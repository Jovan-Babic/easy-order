"""Manual unlock of an account locked by too many wrong passwords."""
import uuid

import requests

from helpers import API, activate_invited_user, login


def _user(api_client, role="operator"):
    email = f"test-unlock-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": "TEST unlock", "role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    activate_invited_user(email, body["temporary_password"])
    return body["id"], email


def _lock(email):
    for i in range(6):
        requests.post(f"{API}/auth/login", json={"email": email, "password": f"wrong-password{i}"})


def _row(api_client, uid):
    return next(u for u in api_client.get(f"{API}/users").json() if u["id"] == uid)


def test_locked_flag_and_manual_unlock(api_client):
    uid, email = _user(api_client)
    assert _row(api_client, uid)["locked"] is False
    _lock(email)
    assert _row(api_client, uid)["locked"] is True
    # locked even for the right password
    assert requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass123!"}).status_code == 429
    assert api_client.post(f"{API}/users/{uid}/unlock").status_code == 200
    assert _row(api_client, uid)["locked"] is False
    assert login(email, "TestPass123!").get(f"{API}/auth/me").status_code == 200
    api_client.delete(f"{API}/users/{uid}")


def test_new_temporary_password_unlocks(api_client):
    uid, email = _user(api_client)
    _lock(email)
    temp = api_client.post(f"{API}/users/{uid}/reset-password").json()["temporary_password"]
    assert _row(api_client, uid)["locked"] is False
    assert login(email, temp).get(f"{API}/auth/me").status_code == 200
    api_client.delete(f"{API}/users/{uid}")


def test_reset_link_unlocks(api_client):
    uid, email = _user(api_client)
    _lock(email)
    token = requests.post(f"{API}/auth/forgot-password", json={"email": email}).json().get("reset_token")
    assert token, "test server must run with PASSWORD_RESET_DEBUG_TOKEN_IN_RESPONSE=true"
    assert requests.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "Fresh-Pass-123"}).status_code == 200
    assert login(email, "Fresh-Pass-123").get(f"{API}/auth/me").status_code == 200
    api_client.delete(f"{API}/users/{uid}")


def test_unlock_permissions(api_client, superadmin_client):
    uid, email = _user(api_client)
    me = api_client.get(f"{API}/auth/me").json()
    op = login(email, "TestPass123!")
    assert op.post(f"{API}/users/{uid}/unlock").status_code == 403  # a sales rep cannot
    assert api_client.post(f"{API}/users/does-not-exist/unlock").status_code == 404
    # superadmin may unlock anyone; the unlock is audited
    assert superadmin_client.post(f"{API}/users/{uid}/unlock").status_code == 200
    rows = superadmin_client.get(f"{API}/audit", params={"action": "user.unlock", "client_id": me["client_id"]}).json()
    assert any(r["target_name"] == email for r in rows)
    api_client.delete(f"{API}/users/{uid}")
