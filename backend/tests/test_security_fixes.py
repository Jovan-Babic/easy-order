"""Regression tests for the security fixes described in .claude/DOCS/IZMENE_BEZBEDNOST.md:
server-side order snapshot, operator role limits, admin-vs-admin limits,
product discount reset, and deactivated-client lockout.

Self-contained: builds its own clients/users through the superadmin, so it
does not depend on seeded demo data. Classes run in file order and share
state through class attributes (same style as test_auth_and_tenancy.py).
"""
import os
import uuid

import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://order-invoice-app-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "TestPass123!"


def _login(email: str, password: str = PASSWORD) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


class S:
    """Shared state across the test classes below."""
    client_id = None
    admin = None
    admin_id = None
    admin_email = None
    other_admin_id = None
    operator = None
    product = None
    customer_id = None
    foreign_product_id = None
    foreign_customer_id = None


class TestSetup:
    def test_create_clients_and_users(self, superadmin_client):
        suffix = uuid.uuid4().hex[:8]
        S.admin_email = f"test-sec-admin-{suffix}@easyorder.dev"
        r = superadmin_client.post(f"{API}/clients", json={
            "name": f"TEST_Sec_{suffix}",
            "admin_name": "TEST Sec Admin",
            "admin_email": S.admin_email,
            "admin_password": PASSWORD,
        })
        assert r.status_code == 200, r.text
        S.client_id = r.json()["client"]["id"]
        S.admin_id = r.json()["admin_user"]["id"]
        S.admin = _login(S.admin_email)

        # Second admin in the same client.
        r = superadmin_client.post(f"{API}/users", json={
            "email": f"test-sec-admin2-{suffix}@easyorder.dev",
            "name": "TEST Sec Admin 2",
            "password": PASSWORD,
            "role": "admin",
            "client_id": S.client_id,
        })
        assert r.status_code == 200, r.text
        S.other_admin_id = r.json()["id"]

        op_email = f"test-sec-op-{suffix}@easyorder.dev"
        r = S.admin.post(f"{API}/users", json={
            "email": op_email, "name": "TEST Sec Operator", "password": PASSWORD, "role": "operator",
        })
        assert r.status_code == 200, r.text
        S.operator = _login(op_email)

        r = S.admin.post(f"{API}/products", json={
            "name": "TEST_Sec_Product",
            "price_no_vat": 100,
            "vat_rate": 20,
            "discount": 5,
            "discounts": [5, 10],
            "additional_discounts": [0, 3],
        })
        assert r.status_code == 200, r.text
        S.product = r.json()
        r = S.admin.post(f"{API}/customers", json={"name": "TEST_Sec_Customer"})
        assert r.status_code == 200, r.text
        S.customer_id = r.json()["id"]

        # A different tenant, for cross-tenant order attempts.
        r = superadmin_client.post(f"{API}/clients", json={
            "name": f"TEST_SecOther_{suffix}",
            "admin_name": "TEST Other Admin",
            "admin_email": f"test-sec-other-{suffix}@easyorder.dev",
            "admin_password": PASSWORD,
        })
        assert r.status_code == 200, r.text
        other = _login(f"test-sec-other-{suffix}@easyorder.dev")
        S.foreign_product_id = other.post(f"{API}/products", json={"name": "TEST_Foreign", "price_no_vat": 1}).json()["id"]
        S.foreign_customer_id = other.post(f"{API}/customers", json={"name": "TEST_ForeignCust"}).json()["id"]


def _order(session, items, customer_id=None):
    return session.post(f"{API}/orders", json={
        "customer_id": customer_id or S.customer_id,
        "customer_name": "TEST_Spoofed_Name",
        "items": items,
    })


class TestOrderSnapshot:
    def test_client_price_and_names_are_ignored(self):
        r = _order(S.operator, [{
            "product_id": S.product["id"],
            "name": "TEST_Spoofed",
            "price_no_vat": 1,
            "vat_rate": 0,
            "ordered_qty": 2,
        }])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["customer_name"] == "TEST_Sec_Customer"
        item = body["items"][0]
        assert item["name"] == "TEST_Sec_Product"
        assert item["price_no_vat"] == 100
        assert item["vat_rate"] == 20
        assert item["discount"] == 5  # product default when not sent

    def test_whitelisted_discounts_accepted(self):
        r = _order(S.operator, [{"product_id": S.product["id"], "ordered_qty": 1, "discount": 10, "additional_discount": 3}])
        assert r.status_code == 200, r.text
        item = r.json()["items"][0]
        assert item["discount"] == 10
        assert item["additional_discount"] == 3

    def test_unlisted_supplier_discount_rejected(self):
        r = _order(S.operator, [{"product_id": S.product["id"], "ordered_qty": 1, "discount": 50}])
        assert r.status_code == 400

    def test_unlisted_additional_discount_rejected(self):
        r = _order(S.operator, [{"product_id": S.product["id"], "ordered_qty": 1, "additional_discount": 100}])
        assert r.status_code == 400

    def test_non_positive_quantity_rejected(self):
        r = _order(S.operator, [{"product_id": S.product["id"], "ordered_qty": 0}])
        assert r.status_code == 400

    def test_empty_order_rejected(self):
        assert _order(S.operator, []).status_code == 400

    def test_foreign_product_rejected(self):
        r = _order(S.operator, [{"product_id": S.foreign_product_id, "ordered_qty": 1}])
        assert r.status_code == 400

    def test_foreign_customer_rejected(self):
        r = _order(S.operator, [{"product_id": S.product["id"], "ordered_qty": 1}], customer_id=S.foreign_customer_id)
        assert r.status_code == 400


