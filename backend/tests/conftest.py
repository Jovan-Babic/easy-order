"""Shared pytest fixtures for backend integration tests.

The server has auth now: every fixture below authenticates as the seeded
demo Admin (see seed_data() in server.py) so requests are scoped to the
demo Client the seeded products/customers/orders belong to.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://order-invoice-app-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_ADMIN_EMAIL = os.environ.get("DEMO_ADMIN_EMAIL", "demo-admin@easyorder.dev")
DEMO_ADMIN_PASSWORD = os.environ.get("DEMO_ADMIN_PASSWORD", "ChangeMe123!")
SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@easyorder.dev")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "ChangeMe123!")


def _authed_session(email: str, password: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    """Authenticated as the seeded demo Admin - scoped to the demo Client."""
    return _authed_session(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def superadmin_client() -> requests.Session:
    return _authed_session(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)


@pytest.fixture(scope="session")
def client(api_client: requests.Session) -> requests.Session:
    """Alias for test_iteration3.py/test_iteration4.py, which use this name."""
    return api_client
