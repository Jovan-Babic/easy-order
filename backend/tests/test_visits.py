"""Visit plan (module `visits`, PLAN_OBILASCI.md V1): zones, customer visit fields, due list, plan,
suggestion, done / skip, report, roles and tenancy."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from helpers import API, activate_invited_user


def _today():
    return datetime.now(timezone.utc).date()


def _day(n):
    return (_today() + timedelta(days=n)).isoformat()


class S:
    clients = []


def _client_with_visits(sa, modules=("visits",)):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-vis-{suffix}@easyorder.dev"
    r = sa.post(f"{API}/clients", json={"name": f"TEST_Vis_{suffix}", "admin_name": "TEST Vis", "admin_email": email, "modules": list(modules)})
    assert r.status_code == 200, r.text
    S.clients.append(r.json()["client"]["id"])
    return r.json()["client"], activate_invited_user(email, r.json()["temporary_password"])


def _rep(admin, label):
    r = admin.post(f"{API}/users", json={"email": f"test-vis-{label}-{uuid.uuid4().hex[:6]}@easyorder.dev", "name": f"TEST {label}", "role": "operator"})
    assert r.status_code == 200, r.text
    return r.json()["id"], activate_invited_user(r.json()["email"], r.json()["temporary_password"])


@pytest.fixture(scope="module", autouse=True)
def world(superadmin_client):
    S.client, S.admin = _client_with_visits(superadmin_client)
    S.rep1_id, S.rep1 = _rep(S.admin, "rep1")
    S.rep2_id, S.rep2 = _rep(S.admin, "rep2")
    S.zone_ns = S.admin.post(f"{API}/zones", json={"name": "Novi Sad"}).json()
    S.zone_zr = S.admin.post(f"{API}/zones", json={"name": "Zrenjanin"}).json()
    S.customers = []
    for i, (name, zone) in enumerate([("A1", S.zone_ns), ("A2", S.zone_ns), ("A3", S.zone_ns), ("B1", S.zone_zr), ("B2", S.zone_zr)]):
        c = S.admin.post(f"{API}/customers", json={"name": f"TEST_Vis_{name}", "street": f"Ulica {i}", "city": zone["name"], "visit_every_days": 1, "zone_id": zone["id"]}).json()
        S.customers.append(c)
    yield
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")


def _plan(session, items, **extra):
    return session.post(f"{API}/visits/plan", json={"items": items, **extra})


def test_module_gating(superadmin_client):
    _, other_admin = _client_with_visits(superadmin_client, modules=("warehouse",))
    assert other_admin.get(f"{API}/zones").status_code == 403
    assert other_admin.get(f"{API}/visits/due").status_code == 403
    # not in the default modules of a new client either
    client, _ = _client_with_visits(superadmin_client, modules=())
    assert "visits" not in client["modules"]


def test_zones(superadmin_client):
    assert S.admin.post(f"{API}/zones", json={"name": "Novi Sad"}).status_code == 409
    zones = S.rep1.get(f"{API}/zones").json()  # a rep can read them
    assert {z["name"]: z["customer_count"] for z in zones}["Novi Sad"] == 3
    assert S.rep1.post(f"{API}/zones", json={"name": "X"}).status_code == 403
    z = S.admin.post(f"{API}/zones", json={"name": "Prazna"}).json()
    assert S.admin.put(f"{API}/zones/{z['id']}", json={"name": "Prazna zona"}).json()["name"] == "Prazna zona"
    assert S.admin.delete(f"{API}/zones/{S.zone_ns['id']}").status_code == 409  # customers use it
    assert S.admin.delete(f"{API}/zones/{z['id']}").status_code == 200
    # another client's zone is invisible
    _, other = _client_with_visits(superadmin_client)
    assert other.delete(f"{API}/zones/{S.zone_ns['id']}").status_code == 404


def test_customer_visit_fields_keep_clear_and_validate():
    c = S.customers[0]
    assert c["visit_every_days"] == 1 and c["visit_channel"] == "visit" and c["zone_id"] == S.zone_ns["id"]
    # a plain edit (old client, fields not sent) keeps them
    kept = S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"]}).json()
    assert kept["visit_every_days"] == 1 and kept["zone_id"] == S.zone_ns["id"]
    changed = S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"], "visit_channel": "call", "visit_every_days": 14}).json()
    assert changed["visit_channel"] == "call" and changed["visit_every_days"] == 14
    cleared = S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"], "visit_every_days": 0, "zone_id": ""}).json()
    assert cleared["visit_every_days"] is None and cleared["zone_id"] is None
    assert S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"], "zone_id": "nope"}).status_code == 400
    assert S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"], "visit_channel": "mail"}).status_code == 422
    S.admin.put(f"{API}/customers/{c['id']}", json={"name": c["name"], "visit_every_days": 1, "visit_channel": "visit", "zone_id": S.zone_ns["id"]})


def test_due_list_horizon_and_never_visited():
    rows = S.rep1.get(f"{API}/visits/due", params={"horizon_days": 7}).json()
    mine = {r["name"]: r for r in rows}
    row = mine["TEST_Vis_A1"]
    assert row["due_date"] == _day(1) and row["days_overdue"] == -1 and row["last_visit"] is None and row["zone_name"] == "Novi Sad"
    assert S.rep1.get(f"{API}/visits/due", params={"horizon_days": 0}).json() == []  # nothing is due yet
    assert all(r["zone_id"] == S.zone_zr["id"] for r in S.rep1.get(f"{API}/visits/due", params={"zone_id": S.zone_zr["id"]}).json())


def test_plan_roles_and_claims():
    c = S.customers[3]
    assert _plan(S.rep1, [{"customer_id": c["id"], "date": _day(-1)}]).status_code == 400  # not in the past
    assert _plan(S.rep1, [{"customer_id": c["id"], "date": "1.1.2030"}]).status_code == 422
    r = _plan(S.rep1, [{"customer_id": c["id"], "date": _day(2)}])
    assert r.status_code == 200 and len(r.json()["created"]) == 1 and r.json()["warnings"] == []
    assert _plan(S.rep1, [{"customer_id": c["id"], "date": _day(2)}]).json()["created"] == []  # already there
    # another rep planning the same shop gets a warning, not a refusal
    r = _plan(S.rep2, [{"customer_id": c["id"], "date": _day(3)}])
    assert r.status_code == 200 and r.json()["warnings"][0]["planned_by"][0]["user_name"] == "TEST rep1"
    # the due list shows who has it
    row = next(x for x in S.rep2.get(f"{API}/visits/due").json() if x["customer_id"] == c["id"])
    assert {p["user_name"] for p in row["planned"]} == {"TEST rep1", "TEST rep2"}
    # roles: a rep cannot plan for someone else, the admin needs to say for whom
    assert _plan(S.rep1, [{"customer_id": c["id"], "date": _day(4)}], user_id=S.rep2_id).status_code == 403
    assert _plan(S.admin, [{"customer_id": c["id"], "date": _day(4)}]).status_code == 400
    assert _plan(S.admin, [{"customer_id": c["id"], "date": _day(4)}], user_id=S.rep2_id).status_code == 200
    # each rep reads only their own plan; the admin reads everyone's
    mine = S.rep1.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(10)}).json()
    assert {v["user_id"] for v in mine} == {S.rep1_id}
    assert {v["user_id"] for v in S.admin.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(10)}).json()} == {S.rep1_id, S.rep2_id}
    assert {v["user_id"] for v in S.rep1.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(10), "user_id": S.rep2_id}).json()} == {S.rep1_id}
    assert S.rep1.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(200)}).status_code == 400
    # clean up for the other tests
    for v in S.admin.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(10)}).json():
        S.admin.delete(f"{API}/visits/{v['id']}")


def test_done_skip_move_delete_and_visit_now():
    a, b, c = S.customers[0], S.customers[1], S.customers[2]
    ids = [v["id"] for v in _plan(S.rep1, [{"customer_id": x["id"], "date": _day(1)} for x in (a, b, c)]).json()["created"]]
    # someone else's visit is not reachable
    assert S.rep2.post(f"{API}/visits/{ids[0]}/done", json={}).status_code == 404
    assert S.rep1.post(f"{API}/visits/{ids[0]}/skip", json={"note": ""}).status_code == 422  # a reason is required
    done = S.rep1.post(f"{API}/visits/{ids[0]}/done", json={"note": "Naručio sutra"})
    assert done.status_code == 200 and done.json()["status"] == "done" and done.json()["note"] == "Naručio sutra"
    assert S.rep1.post(f"{API}/visits/{ids[0]}/done", json={}).status_code == 409  # only once
    skipped = S.rep1.post(f"{API}/visits/{ids[1]}/skip", json={"note": "Zatvoreno"}).json()
    assert skipped["status"] == "skipped"
    moved = S.rep1.put(f"{API}/visits/{ids[2]}", json={"date": _day(3)}).json()
    assert moved["date"] == _day(3)
    assert S.rep1.put(f"{API}/visits/{ids[2]}", json={"date": _day(-2)}).status_code == 400
    assert S.rep1.delete(f"{API}/visits/{ids[0]}").status_code == 409  # a done visit stays
    assert S.rep1.delete(f"{API}/visits/{ids[2]}").status_code == 200
    # a done visit moves the next due date: A1 is now due in a day
    row = next(x for x in S.rep1.get(f"{API}/visits/due", params={"horizon_days": 7}).json() if x["customer_id"] == a["id"])
    assert row["last_visit"] == _today().isoformat() and row["due_date"] == _day(1)
    # "visited now": an unplanned shop gets a done entry, a planned one is completed instead of duplicated
    now = S.rep1.post(f"{API}/visits", json={"customer_id": S.customers[4]["id"], "note": "Usput"})
    assert now.status_code == 200 and now.json()["status"] == "done" and now.json()["date"] == _today().isoformat()
    today_plan = _plan(S.rep1, [{"customer_id": S.customers[3]["id"], "date": _today().isoformat()}]).json()["created"][0]
    again = S.rep1.post(f"{API}/visits", json={"customer_id": S.customers[3]["id"]}).json()
    assert again["id"] == today_plan["id"] and again["status"] == "done"


def test_visit_can_be_linked_to_an_order_of_the_same_customer():
    c = S.customers[2]
    p = S.admin.post(f"{API}/products", json={"name": "TEST_Vis_P", "price_no_vat": 10, "vat_rate": 20}).json()
    order = S.admin.post(f"{API}/orders", json={"customer_id": c["id"], "items": [{"product_id": p["id"], "ordered_qty": 1}]}).json()
    other_order = S.admin.post(f"{API}/orders", json={"customer_id": S.customers[0]["id"], "items": [{"product_id": p["id"], "ordered_qty": 1}]}).json()
    visit = _plan(S.rep2, [{"customer_id": c["id"], "date": _day(1)}]).json()["created"][0]
    assert S.rep2.post(f"{API}/visits/{visit['id']}/done", json={"order_id": other_order["id"]}).status_code == 400
    done = S.rep2.post(f"{API}/visits/{visit['id']}/done", json={"order_id": order["id"]}).json()
    assert done["order_id"] == order["id"]
    row = next(x for x in S.rep2.get(f"{API}/visits/due", params={"horizon_days": 7}).json() if x["customer_id"] == c["id"])
    assert row["last_order"] == _today().isoformat()


def test_suggestion_groups_by_zone_and_respects_limits():
    # a clean slate: remove every planned entry of the test clients' reps
    for v in S.admin.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(60)}).json():
        if v["status"] == "planned":
            S.admin.delete(f"{API}/visits/{v['id']}")
    S.admin.put(f"{API}/visits/settings", json={"plan_days": [0, 1, 2, 3, 4, 5, 6], "max_per_day": 2})
    out = S.rep1.post(f"{API}/visits/plan/suggest", json={"from": _day(0), "to": _day(6)}).json()
    flat = [(day["date"], r["zone_name"]) for day in out["days"] for r in day["items"]]
    assert all(len(day["items"]) <= 2 for day in out["days"])
    assert len(flat) + out["left_out"] == 5  # all five shops are due within the week: placed or left out by capacity
    zones_in_order = [z for _, z in flat]
    changes = sum(1 for i in range(1, len(zones_in_order)) if zones_in_order[i] != zones_in_order[i - 1])
    assert changes <= 1  # a zone's shops stay together
    # nothing is saved by a suggestion
    assert S.rep1.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(6)}).json() == [] or all(v["status"] != "planned" for v in S.rep1.get(f"{API}/visits/plan", params={"from": _day(0), "to": _day(6)}).json())
    # a zone filter and a limit
    only = S.rep1.post(f"{API}/visits/plan/suggest", json={"from": _day(0), "to": _day(6), "zone_ids": [S.zone_zr["id"]], "max_per_day": 1}).json()
    assert {r["zone_name"] for d in only["days"] for r in d["items"]} <= {"Zrenjanin"}
    # shops that are planned already are left out of a new suggestion (claimed)
    first = out["days"][0]["items"][0]
    _plan(S.rep2, [{"customer_id": first["customer_id"], "date": _day(1)}])
    again = S.rep1.post(f"{API}/visits/plan/suggest", json={"from": _day(0), "to": _day(6)}).json()
    assert again["claimed"] >= 1 and first["customer_id"] not in [r["customer_id"] for d in again["days"] for r in d["items"]]
    # settings
    assert S.rep1.put(f"{API}/visits/settings", json={"max_per_day": 3}).status_code == 403
    assert S.admin.put(f"{API}/visits/settings", json={"plan_days": [9]}).status_code == 400
    S.admin.put(f"{API}/visits/settings", json={"plan_days": [0, 1, 2, 3, 4], "max_per_day": 8})


def test_report_counts_per_rep():
    out = S.admin.get(f"{API}/visits/report", params={"from": _day(-1), "to": _day(30)}).json()
    reps = {r["user_name"]: r for r in out["reps"]}
    assert {"TEST rep1", "TEST rep2"} <= set(reps)
    assert reps["TEST rep1"]["done"] >= 2 and reps["TEST rep1"]["skipped"] == 1 and reps["TEST rep1"]["done_pct"] is not None
    assert S.rep1.get(f"{API}/visits/report", params={"from": _day(-1), "to": _day(30)}).status_code == 403
