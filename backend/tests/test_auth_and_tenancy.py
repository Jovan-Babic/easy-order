"""Tests for the new auth/role/tenant-isolation logic added on top of the
previously auth-free, single-tenant backend. These are the risky paths:
cross-tenant data leakage and role-escalation must be impossible.
"""
import os
import uuid

import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://order-invoice-app-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


class TestAuth:
    def test_login_rejects_bad_password(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": "demo-admin@easyorder.dev", "password": "wrong"})
        assert r.status_code == 401

    def test_unauthenticated_request_rejected(self):
        s = requests.Session()
        r = s.get(f"{API}/customers")
        assert r.status_code == 401

    def test_me_returns_current_user(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == "demo-admin@easyorder.dev"
        assert r.json()["role"] == "admin"


class TestCrossTenantIsolation:
    client_b_admin = None
    client_b_id = None
    client_b_product_id = None
    client_b_customer_id = None
    client_b_order_id = None

    def test_setup_second_client(self, superadmin_client):
        suffix = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_ClientB_{suffix}",
            "admin_name": "TEST ClientB Admin",
            "admin_email": f"test-clientb-{suffix}@easyorder.dev",
            "admin_password": "TestPass123!",
        }
        r = superadmin_client.post(f"{API}/clients", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        TestCrossTenantIsolation.client_b_id = body["client"]["id"]
        TestCrossTenantIsolation.client_b_admin = _login(payload["admin_email"], payload["admin_password"])

    def test_client_b_admin_creates_own_data(self):
        admin = TestCrossTenantIsolation.client_b_admin
        p = admin.post(f"{API}/products", json={"name": "TEST_B_Product", "price_no_vat": 100}).json()
        c = admin.post(f"{API}/customers", json={"name": "TEST_B_Customer"}).json()
        o = admin.post(
            f"{API}/orders",
            json={
                "customer_id": c["id"],
                "customer_name": c["name"],
                "items": [{"product_id": p["id"], "name": p["name"], "price_no_vat": 100, "ordered_qty": 1}],
            },
        ).json()
        assert p["client_id"] == TestCrossTenantIsolation.client_b_id
        TestCrossTenantIsolation.client_b_product_id = p["id"]
        TestCrossTenantIsolation.client_b_customer_id = c["id"]
        TestCrossTenantIsolation.client_b_order_id = o["id"]

    def test_client_a_admin_cannot_edit_client_b_customer(self, api_client):
        # No GET-by-id route exists for customers/products (only list + PUT/DELETE
        # by id) - PUT is the isolation surface to probe here.
        r = api_client.put(
            f"{API}/customers/{TestCrossTenantIsolation.client_b_customer_id}",
            json={"name": "TEST_Hijacked"},
        )
        assert r.status_code == 404

    def test_client_a_admin_customer_list_excludes_client_b(self, api_client):
        r = api_client.get(f"{API}/customers")
        ids = {c["id"] for c in r.json()}
        assert TestCrossTenantIsolation.client_b_customer_id not in ids

    def test_client_a_admin_cannot_see_client_b_order(self, api_client):
        r = api_client.get(f"{API}/orders/{TestCrossTenantIsolation.client_b_order_id}")
        assert r.status_code == 404

    def test_client_a_admin_product_list_excludes_client_b(self, api_client):
        r = api_client.get(f"{API}/products")
        ids = {p["id"] for p in r.json()}
        assert TestCrossTenantIsolation.client_b_product_id not in ids

    def test_client_a_admin_cannot_edit_client_b_product(self, api_client):
        r = api_client.put(
            f"{API}/products/{TestCrossTenantIsolation.client_b_product_id}",
            json={"name": "TEST_Hijacked"},
        )
        assert r.status_code == 404

    def test_cleanup(self):
        admin = TestCrossTenantIsolation.client_b_admin
        admin.delete(f"{API}/orders/{TestCrossTenantIsolation.client_b_order_id}")
        admin.delete(f"{API}/customers/{TestCrossTenantIsolation.client_b_customer_id}")
        admin.delete(f"{API}/products/{TestCrossTenantIsolation.client_b_product_id}")


class TestRoleEscalation:
    operator_email = None
    operator_id = None

    def test_admin_creates_operator(self, api_client):
        suffix = uuid.uuid4().hex[:8]
        email = f"test-operator-{suffix}@easyorder.dev"
        r = api_client.post(
            f"{API}/users",
            json={"email": email, "name": "TEST Operator", "password": "TestPass123!", "role": "admin"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Admin-created users are always forced to OPERATOR regardless of requested role.
        assert body["role"] == "operator"
        TestRoleEscalation.operator_email = email
        TestRoleEscalation.operator_id = body["id"]

    def test_operator_cannot_list_users(self):
        operator = _login(TestRoleEscalation.operator_email, "TestPass123!")
        r = operator.get(f"{API}/users")
        assert r.status_code == 403

    def test_operator_cannot_create_users(self):
        operator = _login(TestRoleEscalation.operator_email, "TestPass123!")
        r = operator.post(
            f"{API}/users",
            json={"email": "should-fail@easyorder.dev", "name": "X", "password": "x", "role": "operator"},
        )
        assert r.status_code == 403

    def test_admin_cannot_promote_operator_to_admin(self, api_client):
        r = api_client.put(f"{API}/users/{TestRoleEscalation.operator_id}", json={"role": "admin"})
        assert r.status_code == 403

    def test_cleanup(self, api_client):
        api_client.delete(f"{API}/users/{TestRoleEscalation.operator_id}")


class TestStatsScoping:
    def test_admin_stats_scope_is_client(self, api_client):
        r = api_client.get(f"{API}/stats/overview")
        assert r.status_code == 200
        body = r.json()
        assert body["scope"] == "client"
        assert len(body["by_client"]) == 1

    def test_operator_cannot_view_stats(self, api_client):
        suffix = uuid.uuid4().hex[:8]
        email = f"test-stats-operator-{suffix}@easyorder.dev"
        api_client.post(
            f"{API}/users",
            json={"email": email, "name": "TEST Stats Operator", "password": "TestPass123!", "role": "operator"},
        )
        operator = _login(email, "TestPass123!")
        r = operator.get(f"{API}/stats/overview")
        assert r.status_code == 403

    def test_superadmin_stats_scope_is_global(self, superadmin_client):
        r = superadmin_client.get(f"{API}/stats/overview")
        assert r.status_code == 200
        body = r.json()
        assert body["scope"] == "global"
        assert len(body["by_client"]) >= 1

    def test_admin_cannot_view_client_drilldown(self, api_client):
        r = api_client.get(f"{API}/stats/clients/anything")
        assert r.status_code == 403
