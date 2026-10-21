"""Goods in focus (PLAN_FOKUS_I_CILJEVI.md): admin picks products, sales reps see them."""
import uuid
from datetime import date, timedelta

import pytest

from helpers import API, activate_invited_user


def _in(days):
    return (date.today() + timedelta(days=days)).isoformat()


class S:
    products = []
    orders = []
    client_ids = []


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    return r.json()["id"], activate_invited_user(email, r.json()["temporary_password"])


@pytest.fixture(scope="module", autouse=True)
def world(api_client):
    S.op_id, S.op = _invite(api_client, "operator", "focus-op")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "focus-wh")
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_FOCUS_C"}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    for p in S.products:
        api_client.delete(f"{API}/products/{p['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _product(api_client, **extra):
    body = {"name": f"TEST_FOCUS_{uuid.uuid4().hex[:6]}", "price_no_vat": 100, "additional_discounts": [0, 5, 10], **extra}
    p = api_client.post(f"{API}/products", json=body).json()
    S.products.append(p)
    return p


def _seen(session, pid):
    return next(p for p in session.get(f"{API}/products").json() if p["id"] == pid)


def test_add_and_sales_rep_sees_it(api_client):
    p = _product(api_client)
    assert _seen(S.op, p["id"])["focus"] is None
    r = api_client.post(f"{API}/focus", json={
        "product_id": p["id"], "reason": "stock", "note": "Višak, ponudi svima", "recommended_discount": 10,
    })
    assert r.status_code == 200, r.text
    focus = _seen(S.op, p["id"])["focus"]
    assert focus["reason"] == "stock" and focus["note"] == "Višak, ponudi svima"
    assert focus["recommended_discount"] == 10
    assert focus["expiry_date"] is None
    listed = api_client.get(f"{API}/focus").json()["items"]
    assert any(i["product_id"] == p["id"] for i in listed)
    # removing it takes the label away
    assert api_client.delete(f"{API}/focus/{r.json()['id']}").status_code == 200
    assert _seen(S.op, p["id"])["focus"] is None


def test_only_managers_write(api_client):
    p = _product(api_client)
    assert S.op.post(f"{API}/focus", json={"product_id": p["id"]}).status_code == 403
    assert S.wh.get(f"{API}/focus").status_code == 403


def test_validation(api_client):
    p = _product(api_client)
    bad = api_client.post(f"{API}/focus", json={"product_id": p["id"], "reason": "nope"})
    assert bad.status_code == 400
    # the suggested discount must be one the product allows
    assert api_client.post(f"{API}/focus", json={"product_id": p["id"], "recommended_discount": 33}).status_code == 400
    assert api_client.post(f"{API}/focus", json={"product_id": p["id"], "active_to": _in(-1)}).status_code == 400
    assert api_client.post(f"{API}/focus", json={"product_id": "missing"}).status_code == 404
    ok = api_client.post(f"{API}/focus", json={"product_id": p["id"], "reason": "promo", "active_to": _in(3)})
    assert ok.status_code == 200
    assert api_client.post(f"{API}/focus", json={"product_id": p["id"]}).status_code == 409
    upd = api_client.put(f"{API}/focus/{ok.json()['id']}", json={"reason": "other", "note": "x", "recommended_discount": 5})
    assert upd.status_code == 200 and upd.json()["recommended_discount"] == 5
    api_client.delete(f"{API}/focus/{ok.json()['id']}")


def test_inactive_product_is_not_shown(api_client):
    p = _product(api_client)
    f = api_client.post(f"{API}/focus", json={"product_id": p["id"]}).json()
    api_client.put(f"{API}/products/{p['id']}", json={**p, "active": False})
    assert all(x["id"] != p["id"] for x in S.op.get(f"{API}/products").json())
    api_client.delete(f"{API}/focus/{f['id']}")


def test_expiry_reason_shows_the_date_to_sales_reps(api_client):
    p = _product(api_client, track_expiry=True)
    S.wh.post(f"{API}/stock/receipts", json={"items": [
        {"product_id": p["id"], "qty": 20, "expiry_date": _in(10)},
        {"product_id": p["id"], "qty": 50, "expiry_date": _in(100)},
    ]})
    # without focus a sales rep gets no expiry information
    plain = _seen(S.op, p["id"])
    assert plain["next_expiry"] is None and plain["focus"] is None
    sugg = api_client.get(f"{API}/focus").json()["suggestions"]
    hit = next(s for s in sugg if s["product_id"] == p["id"])
    assert hit["reason"] == "expiry" and hit["expiry_date"] == _in(10) and hit["expiry_qty"] == 20
    f = api_client.post(f"{API}/focus", json={"product_id": p["id"], "reason": "expiry"}).json()
    seen = _seen(S.op, p["id"])
    assert seen["focus"]["expiry_date"] == _in(10) and seen["focus"]["expiry_qty"] == 20
    assert seen["next_expiry"] is None  # the normal expiry fields stay hidden
    # no longer a suggestion once it is in focus
    assert all(s["product_id"] != p["id"] for s in api_client.get(f"{API}/focus").json()["suggestions"])
    api_client.delete(f"{API}/focus/{f['id']}")


def test_stock_suggestion_when_nothing_sells(api_client):
    p = _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": p["id"], "qty": 500}]})
    hit = next(s for s in api_client.get(f"{API}/focus").json()["suggestions"] if s["product_id"] == p["id"])
    assert hit["reason"] == "stock" and hit["cover_days"] is None and hit["stock_qty"] == 500


def test_order_line_remembers_focus(api_client):
    p, q = _product(api_client), _product(api_client)
    f = api_client.post(f"{API}/focus", json={"product_id": p["id"]}).json()
    r = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [
        {"product_id": p["id"], "ordered_qty": 2}, {"product_id": q["id"], "ordered_qty": 1},
    ]})
    assert r.status_code == 200, r.text
    S.orders.append(r.json()["id"])
    flags = {i["product_id"]: i["focus"] for i in r.json()["items"]}
    assert flags == {p["id"]: True, q["id"]: False}
    api_client.delete(f"{API}/focus/{f['id']}")


