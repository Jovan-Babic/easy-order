"""Barcodes on products, scan lookup, Excel import, batch stocktake."""
import io
import uuid

import pytest
from openpyxl import Workbook

from helpers import API, activate_invited_user


def _code():
    return "9" + str(uuid.uuid4().int)[:12]


def _xlsx(rows, header=("Naziv", "Barkod", "Cena bez PDV", "Stanje")):
    wb = Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _upload(session, rows, dry_run, **kw):
    data = _xlsx(rows, **kw)
    return session.post(
        f"{API}/products/import",
        params={"dry_run": str(dry_run).lower()},
        files={"file": ("uvoz.xlsx", data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={"Content-Type": None},
    )


class S:
    created = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    yield
    for pid in S.created:
        api_client.delete(f"{API}/products/{pid}")


def _mk(api_client, **extra):
    p = api_client.post(f"{API}/products", json={"name": f"TEST_BC_{uuid.uuid4().hex[:6]}", **extra})
    assert p.status_code == 200, p.text
    S.created.append(p.json()["id"])
    return p.json()


def _warehouse(api_client):
    email = f"test-bc-wh-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": "TEST bc wh", "role": "warehouse"})
    return r.json()["id"], activate_invited_user(email, r.json()["temporary_password"])


def test_barcode_unique_and_lookup(api_client):
    code = _code()
    p = _mk(api_client, barcode=code)
    assert p["barcode"] == code
    dup = api_client.post(f"{API}/products", json={"name": "TEST_BC_dup", "barcode": code})
    assert dup.status_code == 409
    found = api_client.get(f"{API}/products/by-barcode/{code}")
    assert found.status_code == 200 and found.json()["id"] == p["id"]
    assert api_client.get(f"{API}/products/by-barcode/{_code()}").status_code == 404
    bad = api_client.post(f"{API}/products", json={"name": "TEST_BC_bad", "barcode": "12 34$"})
    assert bad.status_code == 400


def test_update_keeps_barcode_unless_sent(api_client):
    code = _code()
    p = _mk(api_client, barcode=code)
    r = api_client.put(f"{API}/products/{p['id']}", json={"name": "TEST_BC_renamed"})
    assert r.json()["barcode"] == code
    r = api_client.put(f"{API}/products/{p['id']}", json={"name": "TEST_BC_renamed", "barcode": ""})
    assert r.json()["barcode"] is None
    assert api_client.get(f"{API}/products/by-barcode/{code}").status_code == 404


def test_warehouse_links_scanned_code(api_client):
    wh_id, wh = _warehouse(api_client)
    try:
        p = _mk(api_client)
        code = _code()
        r = wh.post(f"{API}/products/{p['id']}/barcode", json={"barcode": code})
        assert r.status_code == 200 and r.json()["barcode"] == code
        other = _mk(api_client)
        assert wh.post(f"{API}/products/{other['id']}/barcode", json={"barcode": code}).status_code == 409
        # warehouse still can't edit products in general
        assert wh.put(f"{API}/products/{p['id']}", json={"name": "x"}).status_code == 403
    finally:
        api_client.delete(f"{API}/users/{wh_id}")


def test_batch_stocktake(api_client):
    wh_id, wh = _warehouse(api_client)
    try:
        a, b = _mk(api_client), _mk(api_client)
        r = wh.post(
            f"{API}/stock/adjustments/batch",
            json={"items": [{"product_id": a["id"], "counted_qty": 5}, {"product_id": b["id"], "counted_qty": 7}], "note": "popis"},
        )
        assert r.status_code == 200 and r.json()["deltas"] == [5, 7]
        stock = {p["id"]: p["stock_qty"] for p in api_client.get(f"{API}/products").json()}
        assert stock[a["id"]] == 5 and stock[b["id"]] == 7
        bad = wh.post(
            f"{API}/stock/adjustments/batch",
            json={"items": [{"product_id": a["id"], "counted_qty": 1}, {"product_id": "nope", "counted_qty": 1}], "note": "x"},
        )
        assert bad.status_code == 404
        assert {p["id"]: p["stock_qty"] for p in api_client.get(f"{API}/products").json()}[a["id"]] == 5
        no_note = wh.post(f"{API}/stock/adjustments/batch", json={"items": [{"product_id": a["id"], "counted_qty": 1}], "note": ""})
        assert no_note.status_code == 422
    finally:
        api_client.delete(f"{API}/users/{wh_id}")


