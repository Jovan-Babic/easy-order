"""Phase 6: GET /reports/orders - counts per status, sales rep and warehouse handler."""
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
    S.op_id, S.op = _invite(api_client, "operator", "rep-op")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "rep-wh")
    S.product = api_client.post(f"{API}/products", json={"name": "TEST_REP_P", "price_no_vat": 100, "vat_rate": 20}).json()
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_REP_C"}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    api_client.delete(f"{API}/products/{S.product['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _order(qty=10):
    r = S.op.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": qty}]})
    S.orders.append(r.json()["id"])
    return r.json()["id"]


def _person(rows, user_id):
    return next(r for r in rows if r["user_id"] == user_id)


def test_report_counts_by_status_creator_and_handler(api_client):
    shipped, rejected, canceled, still_new = _order(), _order(), _order(), _order()
    S.wh.patch(f"{API}/orders/{shipped}/items", json={"items": [{"product_id": S.product["id"], "picked_qty": 5}]})
    assert S.wh.post(f"{API}/orders/{shipped}/status", json={"status": "shipped"}).status_code == 200
    assert S.wh.post(f"{API}/orders/{rejected}/status", json={"status": "rejected", "note": "x"}).status_code == 200
    assert S.op.post(f"{API}/orders/{canceled}/status", json={"status": "canceled"}).status_code == 200

    r = api_client.get(f"{API}/reports/orders")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["by_status"]["shipped"]["count"] >= 1 and body["by_status"]["new"]["count"] >= 1
    rep = _person(body["by_creator"], S.op_id)
    assert (rep["total"], rep["shipped"], rep["rejected"], rep["canceled"]) == (4, 1, 1, 1)
    handler = _person(body["by_handler"], S.wh_id)
    assert (handler["shipped"], handler["rejected"]) == (1, 1)
    assert body["avg_hours_to_ship"] is not None and body["avg_hours_to_ship"] >= 0
    # shipped by packed quantity: 5 x 100 + 20% VAT
    assert body["by_status"]["shipped"]["grand"] >= 600.0


def test_date_filter_excludes_everything_in_the_past(api_client):
    body = api_client.get(f"{API}/reports/orders", params={"from_date": "2000-01-01", "to_date": "2000-01-02"}).json()
    assert body["order_count"] == 0 and body["by_creator"] == []


def test_only_managers(api_client):
    assert S.op.get(f"{API}/reports/orders").status_code == 403
    assert S.wh.get(f"{API}/reports/orders").status_code == 403
    assert api_client.get(f"{API}/reports/orders", params={"from_date": "nope"}).status_code == 400
