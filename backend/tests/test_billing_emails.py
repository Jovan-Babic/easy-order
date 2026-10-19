"""Billing emails (PLAN_NAPLATA_KALENDARSKA.md, N4). CI has no SMTP, so the tests
check the log every email leaves (`GET /billing/clients/{id}/emails`): who would
get it, that it is sent once, and that it is skipped when switched off."""
import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests

from helpers import API, activate_invited_user

CRON_SECRET = os.environ.get("CRON_SECRET", "")


def _today():
    return datetime.now(timezone.utc).date()


def _add_months(d, n):
    i = d.month - 1 + n
    return date(d.year + i // 12, i % 12 + 1, 1)


NEXT = _add_months(_today(), 1)


class S:
    plans = []
    clients = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(superadmin_client):
    superadmin_client.put(f"{API}/settings", json={"due_day": 1, "block_after_day": 5, "bilingual_emails": True})
    yield
    superadmin_client.put(f"{API}/settings", json={
        "due_day": None, "block_after_day": None, "bilingual_emails": None,
        "ips_account": None, "ips_recipient_name": None,
    })
    for cid in S.clients:
        superadmin_client.delete(f"{API}/clients/{cid}")
    for pid in S.plans:
        superadmin_client.delete(f"{API}/plans/{pid}")


def _client(sa):
    plan = sa.post(f"{API}/plans", json={
        "name": f"TEST_Mail_{uuid.uuid4().hex[:6]}", "modules": [], "prices": {"1": 10000},
        "included_seats": {"operator": 1}, "seat_prices": {"operator": 1000},
    }).json()
    S.plans.append(plan["id"])
    suffix = uuid.uuid4().hex[:8]
    email = f"test-mail-{suffix}@easyorder.dev"
    r = sa.post(f"{API}/clients", json={
        "name": f"TEST_Mail_{suffix}", "admin_name": "TEST Mail Admin", "admin_email": email,
        "plan_id": plan["id"], "subscription_ends_at": _today().isoformat(),
    })
    assert r.status_code == 200, r.text
    client = r.json()["client"]
    S.clients.append(client["id"])
    activate_invited_user(email, r.json()["temporary_password"])
    return client, email


def _emails(sa, cid):
    r = sa.get(f"{API}/billing/clients/{cid}/emails")
    assert r.status_code == 200, r.text
    return r.json()


def _events(sa, cid, event):
    return [x for x in _emails(sa, cid)["log"] if x["event"] == event]


def _charge_next_month(sa, cid):
    drafts = sa.post(f"{API}/billing/drafts/generate", json={"client_ids": [cid], "month": NEXT.strftime("%Y-%m")}).json()
    approved = sa.post(f"{API}/billing/drafts/approve", json={"ids": [d["charge"]["id"] for d in drafts]}).json()
    assert len(approved) == 1
    return approved[0]


class TestRecipients:
    def test_admins_and_accounting_once(self, superadmin_client):
        client, admin_email = _client(superadmin_client)
        out = _emails(superadmin_client, client["id"])
        assert out["recipients"] == [admin_email] and out["billing_emails"] is True and out["accounting_email"] is None
        # the same address as the admin's is not a second recipient
        r = superadmin_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"accounting_email": admin_email.upper()})
        assert r.status_code == 200 and r.json()["recipients"] == [admin_email]
        r = superadmin_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"accounting_email": "Racunovodstvo@Example.com"})
        assert r.json()["recipients"] == [admin_email, "racunovodstvo@example.com"]
        assert superadmin_client.get(f"{API}/clients/{client['id']}").json()["accounting_email"] == "racunovodstvo@example.com"
        assert superadmin_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"accounting_email": "nije-email"}).status_code == 400
        r = superadmin_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"accounting_email": ""})
        assert r.json()["accounting_email"] is None and r.json()["recipients"] == [admin_email]

    def test_superadmin_only(self, superadmin_client, api_client):
        client, _ = _client(superadmin_client)
        assert api_client.get(f"{API}/billing/clients/{client['id']}/emails").status_code == 403
        assert api_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"billing_emails": False}).status_code == 403


