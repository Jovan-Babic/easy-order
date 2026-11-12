"""Public website (landing): price list and contact details without a login, the contact form
(stored as an inquiry, honeypot, limits) and the superadmin's inquiry list."""
import uuid

import pytest
import requests

from helpers import API


class S:
    plans = []
    inquiries = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    superadmin_client.put(f"{API}/settings", json={
        "module_prices": None, "site_phone": None, "site_email": None, "site_address": None, "site_inquiry_to": None,
    })
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")
    for iid in S.inquiries:
        superadmin_client.delete(f"{API}/inquiries/{iid}")


def _plan(sa, **extra):
    body = {"name": f"TEST_PUB_{uuid.uuid4().hex[:6]}", "modules": ["warehouse"], "prices": {"1": 9000, "12": 90000},
            "included_seats": {"operator": 3}, **extra}
    r = sa.post(f"{API}/plans", json=body)
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _anon():
    return requests.Session()


def _form(**extra):
    return {"name": "TEST Kupac", "company": "TEST d.o.o.", "email": f"test-inq-{uuid.uuid4().hex[:8]}@easyorder.dev",
            "message": "Zanima nas probni period.", **extra}


def _find_inquiry(sa, email):
    rows = sa.get(f"{API}/inquiries").json()
    found = [r for r in rows if r.get("email") == email]
    S.inquiries.extend(r["id"] for r in found)
    return found


def test_plan_is_private_until_marked_public(superadmin_client):
    plan = _plan(superadmin_client)
    assert plan["public"] is False
    names = [p["name"] for p in _anon().get(f"{API}/public/pricing").json()["plans"]]
    assert plan["name"] not in names
    r = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": plan["modules"], "public": True})
    assert r.status_code == 200 and r.json()["public"] is True
    # an update without `public` keeps it
    r = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": plan["modules"]})
    assert r.json()["public"] is True
    r = _anon().get(f"{API}/public/pricing")
    assert r.status_code == 200
    assert "max-age" in r.headers.get("cache-control", "")
    row = next(p for p in r.json()["plans"] if p["id"] == plan["id"])
    assert row == {"id": plan["id"], "name": plan["name"], "description": "", "modules": ["warehouse"],
                   "included_seats": {"operator": 3}, "prices": {"1": 9000.0, "12": 90000.0}}


def test_inactive_public_plan_is_hidden(superadmin_client):
    plan = _plan(superadmin_client, public=True, active=False)
    assert plan["id"] not in [p["id"] for p in _anon().get(f"{API}/public/pricing").json()["plans"]]


def test_public_plans_sorted_by_monthly_price(superadmin_client):
    cheap = _plan(superadmin_client, public=True, prices={"1": 1})
    yearly = _plan(superadmin_client, public=True, prices={"12": 24})  # = 2 a month
    ids = [p["id"] for p in _anon().get(f"{API}/public/pricing").json()["plans"]]
    assert ids.index(cheap["id"]) < ids.index(yearly["id"])


def test_price_list_follows_the_settings(superadmin_client):
    assert superadmin_client.put(f"{API}/settings", json={"module_prices": {"sef": 2500, "visits": 0}}).status_code == 200
    body = _anon().get(f"{API}/public/pricing").json()
    assert body["module_prices"] == {"sef": 2500.0}  # 0 = not priced, not shown
    assert set(body["seat_prices"]) <= {"admin", "warehouse", "operator"}
    assert body["currency"] == "RSD" and isinstance(body["first_month_free"], bool)


def test_public_contact_details(superadmin_client):
    r = superadmin_client.put(f"{API}/settings", json={"site_phone": "+381 11 123 4567", "site_email": "Prodaja@EasyOrder.dev"})
    assert r.status_code == 200, r.text
    body = _anon().get(f"{API}/public/contact").json()
    assert body == {"phone": "+381 11 123 4567", "email": "prodaja@easyorder.dev", "address": None}
    assert superadmin_client.put(f"{API}/settings", json={"site_email": "not-an-email"}).status_code == 400


def test_contact_form_is_stored_and_listed(superadmin_client):
    form = _form(plan="Osnovni", lang="en", phone="064 123 4567")
    r = _anon().post(f"{API}/public/contact", json=form)
    assert r.status_code == 200 and r.json() == {"ok": True}
    [row] = _find_inquiry(superadmin_client, form["email"])
    assert row["status"] == "new" and row["plan"] == "Osnovni" and row["lang"] == "en" and row["company"] == "TEST d.o.o."
    assert row["email_sent"] is False  # SMTP is off on the test server
    assert superadmin_client.get(f"{API}/superadmin/overview").json()["inquiries_new"] >= 1
    r = superadmin_client.put(f"{API}/inquiries/{row['id']}", json={"status": "handled"})
    assert r.status_code == 200 and r.json()["status"] == "handled" and r.json()["handled_by"]
    assert row["id"] not in [x["id"] for x in superadmin_client.get(f"{API}/inquiries?status=new").json()]
    assert superadmin_client.delete(f"{API}/inquiries/{row['id']}").status_code == 200
    assert superadmin_client.put(f"{API}/inquiries/{row['id']}", json={"status": "new"}).status_code == 404


def test_contact_form_validation(superadmin_client):
    anon = _anon()
    assert anon.post(f"{API}/public/contact", json=_form(email=None)).status_code == 400  # neither email nor phone
    assert anon.post(f"{API}/public/contact", json=_form(email="nope")).status_code == 422
    assert anon.post(f"{API}/public/contact", json=_form(email=None, phone="abc")).status_code == 422
    assert anon.post(f"{API}/public/contact", json=_form(message="   ")).status_code == 400
    assert anon.post(f"{API}/public/contact", json=_form(message="x" * 3001)).status_code == 422


def test_honeypot_keeps_nothing(superadmin_client):
    form = _form(website="http://spam.example")
    assert _anon().post(f"{API}/public/contact", json=form).status_code == 200
    assert _find_inquiry(superadmin_client, form["email"]) == []


def test_contact_form_limit_per_sender(superadmin_client):
    form = _form()
    for _ in range(3):
        assert _anon().post(f"{API}/public/contact", json=form).status_code == 200
    assert _anon().post(f"{API}/public/contact", json=form).status_code == 429
    assert len(_find_inquiry(superadmin_client, form["email"])) == 3


def test_inquiries_are_superadmin_only(client):
    assert client.get(f"{API}/inquiries").status_code == 403
    assert _anon().get(f"{API}/inquiries").status_code in (401, 403)
