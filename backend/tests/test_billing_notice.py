"""The banner's block date (/auth/me billing.blocks_on) is announced only when the
debt would really block the account. Unit-style: no server needed."""
import asyncio
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402


class _Clients:
    def __init__(self, sub):
        self.sub = sub

    async def find_one(self, *_a, **_k):
        return {"subscription": self.sub}


class _Db:
    def __init__(self, sub):
        self.clients = _Clients(sub)


def _notice(monkeypatch, open_amount, ends_at, today=date(2026, 11, 6), role="admin"):
    sub = {
        "billing_cycle": "monthly", "ends_at": ends_at, "monthly_amount": 5000,
        "balance_due": open_amount,
        "open_charges": [{"due_date": "2026-11-01", "open": open_amount}],
    }
    monkeypatch.setattr(server, "db", _Db(sub))
    monkeypatch.setattr(server, "_today", lambda: today)
    monkeypatch.setattr(server, "setting", lambda key: server.SETTINGS_DEFAULTS[key])
    return asyncio.run(server._billing_notice({"client_id": "c1", "role": role}))


def test_full_debt_announces_the_block_date(monkeypatch):
    notice = _notice(monkeypatch, 5000, "2026-10-31")  # nothing paid for November
    assert notice["late"] is True and notice["blocks_on"] == "2026-11-06"


def test_partial_payment_announces_no_block(monkeypatch):
    notice = _notice(monkeypatch, 3000, "2026-11-30")  # part paid: the period is covered
    assert notice["late"] is True and notice["blocks_on"] is None
    assert notice["to_pay"] == 3000
