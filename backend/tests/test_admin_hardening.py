"""Fixes from the admin portal audit: input validation, own password, reset-password, audit, delete guards."""
import uuid

import pytest

from helpers import API, activate_invited_user, login


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["id"], email, activate_invited_user(email, body["temporary_password"])


def _product(api_client, **kw):
    return api_client.post(f"{API}/products", json={"name": f"TEST_ADM_{uuid.uuid4().hex[:6]}", "price_no_vat": 10, "vat_rate": 20, **kw})


@pytest.mark.parametrize("bad", [
    {"price_no_vat": -5}, {"vat_rate": 500}, {"vat_rate": -5}, {"discount": 150}, {"discount": -10},
    {"discounts": [200]}, {"additional_discounts": [-1]}, {"discounts": [1] * 100}, {"pieces_per_package": -3},
    {"name": ""}, {"name": "   "}, {"name": "A" * 201}, {"image": "javascript:alert(1)"}, {"price_no_vat": 1e12},
])
def test_product_validation(api_client, bad):
    r = _product(api_client, **bad)
    assert r.status_code == 422, (bad, r.text)


def test_product_valid_values_still_work(api_client):
    r = _product(api_client, discount=10, discounts=[5, 10], additional_discounts=[5], image="https://res.cloudinary.com/x/a.webp")
    assert r.status_code == 200, r.text
    api_client.delete(f"{API}/products/{r.json()['id']}")


@pytest.mark.parametrize("bad", [
    {"pib": "abc<script>"}, {"pib": "12"}, {"email": "notanemail"}, {"address": "A" * 301}, {"name": ""}, {"phone": "9" * 41},
])
def test_customer_validation(api_client, bad):
    r = api_client.post(f"{API}/customers", json={"name": "TEST_ADM_C", **bad})
    assert r.status_code == 422, (bad, r.text)


def test_customer_valid(api_client):
    r = api_client.post(f"{API}/customers", json={"name": "  TEST_ADM_C  ", "pib": "123456789", "email": "a@b.rs", "phone": "+381 64 1"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "TEST_ADM_C"
    api_client.delete(f"{API}/customers/{r.json()['id']}")


def test_user_validation(api_client):
    assert api_client.post(f"{API}/users", json={"email": "x1@easyorder.dev", "name": "", "role": "operator"}).status_code == 422
    assert api_client.post(f"{API}/users", json={"email": "x2@easyorder.dev", "name": "n" * 101, "role": "operator"}).status_code == 422


def test_own_password_only_through_change_password(api_client):
    me = api_client.get(f"{API}/auth/me").json()
    r = api_client.put(f"{API}/users/{me['id']}", json={"password": "Brand-New-123"})
    assert r.status_code == 403
    assert api_client.get(f"{API}/auth/me").status_code == 200  # the session was not touched


def test_reset_password_gives_generated_temporary_password(api_client):
    uid, email, op = _invite(api_client, "operator", "adm-reset")
    r = api_client.post(f"{API}/users/{uid}/reset-password")
    assert r.status_code == 200, r.text
    temp = r.json()["temporary_password"]
    assert temp and login(email, temp).get(f"{API}/auth/me").json()["must_change_password"] is True
    assert op.get(f"{API}/auth/me").status_code == 401
    me = api_client.get(f"{API}/auth/me").json()
    assert api_client.post(f"{API}/users/{me['id']}/reset-password").status_code == 403
    api_client.delete(f"{API}/users/{uid}")


def test_admin_actions_are_audited_but_only_the_superadmin_reads_the_log(api_client, superadmin_client):
    uid, email, _ = _invite(api_client, "operator", "adm-audit")
    api_client.post(f"{API}/users/{uid}/reset-password")
    api_client.delete(f"{API}/users/{uid}")
    assert api_client.get(f"{API}/audit").status_code == 403
    me = api_client.get(f"{API}/clients/me").json()
    rows = superadmin_client.get(f"{API}/audit", params={"action": "user.", "client_id": me["id"], "limit": 100})
    assert rows.status_code == 200, rows.text
    mine = [r for r in rows.json() if r["target_name"] == email]
    assert {"user.create", "user.reset_password", "user.delete"} <= {r["action"] for r in mine}


def test_cannot_delete_what_has_history_but_can_deactivate(api_client):
    uid, email, op = _invite(api_client, "operator", "adm-hist")
    cust = api_client.post(f"{API}/customers", json={"name": "TEST_ADM_HIST"}).json()
    prod = _product(api_client).json()
    r = op.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": prod["id"], "ordered_qty": 1}]})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    assert api_client.delete(f"{API}/customers/{cust['id']}").status_code == 409
    assert api_client.delete(f"{API}/products/{prod['id']}").status_code == 409
    assert api_client.delete(f"{API}/users/{uid}").status_code == 409
    # deactivate the customer: sales reps no longer see it and cannot order for it
    c = api_client.put(f"{API}/customers/{cust['id']}", json={"name": "TEST_ADM_HIST", "active": False})
    assert c.status_code == 200 and c.json()["active"] is False
    assert cust["id"] not in [x["id"] for x in op.get(f"{API}/customers").json()]
    assert cust["id"] in [x["id"] for x in api_client.get(f"{API}/customers").json()]
    assert op.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": prod["id"], "ordered_qty": 1}]}).status_code == 400
    # an update that does not send `active` keeps it
    assert api_client.put(f"{API}/customers/{cust['id']}", json={"name": "TEST_ADM_HIST 2"}).json()["active"] is False
    api_client.delete(f"{API}/orders/{oid}")
    assert api_client.delete(f"{API}/customers/{cust['id']}").status_code == 200
    assert api_client.delete(f"{API}/products/{prod['id']}").status_code == 200
    assert api_client.delete(f"{API}/users/{uid}").status_code == 200