def test_import_dry_run_then_apply(api_client):
    existing = _mk(api_client, price_no_vat=10)
    code_new, code_existing = _code(), _code()
    name_new = f"TEST_BC_new_{uuid.uuid4().hex[:6]}"
    rows = [
        (name_new, code_new, "12,5", 30),
        (existing["name"], code_existing, None, 4),  # matched by name, price untouched
        ("", None, 5, None),  # no name -> error
        ("TEST_BC_badprice", None, "abc", None),  # bad number -> error
    ]
    dry = _upload(api_client, rows, True)
    assert dry.status_code == 200, dry.text
    body = dry.json()
    assert body["dry_run"] is True and body["summary"] == {"create": 1, "update": 1, "error": 2}
    assert api_client.get(f"{API}/products/by-barcode/{code_new}").status_code == 404  # nothing written

    done = _upload(api_client, rows, False)
    assert done.status_code == 200 and done.json()["summary"]["create"] == 1
    created = api_client.get(f"{API}/products/by-barcode/{code_new}").json()
    S.created.append(created["id"])
    assert created["price_no_vat"] == 12.5 and created["stock_qty"] == 30
    upd = api_client.get(f"{API}/products/by-barcode/{code_existing}").json()
    assert upd["id"] == existing["id"] and upd["price_no_vat"] == 10 and upd["stock_qty"] == 4
    movements = api_client.get(f"{API}/stock/movements", params={"product_id": created["id"]}).json()
    assert movements and movements[0]["delta"] == 30 and "Uvoz" in movements[0]["note"]

    again = _upload(api_client, rows[:2], False).json()  # idempotent: same stock -> no extra movement
    assert again["summary"]["create"] == 0
    assert len(api_client.get(f"{API}/stock/movements", params={"product_id": created["id"]}).json()) == 1


def test_import_rejects_repeated_and_foreign_barcodes(api_client):
    owner = _mk(api_client, barcode=_code())
    other = _mk(api_client)
    code = _code()
    rows = [
        (other["name"], owner["barcode"], None, None),  # barcode belongs to another product
        ("TEST_BC_rep1", code, None, None),
        ("TEST_BC_rep2", code, None, None),  # repeated in file
    ]
    body = _upload(api_client, rows, True).json()
    actions = [r["action"] for r in body["rows"]]
    assert actions == ["update", "create", "error"], body
    # first row matched `other` by name but its barcode is owned by `owner` -> flagged only if differing product
    assert body["rows"][2]["errors"]


def test_import_needs_manager_and_valid_file(api_client):
    wh_id, wh = _warehouse(api_client)
    try:
        r = wh.post(f"{API}/products/import", files={"file": ("a.xlsx", _xlsx([]), "application/octet-stream")}, headers={"Content-Type": None})
        assert r.status_code == 403
    finally:
        api_client.delete(f"{API}/users/{wh_id}")
    junk = api_client.post(f"{API}/products/import", files={"file": ("a.xlsx", b"not excel", "application/octet-stream")}, headers={"Content-Type": None})
    assert junk.status_code == 400
    no_cols = _upload(api_client, [("x", 1)], True, header=("Foo", "Bar"))
    assert no_cols.status_code == 400
    tpl = api_client.get(f"{API}/products/import-template")
    assert tpl.status_code == 200 and tpl.content[:2] == b"PK"
