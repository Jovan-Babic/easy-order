"""Expiry tracking (PLAN_ROK_TRAJANJA.md): batches, FEFO, counts, alerts, visibility."""
import uuid
from datetime import date, timedelta

import pytest

from helpers import API, activate_invited_user


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    return r.json()["id"], activate_invited_user(email, r.json()["temporary_password"])


def _in(days):
    return (date.today() + timedelta(days=days)).isoformat()


class S:
    orders = []
    products = []


@pytest.fixture(scope="module", autouse=True)
def world(api_client, superadmin_client):
    cid = api_client.get(f"{API}/auth/me").json()["client_id"]
    S.cid = cid
    cur = superadmin_client.get(f"{API}/clients/{cid}").json()
    superadmin_client.put(f"{API}/clients/{cid}", json={**cur, "invoice_prefix": "TST", "invoice_numbering": "auto"})
    S.op_id, S.op = _invite(api_client, "operator", "exp-op")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "exp-wh")
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_EXP_C"}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    for p in S.products:
        api_client.delete(f"{API}/products/{p['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _product(api_client, track=True):
    p = api_client.post(
        f"{API}/products",
        json={"name": f"TEST_EXP_{uuid.uuid4().hex[:6]}", "price_no_vat": 10, "track_expiry": track},
    ).json()
    S.products.append(p)
    return p["id"]


def _get(session, pid):
    return next(p for p in session.get(f"{API}/products").json() if p["id"] == pid)


def _receive(pid, qty, expiry):
    return S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": qty, "expiry_date": expiry}]})


def _batches(pid):
    return S.wh.get(f"{API}/products/{pid}/batches").json()


def _order(pid, qty):
    r = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [{"product_id": pid, "ordered_qty": qty}]})
    S.orders.append(r.json()["id"])
    return r.json()["id"]


def _pack_and_ship(oid, pid, picked, batches=None):
    line = {"product_id": pid, "picked_qty": picked}
    if batches is not None:
        line["batches"] = batches
    r = S.wh.patch(f"{API}/orders/{oid}/items", json={"items": [line]})
    assert r.status_code == 200, r.text
    r = S.wh.post(f"{API}/orders/{oid}/status", json={"status": "shipped"})
    return r


def test_receipt_needs_a_date_and_same_date_merges(api_client):
    pid = _product(api_client)
    assert S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 5}]}).status_code == 400
    assert _receive(pid, 5, "31.12.2030").status_code == 400
    assert _receive(pid, 10, _in(60)).status_code == 200
    assert _receive(pid, 4, _in(60)).status_code == 200
    assert _receive(pid, 6, _in(20)).status_code == 200
    batches = _batches(pid)
    assert [(b["expiry_date"], b["qty"]) for b in batches] == [(_in(20), 6), (_in(60), 14)]
    assert _get(S.wh, pid)["stock_qty"] == 20
    moves = S.wh.get(f"{API}/stock/movements", params={"product_id": pid}).json()
    assert moves[0]["expiry_date"] == _in(20) and moves[0]["batch_id"]


def test_plain_products_ignore_the_date(api_client):
    pid = _product(api_client, track=False)
    assert _receive(pid, 5, None).status_code == 200
    assert _get(S.wh, pid)["stock_qty"] == 5 and _batches(pid) == []


def test_fefo_on_shipping_and_reversal(api_client):
    pid = _product(api_client)
    _receive(pid, 10, _in(60))
    _receive(pid, 6, _in(20))
    oid = _order(pid, 8)
    assert _pack_and_ship(oid, pid, 8).status_code == 200
    by_date = {b["expiry_date"]: b["qty"] for b in _batches(pid)}
    assert by_date == {_in(60): 8}  # the 20-day batch went first (6), then 2 from the 60-day one
    assert _get(S.wh, pid)["stock_qty"] == 8
    order = S.wh.get(f"{API}/orders/{oid}").json()
    picks = {p["expiry_date"]: p["qty"] for p in order["items"][0]["picked_batches"]}
    assert picks == {_in(20): 6, _in(60): 2}
    assert api_client.post(f"{API}/orders/{oid}/status", json={"status": "in_progress", "note": "greška"}).status_code == 200
    by_date = {b["expiry_date"]: b["qty"] for b in _batches(pid)}
    assert by_date == {_in(20): 6, _in(60): 10} and _get(S.wh, pid)["stock_qty"] == 16


