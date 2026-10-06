"""Delisting (products.active) and the warehouse quick-add flow."""
import uuid

import pytest

from helpers import API, activate_invited_user


class S:
    products = []
    users = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    yield
    for pid in S.products:
        api_client.delete(f"{API}/products/{pid}")
    for uid in S.users:
        api_client.delete(f"{API}/users/{uid}")


def _code():
    return "8" + str(uuid.uuid4().int)[:12]


def _user(api_client, role):
    email = f"test-act-{role}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {role}", "role": role})
    assert r.status_code == 200, r.text
    S.users.append(r.json()["id"])
    return activate_invited_user(email, r.json()["temporary_password"])


def _quick(session, **extra):
    r = session.post(f"{API}/products/quick", json={"name": f"TEST_QA_{uuid.uuid4().hex[:6]}", "barcode": _code(), **extra})
    if r.status_code == 200:
        S.products.append(r.json()["id"])
    return r


def test_warehouse_quick_add_creates_inactive_without_price(api_client):
    wh = _user(api_client, "warehouse")
    r = _quick(wh, manufacturer="ACME", pieces_per_package=12)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["active"] is False and p["price_no_vat"] == 0 and p["manufacturer"] == "ACME"
    # still found by its barcode, and the warehouse still can't edit/delete products
    assert wh.get(f"{API}/products/by-barcode/{p['barcode']}").json()["id"] == p["id"]
    assert wh.put(f"{API}/products/{p['id']}", json={"name": "x"}).status_code == 403
    assert wh.delete(f"{API}/products/{p['id']}").status_code == 403


def test_quick_add_duplicate_barcode_and_roles(api_client):
    wh = _user(api_client, "warehouse")
    op = _user(api_client, "operator")
    first = _quick(wh).json()
    dup = wh.post(f"{API}/products/quick", json={"name": "TEST_QA_dup", "barcode": first["barcode"]})
    assert dup.status_code == 409
    assert op.post(f"{API}/products/quick", json={"name": "TEST_QA_op", "barcode": _code()}).status_code == 403


def test_superadmin_quick_add_needs_client_id(superadmin_client):
    r = superadmin_client.post(f"{API}/products/quick", json={"name": "TEST_QA_sa", "barcode": _code()})
    assert r.status_code == 400


def test_operator_does_not_see_or_order_inactive(api_client):
    op = _user(api_client, "operator")
    wh = _user(api_client, "warehouse")
    p = _quick(wh).json()
    assert p["id"] not in [x["id"] for x in op.get(f"{API}/products").json()]
    assert p["id"] in [x["id"] for x in api_client.get(f"{API}/products").json()]
    assert p["id"] in [x["id"] for x in wh.get(f"{API}/products").json()]
    customer = api_client.get(f"{API}/customers").json()[0]
    r = op.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": p["id"], "ordered_qty": 1}]})
    assert r.status_code == 400


def test_activation_needs_price_then_visible(api_client):
    op = _user(api_client, "operator")
    wh = _user(api_client, "warehouse")
    p = _quick(wh).json()
    bad = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "active": True})
    assert bad.status_code == 400
    ok = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "price_no_vat": 100, "vat_rate": 20, "active": True})
    assert ok.status_code == 200 and ok.json()["active"] is True
    assert p["id"] in [x["id"] for x in op.get(f"{API}/products").json()]
    # delist again, plain edits keep the flag
    off = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "active": False})
    assert off.json()["active"] is False
    keep = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"] + "x"})
    assert keep.json()["active"] is False
    assert p["id"] not in [x["id"] for x in op.get(f"{API}/products").json()]
