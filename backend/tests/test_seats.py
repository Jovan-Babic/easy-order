"""Package accounts and limits (PLAN_SUPERADMIN.md, phase G1): included accounts per
role in the plan, contracted extra accounts per client, limit enforcement, amounts."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from helpers import API, activate_invited_user


def _end():
    return (datetime.now(timezone.utc).date() + timedelta(days=60)).isoformat()


MONTH = f"{datetime.now(timezone.utc).year + 1}-02"
DUE = f"{datetime.now(timezone.utc).year + 1}-02-05"


class S:
    plans = []
    clients = []


def _plan(sa, **extra):
    body = {"name": f"TEST_Seats_{uuid.uuid4().hex[:6]}", "modules": ["warehouse"], **extra}
    r = sa.post(f"{API}/plans", json=body)
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _client(sa, plan=None):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-seat-{suffix}@easyorder.dev"
    body = {"name": f"TEST_Seat_{suffix}", "admin_name": "TEST Seat Admin", "admin_email": email}
    if plan:
        body.update(plan_id=plan["id"], subscription_ends_at=_end())
    r = sa.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    S.clients.append(r.json()["client"]["id"])
    return r.json()["client"], activate_invited_user(email, r.json()["temporary_password"])


def _user(admin, role, client_id=None):
    body = {"email": f"test-seatu-{uuid.uuid4().hex[:8]}@easyorder.dev", "name": "TEST U", "role": role}
    if client_id:
        body["client_id"] = client_id
    return admin.post(f"{API}/users", json=body)


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


class TestPlanFields:
    def test_validation(self, superadmin_client):
        bad = {"name": f"TEST_Bad_{uuid.uuid4().hex[:6]}", "modules": []}
        assert superadmin_client.post(f"{API}/plans", json={**bad, "included_seats": {"boss": 1}}).status_code == 400
        assert superadmin_client.post(f"{API}/plans", json={**bad, "included_seats": {"admin": -1}}).status_code == 400
        assert superadmin_client.post(f"{API}/plans", json={**bad, "seat_prices": {"operator": -5}}).status_code == 400

    def test_update_keeps_when_omitted(self, superadmin_client):
        plan = _plan(superadmin_client, included_seats={"operator": 3}, seat_prices={"operator": 1200})
        r = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": ["warehouse"]})
        assert r.json()["included_seats"] == {"operator": 3}
        assert r.json()["seat_prices"] == {"operator": 1200}
        r = superadmin_client.put(
            f"{API}/plans/{plan['id']}",
            json={"name": plan["name"], "modules": ["warehouse"], "included_seats": {"operator": 4}},
        )
        assert r.json()["included_seats"] == {"operator": 4}


class TestLimits:
    def test_limit_blocks_and_extra_seats_raise_it(self, superadmin_client):
        plan = _plan(superadmin_client, included_seats={"admin": 1, "operator": 1, "warehouse": 1})
        client, admin = _client(superadmin_client, plan)
        assert _user(admin, "operator").status_code == 200
        r = _user(admin, "operator")
        assert r.status_code == 403 and "limit" in r.json()["detail"].lower()
        # another role still has room
        assert _user(admin, "warehouse").status_code == 200
        assert _user(admin, "warehouse").status_code == 403
        # the superadmin is limited as well
        assert _user(superadmin_client, "operator", client["id"]).status_code == 403
        r = superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {"operator": 1}})
        assert r.status_code == 200, r.text
        assert _user(admin, "operator").status_code == 200
        assert _user(admin, "operator").status_code == 403

    def test_deactivate_frees_seat_and_activate_is_checked(self, superadmin_client):
        plan = _plan(superadmin_client, included_seats={"operator": 1})
        _, admin = _client(superadmin_client, plan)
        first = _user(admin, "operator").json()
        assert admin.put(f"{API}/users/{first['id']}", json={"active": False}).status_code == 200
        second = _user(admin, "operator")
        assert second.status_code == 200
        # the old one cannot come back while the seat is taken
        assert admin.put(f"{API}/users/{first['id']}", json={"active": True}).status_code == 403
        # re-sending the same active value for a user already active is fine
        assert admin.put(f"{API}/users/{second.json()['id']}", json={"active": True, "name": "X"}).status_code == 200

    def test_role_change_into_full_role_refused(self, superadmin_client):
        plan = _plan(superadmin_client, included_seats={"operator": 1, "warehouse": 1})
        _, admin = _client(superadmin_client, plan)
        _user(admin, "operator")
        wh = _user(admin, "warehouse").json()
        assert admin.put(f"{API}/users/{wh['id']}", json={"role": "operator"}).status_code == 403

    def test_plan_without_seats_or_no_plan_is_unlimited(self, superadmin_client):
        plan = _plan(superadmin_client)
        _, admin = _client(superadmin_client, plan)
        for _ in range(3):
            assert _user(admin, "operator").status_code == 200
        _, admin2 = _client(superadmin_client)
        for _ in range(3):
            assert _user(admin2, "operator").status_code == 200


class TestAmounts:
    def test_monthly_total_with_discount(self, superadmin_client):
        plan = _plan(
            superadmin_client, prices={"1": 10000, "12": 100000},
            included_seats={"admin": 1, "operator": 2, "warehouse": 1}, seat_prices={"operator": 1000, "warehouse": 1800},
        )
        client, admin = _client(superadmin_client, plan)
        r = superadmin_client.put(
            f"{API}/subscriptions/{client['id']}/seats",
            json={"extra_seats": {"operator": 2, "warehouse": 1}, "discount_percent": 10},
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["package_price"] == 10000
        assert out["extra_amount"] == 3800
        assert out["monthly_total"] == round((10000 + 3800) * 0.9, 2)
        rows = {x["role"]: x for x in out["seats"]}
        assert rows["operator"]["limit"] == 4 and rows["admin"]["used"] == 1
        # the client's admin sees the same figures; others cannot
        mine = admin.get(f"{API}/clients/me/seats")
        assert mine.status_code == 200 and mine.json()["monthly_total"] == out["monthly_total"]
        _user(admin, "operator")

    def test_warehouse_row_hidden_without_module(self, superadmin_client):
        plan = _plan(superadmin_client, modules=[], included_seats={"warehouse": 1})
        client, _ = _client(superadmin_client, plan)
        out = superadmin_client.get(f"{API}/clients/{client['id']}/seats").json()
        assert [x["role"] for x in out["seats"]] == ["admin", "operator"]

    def test_assign_keeps_contracted_seats(self, superadmin_client):
        plan = _plan(superadmin_client, included_seats={"operator": 1})
        client, _ = _client(superadmin_client, plan)
        superadmin_client.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {"operator": 2}, "discount_percent": 5})
        other = _plan(superadmin_client, included_seats={"operator": 3})
        r = superadmin_client.post(f"{API}/subscriptions/{client['id']}/assign", json={"plan_id": other["id"], "ends_at": _end()})
        assert r.status_code == 200, r.text
        out = superadmin_client.get(f"{API}/clients/{client['id']}/seats").json()
        assert {x["role"]: x["limit"] for x in out["seats"]}["operator"] == 5
        assert out["discount_percent"] == 5

    def test_access_rules(self, superadmin_client, api_client):
        plan = _plan(superadmin_client)
        client, admin = _client(superadmin_client, plan)
        assert admin.get(f"{API}/clients/{client['id']}/seats").status_code == 403
        assert admin.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {}}).status_code == 403
        bare, _ = _client(superadmin_client)
        assert superadmin_client.put(f"{API}/subscriptions/{bare['id']}/seats", json={"extra_seats": {}}).status_code == 400
        assert superadmin_client.put(
            f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {"boss": 1}}
        ).status_code == 400


class TestCharges:
    def _setup_client(self, sa):
        plan = _plan(
            sa, prices={"1": 10000}, included_seats={"operator": 1}, seat_prices={"operator": 1000},
        )
        client, admin = _client(sa, plan)
        sa.put(f"{API}/subscriptions/{client['id']}/seats", json={"extra_seats": {"operator": 2}, "discount_percent": 10})
        return client, admin

    def test_setup_charge_and_payment(self, superadmin_client):
        client, _ = self._setup_client(superadmin_client)
        r = superadmin_client.post(
            f"{API}/payments",
            json={"client_id": client["id"], "status": "expected", "amount": 120000, "due_date": DUE,
                  "kind": "setup", "note": "Uvođenje - Napredna"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["kind"] == "setup"
        paid = superadmin_client.post(f"{API}/payments/{r.json()['id']}/receive", json={})
        assert paid.status_code == 200 and paid.json()["status"] == "received" and paid.json()["kind"] == "setup"
        # paying the setup fee does not touch the subscription
        sub = superadmin_client.get(f"{API}/subscriptions/{client['id']}").json()["row"]["state"]
        assert sub["status"] == "active"

    def test_charge_month_preview_and_create(self, superadmin_client):
        client, _ = self._setup_client(superadmin_client)
        url = f"{API}/clients/{client['id']}/charge-month"
        pv = superadmin_client.get(url, params={"month": MONTH}).json()
        assert pv["already_charged"] is False
        assert pv["total"] == round((10000 + 2000) * 0.9, 2)
        assert pv["breakdown"]["package"] == 10000
        assert pv["breakdown"]["seats"] == [{"role": "operator", "extra": 2, "price": 1000, "amount": 2000}]
        r = superadmin_client.post(url, json={"month": MONTH, "due_date": DUE})
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["status"] == "expected" and pay["kind"] == "subscription" and pay["period"] == MONTH
        assert pay["amount"] == pv["total"] and pay["breakdown"]["discount_percent"] == 10
        assert superadmin_client.get(url, params={"month": MONTH}).json()["already_charged"] is True
        assert superadmin_client.post(url, json={"month": MONTH, "due_date": DUE}).status_code == 409
        # canceling lets the month be charged again
        superadmin_client.post(f"{API}/payments/{pay['id']}/cancel", json={})
        assert superadmin_client.post(url, json={"month": MONTH, "due_date": DUE}).status_code == 200

    def test_charge_month_validation(self, superadmin_client, api_client):
        client, admin = self._setup_client(superadmin_client)
        url = f"{API}/clients/{client['id']}/charge-month"
        assert superadmin_client.post(url, json={"month": "02-2099", "due_date": DUE}).status_code == 400
        assert superadmin_client.post(url, json={"month": MONTH, "due_date": "soon"}).status_code == 400
        assert admin.post(url, json={"month": MONTH, "due_date": DUE}).status_code == 403
        free = _plan(superadmin_client)  # no monthly price
        bare, _ = _client(superadmin_client, free)
        assert superadmin_client.post(
            f"{API}/clients/{bare['id']}/charge-month", json={"month": MONTH, "due_date": DUE}
        ).status_code == 400


class TestAttention:
    def _items(self, sa, client_id):
        return [a for a in sa.get(f"{API}/superadmin/overview").json()["attention"] if a["client_id"] == client_id]

    def test_unpaid_setup_is_listed_until_paid(self, superadmin_client):
        plan = _plan(superadmin_client, prices={"1": 5000})
        client, _ = _client(superadmin_client, plan)
        pay = superadmin_client.post(
            f"{API}/payments",
            json={"client_id": client["id"], "status": "expected", "amount": 60000, "due_date": DUE, "kind": "setup"},
        ).json()
        assert "setup_unpaid" in [a["reason"] for a in self._items(superadmin_client, client["id"])]
        superadmin_client.post(f"{API}/payments/{pay['id']}/receive", json={})
        assert "setup_unpaid" not in [a["reason"] for a in self._items(superadmin_client, client["id"])]

    def test_plain_debt_is_not_a_setup_item(self, superadmin_client):
        plan = _plan(superadmin_client, prices={"1": 5000})
        client, _ = _client(superadmin_client, plan)
        superadmin_client.post(
            f"{API}/payments", json={"client_id": client["id"], "status": "expected", "amount": 100, "due_date": DUE}
        )
        assert "setup_unpaid" not in [a["reason"] for a in self._items(superadmin_client, client["id"])]

    def test_month_not_charged_from_the_25th(self, superadmin_client):
        plan = _plan(superadmin_client, prices={"1": 5000})
        client, _ = _client(superadmin_client, plan)
        today = datetime.now(timezone.utc).date()
        this_month = today.strftime("%Y-%m")
        r = superadmin_client.post(f"{API}/clients/{client['id']}/charge-month", json={"month": this_month, "due_date": DUE})
        assert r.status_code == 200, r.text
        reasons = [a["reason"] for a in self._items(superadmin_client, client["id"])]
        # Only from the 25th on, and only for a client already billed month by month.
        assert ("month_not_charged" in reasons) == (today.day >= 25)