class TestOperatorLimits:
    def test_operator_can_read_catalog(self):
        assert S.operator.get(f"{API}/products").status_code == 200
        assert S.operator.get(f"{API}/customers").status_code == 200

    def test_operator_cannot_write_products(self):
        assert S.operator.post(f"{API}/products", json={"name": "TEST_X"}).status_code == 403
        assert S.operator.put(f"{API}/products/{S.product['id']}", json={"name": "TEST_X"}).status_code == 403
        assert S.operator.delete(f"{API}/products/{S.product['id']}").status_code == 403

    def test_operator_cannot_write_customers(self):
        assert S.operator.post(f"{API}/customers", json={"name": "TEST_X"}).status_code == 403
        assert S.operator.put(f"{API}/customers/{S.customer_id}", json={"name": "TEST_X"}).status_code == 403
        assert S.operator.delete(f"{API}/customers/{S.customer_id}").status_code == 403

    def test_operator_cannot_delete_orders(self):
        order_id = S.operator.get(f"{API}/orders").json()[0]["id"]
        assert S.operator.delete(f"{API}/orders/{order_id}").status_code == 403

    def test_operator_cannot_upload_images(self):
        headers = {"Authorization": S.operator.headers["Authorization"]}
        r = requests.post(f"{API}/upload-image", headers=headers, files={"file": ("x.png", b"x", "image/png")})
        assert r.status_code == 403


class TestProductDiscountReset:
    def test_explicit_zero_resets_discount(self):
        r = S.admin.put(f"{API}/products/{S.product['id']}", json={"name": "TEST_Sec_Product", "price_no_vat": 100, "discount": 0})
        assert r.status_code == 200, r.text
        assert r.json()["discount"] == 0

    def test_missing_discount_keeps_stored_values(self):
        S.admin.put(f"{API}/products/{S.product['id']}", json={"name": "TEST_Sec_Product", "price_no_vat": 100, "discount": 10})
        r = S.admin.put(f"{API}/products/{S.product['id']}", json={"name": "TEST_Sec_Product", "price_no_vat": 100})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["discount"] == 10
        assert 5 in body["discounts"] and 10 in body["discounts"]
        assert 3 in body["additional_discounts"]


class TestAdminLimits:
    def test_admin_cannot_change_other_admin_password(self):
        r = S.admin.put(f"{API}/users/{S.other_admin_id}", json={"password": "Hijacked123!"})
        assert r.status_code == 403

    def test_admin_cannot_deactivate_or_delete_other_admin(self):
        assert S.admin.put(f"{API}/users/{S.other_admin_id}", json={"active": False}).status_code == 403
        assert S.admin.delete(f"{API}/users/{S.other_admin_id}").status_code == 403

    def test_admin_can_edit_own_profile(self):
        # Same payload shape as the admin-web edit form, which always sends `active`.
        r = S.admin.put(f"{API}/users/{S.admin_id}", json={"name": "TEST Sec Admin Renamed", "phone": "+381 601234567", "active": True})
        assert r.status_code == 200, r.text

    def test_admin_cannot_change_own_role_or_status(self):
        assert S.admin.put(f"{API}/users/{S.admin_id}", json={"role": "operator"}).status_code == 403
        assert S.admin.put(f"{API}/users/{S.admin_id}", json={"active": False}).status_code == 403


class TestDeactivatedClient:
    def test_deactivated_client_is_locked_out(self, superadmin_client):
        assert superadmin_client.delete(f"{API}/clients/{S.client_id}").status_code == 200
        r = requests.post(f"{API}/auth/login", json={"email": S.admin_email, "password": PASSWORD})
        assert r.status_code == 403
        # Tokens issued before deactivation stop working too.
        assert S.operator.get(f"{API}/products").status_code == 401
