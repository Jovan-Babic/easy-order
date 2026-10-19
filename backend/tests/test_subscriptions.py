"""Plans and subscriptions (PLAN_PRETPLATE.md): packages, validity, lock, purge. Every
client with a plan is on calendar billing (PLAN_NAPLATA_KALENDARSKA.md): end dates sit at
a month end and the grace period runs to settings.block_after_day of the next month."""
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests

from helpers import API, TEST_PASSWORD, activate_invited_user, login

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _today():
    return datetime.now(timezone.utc).date()


def _day(offset):
    return (_today() + timedelta(days=offset)).isoformat()


def _month_end(d):
    first_next = date(d.year + d.month // 12, d.month % 12 + 1, 1)
    return first_next - timedelta(days=1)


def _set_end(sa, cid, iso):
    """Exact end date (extend with a date keeps it as given)."""
    r = sa.post(f"{API}/subscriptions/{cid}/extend", json={"ends_at": iso})
    assert r.status_code == 200, r.text
    return r.json()["state"]


class S:
    plans = []
    clients = []


def _plan(sa, modules, name=None):
    r = sa.post(f"{API}/plans", json={"name": name or f"TEST_Plan_{uuid.uuid4().hex[:6]}", "modules": modules})
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _client(sa, plan=None, ends_at=None, **extra):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-sub-{suffix}@easyorder.dev"
    body = {"name": f"TEST_Sub_{suffix}", "admin_name": "TEST Sub Admin", "admin_email": email, **extra}
    if plan:
        body["plan_id"] = plan["id"]
        body["subscription_ends_at"] = ends_at
    r = sa.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    client = r.json()["client"]
    S.clients.append(client["id"])
    admin = activate_invited_user(email, r.json()["temporary_password"])
    return client, admin, email


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _state(sa, client_id):
    return sa.get(f"{API}/subscriptions/{client_id}").json()["row"]["state"]


def test_plan_crud_and_validation(superadmin_client):
    plan = _plan(superadmin_client, ["warehouse", "stock"], name=f"TEST_Plan_{uuid.uuid4().hex[:6]}")
    assert plan["modules"] == ["warehouse", "stock"]
    assert superadmin_client.post(f"{API}/plans", json={"name": plan["name"], "modules": []}).status_code == 409
    assert superadmin_client.post(f"{API}/plans", json={"name": "TEST_bad", "modules": ["expiry"]}).status_code == 400
    upd = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": ["warehouse"]})
    assert upd.status_code == 200 and upd.json()["modules"] == ["warehouse"]
    assert any(p["id"] == plan["id"] for p in superadmin_client.get(f"{API}/plans").json())


def test_only_superadmin_manages_subscriptions(api_client):
    for method, path in (("get", "/plans"), ("get", "/subscriptions"), ("post", "/plans")):
        r = getattr(api_client, method)(f"{API}{path}", **({"json": {"name": "x"}} if method == "post" else {}))
        assert r.status_code == 403, (path, r.status_code)


def test_new_client_on_a_plan(superadmin_client):
    plan = _plan(superadmin_client, ["warehouse", "reports"])
    # no date: valid to the end of this month (the first partial month)
    client, admin, _ = _client(superadmin_client, plan)
    assert client["modules"] == ["warehouse", "reports"]
    assert client["subscription"]["plan_name"] == plan["name"]
    me = admin.get(f"{API}/auth/me").json()
    assert me["modules"] == ["warehouse", "reports"]
    assert me["subscription"]["status"] == "active" and me["subscription"]["ends_at"] == _month_end(_today()).isoformat()
    assert me["subscription"]["billing_cycle"] == "monthly"
    # a later date goes to the end of its month
    later, _, _ = _client(superadmin_client, plan, _day(60))
    assert _state(superadmin_client, later["id"])["ends_at"] == _month_end(_today() + timedelta(days=60)).isoformat()
    # a client without a plan has no subscription block at all
    plain, plain_admin, _ = _client(superadmin_client)
    assert plain_admin.get(f"{API}/auth/me").json()["subscription"] is None


def test_assign_changes_plan_and_modules(superadmin_client):
    small, big = _plan(superadmin_client, []), _plan(superadmin_client, ["warehouse", "stock", "expiry", "reports"])
    client, admin, _ = _client(superadmin_client, small, _day(30))
    assert admin.get(f"{API}/reports/orders").status_code == 403
    r = superadmin_client.post(
        f"{API}/subscriptions/{client['id']}/assign", json={"plan_id": big["id"], "ends_at": _day(365), "note": "upgrade"}
    )
    assert r.status_code == 200 and r.json()["plan_name"] == big["name"] and r.json()["modules"] == big["modules"]
    assert admin.get(f"{API}/reports/orders").status_code == 200
    events = superadmin_client.get(f"{API}/subscriptions/{client['id']}").json()["events"]
    assert events[0]["type"] == "assigned" and events[0]["note"] == "upgrade"
    assert "billing_enrolled" in [e["type"] for e in events]  # on calendar billing since it was created
    row = next(x for x in superadmin_client.get(f"{API}/subscriptions").json() if x["client_id"] == client["id"])
    assert row["state"]["status"] == "active"
    # inactive plans can't be assigned; plans in use can't be deleted
    superadmin_client.put(f"{API}/plans/{small['id']}", json={"name": small["name"], "modules": [], "active": False})
    assert superadmin_client.post(
        f"{API}/subscriptions/{client['id']}/assign", json={"plan_id": small["id"], "ends_at": _day(5)}
    ).status_code == 400
    assert superadmin_client.delete(f"{API}/plans/{big['id']}").status_code == 409


def test_plan_edit_can_reach_its_clients(superadmin_client):
    plan = _plan(superadmin_client, ["warehouse"])
    client, admin, _ = _client(superadmin_client, plan, _day(30))
    superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": ["warehouse", "reports"]})
    assert admin.get(f"{API}/auth/me").json()["modules"] == ["warehouse"]  # not applied unless asked
    superadmin_client.put(
        f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": ["warehouse", "reports"], "apply_to_clients": True}
    )
    assert admin.get(f"{API}/auth/me").json()["modules"] == ["warehouse", "reports"]


def test_modules_come_from_the_plan(superadmin_client):
    plan = _plan(superadmin_client, ["warehouse"])
    client, _, _ = _client(superadmin_client, plan, _day(30))
    r = superadmin_client.put(f"{API}/clients/{client['id']}", json={"name": client["name"], "modules": []})
    assert r.status_code == 400
    ok = superadmin_client.put(f"{API}/clients/{client['id']}", json={"name": "TEST_Sub_renamed"})
    assert ok.status_code == 200 and ok.json()["modules"] == ["warehouse"] and ok.json()["subscription"]["plan_id"] == plan["id"]


def test_grace_then_lock_then_extend(superadmin_client):
    plan = _plan(superadmin_client, ["reports"])
    client, admin, email = _client(superadmin_client, plan, _day(30))
    cid = client["id"]
    last_month_end = date(_today().year, _today().month, 1) - timedelta(days=1)

    # paid to the end of last month, not past the block day: grace - everything still works
    superadmin_client.put(f"{API}/settings", json={"block_after_day": 28})
    try:
        if _today().day <= 28:
            state = _set_end(superadmin_client, cid, last_month_end.isoformat())
            assert state["status"] == "grace"
            me = admin.get(f"{API}/auth/me").json()
            assert me["subscription"]["status"] == "grace"
            assert admin.get(f"{API}/reports/orders").status_code == 200
    finally:
        superadmin_client.put(f"{API}/settings", json={"block_after_day": None})

    # long past: locked - the admin only reaches the billing page, others can't log in
    state = _set_end(superadmin_client, cid, _day(-80))
    assert state["status"] == "locked" and state["locked_since"] and state["purge_at"]
    r = admin.get(f"{API}/reports/orders")
    assert r.status_code == 403 and r.json()["detail"] == "Subscription blocked"
    assert admin.get(f"{API}/billing/me").status_code == 200
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert r.status_code == 200  # the admin still gets in (to see what to pay)

    # extending by months counts from today and unlocks
    r = superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"months": 1, "note": "paid"})
    assert r.status_code == 200 and r.json()["state"]["status"] == "active"
    assert 28 <= r.json()["state"]["days_left"] <= 31
    assert login(email, TEST_PASSWORD).get(f"{API}/reports/orders").status_code == 200
    # either months or a date, never both / neither
    assert superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={}).status_code == 400
    assert superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"months": 1, "ends_at": _day(5)}).status_code == 400
    exact = superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"ends_at": _day(100)})
    assert exact.json()["state"]["days_left"] == 100


