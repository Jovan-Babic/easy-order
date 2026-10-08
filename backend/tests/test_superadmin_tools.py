"""Notes, activity, system status, audit log and announcements (PLAN_SUPERADMIN.md, phase D)."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from helpers import API, activate_invited_user

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _day(offset):
    return (datetime.now(timezone.utc).date() + timedelta(days=offset)).isoformat()


class S:
    clients = []
    plans = []
    announcements = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    for aid in S.announcements:
        superadmin_client.delete(f"{API}/announcements/{aid}")
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _client(sa):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-tools-{suffix}@easyorder.dev"
    r = sa.post(f"{API}/clients", json={"name": f"TEST_Tools_{suffix}", "admin_name": "TEST Tools", "admin_email": email})
    assert r.status_code == 200, r.text
    S.clients.append(r.json()["client"]["id"])
    admin = activate_invited_user(email, r.json()["temporary_password"])
    return r.json()["client"], admin


def _announce(sa, **kw):
    body = {"message_sr": "Planirano održavanje", "message_en": "Planned maintenance", **kw}
    r = sa.post(f"{API}/announcements", json=body)
    assert r.status_code == 200, r.text
    S.announcements.append(r.json()["id"])
    return r.json()


def test_only_superadmin(api_client):
    for path in ("/audit", "/announcements", "/superadmin/system", "/clients/x/notes", "/clients/x/activity"):
        assert api_client.get(f"{API}{path}").status_code == 403, path
    assert api_client.post(f"{API}/announcements", json={"message_sr": "x"}).status_code == 403


def test_notes(superadmin_client):
    client, _ = _client(superadmin_client)
    cid = client["id"]
    assert superadmin_client.get(f"{API}/clients/{cid}/notes").json() == []
    first = superadmin_client.post(f"{API}/clients/{cid}/notes", json={"text": "Zovu se Marko, 063..."})
    assert first.status_code == 200 and first.json()["author_name"] and first.json()["text"].startswith("Zovu")
    superadmin_client.post(f"{API}/clients/{cid}/notes", json={"text": "Dogovoren popust"})
    texts = [n["text"] for n in superadmin_client.get(f"{API}/clients/{cid}/notes").json()]
    assert texts == ["Dogovoren popust", "Zovu se Marko, 063..."]  # newest first
    assert superadmin_client.post(f"{API}/clients/{cid}/notes", json={"text": "   "}).status_code == 400
    assert superadmin_client.post(f"{API}/clients/{cid}/notes", json={"text": ""}).status_code == 422
    assert superadmin_client.post(f"{API}/clients/nope/notes", json={"text": "x"}).status_code == 404


def test_activity(superadmin_client):
    client, admin = _client(superadmin_client)
    cid = client["id"]
    row = next(c for c in superadmin_client.get(f"{API}/clients").json() if c["id"] == cid)
    assert row["last_activity_at"] and row["last_order_at"] is None and row["orders_30d"] == 0  # the admin logged in

    product = admin.post(f"{API}/products", json={"name": "TEST_Act_P", "price_no_vat": 5}).json()
    customer = admin.post(f"{API}/customers", json={"name": "TEST_Act_C"}).json()
    admin.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "ordered_qty": 1}]})
    admin.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": product["id"], "ordered_qty": 2}]})
    row = next(c for c in superadmin_client.get(f"{API}/clients").json() if c["id"] == cid)
    assert row["orders_30d"] == 2 and row["last_order_at"] and row["last_activity_at"] >= row["last_order_at"]

    activity = superadmin_client.get(f"{API}/clients/{cid}/activity").json()
    assert activity["orders_total"] == 2 and activity["orders_30d"] == 2 and activity["last_order_at"] == row["last_order_at"]
    assert len(activity["users"]) == 1 and activity["users"][0]["role"] == "admin"
    assert activity["users"][0]["last_login_at"] and activity["users"][0]["last_seen_at"]

    # "last seen" is written at most once an hour: more requests don't move it
    before = activity["users"][0]["last_seen_at"]
    for _ in range(3):
        admin.get(f"{API}/products")
    assert superadmin_client.get(f"{API}/clients/{cid}/activity").json()["users"][0]["last_seen_at"] == before

    quiet, _quiet_admin = _client(superadmin_client)
    assert superadmin_client.get(f"{API}/clients/{quiet['id']}/activity").json()["orders_total"] == 0


def test_system_status(superadmin_client):
    status = superadmin_client.get(f"{API}/superadmin/system").json()
    assert status["environment"] in ("development", "production") and status["server_time"]
    assert isinstance(status["smtp_configured"], bool) and isinstance(status["cloudinary_configured"], bool)
    assert isinstance(status["auto_purge_enabled"], bool) and status["cron"]["configured"] == bool(CRON_SECRET)
    assert "secret" not in str(status).lower()


@pytest.mark.skipif(not CRON_SECRET, reason="needs CRON_SECRET (same value on the server and in the tests)")
def test_cron_run_is_remembered(superadmin_client):
    r = requests.get(f"{API}/internal/cron/subscriptions", headers={"Authorization": f"Bearer {CRON_SECRET}"})
    assert r.status_code == 200
    cron = superadmin_client.get(f"{API}/superadmin/system").json()["cron"]
    assert cron["status"] == "ok" and cron["last_run_at"] and set(cron["summary"]) == {
        "reminders", "purge_warnings", "purged", "would_purge",
    }
    assert cron["live"] is r.json()["live"]


def test_audit_log(superadmin_client, api_client):
    marker = uuid.uuid4().hex[:6]
    plan = superadmin_client.post(f"{API}/plans", json={"name": f"TEST_Audit_{marker}", "modules": []}).json()
    S.plans.append(plan["id"])
    client, admin = _client(superadmin_client)
    superadmin_client.post(f"{API}/subscriptions/{client['id']}/assign", json={"plan_id": plan["id"], "ends_at": _day(30), "note": "ugovor"})
    superadmin_client.post(f"{API}/payments", json={"client_id": client["id"], "amount": 1000})
    user = superadmin_client.post(
        f"{API}/users",
        json={"email": f"test-audit-{marker}@easyorder.dev", "name": "TEST Audit Op", "role": "operator", "client_id": client["id"]},
    ).json()
    superadmin_client.put(f"{API}/users/{user['id']}", json={"active": False})
    superadmin_client.delete(f"{API}/users/{user['id']}")

    entries = superadmin_client.get(f"{API}/audit", params={"client_id": client["id"], "limit": 200}).json()
    actions = [e["action"] for e in entries]
    for expected in ("client.create", "subscription.assigned", "subscription.payment_received", "user.create", "user.update", "user.delete"):
        assert expected in actions, (expected, actions)
    created = next(e for e in entries if e["action"] == "client.create")
    assert created["target_name"] == client["name"] and created["actor_name"] and created["client_id"] == client["id"]
    assigned = next(e for e in entries if e["action"] == "subscription.assigned")
    assert assigned["data"]["note"] == "ugovor" and assigned["data"]["plan"] == plan["name"]
    update = next(e for e in entries if e["action"] == "user.update")
    assert update["data"] == {"active": False}
    stamps = [e["created_at"] for e in entries]
    assert stamps == sorted(stamps, reverse=True)

    only_users = superadmin_client.get(f"{API}/audit", params={"action": "user.", "client_id": client["id"]}).json()
    assert {e["action"] for e in only_users} == {"user.create", "user.update", "user.delete"}
    assert len(superadmin_client.get(f"{API}/audit", params={"client_id": client["id"], "limit": 2}).json()) == 2
    paged = superadmin_client.get(f"{API}/audit", params={"client_id": client["id"], "limit": 2, "skip": 2}).json()
    assert [e["id"] for e in paged] == [e["id"] for e in entries[2:4]]
    assert any(e["action"] == "plan.create" and e["target_name"] == plan["name"] for e in superadmin_client.get(f"{API}/audit", params={"action": "plan."}).json())

    # what a client's own admin does is not the superadmin's business: nothing is logged for it
    n = len(superadmin_client.get(f"{API}/audit", params={"client_id": client["id"], "limit": 200}).json())
    admin.post(f"{API}/users", json={"email": f"test-audit-op-{marker}@easyorder.dev", "name": "TEST", "role": "operator"})
    assert len(superadmin_client.get(f"{API}/audit", params={"client_id": client["id"], "limit": 200}).json()) == n


def test_announcement_validation(superadmin_client):
    client, _ = _client(superadmin_client)
    bad = lambda **kw: superadmin_client.post(f"{API}/announcements", json=kw)
    assert bad(message_sr="", message_en="  ").status_code == 400
    assert bad(message_sr="x", starts_at=_day(5), ends_at=_day(1)).status_code == 400
    assert bad(message_sr="x", starts_at="nope").status_code == 400
    assert bad(message_sr="x", client_ids=["nope"]).status_code == 400
    assert bad(message_sr="x", level="alarm").status_code == 422
    assert bad(message_sr="x" * 501).status_code == 422
    ok = _announce(superadmin_client, client_ids=[client["id"]])
    assert ok["status"] == "live"


def test_announcement_delivery(superadmin_client):
    one, admin_one = _client(superadmin_client)
    two, admin_two = _client(superadmin_client)
    marker = uuid.uuid4().hex[:6]
    everyone = _announce(superadmin_client, message_sr=f"Svima {marker}", message_en=f"Everyone {marker}")
    only_one = _announce(superadmin_client, message_sr=f"Samo prvom {marker}", message_en="", level="warning", client_ids=[one["id"]])
    scheduled = _announce(superadmin_client, message_sr=f"Sutra {marker}", starts_at=_day(1))
    ended = _announce(superadmin_client, message_sr=f"Prošlo {marker}", ends_at=_day(-1))
    off = _announce(superadmin_client, message_sr=f"Ugašeno {marker}", active=False)
    assert (scheduled["status"], ended["status"], off["status"]) == ("scheduled", "ended", "off")

    def seen(admin):
        return {a["id"]: a for a in admin.get(f"{API}/auth/me").json()["announcements"]}

    s1, s2 = seen(admin_one), seen(admin_two)
    assert everyone["id"] in s1 and everyone["id"] in s2
    assert only_one["id"] in s1 and only_one["id"] not in s2
    for hidden in (scheduled, ended, off):
        assert hidden["id"] not in s1 and hidden["id"] not in s2
    # a missing language falls back to the other one
    assert s1[only_one["id"]]["message_en"] == f"Samo prvom {marker}" and s1[only_one["id"]]["level"] == "warning"
    assert s1[everyone["id"]]["message_en"] == f"Everyone {marker}"
    assert superadmin_client.get(f"{API}/auth/me").json()["announcements"] == []

    # edit: switch it off / widen the audience; delete removes it
    upd = superadmin_client.put(f"{API}/announcements/{only_one['id']}", json={"message_sr": "Svima sada", "client_ids": []})
    assert upd.status_code == 200 and only_one["id"] in seen(admin_two)
    superadmin_client.put(f"{API}/announcements/{only_one['id']}", json={"message_sr": "Svima sada", "active": False})
    assert only_one["id"] not in seen(admin_two)
    assert superadmin_client.delete(f"{API}/announcements/{everyone['id']}").status_code == 200
    assert everyone["id"] not in seen(admin_one)
    assert superadmin_client.delete(f"{API}/announcements/{everyone['id']}").status_code == 404
    listed = {a["id"]: a for a in superadmin_client.get(f"{API}/announcements").json()}
    assert listed[only_one["id"]]["status"] == "off" and everyone["id"] not in listed
