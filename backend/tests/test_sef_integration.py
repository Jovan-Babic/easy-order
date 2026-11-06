"""SEF module (phase S3) end to end against a fake SEF (tests/fake_sef.py).
The API server must run with SEF_BASE_URL=http://127.0.0.1:8765 (CI sets it); otherwise these tests skip."""
import uuid

import pytest

import fake_sef
from helpers import API, activate_invited_user

PIB = "109876541"  # a PIB with a valid check digit


class S:
    client = None
    admin = None
    wh = None
    other_admin = None
    customer = None
    orders = []
    products = []


def _invite_admin(superadmin, modules, label):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-sef-{label}-{suffix}@easyorder.dev"
    r = superadmin.post(f"{API}/clients", json={"name": f"TEST_Sef_{label}_{suffix}", "admin_name": "TEST Sef", "admin_email": email, "modules": modules})
    assert r.status_code == 200, r.text
    client = r.json()["client"]
    return client, activate_invited_user(email, r.json()["temporary_password"])


@pytest.fixture(scope="module", autouse=True)
def world(superadmin_client):
    fake_sef.start()
    S.client, S.admin = _invite_admin(superadmin_client, ["warehouse", "sef"], "main")
    probe = S.admin.get(f"{API}/integrations/sef")
    if probe.status_code != 200 or probe.json().get("base_url_override") != fake_sef.URL:
        pytest.skip("API server is not pointed at the fake SEF (SEF_BASE_URL)")
    other, S.other_admin = _invite_admin(superadmin_client, ["warehouse", "sef"], "other")
    cur = superadmin_client.get(f"{API}/clients/{S.client['id']}").json()
    r = superadmin_client.put(f"{API}/clients/{S.client['id']}", json={
        **cur, "pib": PIB, "registration_number": "20869500", "street": "Bulevar 1", "city": "Beograd",
        "postal_code": "11000", "vat_payer": True, "bank_account": "160-0000000012345-98",
        "invoice_prefix": "SEF", "invoice_numbering": "auto",
    })
    assert r.status_code == 200, r.text
    r = S.admin.post(f"{API}/users", json={"email": f"test-sef-wh-{uuid.uuid4().hex[:8]}@easyorder.dev", "name": "TEST wh", "role": "warehouse"})
    S.wh = activate_invited_user(r.json()["email"], r.json()["temporary_password"])
    S.customer = S.admin.post(f"{API}/customers", json={
        "name": "TEST_Sef_Kupac", "pib": "100000000", "registration_number": "12345678",
        "street": "Ulica 5", "city": "Novi Sad", "postal_code": "21000",
    }).json()
    yield
    for cid in (S.client["id"], other["id"]):
        superadmin_client.delete(f"{API}/clients/{cid}")


@pytest.fixture(autouse=True)
def clean_fake():
    fake_sef.reset()
    yield


def _set_key(key="fake-ok-1234567", **extra):
    r = S.admin.put(f"{API}/integrations/sef", json={"api_key": key, "enabled": True, "env": "demo", **extra})
    assert r.status_code == 200, r.text
    return r.json()


def _shipped_order(name="Artikal", customer=None):
    p = S.admin.post(f"{API}/products", json={"name": f"TEST_{name}", "price_no_vat": 100, "vat_rate": 20}).json()
    r = S.admin.post(f"{API}/orders", json={"customer_id": (customer or S.customer)["id"], "items": [{"product_id": p["id"], "ordered_qty": 3}]})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    assert S.wh.post(f"{API}/orders/{oid}/status", json={"status": "in_progress"}).status_code == 200
    S.wh.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": p["id"], "picked_qty": 3}]})
    r = S.wh.post(f"{API}/orders/{oid}/status", json={"status": "shipped"})
    assert r.status_code == 200, r.text
    return r.json()