def test_cancel_locks_immediately(superadmin_client):
    plan = _plan(superadmin_client, ["reports"])
    client, admin, _ = _client(superadmin_client, plan, _day(200))
    r = superadmin_client.post(f"{API}/subscriptions/{client['id']}/cancel", json={"note": "left"})
    assert r.status_code == 200 and r.json()["state"]["status"] == "locked"
    assert admin.get(f"{API}/reports/orders").status_code == 403
    assert superadmin_client.post(f"{API}/subscriptions/{client['id']}/extend", json={"months": 1}).json()["state"]["status"] == "active"
    plain, _, _ = _client(superadmin_client)
    assert superadmin_client.post(f"{API}/subscriptions/{plain['id']}/cancel", json={}).status_code == 400


def test_superadmin_is_never_locked(superadmin_client):
    assert superadmin_client.get(f"{API}/auth/me").status_code == 200


@pytest.mark.skipif(not CRON_SECRET, reason="needs CRON_SECRET (same value on the server and in the tests)")
class TestCron:
    def _run(self, **params):
        return requests.get(
            f"{API}/internal/cron/subscriptions", params=params, headers={"Authorization": f"Bearer {CRON_SECRET}"}
        )

    def _stocked_client(self, sa, plan):
        client, admin, _ = _client(sa, plan, _day(30))
        product = admin.post(f"{API}/products", json={"name": "TEST_Sub_P", "price_no_vat": 5}).json()
        assert admin.post(f"{API}/stock/receipts", json={"items": [{"product_id": product["id"], "qty": 10}]}).status_code == 200
        return client, product

    def test_needs_the_secret(self):
        assert requests.get(f"{API}/internal/cron/subscriptions").status_code == 401
        bad = requests.get(f"{API}/internal/cron/subscriptions", headers={"Authorization": "Bearer nope"})
        assert bad.status_code == 401

    def test_purge_warning_then_dry_run_then_purge(self, superadmin_client):
        plan = _plan(superadmin_client, ["warehouse", "stock"])
        client, product = self._stocked_client(superadmin_client, plan)
        cid = client["id"]

        # locked for a while; set the purge 5 days ahead -> warning only
        state = _set_end(superadmin_client, cid, _day(-120))
        locked_days = (_today() - date.fromisoformat(state["locked_since"])).days
        superadmin_client.put(f"{API}/settings", json={"purge_after_days": locked_days + 5})
        try:
            run = self._run().json()
            assert client["name"] in run["purge_warnings"] and not [x for x in run["purged"] if x["client"] == client["name"]]
            assert client["name"] not in self._run().json()["purge_warnings"]  # warned once
        finally:
            superadmin_client.put(f"{API}/settings", json={"purge_after_days": None})

        # now past the deadline (default 90 days)
        _set_end(superadmin_client, cid, _day(-200))
        dry = self._run(dry_run="true").json()
        assert dry["live"] is False
        assert any(x["client"] == client["name"] and x["stock_movements"] == 1 for x in dry["would_purge"])
        assert len(superadmin_client.get(f"{API}/subscriptions/{cid}/export").json()["stock_movements"]) == 1

        live = self._run().json()
        entry = next(x for x in live["purged"] if x["client"] == client["name"])
        assert entry["stock_movements"] == 1 and entry["products_reset"] == 1
        exported = superadmin_client.get(f"{API}/subscriptions/{cid}/export").json()
        assert exported["stock_movements"] == [] and exported["stock_batches"] == []
        assert exported["products_stock"][0]["stock_qty"] is None
        events = superadmin_client.get(f"{API}/subscriptions/{cid}").json()["events"]
        assert events[0]["type"] == "purged" and events[0]["source"] == "cron"
        assert client["name"] not in [x["client"] for x in self._run().json()["purged"]]  # only once

    def test_orders_customers_and_products_survive(self, superadmin_client):
        plan = _plan(superadmin_client, ["warehouse", "stock"])
        client, admin, _ = _client(superadmin_client, plan, _day(30))
        product = admin.post(f"{API}/products", json={"name": "TEST_Sub_Keep", "price_no_vat": 5}).json()
        customer = admin.post(f"{API}/customers", json={"name": "TEST_Sub_Cust"}).json()
        order = admin.post(
            f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "ordered_qty": 1}]}
        ).json()
        _set_end(superadmin_client, client["id"], _day(-200))
        assert client["name"] in [x["client"] for x in self._run().json()["purged"]]
        # the account is locked, but the data is all still there
        sa_products = superadmin_client.get(f"{API}/products").json()
        assert any(p["id"] == product["id"] for p in sa_products)
        assert any(o["id"] == order["id"] for o in superadmin_client.get(f"{API}/orders", params={"limit": 500}).json())
        assert any(c["id"] == customer["id"] for c in superadmin_client.get(f"{API}/customers").json())

    def test_paused_purge_is_skipped_and_resumes(self, superadmin_client):
        plan = _plan(superadmin_client, ["warehouse", "stock"])
        client, product = self._stocked_client(superadmin_client, plan)
        cid = client["id"]
        _set_end(superadmin_client, cid, _day(-200))
        paused = superadmin_client.post(f"{API}/subscriptions/{cid}/purge-pause", json={"paused": True, "note": "talking to them"})
        assert paused.json()["purge_paused"] is True
        assert client["name"] not in [x["client"] for x in self._run().json()["purged"]]
        assert len(superadmin_client.get(f"{API}/subscriptions/{cid}/export").json()["stock_movements"]) == 1
        superadmin_client.post(f"{API}/subscriptions/{cid}/purge-pause", json={"paused": False})
        assert client["name"] in [x["client"] for x in self._run().json()["purged"]]

    def test_extending_cancels_a_pending_purge(self, superadmin_client):
        plan = _plan(superadmin_client, ["warehouse", "stock"])
        client, product = self._stocked_client(superadmin_client, plan)
        cid = client["id"]
        _set_end(superadmin_client, cid, _day(-200))
        superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"months": 1})
        assert client["name"] not in [x["client"] for x in self._run().json()["purged"]]
        assert len(superadmin_client.get(f"{API}/subscriptions/{cid}/export").json()["stock_movements"]) == 1