def test_module_off_and_other_tenant(superadmin_client):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-focus-{suffix}@easyorder.dev"
    r = superadmin_client.post(f"{API}/clients", json={
        "name": f"TEST_Focus_{suffix}", "admin_name": "TEST", "admin_email": email, "modules": ["warehouse"],
    })
    assert r.status_code == 200, r.text
    S.client_ids.append(r.json()["client"]["id"])
    admin = activate_invited_user(email, r.json()["temporary_password"])
    assert admin.get(f"{API}/focus").status_code == 403
    p = admin.post(f"{API}/products", json={"name": "TEST_F_off", "price_no_vat": 1}).json()
    assert admin.get(f"{API}/products").json()[0]["focus"] is None
    # enabling the module makes it work; another client's product is a 404
    superadmin_client.put(f"{API}/clients/{r.json()['client']['id']}", json={
        **r.json()["client"], "modules": ["warehouse", "focus"],
    })
    assert admin.get(f"{API}/focus").status_code == 200
    other = S.products[0]
    assert admin.post(f"{API}/focus", json={"product_id": other["id"]}).status_code == 404
    superadmin_client.delete(f"{API}/clients/{r.json()['client']['id']}")


def test_report_counts_only_focus_lines(api_client):
    p, q = _product(api_client), _product(api_client)
    f = api_client.post(f"{API}/focus", json={"product_id": p["id"]}).json()
    before = api_client.get(f"{API}/focus/report").json()
    r = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [
        {"product_id": p["id"], "ordered_qty": 3}, {"product_id": q["id"], "ordered_qty": 5},
    ]})
    S.orders.append(r.json()["id"])
    canceled = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [{"product_id": p["id"], "ordered_qty": 7}]})
    S.orders.append(canceled.json()["id"])
    S.op.post(f"{API}/orders/{canceled.json()['id']}/status", json={"status": "canceled"})
    rep = api_client.get(f"{API}/focus/report").json()
    assert round(rep["revenue"] - before["revenue"], 2) == 300  # 3 x 100, the other product and the canceled order don't count
    row = next(x for x in rep["products"] if x["product_id"] == p["id"])
    assert row["qty"] == 3 and row["revenue"] == 300 and row["orders"] == 1
    assert all(x["product_id"] != q["id"] for x in rep["products"])
    assert any(x["name"] == "TEST focus-op" for x in rep["reps"])
    assert S.op.get(f"{API}/focus/report").status_code == 403
    assert api_client.get(f"{API}/focus/report", params={"from_date": "2026-02-01", "to_date": "2026-01-01"}).status_code == 400
    api_client.delete(f"{API}/focus/{f['id']}")