def test_manual_batch_choice_and_validation(api_client):
    pid = _product(api_client)
    _receive(pid, 10, _in(60))
    _receive(pid, 6, _in(20))
    late = next(b for b in _batches(pid) if b["expiry_date"] == _in(60))
    oid = _order(pid, 4)
    bad = S.wh.patch(f"{API}/orders/{oid}/items", json={"items": [
        {"product_id": pid, "picked_qty": 4, "batches": [{"batch_id": late["id"], "qty": 3}]}]})
    assert bad.status_code == 400  # doesn't add up
    assert _pack_and_ship(oid, pid, 4, [{"batch_id": late["id"], "qty": 4}]).status_code == 200
    assert {b["expiry_date"]: b["qty"] for b in _batches(pid)} == {_in(20): 6, _in(60): 6}


def test_shortfall_goes_negative_on_undated_stock_and_expired_is_skipped(api_client):
    pid = _product(api_client)
    _receive(pid, 5, _in(-3))  # already expired
    _receive(pid, 3, _in(10))
    p = _get(S.wh, pid)
    assert (p["stock_qty"], p["expired_qty"], p["available_qty"], p["next_expiry"]) == (8, 5, 3, _in(10))
    oid = _order(pid, 5)
    assert _pack_and_ship(oid, pid, 5).status_code == 200
    by_date = {b["expiry_date"]: b["qty"] for b in _batches(pid)}
    assert by_date == {_in(-3): 5, None: -2}  # expired batch untouched, shortfall on undated
    assert _get(S.wh, pid)["stock_qty"] == 3 - 5 + 5


def test_count_per_batch_and_writeoff(api_client):
    pid = _product(api_client)
    _receive(pid, 10, _in(40))
    _receive(pid, 4, _in(-1))
    assert S.wh.post(f"{API}/stock/adjustments", json={"product_id": pid, "counted_qty": 3, "note": "popis"}).status_code == 400
    r = S.wh.post(f"{API}/stock/adjustments", json={
        "product_id": pid, "note": "popis", "batches": [{"expiry_date": _in(40), "counted_qty": 9}]})
    assert r.status_code == 200 and r.json()["delta"] == -5  # -1 and the unlisted expired batch -4
    assert _get(S.wh, pid)["stock_qty"] == 9
    batch = _batches(pid)[0]
    w = S.wh.post(f"{API}/stock/batches/{batch['id']}/writeoff", json={})
    assert w.status_code == 200 and w.json()["written_off"] == 9
    assert _get(S.wh, pid)["stock_qty"] == 0
    assert S.wh.post(f"{API}/stock/batches/{batch['id']}/writeoff", json={}).status_code == 400


def test_switching_tracking_on_and_off(api_client):
    pid = _product(api_client, track=False)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 12}]})
    cur = _get(api_client, pid)
    r = api_client.put(f"{API}/products/{pid}", json={"name": cur["name"], "price_no_vat": 10, "track_expiry": True})
    assert r.status_code == 200 and r.json()["track_expiry"] is True
    batches = _batches(pid)
    assert [(b["expiry_date"], b["qty"]) for b in batches] == [(None, 12)]
    _receive(pid, 5, _in(30))
    off = api_client.put(f"{API}/products/{pid}", json={"name": cur["name"], "price_no_vat": 10, "track_expiry": False})
    assert off.status_code == 409
    # a PUT without the field keeps tracking on
    keep = api_client.put(f"{API}/products/{pid}", json={"name": cur["name"], "price_no_vat": 12})
    assert keep.json()["track_expiry"] is True