def _preview(oid, **body):
    r = S.admin.post(f"{API}/orders/{oid}/einvoice/preview", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_key_is_stored_encrypted_and_never_returned():
    out = _set_key("fake-ok-SECRETKEY9876")
    assert out["key_set"] is True and out["keys"]["demo"]["hint"] == "…9876" and out["env"] == "demo"
    assert out["keys"]["production"]["set"] is False
    assert "SECRETKEY" not in str(out) and "SECRETKEY" not in S.admin.get(f"{API}/integrations/sef").text
    out = S.admin.put(f"{API}/integrations/sef", json={"payment_terms_days": 30}).json()
    assert out["key_set"] is True and out["payment_terms_days"] == 30  # None keeps the key
    assert S.admin.put(f"{API}/integrations/sef", json={"payment_terms_days": 400}).status_code == 422
    out = S.admin.put(f"{API}/integrations/sef", json={"api_key": ""}).json()
    assert out["key_set"] is False


def test_demo_and_production_keys_are_kept_apart():
    S.admin.put(f"{API}/integrations/sef", json={"api_key": "", "key_env": "demo"})
    S.admin.put(f"{API}/integrations/sef", json={"api_key": "", "key_env": "production"})
    out = S.admin.put(f"{API}/integrations/sef", json={"api_key": "fake-demo-AAAA1111", "key_env": "demo", "env": "demo"}).json()
    assert out["keys"]["demo"]["set"] and not out["keys"]["production"]["set"]
    out = S.admin.put(f"{API}/integrations/sef", json={"api_key": "fake-prod-BBBB2222", "key_env": "production"}).json()
    assert out["env"] == "demo"  # saving a key does not switch the environment
    assert out["keys"]["demo"]["hint"] == "…1111" and out["keys"]["production"]["hint"] == "…2222"
    # switching the environment keeps both keys; the check runs against the key of the chosen one
    out = S.admin.put(f"{API}/integrations/sef", json={"env": "production"}).json()
    assert out["env"] == "production" and out["key_set"] is True and out["keys"]["demo"]["set"]
    assert S.admin.post(f"{API}/integrations/sef/test").json()["env"] == "production"
    assert S.admin.post(f"{API}/integrations/sef/test", params={"env": "demo"}).json()["env"] == "demo"
    # removing one leaves the other; a missing key of the chosen environment stops sending
    out = S.admin.put(f"{API}/integrations/sef", json={"api_key": "", "key_env": "production"}).json()
    assert out["key_set"] is False and out["keys"]["demo"]["set"] is True
    assert S.admin.post(f"{API}/integrations/sef/test").status_code == 400
    S.admin.put(f"{API}/integrations/sef", json={"env": "demo"})
    S.admin.put(f"{API}/integrations/sef", json={"api_key": "", "key_env": "demo"})  # leave no key behind


def test_connection_check():
    assert S.admin.post(f"{API}/integrations/sef/test").status_code == 400  # no key yet
    _set_key("fake-bad")
    r = S.admin.post(f"{API}/integrations/sef/test").json()
    assert r["ok"] is False and "401" in r["message"]
    _set_key("fake-ok-1234567")
    r = S.admin.post(f"{API}/integrations/sef/test").json()
    assert r["ok"] is True and "3.7" in r["message"]
    assert S.admin.get(f"{API}/integrations/sef").json()["keys"]["demo"]["last_check_ok"] is True


def test_roles_and_modules():
    assert S.wh.get(f"{API}/integrations/sef").status_code == 403
    order = _shipped_order()
    assert S.wh.post(f"{API}/orders/{order['id']}/einvoice/preview", json={}).status_code == 403
    assert S.other_admin.get(f"{API}/orders/{order['id']}/einvoice").status_code == 404  # someone else's order


def test_module_is_off_for_clients_without_it(api_client):
    assert api_client.get(f"{API}/integrations/sef").status_code == 403


def test_preview_lists_what_is_missing_and_never_guesses():
    bare = S.admin.post(f"{API}/customers", json={"name": "TEST_Sef_Bare"}).json()
    order = _shipped_order("Bare", bare)
    out = _preview(order["id"])
    assert set(out["problems"]) >= {"buyer.pib", "buyer.registration_number", "buyer.street", "buyer.city", "buyer.postal_code"}
    assert out["amounts"]["grand"] == 360.0
    r = S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={})
    assert r.status_code in (400, 422)  # enabled flag or problems stop it; nothing is sent
    assert fake_sef.State.uploads == []


