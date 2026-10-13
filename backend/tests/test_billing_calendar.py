"""Calendar billing (PLAN_NAPLATA_KALENDARSKA.md, N2): enrollment, drafts, approval,
ledger with FIFO payments and credit, annual cycle, blocking."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from helpers import API, activate_invited_user


def _today():
    return datetime.now(timezone.utc).date()


def _add_months(d, n):
    i = d.month - 1 + n
    return date(d.year + i // 12, i % 12 + 1, 1)


def _month_end(d):
    return _add_months(date(d.year, d.month, 1), 1) - timedelta(days=1)


NEXT = _add_months(_today(), 1)
AFTER = _add_months(_today(), 2)


class S:
    plans = []
    clients = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    yield
    superadmin_client.put(f"{API}/settings", json={"due_day": None, "block_after_day": None, "first_month_free": None})
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _plan(sa, **extra):
    body = {
        "name": f"TEST_Cal_{uuid.uuid4().hex[:6]}", "modules": [], "prices": {"1": 10000, "12": 100000},
        "included_seats": {"operator": 1}, "seat_prices": {"operator": 1000}, **extra,
    }
    r = sa.post(f"{API}/plans", json=body)
    assert r.status_code == 200, r.text
    S.plans.append(r.json()["id"])
    return r.json()


def _client(sa, plan, ends_at=None, cycle="monthly", enroll=True):
    suffix = uuid.uuid4().hex[:8]
    email = f"test-cal-{suffix}@easyorder.dev"
    r = sa.post(f"{API}/clients", json={
        "name": f"TEST_Cal_{suffix}", "admin_name": "TEST Cal Admin", "admin_email": email,
        "plan_id": plan["id"], "subscription_ends_at": ends_at or (_today() + timedelta(days=1)).isoformat(),
    })
    assert r.status_code == 200, r.text
    client = r.json()["client"]
    S.clients.append(client["id"])
    admin = activate_invited_user(email, r.json()["temporary_password"])
    if enroll:
        e = sa.post(f"{API}/billing/clients/{client['id']}/enroll", json={"cycle": cycle})
        assert e.status_code == 200, e.text
    return client, admin


def _state(sa, cid):
    return sa.get(f"{API}/subscriptions/{cid}").json()["row"]["state"]


def _balance(sa, cid):
    return sa.get(f"{API}/billing/clients/{cid}").json()


def _draft(sa, cid, month=NEXT):
    r = sa.post(f"{API}/billing/drafts/generate", json={"client_ids": [cid], "month": month.strftime("%Y-%m")})
    assert r.status_code == 200, r.text
    return r.json()


def _approve(sa, ids):
    r = sa.post(f"{API}/billing/drafts/approve", json={"ids": ids})
    assert r.status_code == 200, r.text
    return r.json()


def _pay(sa, cid, amount):
    r = sa.post(f"{API}/billing/payments", json={"client_id": cid, "amount": amount})
    assert r.status_code == 200, r.text
    return r.json()


class TestEnroll:
    def test_aligns_to_month_end_with_free_month(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        expected_end = _month_end(max(_today() + timedelta(days=1), _today()))
        state = _state(superadmin_client, client["id"])
        assert state["ends_at"] == expected_end.isoformat() and state["billing_cycle"] == "monthly"
        bal = _balance(superadmin_client, client["id"])
        assert bal["balance_due"] == 0
        if expected_end == _month_end(_today()):
            free = [c for c in bal["charges"] if c["amount"] == 0]
            assert free and free[0]["note"] == "Besplatan mesec" and free[0]["number"].startswith(f"PR-{_today().year}-")

    def test_needs_a_plan_and_superadmin(self, superadmin_client, api_client):
        plan = _plan(superadmin_client)
        client, admin = _client(superadmin_client, plan, enroll=False)
        assert admin.post(f"{API}/billing/clients/{client['id']}/enroll", json={}).status_code == 403
        assert admin.get(f"{API}/billing/drafts").status_code == 403


class TestDraftsAndLedger:
    def test_draft_edit_approve_pay_and_credit(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        cid = client["id"]
        superadmin_client.put(f"{API}/subscriptions/{cid}/seats", json={"extra_seats": {"operator": 2}, "discount_percent": 10})
        rows = _draft(superadmin_client, cid)
        assert len(rows) == 1
        d = rows[0]["charge"]
        kinds = {line["kind"]: line["amount"] for line in d["lines"]}
        assert kinds["package"] == 10000 and kinds["seats"] == 2000 and kinds["discount"] == -1200
        assert d["amount"] == 10800 and d["status"] == "draft" and d["period_start"] == NEXT.isoformat()
        # one draft per client and period
        assert _draft(superadmin_client, cid) == []
        # a draft is not a debt yet
        assert _balance(superadmin_client, cid)["balance_due"] == 0
        # manual amount, then approve
        r = superadmin_client.put(f"{API}/billing/drafts/{d['id']}", json={"amount": 10000, "note": "Dogovor"})
        assert r.json()["charge"]["amount"] == 10000 and r.json()["charge"]["calculated_total"] == 10800
        charge = _approve(superadmin_client, [d["id"]])[0]
        assert charge["status"] == "expected" and charge["number"].startswith("PR-")
        assert charge["due_date"] == NEXT.replace(day=1).isoformat()
        assert _balance(superadmin_client, cid)["balance_due"] == 10000
        # partial payment: rest stays, the paid period is now usable
        out = _pay(superadmin_client, cid, 4000)
        assert out["balance"]["balance_due"] == 6000 and out["balance"]["credit"] == 0
        assert out["subscription"]["state"]["ends_at"] == _month_end(NEXT).isoformat()
        # overpayment becomes credit, the next draft shows what is left to pay
        out = _pay(superadmin_client, cid, 7000)
        assert out["balance"]["balance_due"] == 0 and out["balance"]["credit"] == 1000
        nxt = _draft(superadmin_client, cid, AFTER)[0]
        assert nxt["credit"] == 1000 and nxt["to_pay"] == round(nxt["charge"]["amount"] - 1000, 2)

    def test_free_draft_extends_without_payment(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        d = _draft(superadmin_client, client["id"])[0]["charge"]
        r = superadmin_client.put(f"{API}/billing/drafts/{d['id']}", json={"free": True})
        assert r.json()["charge"]["amount"] == 0 and r.json()["charge"]["note"] == "Besplatan mesec"
        _approve(superadmin_client, [d["id"]])
        assert _state(superadmin_client, client["id"])["ends_at"] == _month_end(NEXT).isoformat()

    def test_ledger_charge_is_not_settled_the_old_way(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        d = _draft(superadmin_client, client["id"])[0]["charge"]
        _approve(superadmin_client, [d["id"]])
        assert superadmin_client.post(f"{API}/payments/{d['id']}/receive", json={}).status_code == 400
        listed = superadmin_client.get(f"{API}/payments", params={"client_id": client["id"]}).json()
        row = next(p for p in listed["items"] if p["id"] == d["id"])
        assert row["ledger"] is True and row["open"] == 10000

    def test_canceled_draft_is_not_redone_by_the_cron_but_can_be_generated(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        d = _draft(superadmin_client, client["id"])[0]["charge"]
        superadmin_client.post(f"{API}/payments/{d['id']}/cancel", json={})
        assert len(_draft(superadmin_client, client["id"])) == 1  # manual generate ignores canceled ones

    def test_attention_lists_pending_drafts(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        _draft(superadmin_client, client["id"])
        items = superadmin_client.get(f"{API}/superadmin/overview").json()["attention"]
        assert any(a["client_id"] == client["id"] and a["reason"] == "drafts_pending" for a in items)


class TestAnnual:
    def test_annual_draft_and_prorated_extra_account(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan, cycle="annual")
        cid = client["id"]
        d = _draft(superadmin_client, cid)[0]["charge"]
        assert d["cycle"] == "annual" and d["amount"] == 100000
        assert d["period_end"] == _month_end(_add_months(NEXT, 11)).isoformat()
        _approve(superadmin_client, [d["id"]])
        _pay(superadmin_client, cid, 100000)
        assert _state(superadmin_client, cid)["ends_at"] == d["period_end"]
        # a new extra account mid-year: billed to the end of the paid year
        superadmin_client.put(f"{API}/subscriptions/{cid}/seats", json={"extra_seats": {"operator": 1}})
        addon = _draft(superadmin_client, cid, AFTER)
        assert len(addon) == 1
        line = addon[0]["charge"]["lines"][0]
        assert addon[0]["charge"]["cycle"] == "annual_addon" and line["kind"] == "seats_prorated"
        assert line["months"] == 11 and line["amount"] == 11 * 1000
        _approve(superadmin_client, [addon[0]["charge"]["id"]])
        # once billed, it isn't drafted again
        assert _draft(superadmin_client, cid, _add_months(AFTER, 1)) == []


class TestBlocking:
    def test_manual_block_and_unblock(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, admin = _client(superadmin_client, plan)
        r = superadmin_client.post(f"{API}/subscriptions/{client['id']}/block", json={"note": "test"})
        assert r.status_code == 200 and r.json()["state"]["lock_reason"] == "manual"
        assert admin.get(f"{API}/products").status_code == 403
        superadmin_client.post(f"{API}/subscriptions/{client['id']}/unblock", json={})
        assert admin.get(f"{API}/products").status_code == 200

    def test_next_month_charge_is_not_late(self, superadmin_client):
        superadmin_client.put(f"{API}/settings", json={"due_day": 1, "block_after_day": 1})
        try:
            plan = _plan(superadmin_client)
            client, _ = _client(superadmin_client, plan)
            d = _draft(superadmin_client, client["id"])[0]["charge"]
            _approve(superadmin_client, [d["id"]])
            # due on the 1st of next month: owed, but nobody is blocked before the due date
            assert _balance(superadmin_client, client["id"])["balance_due"] == 10000
            assert _state(superadmin_client, client["id"])["status"] != "locked"
        finally:
            superadmin_client.put(f"{API}/settings", json={"due_day": None, "block_after_day": None})

    def test_late_debt_blocks_until_paid(self, superadmin_client):
        if _today().day == 1:
            pytest.skip("needs today to be after the 1st")
        superadmin_client.put(f"{API}/settings", json={"due_day": 1, "block_after_day": 1, "first_month_free": False})
        try:
            plan = _plan(superadmin_client)
            client, _ = _client(superadmin_client, plan)
            cid = client["id"]
            # unpaid since the end of last month, then this month's charge (due on the 1st, now late)
            last_month_end = date(_today().year, _today().month, 1) - timedelta(days=1)
            superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"ends_at": last_month_end.isoformat()})
            d = _draft(superadmin_client, cid, _today())[0]["charge"]
            _approve(superadmin_client, [d["id"]])
            assert _state(superadmin_client, cid)["status"] == "locked"
            # something paid: the month is usable, 9.999 left is below one month (10.000)
            _pay(superadmin_client, cid, 1)
            state = _state(superadmin_client, cid)
            assert state["status"] != "locked" and state["ends_at"] == _month_end(_today()).isoformat()
            # one month becomes cheaper (50% off): the late debt is now more than a month -> blocked
            superadmin_client.put(f"{API}/subscriptions/{cid}/seats", json={"discount_percent": 50})
            state = _state(superadmin_client, cid)
            assert state["status"] == "locked" and state["lock_reason"] == "debt"
            # an exception for this client lifts it until that date
            r = superadmin_client.post(f"{API}/subscriptions/{cid}/extend-due", json={"until": (_today() + timedelta(days=3)).isoformat()})
            assert r.json()["state"]["status"] != "locked"
            superadmin_client.post(f"{API}/subscriptions/{cid}/extend-due", json={"until": None})
            assert _state(superadmin_client, cid)["status"] == "locked"
            # paying the rest lifts it
            _pay(superadmin_client, cid, 9999)
            assert _state(superadmin_client, cid)["status"] != "locked"
        finally:
            superadmin_client.put(f"{API}/settings", json={"due_day": None, "block_after_day": None, "first_month_free": None})

    def test_unpaid_end_of_month_locks_after_the_block_day(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan)
        cid = client["id"]
        last_month_end = date(_today().year, _today().month, 1) - timedelta(days=1)
        superadmin_client.post(f"{API}/subscriptions/{cid}/extend", json={"ends_at": last_month_end.isoformat()})
        superadmin_client.put(f"{API}/settings", json={"block_after_day": 28})
        try:
            state = _state(superadmin_client, cid)
            if _today().day <= 28:
                assert state["status"] == "grace"
            if _today().day > 1:
                superadmin_client.put(f"{API}/settings", json={"due_day": 1, "block_after_day": 1})
                state = _state(superadmin_client, cid)
                assert state["status"] == "locked" and state["lock_reason"] == "expired"
        finally:
            superadmin_client.put(f"{API}/settings", json={"due_day": None, "block_after_day": None})

    def test_block_needs_calendar_billing(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, _ = _client(superadmin_client, plan, enroll=False)
        assert superadmin_client.post(f"{API}/subscriptions/{client['id']}/block", json={}).status_code == 400
        assert superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 5}).status_code == 400


def _set_ips(sa):
    first16 = "1600000000012345"
    account = first16 + f"{98 - (int(first16) * 100) % 97:02d}"
    sa.put(f"{API}/settings", json={
        "ips_account": account, "ips_recipient_name": "TEST Primalac", "ips_purpose": "Pretplata",
        "payment_instructions_sr": "Uplatite na račun", "payment_instructions_en": "Pay to the account",
    })
    return account


class TestClientView:
    def test_admin_sees_charges_and_qr(self, superadmin_client):
        account = _set_ips(superadmin_client)
        try:
            plan = _plan(superadmin_client)
            client, admin = _client(superadmin_client, plan)
            d = _draft(superadmin_client, client["id"])[0]["charge"]
            # a draft is not shown to the client
            me = admin.get(f"{API}/billing/me").json()
            assert me["to_pay"] == 0 and all(c["status"] != "draft" for c in me["charges"])
            assert admin.get(f"{API}/billing/me/qr.png").status_code == 404
            charge = _approve(superadmin_client, [d["id"]])[0]
            me = admin.get(f"{API}/billing/me").json()
            assert me["to_pay"] == 10000 and me["next_due_date"] == charge["due_date"]
            row = next(c for c in me["charges"] if c["id"] == d["id"])
            assert row["number"] == charge["number"] and row["lines"][0]["kind"] == "package" and row["open"] == 10000
            assert me["instructions_sr"] == "Uplatite na račun" and me["ips"]["available"] is True
            assert me["ips"]["account"] == account and me["ips"]["reference"].startswith("97")
            qr = admin.get(f"{API}/billing/me/qr.png")
            assert qr.status_code == 200 and qr.headers["content-type"] == "image/png" and qr.content[:4] == b"\x89PNG"
            # the banner data in /auth/me
            billing = admin.get(f"{API}/auth/me").json()["billing"]
            assert billing["next_due_date"] == charge["due_date"] and billing["to_pay"] == 10000
            assert superadmin_client.get(f"{API}/billing/clients/{client['id']}/qr.png").status_code == 200
        finally:
            superadmin_client.put(f"{API}/settings", json={
                "ips_account": None, "ips_recipient_name": None, "ips_purpose": None,
                "payment_instructions_sr": None, "payment_instructions_en": None,
            })

    def test_only_the_admin_sees_amounts(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, admin = _client(superadmin_client, plan)
        r = admin.post(f"{API}/users", json={"email": f"test-calop-{uuid.uuid4().hex[:6]}@easyorder.dev", "name": "Op", "role": "operator"})
        op = activate_invited_user(r.json()["email"], r.json()["temporary_password"])
        assert op.get(f"{API}/billing/me").status_code == 403
        billing = op.get(f"{API}/auth/me").json()["billing"]
        assert billing is not None and "to_pay" not in billing

    def test_blocked_admin_only_reaches_billing(self, superadmin_client):
        plan = _plan(superadmin_client)
        client, admin = _client(superadmin_client, plan)
        r = admin.post(f"{API}/users", json={"email": f"test-calop-{uuid.uuid4().hex[:6]}@easyorder.dev", "name": "Op", "role": "operator"})
        op_email, op_temp = r.json()["email"], r.json()["temporary_password"]
        op = activate_invited_user(op_email, op_temp)
        superadmin_client.post(f"{API}/subscriptions/{client['id']}/block", json={})
        # the admin: billing yes, the rest no (403, not a logout)
        assert admin.get(f"{API}/auth/me").status_code == 200
        assert admin.get(f"{API}/billing/me").status_code == 200
        r = admin.get(f"{API}/products")
        assert r.status_code == 403 and r.json()["detail"] == "Subscription blocked"
        # the admin can still log in; the sales rep cannot
        admin_email = admin.get(f"{API}/auth/me").json()["email"]
        from helpers import TEST_PASSWORD
        import requests as _rq
        assert _rq.post(f"{API}/auth/login", json={"email": admin_email, "password": TEST_PASSWORD}).status_code == 200
        assert op.get(f"{API}/auth/me").status_code == 401
        assert _rq.post(f"{API}/auth/login", json={"email": op_email, "password": TEST_PASSWORD}).status_code == 403
        superadmin_client.post(f"{API}/subscriptions/{client['id']}/unblock", json={})
        assert admin.get(f"{API}/products").status_code == 200
