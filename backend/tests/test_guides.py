"""In-app user guides: one per role, served from backend/public/guides (a copy of docs/uputstva)."""
import pathlib
import uuid

import pytest
import requests

from helpers import API, BASE_URL, activate_invited_user

ROOT = pathlib.Path(__file__).resolve().parents[2]


class S:
    ids = []


def _invite(api_client, role):
    email = f"test-guide-{role}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST guide {role}", "role": role})
    assert r.status_code == 200, r.text
    S.ids.append(r.json()["id"])
    return activate_invited_user(email, r.json()["temporary_password"])


@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    yield
    for uid in S.ids:
        api_client.delete(f"{API}/users/{uid}")


def test_each_role_gets_its_own_guide(api_client):
    for role, word in (("operator", "komercijalistu"), ("warehouse", "magacin")):
        session = _invite(api_client, role)
        body = session.get(f"{API}/guide").json()
        assert body["role"] == role and word in body["title"].lower()
        assert body["available_roles"] == [role]
        assert "](/api/guide/image/" in body["markdown"] and "](slike/" not in body["markdown"]
        assert not body["markdown"].startswith("---")  # front matter is parsed away
        # nobody reads another role's guide
        other = "admin" if role == "operator" else "operator"
        assert session.get(f"{API}/guide", params={"role": other}).status_code == 403


def test_admin_reads_all_three(api_client):
    first = api_client.get(f"{API}/guide").json()
    assert first["role"] == "admin" and first["available_roles"] == ["admin", "operator", "warehouse"]
    for role in ("operator", "warehouse"):
        assert api_client.get(f"{API}/guide", params={"role": role}).json()["role"] == role


def test_guide_needs_login():
    assert requests.get(f"{API}/guide").status_code in (401, 403)


def test_images(api_client):
    md = api_client.get(f"{API}/guide").json()["markdown"]
    path = md.split("](/api/guide/image/")[1].split(")")[0]
    r = requests.get(f"{API}/guide/image/{path}")  # public, no token
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:4] == b"\x89PNG"
    assert requests.get(f"{API}/guide/image/admin/nope.png").status_code == 404
    assert requests.get(f"{API}/guide/image/admin/..%2Fadmin.md").status_code == 404
    assert requests.get(f"{API}/guide/image/other/01-prijava.png").status_code == 404


def test_published_copy_matches_the_docs():
    """backend/public/guides is made by docs/uputstva/alati/publish_guides.py; the copies must not drift."""
    docs = ROOT / "docs" / "uputstva"
    if not docs.is_dir():
        pytest.skip("docs/ not available")
    published = ROOT / "backend" / "public" / "guides"
    for name in ("komercijalista", "magacin", "admin"):
        assert (docs / f"{name}.md").read_text(encoding="utf-8") == (published / f"{name}.md").read_text(encoding="utf-8"), (
            f"{name}.md differs - run docs/uputstva/alati/publish_guides.py"
        )
        assert sorted(p.name for p in (docs / "slike" / name).glob("*.png")) == sorted(
            p.name for p in (published / "slike" / name).glob("*.png")
        )
