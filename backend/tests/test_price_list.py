"""One price list for every client (settings `seat_prices`, `module_prices`) and extra modules
on a plan: they show on the monthly total and as lines on the charge draft."""
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from helpers import API, activate_invited_user


def _today():
    return datetime.now(timezone.utc).date()


def _next_month():
    i = _today().month
    return date(_today().year + i // 12, i % 12 + 1, 1)


NEXT = _next_month()


class S:
    plans = []
    clients = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    superadmin_client.put(f"{API}/settings", json={"seat_prices": None, "module_prices": None})
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _plan(sa, **extra):
    body = {"name": f"TEST_PL_{uuid.uuid4().hex[:6]}", "modules": [], "prices": {"1": 10000, "12": 100000}, **extra}
    r = sa.post(f"{API}/plans", json=body)
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _client(sa, plan):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-pl-{suffix}@easyorder.dev"
    r = sa.post(f"{API}/clients", json={
        "name": f"TEST_PL_{suffix}", "admin_name": "TEST PL", "admin_email": email, "plan_id": plan["id"],
        "subscription_ends_at": (_today() + timedelta(days=1)).isoformat(),
    })
    assert r.status_code == 200, r.text
    client = r.json()["client"]
    S.clients.append(client["id"])
    assert sa.post(f"{API}/billing/clients/{client['id']}/enroll", json={"cycle": "monthly"}).status_code == 200
    return client, activate_invited_user(email, r.json()["temporary_password"])


def _draft_lines(sa, cid):
    r = sa.post(f"{API}/billing/drafts/generate", json={"client_ids": [cid], "month": NEXT.strftime("%Y-%m")})
    assert r.status_code == 200, r.text
    return r.json()[0]["charge"]["lines"]


def test_price_list_validation_and_reset(superadmin_client):
    put = lambda body: superadmin_client.put(f"{API}/settings", json=body)  # noqa: E731
    assert put({"module_prices": {"bogus": 100}}).status_code == 400
    assert put({"module_prices": {"sef": -1}}).status_code == 400
    assert put({"seat_prices": {"boss": 1}}).status_code == 400
    out = put({"module_prices": {"sef": 1500, "focus": 0}, "seat_prices": {"operator": 1200}}).json()["values"]
    assert out["module_prices"] == {"sef": 1500.0}  # 0 = no separate price
    assert out["seat_prices"] == {"operator": 1200.0, "warehouse": 1500, "admin": 2000}  # a role not sent keeps its price
    out = put({"module_prices": None, "seat_prices": None}).json()["values"]
    assert out["module_prices"] == {} and out["seat_prices"] == {"operator": 1000, "warehouse": 1500, "admin": 2000}


def test_extra_module_is_priced_on_the_total_and_the_draft(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"module_prices": {"sef": 1500}})
    plan = _plan(superadmin_client, modules=[])
    client, admin = _client(superadmin_client, plan)
    assert "sef" not in admin.get(f"{API}/auth/me").json()["modules"]
    r = superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": ["sef"], "discount_percent": 10})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["modules"] == [{"module": "sef", "price": 1500.0}] and out["modules_amount"] == 1500
    assert out["monthly_total"] == round((10000 + 1500) * 0.9, 2)
    assert "sef" in admin.get(f"{API}/auth/me").json()["modules"]  # switched on for the client
    lines = _draft_lines(superadmin_client, client["id"])
    by_kind = {line["kind"]: line for line in lines}
    assert by_kind["module"]["amount"] == 1500 and by_kind["module"]["module"] == "sef"
    assert by_kind["discount"]["amount"] == -1150.0
    assert sum(line["amount"] for line in lines) == 10350.0


def test_module_in_the_plan_is_not_charged_twice(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"module_prices": {"sef": 1500}})
    plan = _plan(superadmin_client, modules=["sef"])
    client, _ = _client(superadmin_client, plan)
    r = superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": ["sef"]})
    assert r.status_code == 200 and r.json()["modules"] == [] and r.json()["monthly_total"] == 10000
    assert [line["kind"] for line in _draft_lines(superadmin_client, client["id"])] == ["package"]


def test_unpriced_module_is_free_and_dependencies_hold(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"module_prices": None})
    plan = _plan(superadmin_client, modules=[])
    client, admin = _client(superadmin_client, plan)
    r = superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": ["sef"]})
    assert r.status_code == 200 and r.json()["modules"] == [{"module": "sef", "price": None}]
    assert [line["kind"] for line in _draft_lines(superadmin_client, client["id"])] == ["package"]
    # a module needs the ones it builds on (stock needs the warehouse module)
    assert superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": ["stock"]}).status_code == 400


def test_extra_modules_survive_a_plan_change_and_removal_switches_off(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"module_prices": {"sef": 1500}})
    plan, other = _plan(superadmin_client, modules=[]), _plan(superadmin_client, modules=["reports"])
    client, admin = _client(superadmin_client, plan)
    superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": ["sef"]})
    r = superadmin_client.post(f"{API}/subscriptions/{client['id']}/assign", json={"plan_id": other["id"]})
    assert r.status_code == 200, r.text
    assert set(admin.get(f"{API}/auth/me").json()["modules"]) == {"reports", "sef"}
    superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_modules": []})
    assert admin.get(f"{API}/auth/me").json()["modules"] == ["reports"]


def test_seat_price_comes_from_the_price_list(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"seat_prices": {"operator": 1200}})
    plan = _plan(superadmin_client, included_seats={"operator": 1})
    client, _ = _client(superadmin_client, plan)
    r = superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {"operator": 2}})
    assert r.json()["extra_amount"] == 2400 and r.json()["monthly_total"] == 12400
    lines = _draft_lines(superadmin_client, client["id"])
    assert any(line["kind"] == "seats" and line["unit_price"] == 1200 for line in lines)