def test_expiring_list_thresholds_and_permissions(api_client):
    pid = _product(api_client)
    for days, qty in ((-2, 1), (3, 2), (12, 3), (25, 4), (200, 5)):
        _receive(pid, qty, _in(days))
    r = S.wh.get(f"{API}/stock/expiring")
    assert r.status_code == 200, r.text
    body = r.json()
    mine = [i for i in body["items"] if i["product_id"] == pid]
    assert {i["days_left"]: i["level"] for i in mine} == {-2: "expired", 3: "5", 12: "15", 25: "30"}
    assert body["thresholds"] == [5, 15, 30] and body["counts"]["expired"] >= 1
    assert api_client.get(f"{API}/stock/expiring").status_code == 200  # admin
    assert S.op.get(f"{API}/stock/expiring").status_code == 403
    assert S.op.get(f"{API}/products/{pid}/batches").status_code == 403


def test_sales_reps_see_no_expiry_information(api_client):
    pid = _product(api_client)
    _receive(pid, 10, _in(2))
    _receive(pid, 4, _in(-1))
    p = _get(S.op, pid)
    assert p["track_expiry"] is False and p["expired_qty"] == 0 and p["next_expiry"] is None
    assert p["available_qty"] == 10  # expired pieces are not available, nothing else shown
    oid = _order(pid, 3)
    assert _pack_and_ship(oid, pid, 3).status_code == 200
    for order in (S.op.get(f"{API}/orders/{oid}").json(), *[o for o in S.op.get(f"{API}/orders").json() if o["id"] == oid]):
        assert order["items"][0]["picked_batches"] is None


def test_superadmin_has_no_alerts(superadmin_client):
    assert superadmin_client.get(f"{API}/stock/expiring").status_code == 403


def test_alert_days_are_set_by_the_superadmin(api_client, superadmin_client):
    cur = superadmin_client.get(f"{API}/clients/{S.cid}").json()
    assert cur["expiry_alert_days"] == [5, 15, 30]
    try:
        r = superadmin_client.put(f"{API}/clients/{S.cid}", json={**cur, "expiry_alert_days": [60, 10]})
        assert r.status_code == 200 and r.json()["expiry_alert_days"] == [10, 60]
        assert S.wh.get(f"{API}/stock/expiring").json()["thresholds"] == [10, 60]
        assert superadmin_client.put(f"{API}/clients/{S.cid}", json={**cur, "expiry_alert_days": [0]}).status_code == 400
        keep = superadmin_client.put(f"{API}/clients/{S.cid}", json={k: v for k, v in cur.items() if k != "expiry_alert_days"})
        assert keep.json()["expiry_alert_days"] == [10, 60]
    finally:
        superadmin_client.put(f"{API}/clients/{S.cid}", json={**cur, "expiry_alert_days": [5, 15, 30]})


def test_excel_import_switches_tracking(api_client):
    import io
    from openpyxl import Workbook

    name = f"TEST_EXP_IMP_{uuid.uuid4().hex[:6]}"

    def upload(rows, dry_run):
        wb = Workbook()
        ws = wb.active
        ws.append(["Naziv", "Cena bez PDV", "Stanje", "Prati rok"])
        for r in rows:
            ws.append(list(r))
        buf = io.BytesIO()
        wb.save(buf)
        return api_client.post(
            f"{API}/products/import",
            params={"dry_run": str(dry_run).lower()},
            files={"file": ("uvoz.xlsx", buf.getvalue(), "application/octet-stream")},
            headers={"Content-Type": None},
        )

    assert upload([(name, 10, 7, "da")], True).json()["summary"]["create"] == 1
    assert upload([(name, 10, 7, "možda")], True).json()["summary"]["error"] == 1
    assert upload([(name, 10, 7, "da")], False).status_code == 200
    created = next(p for p in api_client.get(f"{API}/products").json() if p["name"] == name)
    S.products.append(created)
    assert created["track_expiry"] is True and created["stock_qty"] == 7
    assert [(b["expiry_date"], b["qty"]) for b in _batches(created["id"])] == [(None, 7)]  # lands on undated stock
    _receive(created["id"], 2, _in(30))
    assert upload([(name, 10, None, "ne")], True).json()["summary"]["error"] == 1
