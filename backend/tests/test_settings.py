"""System settings (PLAN_NAPLATA_KALENDARSKA.md, N1): stored in the DB, edited by
the superadmin, falling back to env and then code."""
import uuid

import pytest

from helpers import API


@pytest.fixture(autouse=True)
def reset_settings(superadmin_client):
    yield
    # Back to the defaults so other tests see the usual values.
    superadmin_client.put(f"{API}/settings", json={k: None for k in (
        "draft_day", "due_day", "block_after_day", "first_month_free", "reminder_days", "purge_after_days",
        "expiry_alert_days", "payment_instructions_sr", "payment_instructions_en", "ips_account", "ips_recipient_name",
        "ips_payment_code", "ips_purpose", "ips_reference_from_number", "issuer_name", "issuer_address", "issuer_pib",
        "issuer_account", "issuer_note", "billing_from_email", "billing_from_name", "billing_reply_to", "bilingual_emails",
    )})


# A valid Serbian account: 16 digits + control so that the number mod 97 == 1.
def _account(first16="1600000000012345"):
    control = 98 - (int(first16) * 100) % 97
    return first16 + f"{control:02d}"


class TestAccess:
    def test_only_superadmin(self, api_client):
        assert api_client.get(f"{API}/settings").status_code == 403
        assert api_client.put(f"{API}/settings", json={"draft_day": 20}).status_code == 403


class TestValues:
    def test_defaults(self, superadmin_client):
        body = superadmin_client.get(f"{API}/settings").json()
        v = body["values"]
        assert (v["draft_day"], v["due_day"], v["block_after_day"]) == (25, 1, 5)
        assert v["first_month_free"] is True and v["bilingual_emails"] is True
        assert v["expiry_alert_days"] == [5, 15, 30]
        assert body["defaults"]["draft_day"] == 25

    def test_partial_update_and_reset(self, superadmin_client):
        r = superadmin_client.put(f"{API}/settings", json={"draft_day": 20, "payment_instructions_sr": "  Uplata na račun  "})
        assert r.status_code == 200, r.text
        v = r.json()["values"]
        assert v["draft_day"] == 20 and v["payment_instructions_sr"] == "Uplata na račun" and v["due_day"] == 1
        # not sent = kept
        v = superadmin_client.put(f"{API}/settings", json={"due_day": 2}).json()["values"]
        assert v["draft_day"] == 20 and v["due_day"] == 2
        # null or empty text = back to the default
        v = superadmin_client.put(f"{API}/settings", json={"draft_day": None, "payment_instructions_sr": ""}).json()["values"]
        assert v["draft_day"] == 25 and v["payment_instructions_sr"] == ""

    def test_validation(self, superadmin_client):
        put = lambda body: superadmin_client.put(f"{API}/settings", json=body).status_code
        assert put({"draft_day": 0}) == 422
        assert put({"draft_day": 29}) == 422
        assert put({"due_day": 10, "block_after_day": 5}) == 400
        assert put({"ips_account": "123"}) == 400
        acc = _account()
        assert put({"ips_account": acc[:-2] + f"{(int(acc[-2:]) + 1) % 100:02d}"}) == 400  # wrong control number
        assert put({"ips_payment_code": "28"}) == 400
        assert put({"issuer_pib": "12345"}) == 400
        assert put({"billing_from_email": "not-an-email"}) == 400
        assert put({"expiry_alert_days": [0, 5]}) == 400
        assert put({"purge_after_days": 3}) == 422

    def test_account_is_normalized(self, superadmin_client):
        acc = _account()
        dashed = f"{acc[:3]}-{acc[3:16].lstrip('0')}-{acc[16:]}"
        r = superadmin_client.put(f"{API}/settings", json={"ips_account": dashed, "billing_from_email": "Naplata@Example.com"})
        assert r.status_code == 200, r.text
        assert r.json()["values"]["ips_account"] == acc
        assert r.json()["values"]["billing_from_email"] == "naplata@example.com"

    def test_change_is_audited(self, superadmin_client):
        superadmin_client.put(f"{API}/settings", json={"issuer_name": "TEST Izdavalac"})
        entries = superadmin_client.get(f"{API}/audit", params={"action": "settings."}).json()
        rows = entries["items"] if isinstance(entries, dict) else entries
        assert any(e["action"] == "settings.update" for e in rows)


class TestSettingsAreUsed:
    def test_new_client_gets_default_expiry_alert_days(self, superadmin_client):
        superadmin_client.put(f"{API}/settings", json={"expiry_alert_days": [3, 10]})
        suffix = uuid.uuid4().hex[:6]
        r = superadmin_client.post(
            f"{API}/clients", json={"name": f"TEST_Set_{suffix}", "admin_name": "A", "admin_email": f"test-set-{suffix}@easyorder.dev"}
        )
        assert r.status_code == 200, r.text
        try:
            assert r.json()["client"]["expiry_alert_days"] == [3, 10]
        finally:
            superadmin_client.delete(f"{API}/clients/{r.json()['client']['id']}")