def test_preview_ok_and_validation_on_demo():
    _set_key()
    order = _shipped_order()
    out = _preview(order["id"], include_xml=True, validate_on_sef=True)
    assert out["problems"] == [] and out["number"].startswith("SEF/")
    assert out["validation"] == {"ok": True, "message": None}
    assert f"<cbc:ID>{out['number']}</cbc:ID>" in out["xml"]
    assert fake_sef.State.invoices == {}  # a validation never creates an invoice
    assert fake_sef.State.uploads[-1]["validate_only"] is True


def test_validation_is_demo_only():
    _set_key(env="production")
    order = _shipped_order()
    out = _preview(order["id"], validate_on_sef=True)
    assert out["validation"]["ok"] is False and fake_sef.State.uploads == []
    _set_key(env="demo")


def test_send_status_cancel_and_storno():
    _set_key()
    order = _shipped_order()
    r = S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={})
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["status"] == "sent" and inv["sef_invoice_id"] and inv["amounts"]["grand"] == 360.0
    assert "ubl_xml" not in inv
    assert len(fake_sef.State.invoices) == 1 and fake_sef.State.uploads[-1]["validate_only"] is False
    # a second click does not create a second invoice
    assert S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).status_code == 409
    assert len(fake_sef.State.invoices) == 1
    # status follows SEF
    fake_sef.State.invoices[inv["sef_invoice_id"]]["status"] = "Approved"
    cur = S.admin.get(f"{API}/orders/{order['id']}/einvoice").json()["current"]
    assert cur["status"] == "approved" and cur["sef_status"] == "Approved"
    # an approved invoice cannot be cancelled, only stornoed
    r = S.admin.post(f"{API}/orders/{order['id']}/einvoice/cancel", json={"comment": "x"})
    assert r.status_code == 422 and "cannot be cancelled" in str(r.json())
    r = S.admin.post(f"{API}/orders/{order['id']}/einvoice/storno", json={"comment": "Greška u količini"})
    assert r.status_code == 200 and r.json()["status"] == "storno"
    assert S.admin.get(f"{API}/orders/{order['id']}/einvoice/xml").text.startswith("<?xml")


def test_cancel_before_approval():
    _set_key()
    order = _shipped_order()
    S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={})
    r = S.admin.post(f"{API}/orders/{order['id']}/einvoice/cancel", json={"comment": "Pogrešan kupac"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert S.admin.post(f"{API}/orders/{order['id']}/einvoice/cancel", json={"comment": ""}).status_code == 422


def test_rejected_by_sef_is_shown_not_hidden():
    _set_key()
    order = _shipped_order("REJECTME")
    inv = S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).json()
    assert inv["status"] == "error" and inv["error_code"] == "TestRejection" and "Test rejection" in inv["error_text"]
    assert fake_sef.State.invoices == {}


def test_no_answer_keeps_sending_and_a_repeat_does_not_duplicate():
    _set_key("fake-down")
    order = _shipped_order()
    inv = S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).json()
    assert inv["status"] == "sending" and inv["error_http"] == 503
    request_id = inv["request_id"]
    _set_key("fake-ok-1234567")
    inv = S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).json()
    assert inv["status"] == "sent" and inv["request_id"] == request_id  # the same requestId again
    assert len(fake_sef.State.invoices) == 1


def test_disabled_integration_does_not_send():
    _set_key()
    S.admin.put(f"{API}/integrations/sef", json={"enabled": False})
    order = _shipped_order()
    assert S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).status_code == 400
    S.admin.put(f"{API}/integrations/sef", json={"enabled": True})


# ---------------------------------------------------------------- clients without the warehouse module


