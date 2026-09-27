"""Round 2 (.claude/DOCS/IZMENE_RUNDA_2.md): email invites with a temporary
password + forced change, password rules, token_version, lowercase/unique
emails, login and forgot-password limits, image upload limits, and the new
order fields (status, created_by, totals).

Needs a server WITHOUT SMTP configured (temporary passwords are then returned
in the create response). The forgot-password limit test also needs
PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE=true, otherwise it is skipped.
"""
import uuid

import pytest
import requests

from helpers import API, TEST_PASSWORD, activate_invited_user, login


def _email(prefix: str) -> str:
    return f"test-{prefix}-{uuid.uuid4().hex[:8]}@easyorder.dev"


def _invite_operator(api_client, email=None):
    email = email or _email("op")
    r = api_client.post(f"{API}/users", json={"email": email, "name": "TEST Invited", "role": "operator"})
    assert r.status_code == 200, r.text
    return email, r.json()


class TestInvite:
    def test_create_returns_temporary_password_when_email_not_sent(self, api_client):
        _, body = _invite_operator(api_client)
        assert body["invite_sent"] is False
        assert body["must_change_password"] is True
        temp = body["temporary_password"]
        assert len(temp) >= 12
        assert any(c.isalpha() for c in temp) and any(c.isdigit() for c in temp)

    def test_password_in_payload_is_ignored(self, api_client):
        email = _email("op")
        r = api_client.post(
            f"{API}/users",
            json={"email": email, "name": "TEST", "role": "operator", "password": "Chosen12345"},
        )
        assert r.status_code == 200, r.text
        bad = requests.post(f"{API}/auth/login", json={"email": email, "password": "Chosen12345"})
        assert bad.status_code == 401

    def test_client_admin_is_invited_too(self, superadmin_client):
        email = _email("clientadmin")
        r = superadmin_client.post(f"{API}/clients", json={"name": f"TEST_Invite_{uuid.uuid4().hex[:6]}", "admin_name": "A", "admin_email": email})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["temporary_password"]
        assert body["admin_user"]["must_change_password"] is True
        superadmin_client.delete(f"{API}/clients/{body['client']['id']}")


class TestForcedPasswordChange:
    def test_pending_user_can_only_use_me_and_change_password(self, api_client):
        email, body = _invite_operator(api_client)
        s = login(email, body["temporary_password"])
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["must_change_password"] is True
        blocked = s.get(f"{API}/products")
        assert blocked.status_code == 403
        assert blocked.json()["detail"] == "Password change required"

    def test_change_password_validation(self, api_client):
        email, body = _invite_operator(api_client)
        temp = body["temporary_password"]
        s = login(email, temp)
        url = f"{API}/auth/change-password"
        assert s.post(url, json={"current_password": "wrong", "new_password": TEST_PASSWORD}).status_code == 400
        assert s.post(url, json={"current_password": temp, "new_password": "short1"}).status_code == 400
        assert s.post(url, json={"current_password": temp, "new_password": "onlyletters"}).status_code == 400
        assert s.post(url, json={"current_password": temp, "new_password": temp}).status_code == 400

    def test_change_password_unlocks_and_invalidates_old_token(self, api_client):
        email, body = _invite_operator(api_client)
        old = login(email, body["temporary_password"])
        new = activate_invited_user(email, body["temporary_password"])
        assert new.get(f"{API}/products").status_code == 200
        assert new.get(f"{API}/auth/me").json()["must_change_password"] is False
        assert old.get(f"{API}/auth/me").status_code == 401


class TestPasswordSetByAdmin:
    def test_admin_reset_forces_change_and_logs_out(self, api_client):
        email, body = _invite_operator(api_client)
        op = activate_invited_user(email, body["temporary_password"])
        r = api_client.put(f"{API}/users/{body['id']}", json={"password": "NewTemp12345"})
        assert r.status_code == 200, r.text
        assert r.json()["must_change_password"] is True
        assert op.get(f"{API}/products").status_code == 401
        again = login(email, "NewTemp12345")
        assert again.get(f"{API}/products").status_code == 403

    def test_weak_password_rejected_on_update(self, api_client):
        _, body = _invite_operator(api_client)
        r = api_client.put(f"{API}/users/{body['id']}", json={"password": "abc"})
        assert r.status_code == 400

    def test_role_change_logs_out(self, superadmin_client, api_client):
        email, body = _invite_operator(api_client)
        op = activate_invited_user(email, body["temporary_password"])
        r = superadmin_client.put(f"{API}/users/{body['id']}", json={"role": "admin"})
        assert r.status_code == 200, r.text
        assert op.get(f"{API}/auth/me").status_code == 401


