"""Plan prices, payments, debts and pay-and-extend (PLAN_SUPERADMIN.md, phase C)."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from helpers import API


def _today():
    return datetime.now(timezone.utc).date()


def _day(offset):
    return (_today() + timedelta(days=offset)).isoformat()


def _add_months(day, months):
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    for d in range(day.day, 27, -1):
        try:
            return date(year, month, d)
        except ValueError:
            continue
    return date(year, month, min(day.day, 28))


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


def _plan(sa, prices=None, modules=None):
    body = {"name": f"TEST_PayPlan_{uuid.uuid4().hex[:6]}", "modules": modules or []}
    if prices is not None:
        body["prices"] = prices
    r = sa.post(f"{API}/plans", json=body)
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _client(sa, plan=None, ends_offset=None):
    suffix = uuid.uuid4().hex[:8]
    body = {"name": f"TEST_Pay_{suffix}", "admin_name": "TEST Pay", "admin_email": f"test-pay-{suffix}@easyorder.dev"}
    if plan:
        body["plan_id"] = plan["id"]
        body["subscription_ends_at"] = _day(ends_offset)
    r = sa.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    S.clients.append(r.json()["client"]["id"])
    return r.json()["client"]


def _payments(sa, **params):
    r = sa.get(f"{API}/payments", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_only_superadmin(api_client):
    assert api_client.get(f"{API}/payments").status_code == 403
    assert api_client.post(f"{API}/payments", json={"client_id": "x", "amount": 1}).status_code == 403


def test_plan_prices(superadmin_client):
    plan = _plan(superadmin_client, {"12": 15000, "1": 1500})
    assert plan["prices"] == {"1": 1500.0, "12": 15000.0} and plan["currency"] == "RSD"
    for bad in ({"x": 5}, {"0": 5}, {"61": 5}, {"1": 0}, {"1": -3}):
        r = superadmin_client.post(f"{API}/plans", json={"name": f"TEST_bad_{uuid.uuid4().hex[:5]}", "prices": bad})
        assert r.status_code == 400, bad
    # an update without prices keeps them; an empty map clears them
    kept = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": []})
    assert kept.json()["prices"] == plan["prices"]
    cleared = superadmin_client.put(f"{API}/plans/{plan['id']}", json={"name": plan["name"], "modules": [], "prices": {}})
    assert cleared.json()["prices"] == {}
    assert _plan(superadmin_client)["prices"] == {}


def test_received_payment(superadmin_client):
    client = _client(superadmin_client)
    r = superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 1500})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["status"] == "received" and p["paid_at"] == _day(0) and p["method"] == "bank" and p["currency"] == "RSD"
    assert p["client_name"] == client["name"] and p["overdue"] is False
    paid = superadmin_client.post(
        f"{API}/payments", json={"client_id": client["id"], "amount": 99.5, "paid_at": _day(-3), "method": "cash", "note": "u ruke"}
    ).json()
    assert paid["paid_at"] == _day(-3) and paid["method"] == "cash" and paid["note"] == "u ruke"
    bad = lambda **kw: superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 5, **kw})
    assert bad(paid_at=_day(2)).status_code == 400  # not in the future
    assert bad(paid_at="nope").status_code == 400
    assert superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 0}).status_code == 422
    assert bad(method="barter").status_code == 422
    assert superadmin_client.post(f"{API}/payments", json={"client_id": "nope", "amount": 5}).status_code == 404


def test_debt_overdue_receive_and_cancel(superadmin_client):
    client = _client(superadmin_client)
    cid = client["id"]
    assert superadmin_client.post(f"{API}/payments", json={"client_id": cid, "amount": 100, "status": "expected"}).status_code == 400
    late = superadmin_client.post(
        f"{API}/payments", json={"client_id": cid, "amount": 1000, "status": "expected", "due_date": _day(-5)}
    ).json()
    future = superadmin_client.post(
        f"{API}/payments", json={"client_id": cid, "amount": 400, "status": "expected", "due_date": _day(10)}
    ).json()
    assert late["overdue"] is True and future["overdue"] is False and late["paid_at"] is None
    totals = _payments(superadmin_client, client_id=cid)["totals"]
    assert totals == {"received": 0, "expected": 1400, "overdue_total": 1000, "overdue_count": 1}

    # settling: amount may differ (a discount), the debt becomes money in
    settled = superadmin_client.post(f"{API}/payments/{late['id']}/receive", json={"amount": 900, "note": "popust 10%"})
    assert settled.status_code == 200 and settled.json()["status"] == "received" and settled.json()["amount"] == 900
    assert settled.json()["paid_at"] == _day(0) and settled.json()["overdue"] is False
    assert superadmin_client.post(f"{API}/payments/{late['id']}/receive", json={}).status_code == 409
    assert _payments(superadmin_client, client_id=cid)["totals"] == {
        "received": 900, "expected": 400, "overdue_total": 0, "overdue_count": 0,
    }

    # a canceled entry stays on record but is not counted
    canceled = superadmin_client.post(f"{API}/payments/{future['id']}/cancel", json={"note": "greska"})
    assert canceled.status_code == 200 and canceled.json()["status"] == "canceled"
    assert superadmin_client.post(f"{API}/payments/{future['id']}/cancel", json={}).status_code == 409
    after = _payments(superadmin_client, client_id=cid)
    assert after["totals"]["expected"] == 0 and len(after["items"]) == 2
    assert [p["status"] for p in _payments(superadmin_client, client_id=cid, status="canceled")["items"]] == ["canceled"]
    assert superadmin_client.post(f"{API}/payments/nope/cancel", json={}).status_code == 404


def test_list_filters(superadmin_client):
    a, b = _client(superadmin_client), _client(superadmin_client)
    for client, offset, amount in ((a, -40, 100), (a, -2, 200), (b, -2, 50)):
        superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": amount, "paid_at": _day(offset)})
    assert len(_payments(superadmin_client, client_id=a["id"])["items"]) == 2
    recent = _payments(superadmin_client, client_id=a["id"], from_date=_day(-10), to_date=_day(0))
    assert [p["amount"] for p in recent["items"]] == [200] and recent["totals"]["received"] == 200
    older = _payments(superadmin_client, client_id=a["id"], to_date=_day(-30))
    assert [p["amount"] for p in older["items"]] == [100]
    both = _payments(superadmin_client, status="received", from_date=_day(-3), to_date=_day(-1))
    assert {p["client_id"] for p in both["items"]} >= {a["id"], b["id"]}
    # newest first
    items = _payments(superadmin_client, client_id=a["id"])["items"]
    assert [p["paid_at"] for p in items] == sorted((p["paid_at"] for p in items), reverse=True)
    assert superadmin_client.get(f"{API}/payments", params={"from_date": "nope"}).status_code == 400


def test_pay_extends_the_subscription(superadmin_client):
    plan = _plan(superadmin_client, {"3": 4000})
    client = _client(superadmin_client, plan, 10)
    cid = client["id"]
    r = superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 3, "amount": 4000, "note": "uplata"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subscription"]["state"]["ends_at"] == _add_months(_today() + timedelta(days=10), 3).isoformat()
    assert body["payment"]["status"] == "received" and body["payment"]["period_months"] == 3
    assert body["payment"]["plan_name"] == plan["name"] and body["payment"]["amount"] == 4000
    assert _payments(superadmin_client, client_id=cid)["totals"]["received"] == 4000
    events = [e["type"] for e in superadmin_client.get(f"{API}/subscriptions/{cid}").json()["events"]]
    assert "payment_received" in events and "extended" in events
    # the plan can only be changed through assign
    other = _plan(superadmin_client)
    bad = superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 1, "amount": 10, "plan_id": other["id"]})
    assert bad.status_code == 400
    assert len(_payments(superadmin_client, client_id=cid)["items"]) == 1  # nothing was written
    assert superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 0, "amount": 10}).status_code == 422
    assert superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 1, "amount": 10, "paid_at": _day(3)}).status_code == 400


def test_pay_starts_a_subscription_and_unlocks(superadmin_client):
    plan = _plan(superadmin_client, {"1": 1500}, modules=["reports"])
    client = _client(superadmin_client)  # no subscription
    cid = client["id"]
    assert superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 1, "amount": 1500}).status_code == 400
    r = superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 1, "amount": 1500, "plan_id": plan["id"]})
    assert r.status_code == 200, r.text
    state = r.json()["subscription"]
    assert state["plan_name"] == plan["name"] and state["modules"] == ["reports"]
    assert state["state"]["ends_at"] == _add_months(_today(), 1).isoformat()

    # a locked client paying is unlocked, counting from today
    superadmin_client.post(f"{API}/subscriptions/{cid}/assign", json={"plan_id": plan["id"], "ends_at": _day(-60)})
    assert superadmin_client.get(f"{API}/subscriptions/{cid}").json()["row"]["state"]["status"] == "locked"
    again = superadmin_client.post(f"{API}/subscriptions/{cid}/pay", json={"months": 1, "amount": 1500}).json()
    assert again["subscription"]["state"]["status"] == "active"
    assert again["subscription"]["state"]["ends_at"] == _add_months(_today(), 1).isoformat()


def test_pay_settles_an_expected_payment(superadmin_client):
    plan = _plan(superadmin_client, {"12": 15000})
    client, other = _client(superadmin_client, plan, 30), _client(superadmin_client, plan, 30)
    debt = superadmin_client.post(
        f"{API}/payments", json={"client_id": client["id"], "amount": 15000, "status": "expected", "due_date": _day(-1)}
    ).json()
    foreign = superadmin_client.post(
        f"{API}/payments", json={"client_id": other["id"], "amount": 1, "status": "expected", "due_date": _day(5)}
    ).json()
    assert superadmin_client.post(
        f"{API}/subscriptions/{client['id']}/pay", json={"months": 12, "amount": 13500, "payment_id": foreign["id"]}
    ).status_code == 404
    r = superadmin_client.post(
        f"{API}/subscriptions/{client['id']}/pay", json={"months": 12, "amount": 13500, "payment_id": debt["id"], "note": "akcija"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["payment"]["id"] == debt["id"] and r.json()["payment"]["amount"] == 13500
    assert r.json()["payment"]["status"] == "received" and r.json()["payment"]["period_months"] == 12
    items = _payments(superadmin_client, client_id=client["id"])
    assert len(items["items"]) == 1 and items["totals"]["expected"] == 0 and items["totals"]["received"] == 13500
    # the same debt can't be paid twice (and nothing was extended the second time)
    ends = superadmin_client.get(f"{API}/subscriptions/{client['id']}").json()["row"]["state"]["ends_at"]
    twice = superadmin_client.post(
        f"{API}/subscriptions/{client['id']}/pay", json={"months": 12, "amount": 1, "payment_id": debt["id"]}
    )
    assert twice.status_code == 409
    assert superadmin_client.get(f"{API}/subscriptions/{client['id']}").json()["row"]["state"]["ends_at"] == ends


def test_dashboard_money_figures(superadmin_client):
    before = superadmin_client.get(f"{API}/superadmin/overview").json()["payments"]
    client = _client(superadmin_client)
    superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 700})
    superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 50, "status": "expected", "due_date": _day(9)})
    superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 300, "status": "expected", "due_date": _day(-9)})
    superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 11, "status": "expected", "due_date": _day(-20)})
    gone = superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 9999}).json()
    superadmin_client.post(f"{API}/payments/{gone['id']}/cancel", json={})  # not counted
    overview = superadmin_client.get(f"{API}/superadmin/overview").json()
    after = overview["payments"]
    assert after["currency"] == "RSD"
    assert round(after["received_month"] - before["received_month"], 2) == 700
    assert round(after["received_year"] - before["received_year"], 2) == 700
    assert round(after["expected_total"] - before["expected_total"], 2) == 361
    assert round(after["overdue_total"] - before["overdue_total"], 2) == 311
    assert after["overdue_count"] - before["overdue_count"] == 2
    item = next(a for a in overview["attention"] if a["client_id"] == client["id"])
    assert item["reason"] == "payment_overdue" and item["date"] == _day(-20)  # the oldest overdue debt
