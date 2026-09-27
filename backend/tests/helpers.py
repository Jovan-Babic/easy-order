"""Shared helpers for the integration tests (imported as `from helpers import ...`)."""
import os

import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
TEST_PASSWORD = "TestPass123!"


def login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def activate_invited_user(email: str, temporary_password: str, new_password: str = TEST_PASSWORD) -> requests.Session:
    """Invited users must replace their temporary password before anything
    else works. Logs in with it, sets `new_password`, returns a session
    holding the fresh token from /auth/change-password."""
    assert temporary_password, (
        "No temporary_password in the create response - the test server must run "
        "without SMTP configured, otherwise the password only goes out by email"
    )
    s = login(email, temporary_password)
    r = s.post(
        f"{API}/auth/change-password",
        json={"current_password": temporary_password, "new_password": new_password},
    )
    r.raise_for_status()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s