class TestChargeEmails:
    def test_approved_charge_is_emailed_with_lines_and_due_date(self, superadmin_client):
        client, admin_email = _client(superadmin_client)
        # the free first month (0 din) is not emailed
        assert _events(superadmin_client, client["id"], "issued") == []
        charge = _charge_next_month(superadmin_client, client["id"])
        logs = _events(superadmin_client, client["id"], "issued")
        assert len(logs) == 1
        log = logs[0]
        assert log["charge_ids"] == [charge["id"]] and log["recipients"] == [admin_email]
        assert log["sent"] is False and log["skipped"] == "smtp_off"  # CI has no SMTP
        assert charge["number"] in log["subject"]
        assert "Ukupno za uplatu" in log["text"] and "10.000,00 RSD" in log["text"] and "Total to pay" in log["text"]
        assert "Rok plaćanja: " + date(NEXT.year, NEXT.month, 1).strftime("%d.%m.%Y") in log["text"]

    def test_switched_off_is_logged_but_not_sent(self, superadmin_client):
        client, _ = _client(superadmin_client)
        superadmin_client.put(f"{API}/billing/clients/{client['id']}/emails", json={"billing_emails": False})
        assert _emails(superadmin_client, client["id"])["billing_emails"] is False
        _charge_next_month(superadmin_client, client["id"])
        assert [x["skipped"] for x in _events(superadmin_client, client["id"], "issued")] == ["disabled"]

    def test_manual_debt_is_emailed(self, superadmin_client):
        client, _ = _client(superadmin_client)
        r = superadmin_client.post(f"{API}/payments", json={
            "client_id": client["id"], "status": "expected", "amount": 50000, "kind": "setup",
            "due_date": (_today() + timedelta(days=10)).isoformat(), "note": "Uvođenje",
        })
        assert r.status_code == 200, r.text
        logs = _events(superadmin_client, client["id"], "issued")
        assert len(logs) == 1 and "Uvođenje" in logs[0]["text"] and "50.000,00 RSD" in logs[0]["text"]

    def test_serbian_only_when_bilingual_is_off(self, superadmin_client):
        superadmin_client.put(f"{API}/settings", json={"bilingual_emails": False})
        try:
            client, _ = _client(superadmin_client)
            _charge_next_month(superadmin_client, client["id"])
            log = _events(superadmin_client, client["id"], "issued")[0]
            assert "Ukupno za uplatu" in log["text"] and "Total to pay" not in log["text"] and " / " not in log["subject"]
        finally:
            superadmin_client.put(f"{API}/settings", json={"bilingual_emails": True})

    def test_qr_attached_when_payment_details_are_set(self, superadmin_client):
        first16 = "1600000000012345"
        account = first16 + f"{98 - (int(first16) * 100) % 97:02d}"
        superadmin_client.put(f"{API}/settings", json={"ips_account": account, "ips_recipient_name": "TEST Primalac"})
        try:
            client, _ = _client(superadmin_client)
            _charge_next_month(superadmin_client, client["id"])
            log = _events(superadmin_client, client["id"], "issued")[0]
            assert log["with_qr"] is True and "TEST Primalac" in log["text"]
        finally:
            superadmin_client.put(f"{API}/settings", json={"ips_account": None, "ips_recipient_name": None})


class TestPaymentReceipt:
    def test_receipt_only_when_asked_and_switch_can_change(self, superadmin_client):
        client, _ = _client(superadmin_client)
        _charge_next_month(superadmin_client, client["id"])
        superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 4000})
        assert _events(superadmin_client, client["id"], "paid") == []
        r = superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 1000, "send_receipt": True})
        assert r.status_code == 200, r.text
        logs = _events(superadmin_client, client["id"], "paid")
        assert len(logs) == 1 and "1.000,00 RSD" in logs[0]["text"] and "5.000,00 RSD" in logs[0]["text"]  # still to pay
        r = superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 1, "billing_emails": False, "send_receipt": True})
        assert r.status_code == 200
        assert _emails(superadmin_client, client["id"])["billing_emails"] is False
        assert _events(superadmin_client, client["id"], "paid")[0]["skipped"] == "disabled"


def _cron(day):
    r = requests.get(
        f"{API}/internal/cron/subscriptions", params={"dry_run": "true", "as_of": day.isoformat()},
        headers={"Authorization": f"Bearer {CRON_SECRET}"},
    )
    assert r.status_code == 200, r.text
    return r.json()["billing_emails"]


@pytest.mark.skipif(not CRON_SECRET, reason="needs CRON_SECRET (same value on the server and in the tests)")
class TestCronEmails:
    def test_reminder_warning_blocked_each_once(self, superadmin_client):
        client, _ = _client(superadmin_client)
        name = client["name"]
        _charge_next_month(superadmin_client, client["id"])
        day = lambda d: date(NEXT.year, NEXT.month, d)  # noqa: E731
        assert name not in _cron(day(1) - timedelta(days=1))["reminder"]  # not due yet
        assert name in _cron(day(1))["reminder"]
        assert name not in _cron(day(2))["reminder"]  # once per charge
        out = _cron(day(4))
        assert name in out["warning"] and name not in out["reminder"]
        assert name not in _cron(day(5))["warning"]
        assert name in _cron(day(6))["blocked"]
        assert name not in _cron(day(7))["blocked"]
        assert [len(_events(superadmin_client, client["id"], e)) for e in ("reminder", "warning", "blocked")] == [1, 1, 1]
        # paid: the block lifts and the next block would be emailed again
        superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 10000})
        out = _cron(day(7))
        assert name not in out["blocked"]

    def test_no_warning_when_the_client_would_not_be_blocked(self, superadmin_client):
        client, _ = _client(superadmin_client)
        name = client["name"]
        _charge_next_month(superadmin_client, client["id"])
        # most of it paid: the period counts as paid, the rest is below a month's amount
        superadmin_client.post(f"{API}/billing/payments", json={"client_id": client["id"], "amount": 9000})
        day = lambda d: date(NEXT.year, NEXT.month, d)  # noqa: E731
        assert name in _cron(day(1))["reminder"]
        assert name not in _cron(day(4))["warning"]
        assert name not in _cron(day(6))["blocked"]

    def test_as_of_needs_a_valid_day(self):
        r = requests.get(
            f"{API}/internal/cron/subscriptions", params={"dry_run": "true", "as_of": "sutra"},
            headers={"Authorization": f"Bearer {CRON_SECRET}"},
        )
        assert r.status_code == 400