def _no_warehouse_world(superadmin, numbering="auto"):
    client, admin = _invite_admin(superadmin, ["sef"], "nowh")
    cur = superadmin.get(f"{API}/clients/{client['id']}").json()
    r = superadmin.put(f"{API}/clients/{client['id']}", json={
        **cur, "pib": PIB, "registration_number": "20869500", "street": "Bulevar 1", "city": "Beograd",
        "postal_code": "11000", "vat_payer": True, "bank_account": "160-0000000012345-98",
        "invoice_prefix": "NW", "invoice_numbering": numbering,
    })
    assert r.status_code == 200, r.text
    customer = admin.post(f"{API}/customers", json={
        "name": "TEST_NW_Kupac", "pib": "100000000", "registration_number": "12345678",
        "street": "Ulica 5", "city": "Novi Sad", "postal_code": "21000",
    }).json()
    product = admin.post(f"{API}/products", json={"name": "TEST_NW_Artikal", "price_no_vat": 200, "vat_rate": 20}).json()
    order = admin.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "ordered_qty": 2}]})
    assert order.status_code == 200, order.text
    admin.put(f"{API}/integrations/sef", json={"api_key": "fake-ok-1234567", "enabled": True, "env": "demo"})
    return client, admin, order.json()


def test_client_without_warehouse_invoices_a_new_order(superadmin_client):
    client, admin, order = _no_warehouse_world(superadmin_client)
    try:
        oid = order["id"]
        out = admin.post(f"{API}/orders/{oid}/einvoice/preview", json={}).json()
        assert out["problems"] == [] and out["number_pending"] is True and out["delivery_editable"] is True
        assert out["number"] is None and out["amounts"]["grand"] == 480.0  # by the ordered quantity
        assert admin.get(f"{API}/orders/{oid}").json()["invoice_number"] in (None, "")  # a preview draws no number
        r = admin.post(f"{API}/orders/{oid}/einvoice", json={})
        assert r.status_code == 200 and r.json()["status"] == "sent" and r.json()["number"] == "NW/0001"
        assert admin.get(f"{API}/orders/{oid}").json()["invoice_number"] == "NW/0001"
        # an invoiced order is frozen: no edit, delete or status change
        body = {"customer_id": order["customer_id"], "items": [{"product_id": order["items"][0]["product_id"], "ordered_qty": 5}]}
        assert admin.put(f"{API}/orders/{oid}", json=body).status_code == 409
        assert admin.delete(f"{API}/orders/{oid}").status_code == 409
        assert admin.post(f"{API}/orders/{oid}/status", json={"status": "canceled"}).status_code == 409
        # after the invoice is cancelled the order can be changed again
        assert admin.post(f"{API}/orders/{oid}/einvoice/cancel", json={"comment": "Greška"}).status_code == 200
        assert admin.put(f"{API}/orders/{oid}", json=body).status_code == 200
    finally:
        superadmin_client.delete(f"{API}/clients/{client['id']}")


def test_manual_numbering_needs_a_typed_number(superadmin_client):
    client, admin, order = _no_warehouse_world(superadmin_client, numbering="manual")
    try:
        oid = order["id"]
        out = admin.post(f"{API}/orders/{oid}/einvoice/preview", json={}).json()
        assert out["manual_numbering"] is True and out["problems"] == ["invoice_number"]
        assert admin.post(f"{API}/orders/{oid}/einvoice", json={}).status_code == 422
        r = admin.post(f"{API}/orders/{oid}/einvoice", json={"invoice_number": "RN-2026/77"})
        assert r.status_code == 200 and r.json()["number"] == "RN-2026/77"
        assert fake_sef.State.uploads and "RN-2026/77" in fake_sef.State.uploads[-1]["xml"]
    finally:
        superadmin_client.delete(f"{API}/clients/{client['id']}")


def test_warehouse_client_still_needs_shipping():
    p = S.admin.post(f"{API}/products", json={"name": "TEST_NotShipped", "price_no_vat": 10, "vat_rate": 20}).json()
    o = S.admin.post(f"{API}/orders", json={"customer_id": S.customer["id"], "items": [{"product_id": p["id"], "ordered_qty": 1}]}).json()
    out = S.admin.post(f"{API}/orders/{o['id']}/einvoice/preview", json={}).json()
    assert "not_shipped" in out["problems"]


def test_shipped_order_with_an_invoice_cannot_change_status():
    _set_key()
    order = _shipped_order()
    assert S.admin.post(f"{API}/orders/{order['id']}/einvoice", json={}).status_code == 200
    r = S.admin.post(f"{API}/orders/{order['id']}/status", json={"status": "new", "note": "vraćam"})
    assert r.status_code == 409
