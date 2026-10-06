"""Phase 1 of RBAC_PLAN.md: the `warehouse` role and operator-only-own-orders."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from helpers import API, TEST_PASSWORD, activate_invited_user


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["id"], activate_invited_user(email, body["temporary_password"])


class S:
    pass


@pytest.fixture(scope="module", autouse=True)
def world(api_client):
    S.op_a_id, S.op_a = _invite(api_client, "operator", "op-a")
    S.op_b_id, S.op_b = _invite(api_client, "operator", "op-b")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "wh")
    S.product = api_client.post(f"{API}/products", json={"name": "TEST_WH_Product", "price_no_vat": 10}).json()
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_WH_Customer"}).json()
    line = {"customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": 2}]}
    S.order_a = S.op_a.post(f"{API}/orders", json=line).json()
    S.order_b = S.op_b.post(f"{API}/orders", json=line).json()
    yield
    for oid in (S.order_a["id"], S.order_b["id"]):
        api_client.delete(f"{API}/orders/{oid}")
    api_client.delete(f"{API}/products/{S.product['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_a_id, S.op_b_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _ids(resp):
    assert resp.status_code == 200, resp.text
    return {o["id"] for o in resp.json()}


class TestAdminManagesWarehouse:
    def test_created_with_warehouse_role(self, api_client):
        me = S.wh.get(f"{API}/auth/me").json()
        assert me["role"] == "warehouse"
        assert me["client_id"] == api_client.get(f"{API}/auth/me").json()["client_id"]

    def test_admin_can_switch_operator_to_warehouse_and_back(self, api_client):
        uid, _ = _invite(api_client, "operator", "switch")
        try:
            r = api_client.put(f"{API}/users/{uid}", json={"role": "warehouse"})
            assert r.status_code == 200 and r.json()["role"] == "warehouse"
            r = api_client.put(f"{API}/users/{uid}", json={"role": "operator"})
            assert r.status_code == 200 and r.json()["role"] == "operator"
            assert api_client.put(f"{API}/users/{uid}", json={"role": "admin"}).status_code == 403
        finally:
            assert api_client.delete(f"{API}/users/{uid}").status_code == 200


class TestWarehouseCannotManage:
    def test_cannot_use_user_endpoints(self):
        assert S.wh.get(f"{API}/users").status_code == 403
        assert S.wh.post(f"{API}/users", json={"email": "x@easyorder.dev", "name": "X", "role": "operator"}).status_code == 403
        assert S.wh.put(f"{API}/users/{S.op_a_id}", json={"name": "Hacked"}).status_code == 403
        assert S.wh.delete(f"{API}/users/{S.op_a_id}").status_code == 403

    def test_cannot_write_catalog_or_customers(self):
        assert S.wh.post(f"{API}/products", json={"name": "TEST_nope", "price_no_vat": 1}).status_code == 403
        assert S.wh.post(f"{API}/customers", json={"name": "TEST_nope"}).status_code == 403
        assert S.wh.put(f"{API}/products/{S.product['id']}", json={"name": "TEST_nope"}).status_code == 403

    def test_cannot_create_or_delete_orders(self):
        line = {"customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": 1}]}
        assert S.wh.post(f"{API}/orders", json=line).status_code == 403
        assert S.wh.delete(f"{API}/orders/{S.order_a['id']}").status_code == 403

    def test_cannot_see_stats_or_upload(self):
        assert S.wh.get(f"{API}/stats/overview").status_code == 403
        headers = {"Authorization": S.wh.headers["Authorization"]}
        r = requests.post(f"{API}/upload-image", headers=headers, files={"file": ("x.png", b"x", "image/png")})
        assert r.status_code == 403


class TestWarehouseReads:
    def test_reads_catalog_and_customers(self):
        assert S.wh.get(f"{API}/products").status_code == 200
        assert S.wh.get(f"{API}/customers").status_code == 200

    def test_sees_all_orders_of_client(self):
        ids = _ids(S.wh.get(f"{API}/orders"))
        assert {S.order_a["id"], S.order_b["id"]} <= ids
        assert S.wh.get(f"{API}/orders/{S.order_a['id']}").status_code == 200


class TestOperatorSeesOnlyOwn:
    def test_list_excludes_others(self):
        ids = _ids(S.op_a.get(f"{API}/orders"))
        assert S.order_a["id"] in ids and S.order_b["id"] not in ids

    def test_get_foreign_order_is_404(self):
        assert S.op_a.get(f"{API}/orders/{S.order_b['id']}").status_code == 404
        assert S.op_a.get(f"{API}/orders/{S.order_a['id']}").status_code == 200

    def test_created_by_filter_cannot_widen_scope(self):
        ids = _ids(S.op_a.get(f"{API}/orders", params={"created_by_user_id": S.op_b_id}))
        assert S.order_a["id"] in ids and S.order_b["id"] not in ids

    def test_still_sees_all_customers(self, api_client):
        mine = {c["id"] for c in S.op_a.get(f"{API}/customers").json()}
        assert S.customer["id"] in mine

    def test_admin_sees_both(self, api_client):
        ids = _ids(api_client.get(f"{API}/orders"))
        assert {S.order_a["id"], S.order_b["id"]} <= ids


class TestOrderFilters:
    def test_created_by_user_id(self, api_client):
        ids = _ids(api_client.get(f"{API}/orders", params={"created_by_user_id": S.op_b_id}))
        assert S.order_b["id"] in ids and S.order_a["id"] not in ids

    def test_status_filter_multi(self, api_client):
        ids = _ids(api_client.get(f"{API}/orders", params=[("status", "new"), ("status", "canceled")]))
        assert S.order_a["id"] in ids
        assert S.order_a["id"] not in _ids(api_client.get(f"{API}/orders", params={"status": "shipped"}))

    def test_date_range(self, api_client):
        today = datetime.now(timezone.utc).date()
        day = timedelta(days=1)
        inside = api_client.get(f"{API}/orders", params={"from_date": str(today), "to_date": str(today)})
        assert S.order_a["id"] in _ids(inside)
        past = api_client.get(f"{API}/orders", params={"to_date": str(today - day)})
        assert S.order_a["id"] not in _ids(past)
        future = api_client.get(f"{API}/orders", params={"from_date": str(today + day)})
        assert S.order_a["id"] not in _ids(future)
        assert api_client.get(f"{API}/orders", params={"from_date": "nope"}).status_code == 400

    def test_limit_and_skip(self, api_client):
        everything = api_client.get(f"{API}/orders").json()
        assert len(api_client.get(f"{API}/orders", params={"limit": 1}).json()) == 1
        rest = api_client.get(f"{API}/orders", params={"skip": 1}).json()
        assert [o["id"] for o in rest] == [o["id"] for o in everything[1:]]
