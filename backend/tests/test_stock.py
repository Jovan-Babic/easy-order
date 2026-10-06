"""Warehouse stock (PLAN_STANJE_MAGACINA.md): receipts, counts, reservations, shipment deduction."""
import uuid

import pytest

from helpers import API, activate_invited_user


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    return r.json()["id"], activate_invited_user(email, r.json()["temporary_password"])


class S:
    orders = []


@pytest.fixture(scope="module", autouse=True)
def world(api_client, superadmin_client):
    cid = api_client.get(f"{API}/auth/me").json()["client_id"]
    cur = superadmin_client.get(f"{API}/clients/{cid}").json()
    superadmin_client.put(f"{API}/clients/{cid}", json={**cur, "invoice_prefix": "TST", "invoice_numbering": "auto"})
    S.op_id, S.op = _invite(api_client, "operator", "stk-op")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "stk-wh")
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_STK_C"}).json()
    S.products = []
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    for p in S.products:
        api_client.delete(f"{API}/products/{p['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _product(api_client):
    p = api_client.post(f"{API}/products", json={"name": f"TEST_STK_{uuid.uuid4().hex[:6]}", "price_no_vat": 10}).json()
    S.products.append(p)
    return p["id"]


def _get(session, pid):
    return next(p for p in session.get(f"{API}/products").json() if p["id"] == pid)


def _order(pid, qty):
    r = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [{"product_id": pid, "ordered_qty": qty}]})
    S.orders.append(r.json()["id"])
    return r.json()["id"]


def _ship(oid, pid, picked):
    S.wh.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": pid, "picked_qty": picked}]})
    return S.wh.post(f"{API}/orders/{oid}/status", json={"status": "shipped"})


def test_untracked_product_has_no_stock(api_client):
    pid = _product(api_client)
    p = _get(S.op, pid)
    assert p["stock_qty"] is None and p["available_qty"] is None and p["reserved_qty"] == 0


def test_receipt_starts_tracking_and_everyone_sees_it(api_client):
    pid = _product(api_client)
    r = S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 100}], "note": "dobavljač"})
    assert r.status_code == 200, r.text
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 20}]})
    p = _get(S.op, pid)  # the sales rep sees the exact number
    assert p["stock_qty"] == 120 and p["available_qty"] == 120
    moves = S.wh.get(f"{API}/stock/movements", params={"product_id": pid}).json()
    assert [(m["type"], m["delta"], m["balance_after"]) for m in moves] == [("receipt", 20, 120), ("receipt", 100, 100)]


def test_reserved_counts_new_and_in_progress_orders(api_client):
    pid = _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 50}]})
    a, b = _order(pid, 10), _order(pid, 5)
    S.wh.post(f"{API}/orders/{b}/status", json={"status": "in_progress"})
    p = _get(S.op, pid)
    assert (p["stock_qty"], p["reserved_qty"], p["available_qty"]) == (50, 15, 35)
    S.op.post(f"{API}/orders/{a}/status", json={"status": "canceled"})
    assert _get(S.op, pid)["reserved_qty"] == 5


def test_shipping_deducts_picked_qty_and_reversal_returns_it(api_client):
    pid = _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 30}]})
    oid = _order(pid, 10)
    assert _ship(oid, pid, 7).status_code == 200
    p = _get(S.wh, pid)
    assert (p["stock_qty"], p["reserved_qty"]) == (23, 0)
    back = api_client.post(f"{API}/orders/{oid}/status", json={"status": "in_progress", "note": "greška"})
    assert back.status_code == 200
    assert _get(S.wh, pid)["stock_qty"] == 30
    kinds = [m["type"] for m in S.wh.get(f"{API}/stock/movements", params={"product_id": pid}).json()]
    assert kinds[:2] == ["reversal", "shipment"]


def test_shipping_can_take_stock_below_zero_and_untracked_is_ignored(api_client):
    pid, untracked = _product(api_client), _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 3}]})
    assert _ship(_order(pid, 5), pid, 5).status_code == 200
    assert _get(S.wh, pid)["stock_qty"] == -2
    assert _ship(_order(untracked, 5), untracked, 5).status_code == 200
    assert _get(S.wh, untracked)["stock_qty"] is None


def test_adjustment_sets_counted_quantity_and_needs_a_note(api_client):
    pid = _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 10}]})
    r = S.wh.post(f"{API}/stock/adjustments", json={"product_id": pid, "counted_qty": 8, "note": "popis"})
    assert r.status_code == 200 and r.json()["delta"] == -2
    assert _get(S.wh, pid)["stock_qty"] == 8
    assert S.wh.post(f"{API}/stock/adjustments", json={"product_id": pid, "counted_qty": 8, "note": ""}).status_code == 422


def test_editing_a_product_keeps_its_stock(api_client):
    pid = _product(api_client)
    S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 12}]})
    cur = _get(api_client, pid)
    r = api_client.put(f"{API}/products/{pid}", json={"name": cur["name"] + "x", "price_no_vat": 11})
    assert r.status_code == 200
    assert _get(api_client, pid)["stock_qty"] == 12 and _get(api_client, pid)["price_no_vat"] == 11


def test_permissions_and_validation(api_client):
    pid = _product(api_client)
    line = {"items": [{"product_id": pid, "qty": 1}]}
    assert S.op.post(f"{API}/stock/receipts", json=line).status_code == 403
    assert S.op.get(f"{API}/stock/movements").status_code == 403
    assert S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": pid, "qty": 0}]}).status_code == 422
    assert S.wh.post(f"{API}/stock/receipts", json={"items": [{"product_id": "nope", "qty": 1}]}).status_code == 404
