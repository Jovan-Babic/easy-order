"""Startup migration: orders numbered before `invoiced_at` existed get the time of their first shipment.
Unit-style: no server needed."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def __aiter__(self):
        self._it = iter(self.rows)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class _Orders:
    def __init__(self, rows):
        self.rows = rows

    def find(self, query, _projection=None):
        return _Cursor([r for r in self.rows if r.get("invoice_number") and "invoiced_at" not in r])

    async def update_one(self, query, update):
        row = next(r for r in self.rows if r["id"] == query["id"])
        row.update(update["$set"])


class _Db:
    def __init__(self, rows):
        self.orders = _Orders(rows)


def test_first_shipment_from_history_else_shipped_at(monkeypatch):
    rows = [
        {"id": "a", "invoice_number": "A/0001", "created_at": "2026-10-01T08:00:00+00:00", "shipped_at": "2026-10-20T09:00:00+00:00",
         "status_history": [
             {"to_status": "in_progress", "changed_at": "2026-10-02T08:00:00+00:00"},
             {"to_status": "shipped", "changed_at": "2026-10-07T10:00:00+00:00"},  # first shipment
             {"to_status": "in_progress", "changed_at": "2026-10-19T10:00:00+00:00"},
             {"to_status": "shipped", "changed_at": "2026-10-20T09:00:00+00:00"},  # shipped again: shipped_at moved
         ]},
        {"id": "b", "invoice_number": "A/0002", "created_at": "2026-10-03T08:00:00+00:00", "shipped_at": "2026-10-12T09:00:00+00:00"},
        {"id": "c", "invoice_number": None, "created_at": "2026-10-04T08:00:00+00:00"},  # never numbered: untouched
        {"id": "d", "invoice_number": "A/0003", "invoiced_at": "2026-10-15T00:00:00+00:00"},  # already has one
    ]
    monkeypatch.setattr(server, "db", _Db(rows))
    asyncio.run(server._migrate_invoiced_at())
    by_id = {r["id"]: r for r in rows}
    assert by_id["a"]["invoiced_at"] == "2026-10-07T10:00:00+00:00"
    assert by_id["b"]["invoiced_at"] == "2026-10-12T09:00:00+00:00"
    assert "invoiced_at" not in by_id["c"]
    assert by_id["d"]["invoiced_at"] == "2026-10-15T00:00:00+00:00"