class TestEmailNormalization:
    def test_email_stored_lowercase_and_login_case_insensitive(self, api_client):
        raw = f"Test-Case-{uuid.uuid4().hex[:6]}@EasyOrder.DEV"
        _, body = _invite_operator(api_client, raw)
        assert body["email"] == raw.lower()
        r = requests.post(f"{API}/auth/login", json={"email": raw.upper(), "password": body["temporary_password"]})
        assert r.status_code == 200, r.text

    def test_duplicate_with_different_case_rejected(self, api_client):
        raw = _email("dup")
        _invite_operator(api_client, raw)
        r = api_client.post(f"{API}/users", json={"email": raw.upper(), "name": "X", "role": "operator"})
        assert r.status_code == 400


class TestLoginLimit:
    def test_lockout_after_repeated_failures(self, api_client):
        email, body = _invite_operator(api_client)
        for _ in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password1"})
            assert r.status_code == 401
        # Locked even with the right password.
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": body["temporary_password"]})
        assert r.status_code == 429

    def test_success_resets_counter(self, api_client):
        email, body = _invite_operator(api_client)
        for _ in range(4):
            requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password1"})
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": body["temporary_password"]}).status_code == 200
        for _ in range(4):
            requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password1"})
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": body["temporary_password"]}).status_code == 200


class TestForgotPasswordLimit:
    def test_fourth_request_in_an_hour_sends_nothing(self, api_client):
        email, _ = _invite_operator(api_client)
        tokens = []
        for _ in range(4):
            r = requests.post(f"{API}/auth/forgot-password", json={"email": email, "channel": "web"})
            assert r.status_code == 200
            tokens.append(r.json().get("reset_token"))
        if tokens[0] is None:
            pytest.skip("Enable PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE=true to observe the limit")
        assert all(tokens[:3]) and tokens[3] is None


class TestImageUpload:
    def _post(self, session, name, content, content_type):
        headers = {"Authorization": session.headers["Authorization"]}
        return requests.post(f"{API}/upload-image", headers=headers, files={"file": (name, content, content_type)})

    def test_wrong_type_rejected(self, api_client):
        assert self._post(api_client, "x.pdf", b"%PDF-1.4", "application/pdf").status_code == 415

    def test_too_large_rejected(self, api_client):
        big = b"\x89PNG" + b"0" * (4 * 1024 * 1024)
        assert self._post(api_client, "big.png", big, "image/png").status_code == 413


class TestOrderFields:
    def test_order_has_status_author_and_totals(self, api_client):
        product = api_client.post(f"{API}/products", json={"name": "TEST_Totals", "price_no_vat": 100, "vat_rate": 20, "discount": 10}).json()
        customer = api_client.post(f"{API}/customers", json={"name": "TEST_Totals_Cust"}).json()
        me = api_client.get(f"{API}/auth/me").json()
        r = api_client.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "ordered_qty": 3}]})
        assert r.status_code == 200, r.text
        order = r.json()
        try:
            assert order["status"] == "new"
            assert order["created_by_user_id"] == me["id"]
            assert order["created_by_name"] == me["name"]
            # 100 * 3 * 0.9 = 270 net, 20% VAT = 54
            assert order["items"][0]["line_net"] == 270
            assert order["totals"] == {"subtotal": 270, "vat": 54, "grand": 324}
            listed = next(o for o in api_client.get(f"{API}/orders").json() if o["id"] == order["id"])
            assert listed["totals"]["grand"] == 324
        finally:
            api_client.delete(f"{API}/orders/{order['id']}")
            api_client.delete(f"{API}/products/{product['id']}")
            api_client.delete(f"{API}/customers/{customer['id']}")
