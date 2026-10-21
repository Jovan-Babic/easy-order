"""Sales targets (PLAN_FOKUS_I_CILJEVI.md): admin sets them, sales reps follow their own progress."""
import uuid
from datetime import date

import pytest

from helpers import API, activate_invited_user


class S:
    products = []
    orders = []
    users = []


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    S.users.append(r.json()["id"])
    return r.json()["id"], activate_invited_user(email, r.json()["temporary_password"])


def _month():
    return date.today().strftime("%Y-%m")


@pytest.fixture(scope="module", autouse=True)
def world(api_client):
    S.rep_id, S.rep = _invite(api_client, "operator", "tg-rep")
    S.other_id, S.other = _invite(api_client, "operator", "tg-other")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "tg-wh")
    S.customers = [api_client.post(f"{API}/customers", json={"name": f"TEST_TG_C{i}"}).json() for i in range(2)]
    S.product = api_client.post(f"{API}/products", json={"name": "TEST_TG_P", "price_no_vat": 100}).json()
    S.focus_product = api_client.post(f"{API}/products", json={"name": "TEST_TG_F", "price_no_vat": 50}).json()
    S.focus = api_client.post(f"{API}/focus", json={"product_id": S.focus_product["id"]}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    api_client.delete(f"{API}/focus/{S.focus['id']}")
    for p in (S.product, S.focus_product):
        api_client.delete(f"{API}/products/{p['id']}")
    for c in S.customers:
        api_client.delete(f"{API}/customers/{c['id']}")
    for uid in S.users:
        api_client.delete(f"{API}/users/{uid}")


def _order(session, customer, lines):
    r = session.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [
        {"product_id": p["id"], "ordered_qty": q} for p, q in lines]})
    assert r.status_code == 200, r.text
    S.orders.append(r.json()["id"])
    return r.json()["id"]


def _row(api_client, period_type="month", period=None):
    params = {"period_type": period_type}
    if period:
        params["period"] = period
    rows = api_client.get(f"{API}/targets/progress", params=params).json()["rows"]
    return next(r for r in rows if r["user_id"] == S.rep_id)


def test_set_and_progress(api_client):
    r = api_client.put(f"{API}/targets", json={
        "user_id": S.rep_id, "period_type": "month", "period": _month(),
        "values": {"revenue": 1000, "orders": 4, "customers": 2, "focus_revenue": 200},
    })
    assert r.status_code == 200, r.text
    _order(S.rep, S.customers[0], [(S.product, 3), (S.focus_product, 2)])  # 300 + 100
    canceled = _order(S.rep, S.customers[1], [(S.product, 50)])
    assert S.rep.post(f"{API}/orders/{canceled}/status", json={"status": "canceled"}).status_code == 200
    _order(S.other, S.customers[1], [(S.product, 9)])  # someone else's order never counts
    row = _row(api_client)
    assert row["targets"] == {"revenue": 1000, "orders": 4, "customers": 2, "focus_revenue": 200}
    assert row["achieved"]["revenue"] == 400
    assert row["achieved"]["orders"] == 1 and row["achieved"]["customers"] == 1
    assert row["achieved"]["focus_revenue"] == 100
    assert row["pct"]["revenue"] == 40.0 and row["pct"]["focus_revenue"] == 50.0
    assert row["previous_year"]["revenue"] == 0


def test_rep_sees_only_own_month(api_client):
    me = S.rep.get(f"{API}/targets/me").json()
    assert me["period"] == _month()
    assert me["achieved"]["revenue"] == 400 and me["targets"]["revenue"] == 1000
    assert me["pct"]["revenue"] == 40.0
    assert me["days_left"] >= 1 and me["daily_needed"]["revenue"] > 0
    assert len(me["history"]) == 3 and me["history"][0]["achieved"]["orders"] == 0
    other = S.other.get(f"{API}/targets/me").json()
    assert other["targets"] == {} and other["achieved"]["revenue"] == 900


def test_roles(api_client):
    body = {"user_id": S.rep_id, "period_type": "month", "period": _month(), "values": {"revenue": 1}}
    assert S.rep.put(f"{API}/targets", json=body).status_code == 403
    assert S.rep.get(f"{API}/targets/progress").status_code == 403
    assert S.wh.get(f"{API}/targets/me").status_code == 403
    assert api_client.get(f"{API}/targets/me").status_code == 403


def test_validation(api_client):
    base = {"user_id": S.rep_id, "period_type": "month", "period": _month()}
    assert api_client.put(f"{API}/targets", json={**base, "values": {"profit": 5}}).status_code == 400
    assert api_client.put(f"{API}/targets", json={**base, "values": {"revenue": -5}}).status_code == 400
    assert api_client.put(f"{API}/targets", json={**base, "period": "2026-13", "values": {"revenue": 5}}).status_code == 400
    assert api_client.put(f"{API}/targets", json={**base, "period_type": "week", "values": {"revenue": 5}}).status_code == 400
    assert api_client.put(f"{API}/targets", json={**base, "user_id": S.wh_id, "values": {"revenue": 5}}).status_code == 404


def test_quarter_year_and_copy(api_client):
    year = date.today().year
    for ptype, period in (("quarter", f"{year}-Q1"), ("year", str(year))):
        assert api_client.put(f"{API}/targets", json={
            "user_id": S.rep_id, "period_type": ptype, "period": period, "values": {"revenue": 5000}}).status_code == 200
        row = _row(api_client, ptype, period)
        assert row["targets"]["revenue"] == 5000
    # the rep still only sees the month
    assert S.rep.get(f"{API}/targets/me").json()["targets"]["revenue"] == 1000
    copy = api_client.post(f"{API}/targets/copy", json={"period_type": "year", "from_period": str(year), "to_period": str(year + 1)})
    assert copy.json()["copied"] >= 1
    assert api_client.post(f"{API}/targets/copy", json={"period_type": "year", "from_period": str(year), "to_period": str(year + 1)}).json()["copied"] == 0
    assert _row(api_client, "year", str(year + 1))["targets"]["revenue"] == 5000
    # 0 / null removes a target
    api_client.put(f"{API}/targets", json={"user_id": S.rep_id, "period_type": "year", "period": str(year + 1), "values": {"revenue": None}})
    assert _row(api_client, "year", str(year + 1))["targets"] == {}


def test_previous_year_is_reported(api_client):
    row = _row(api_client, "year", str(date.today().year + 1))
    assert row["achieved"]["revenue"] == 0
    assert row["previous_year"]["revenue"] == 400  # this year's orders
