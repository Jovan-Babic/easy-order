"""Phase 6: the sales rep gets an email when their order is shipped or rejected.
Unit-style: no running server or SMTP needed (the sender is stubbed)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402


class _Users:
    def __init__(self, doc):
        self.doc = doc

    async def find_one(self, *_a, **_k):
        return self.doc


class _Db:
    def __init__(self, user_doc):
        self.users = _Users(user_doc)


def _actor(uid="wh1"):
    return server.User(email="wh@x.dev", name="Magacioner", role=server.Role.WAREHOUSE, client_id="c1", id=uid)


ORDER = {"id": "o1", "customer_name": "Kupac DOO", "created_by_user_id": "op1", "created_by_name": "Pera",
         "invoice_number": "ABC/0007"}


def _run(monkeypatch, status, note=None, user_doc=None, actor=None, configured=True, creator="op1"):
    sent = []
    monkeypatch.setattr(server, "db", _Db(user_doc if user_doc is not None else {"email": "pera@x.dev"}))
    monkeypatch.setattr(server, "_smtp_is_configured", lambda: configured)
    monkeypatch.setattr(server, "_send_smtp_email_sync", lambda to, subj, body: sent.append((to, subj, body)))
    order = {**ORDER, "created_by_user_id": creator}
    asyncio.run(server._send_order_status_email(order, status, note, actor or _actor()))
    return sent


def test_shipped_email_has_invoice_number(monkeypatch):
    (to, subject, body), = _run(monkeypatch, "shipped")
    assert to == "pera@x.dev" and "poslata" in subject
    assert "ABC/0007" in body and "Magacioner" in body


def test_rejected_email_has_reason(monkeypatch):
    (to, subject, body), = _run(monkeypatch, "rejected", note="nema na stanju")
    assert "odbijena" in subject and "nema na stanju" in body


def test_no_email_when_actor_is_creator(monkeypatch):
    assert _run(monkeypatch, "shipped", actor=_actor("op1")) == []


def test_no_email_without_smtp_or_creator(monkeypatch):
    assert _run(monkeypatch, "shipped", configured=False) == []
    assert _run(monkeypatch, "shipped", creator=None) == []
    assert _run(monkeypatch, "shipped", user_doc={}) == []


def test_send_failure_never_raises(monkeypatch):
    monkeypatch.setattr(server, "db", _Db({"email": "pera@x.dev"}))
    monkeypatch.setattr(server, "_smtp_is_configured", lambda: True)

    def boom(*_a):
        raise OSError("smtp down")

    monkeypatch.setattr(server, "_send_smtp_email_sync", boom)
    asyncio.run(server._send_order_status_email(ORDER, "shipped", None, _actor()))
