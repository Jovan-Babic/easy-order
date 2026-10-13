"""Superadmin dashboard numbers (PLAN_SUPERADMIN.md, phase A)."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from helpers import API


def _day(offset):
    return (datetime.now(timezone.utc).date() + timedelta(days=offset)).isoformat()


class S:
    clients = []
    plans = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _client(sa, plan=None, ends_offset=None):
    suffix = uuid.uuid4().hex[:8]
    body = {"name": f"TEST_Ov_{suffix}", "admin_name": "TEST Ov", "admin_email": f"test-ov-{suffix}@easyorder.dev"}
    if plan:
        body["plan_id"] = plan["id"]
        body["subscription_ends_at"] = _day(ends_offset)
    r = sa.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    S.clients.append(r.json()["client"]["id"])
    return r.json()["client"]


def test_only_superadmin(api_client):
    assert api_client.get(f"{API}/superadmin/overview").status_code == 403


def _set_end(sa, cid, iso):
    r = sa.post(f"{API}/subscriptions/{cid}/extend", json={"ends_at": iso})
    assert r.status_code == 200, r.text
    return r.json()["state"]


def test_counts_and_attention(superadmin_client):
    """Calendar billing: monthly clients never get "ending soon" (they get a charge each
    month); an annual one does. Grace = until the block day of the next month."""
    before = superadmin_client.get(f"{API}/superadmin/overview").json()
    plan = superadmin_client.post(f"{API}/plans", json={"name": f"TEST_OvPlan_{uuid.uuid4().hex[:6]}", "modules": []}).json()
    S.plans.append(plan["id"])

    none = _client(superadmin_client)
    far = _client(superadmin_client, plan, 200)
    soon = _client(superadmin_client, plan, 0)
    superadmin_client.post(f"{API}/billing/clients/{soon['id']}/enroll", json={"cycle": "annual"})
    _set_end(superadmin_client, soon["id"], _day(10))
    grace = _client(superadmin_client, plan, 0)
    _set_end(superadmin_client, grace["id"], _day(-40))
    superadmin_client.post(f"{API}/subscriptions/{grace['id']}/extend-due", json={"until": _day(3)})
    locked = _client(superadmin_client, plan, 0)
    _set_end(superadmin_client, locked["id"], _day(-120))
    superadmin_client.post(f"{API}/subscriptions/{locked['id']}/purge-pause", json={"paused": True})
    purge_soon = _client(superadmin_client, plan, 0)
    state = _set_end(superadmin_client, purge_soon["id"], _day(-60))
    locked_days = (datetime.now(timezone.utc).date() - datetime.fromisoformat(state["locked_since"]).date()).days
    gone = _client(superadmin_client, plan, -100)
    assert superadmin_client.delete(f"{API}/clients/{gone['id']}").status_code == 200  # deactivated

    superadmin_client.put(f"{API}/settings", json={"purge_after_days": max(7, locked_days + 5)})
    try:
        after = superadmin_client.get(f"{API}/superadmin/overview").json()
    finally:
        superadmin_client.put(f"{API}/settings", json={"purge_after_days": None})

    def delta(section, key):
        return after[section][key] - before[section][key]

    assert delta("clients", "total") == 7 and delta("clients", "active") == 6
    assert delta("clients", "inactive") == 1 and delta("clients", "locked") == 2
    assert delta("subscriptions", "none") == 1 and delta("subscriptions", "active") == 2
    assert delta("subscriptions", "grace") == 1 and delta("subscriptions", "locked") == 2
    # one admin per active client; the deactivated client's admin isn't counted
    assert after["users"]["by_role"].get("admin", 0) - before["users"]["by_role"].get("admin", 0) == 6
    assert after["users"]["total"] - before["users"]["total"] == 6

    reasons = {a["client_id"]: a for a in after["attention"]}
    assert reasons[soon["id"]]["reason"] == "ending_soon" and reasons[soon["id"]]["date"] == _day(10)
    assert reasons[grace["id"]]["reason"] == "grace"
    assert reasons[locked["id"]]["reason"] == "locked"
    if locked_days + 5 >= 7:
        assert reasons[purge_soon["id"]]["reason"] == "purge_soon"
    for quiet in (none, far, gone):
        assert quiet["id"] not in reasons
    # most urgent first
    rank = {"locked": 0, "blocked_debt": 0, "purge_soon": 1, "payment_overdue": 2, "debt_repeated": 2, "grace": 3,
            "drafts_pending": 4, "setup_unpaid": 4, "ending_soon": 6}
    order = [a["reason"] for a in after["attention"]]
    assert order == sorted(order, key=lambda r: rank[r])


def test_users_list_has_client_names_and_clients_have_user_counts(superadmin_client):
    client = _client(superadmin_client)
    other = _client(superadmin_client)
    users = superadmin_client.get(f"{API}/users").json()
    mine = [u for u in users if u["client_id"] == client["id"]]
    assert len(mine) == 1 and mine[0]["client_name"] == client["name"]
    assert any(u["role"] == "superadmin" and u["client_name"] is None for u in users)
    filtered = superadmin_client.get(f"{API}/users", params={"client_id": other["id"]}).json()
    assert [u["client_id"] for u in filtered] == [other["id"]]

    rows = {c["id"]: c for c in superadmin_client.get(f"{API}/clients").json()}
    assert rows[client["id"]]["user_count"] == 1
    # a second user in the client
    r = superadmin_client.post(
        f"{API}/users",
        json={"email": f"test-ov-op-{uuid.uuid4().hex[:6]}@easyorder.dev", "name": "TEST Ov Op", "role": "operator", "client_id": client["id"]},
    )
    assert r.status_code == 200, r.text
    assert {c["id"]: c for c in superadmin_client.get(f"{API}/clients").json()}[client["id"]]["user_count"] == 2
    # the detail endpoint doesn't carry the count (it is a list-only figure)
    assert superadmin_client.get(f"{API}/clients/{client['id']}").json()["user_count"] is None
