"""Phase 4 of RBAC_PLAN.md: per-client invoice settings and invoice numbers."""
import uuid

import pytest

from helpers import API, activate_invited_user


class S:
    pass


def _client_payload(**extra):
    suffix = uuid.uuid4().hex[:8]
    return {
        "name": f"TEST_INV_Client_{suffix}",
        "admin_name": "TEST inv admin",
        "admin_email": f"test-inv-{suffix}@easyorder.dev",
        **extra,
    }


def _make_client(superadmin_client, **extra):
    payload = _client_payload(**extra)
    r = superadmin_client.post(f"{API}/clients", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    admin = activate_invited_user(payload["admin_email"], body["temporary_password"])
    return body["client"], admin


def _flow(admin, qty=5):
    """Create an order as admin, pack it fully and ship it. Returns the shipped response."""
    prod = admin.post(f"{API}/products", json={"name": "TEST_INV_P", "price_no_vat": 10}).json()
    cust = admin.post(f"{API}/customers", json={"name": "TEST_INV_C"}).json()
    o = admin.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": prod["id"], "ordered_qty": qty}]}).json()
    admin.post(f"{API}/orders/{o['id']}/status", json={"status": "in_progress"})
    admin.patch(f"{API}/orders/{o['id']}/items", json={"items": [{"product_id": prod["id"], "picked_qty": qty}]})
    return o["id"]


def _ship(admin, oid, **extra):
    return admin.post(f"{API}/orders/{oid}/status", json={"status": "shipped", **extra})


class TestClientSettings:
    def test_invalid_prefix_rejected(self, superadmin_client):
        r = superadmin_client.post(f"{API}/clients", json=_client_payload(invoice_prefix="bad prefix!"))
        assert r.status_code == 400

    def test_prefix_uppercased_and_me_endpoint(self, superadmin_client):
        client, admin = _make_client(
            superadmin_client, invoice_prefix="abc", registration_number="123", bank_account="160-1-00", logo=""
        )
        assert client["invoice_prefix"] == "ABC" and client["invoice_next_seq"] == 1
        me = admin.get(f"{API}/clients/me")
        assert me.status_code == 200
        assert me.json()["registration_number"] == "123" and me.json()["bank_account"] == "160-1-00"

    def test_superadmin_has_no_own_client(self, superadmin_client):
        assert superadmin_client.get(f"{API}/clients/me").status_code == 404

    def test_admin_cannot_edit_client(self, superadmin_client):
        client, admin = _make_client(superadmin_client, invoice_prefix="ABC")
        r = admin.put(f"{API}/clients/{client['id']}", json={"name": "x"})
        assert r.status_code == 403

    def test_logo_upload_is_superadmin_only(self, superadmin_client):
        _, admin = _make_client(superadmin_client, invoice_prefix="ABC")
        r = admin.post(f"{API}/upload-image", params={"kind": "client_logo"}, files={"file": ("x.png", b"x", "image/png")},
                       headers={"Content-Type": None})
        assert r.status_code == 403


class TestAutoNumbering:
    def test_sequence_continues_and_starts_at_next_seq(self, superadmin_client):
        client, admin = _make_client(superadmin_client, invoice_prefix="ABC", invoice_next_seq=41)
        assert client["invoice_next_seq"] == 41
        first = _ship(admin, _flow(admin))
        assert first.status_code == 200, first.text
        assert first.json()["invoice_number"] == "ABC/0041" and first.json()["invoice_seq"] == 41
        second = _ship(admin, _flow(admin))
        assert second.json()["invoice_number"] == "ABC/0042"
        cur = superadmin_client.get(f"{API}/clients/{client['id']}").json()
        assert cur["invoice_next_seq"] == 43

    def test_counter_only_goes_up(self, superadmin_client):
        client, admin = _make_client(superadmin_client, invoice_prefix="ABC", invoice_next_seq=10)
        cur = superadmin_client.get(f"{API}/clients/{client['id']}").json()
        r = superadmin_client.put(f"{API}/clients/{client['id']}", json={**cur, "invoice_next_seq": 5})
        assert r.status_code == 400
        r = superadmin_client.put(f"{API}/clients/{client['id']}", json={**cur, "invoice_next_seq": 20})
        assert r.status_code == 200 and r.json()["invoice_next_seq"] == 20

    def test_no_prefix_blocks_shipping_and_burns_nothing(self, superadmin_client):
        client, admin = _make_client(superadmin_client)
        oid = _flow(admin)
        r = _ship(admin, oid)
        assert r.status_code == 400
        cur = superadmin_client.get(f"{API}/clients/{client['id']}").json()
        assert cur["invoice_next_seq"] == 1
        superadmin_client.put(f"{API}/clients/{client['id']}", json={**cur, "invoice_prefix": "ZZ"})
        assert _ship(admin, oid).json()["invoice_number"] == "ZZ/0001"

    def test_rejected_orders_do_not_use_numbers(self, superadmin_client):
        _, admin = _make_client(superadmin_client, invoice_prefix="ABC")
        oid = _flow(admin)
        admin.post(f"{API}/orders/{oid}/status", json={"status": "rejected", "note": "x"})
        assert _ship(admin, _flow(admin)).json()["invoice_number"] == "ABC/0001"

    def test_number_survives_override_and_reship(self, superadmin_client):
        _, admin = _make_client(superadmin_client, invoice_prefix="ABC")
        oid = _flow(admin)
        assert _ship(admin, oid).json()["invoice_number"] == "ABC/0001"
        back = admin.post(f"{API}/orders/{oid}/status", json={"status": "in_progress", "note": "ispravka"})
        assert back.status_code == 200 and back.json()["invoice_number"] == "ABC/0001"
        again = _ship(admin, oid)
        assert again.json()["invoice_number"] == "ABC/0001"
        assert _ship(admin, _flow(admin)).json()["invoice_number"] == "ABC/0002"


class TestManualNumbering:
    def test_manual_requires_unique_number(self, superadmin_client):
        _, admin = _make_client(superadmin_client, invoice_numbering="manual")
        a, b = _flow(admin), _flow(admin)
        assert _ship(admin, a).status_code == 400  # number required
        ok = _ship(admin, a, invoice_number="2026-001")
        assert ok.status_code == 200 and ok.json()["invoice_number"] == "2026-001"
        assert ok.json()["invoice_seq"] is None
        dup = _ship(admin, b, invoice_number="2026-001")
        assert dup.status_code == 409
        assert _ship(admin, b, invoice_number="2026-002").status_code == 200

    def test_same_number_allowed_in_another_client(self, superadmin_client):
        _, admin1 = _make_client(superadmin_client, invoice_numbering="manual")
        _, admin2 = _make_client(superadmin_client, invoice_numbering="manual")
        assert _ship(admin1, _flow(admin1), invoice_number="1").status_code == 200
        assert _ship(admin2, _flow(admin2), invoice_number="1").status_code == 200
