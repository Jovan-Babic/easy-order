"""Fixes from the warehouse portal audit: merged duplicate lines, note limit, logout, ownership, items revision."""
import uuid

import pytest

from helpers import API, activate_invited_user, login


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["id"], email, activate_invited_user(email, body["temporary_password"])


class S:
    orders = []


def _order(session, items):
    r = session.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": items})
    if r.status_code == 200:
        S.orders.append(r.json()["id"])
    return r


@pytest.fixture(scope="module", autouse=True)
def world(api_client, superadmin_client):
    cid = api_client.get(f"{API}/auth/me").json()["client_id"]
    cur = superadmin_client.get(f"{API}/clients/{cid}").json()
    superadmin_client.put(f"{API}/clients/{cid}", json={**cur, "invoice_prefix": "TST", "invoice_numbering": "auto"})
    S.op_id, _, S.op = _invite(api_client, "operator", "wh-op")
    S.wh1_id, S.wh1_email, S.wh1 = _invite(api_client, "warehouse", "wh-1")
    S.wh2_id, _, S.wh2 = _invite(api_client, "warehouse", "wh-2")
    S.p1 = api_client.post(f"{API}/products", json={"name": "TEST_HARD_P1", "price_no_vat": 100, "vat_rate": 20}).json()
    S.p2 = api_client.post(f"{API}/products", json={"name": "TEST_HARD_P2", "price_no_vat": 50, "vat_rate": 20}).json()
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_HARD_Customer"}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    for p in (S.p1, S.p2):
        api_client.delete(f"{API}/products/{p['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.wh1_id, S.wh2_id):
        api_client.delete(f"{API}/users/{uid}")


def test_same_product_twice_is_merged():
    r = _order(S.op, [{"product_id": S.p1["id"], "ordered_qty": 2}, {"product_id": S.p1["id"], "ordered_qty": 3}])
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1 and items[0]["ordered_qty"] == 5


def test_same_product_twice_with_different_discounts_is_rejected(api_client):
    p = api_client.put(f"{API}/products/{S.p2['id']}", json={**S.p2, "additional_discounts": [5]}).json()
    r = _order(S.op, [{"product_id": p["id"], "ordered_qty": 1}, {"product_id": p["id"], "ordered_qty": 1, "additional_discount": 5}])
    assert r.status_code == 400


def test_duplicate_order_can_be_shipped():
    oid = _order(S.op, [{"product_id": S.p1["id"], "ordered_qty": 2}, {"product_id": S.p1["id"], "ordered_qty": 1}]).json()["id"]
    assert S.wh1.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": S.p1["id"], "picked_qty": 3}]}).status_code == 200
    assert S.wh1.post(f"{API}/orders/{oid}/status", json={"status": "shipped"}).status_code == 200


def test_status_note_is_limited():
    oid = _order(S.op, [{"product_id": S.p1["id"], "ordered_qty": 1}]).json()["id"]
    r = S.wh1.post(f"{API}/orders/{oid}/status", json={"status": "rejected", "note": "A" * 301})
    assert r.status_code == 422
    assert S.wh1.post(f"{API}/orders/{oid}/status", json={"status": "rejected", "note": "A" * 300}).status_code == 200


def test_order_taken_by_another_worker_is_locked():
    oid = _order(S.op, [{"product_id": S.p1["id"], "ordered_qty": 4}]).json()["id"]
    assert S.wh1.post(f"{API}/orders/{oid}/status", json={"status": "in_progress"}).status_code == 200
    line = {"items": [{"product_id": S.p1["id"], "picked_qty": 1}]}
    assert S.wh2.patch(f"{API}/orders/{oid}/items", json=line).status_code == 403
    assert S.wh2.post(f"{API}/orders/{oid}/status", json={"status": "new"}).status_code == 403
    assert S.wh2.post(f"{API}/orders/{oid}/status", json={"status": "rejected", "note": "x"}).status_code == 403
    assert S.wh1.patch(f"{API}/orders/{oid}/items", json=line).status_code == 200
    # An admin may still take over; and once the holder releases it, anyone can take it.
    assert S.wh1.post(f"{API}/orders/{oid}/status", json={"status": "new"}).status_code == 200
    assert S.wh2.post(f"{API}/orders/{oid}/status", json={"status": "in_progress"}).status_code == 200


def test_picking_two_lines_one_after_another_keeps_both():
    oid = _order(S.op, [{"product_id": S.p1["id"], "ordered_qty": 4}, {"product_id": S.p2["id"], "ordered_qty": 2}]).json()["id"]
    assert S.wh1.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": S.p1["id"], "picked_qty": 4}]}).status_code == 200
    r = S.wh1.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": S.p2["id"], "picked_qty": 1}]})
    assert r.status_code == 200
    assert {i["product_id"]: i["picked_qty"] for i in r.json()["items"]} == {S.p1["id"]: 4, S.p2["id"]: 1}


def test_warehouse_client_view_hides_activity_and_accounting():
    me = S.wh1.get(f"{API}/clients/me").json()
    assert me.get("accounting_email") is None and me.get("orders_30d") is None and me.get("last_activity_at") is None
    assert "name" in me and "bank_account" in me  # invoice header data stays


def test_logout_invalidates_the_token():
    s = login(S.wh1_email, "TestPass123!")
    assert s.get(f"{API}/orders").status_code == 200
    assert s.post(f"{API}/auth/logout").status_code == 200
    assert s.get(f"{API}/orders").status_code == 401
