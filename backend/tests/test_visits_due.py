"""The "due" computation of the visit plan: late customers, never-visited customers, planned flag.
Unit-style: no server needed."""
import asyncio
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402


class _Find:
    def __init__(self, rows):
        self.rows = rows

    def __aiter__(self):
        async def gen():
            for r in self.rows:
                yield r
        return gen()

    async def to_list(self, _n):
        return self.rows


class _Agg:
    def __init__(self, rows):
        self.rows = rows

    def __aiter__(self):
        async def gen():
            for r in self.rows:
                yield r
        return gen()


class _Coll:
    def __init__(self, rows=(), agg=()):
        self.rows, self.agg = list(rows), list(agg)

    def find(self, *_a, **_k):
        return _Find(self.rows)

    def aggregate(self, _pipeline):
        return _Agg(self.agg)


class _Db:
    def __init__(self, customers, done, orders, planned, zones):
        self.customers = _Coll(customers)
        self.visits_done = done
        self.orders = _Coll(agg=orders)
        self.zones = _Coll(zones)
        self.visits = _Coll(planned, agg=done)


def _run(monkeypatch, customers, done=(), orders=(), planned=(), zones=(), horizon=7, today=date(2026, 11, 9)):
    monkeypatch.setattr(server, "db", _Db(customers, list(done), list(orders), list(planned), list(zones)))
    return asyncio.run(server._due_rows("c1", today, horizon))


def _customer(cid, name, every, created="2026-10-01T08:00:00+00:00", zone=None):
    return {"id": cid, "name": name, "visit_every_days": every, "created_at": created, "zone_id": zone, "visit_channel": "visit"}


def test_late_customers_come_first_and_never_visited_counts_from_creation(monkeypatch):
    rows = _run(monkeypatch, [
        _customer("a", "Zora", 14, created="2026-10-20T08:00:00+00:00"),  # never visited: 20.10 + 14 = 3.11 -> 6 days late
        _customer("b", "Alfa", 7),  # never visited: 1.10 + 7 = 8.10 -> 32 days late
        _customer("c", "Mika", 30),  # visited 25.10: due 24.11 -> 15 days from now
    ], done=[{"_id": "c", "last": "2026-10-25T10:00:00+00:00"}], horizon=7)
    assert [r["name"] for r in rows] == ["Alfa", "Zora"]  # Mika is outside the horizon; the latest comes first
    assert rows[0]["days_overdue"] == 32 and rows[1]["days_overdue"] == 6 and rows[0]["last_visit"] is None
    wide = _run(monkeypatch, [_customer("c", "Mika", 30)], done=[{"_id": "c", "last": "2026-10-25T10:00:00+00:00"}], horizon=30)
    assert wide[0]["due_date"] == "2026-11-24" and wide[0]["days_overdue"] == -15 and wide[0]["last_visit"] == "2026-10-25"


def test_planned_flag_zone_and_last_order(monkeypatch):
    rows = _run(
        monkeypatch, [_customer("a", "Alfa", 7, zone="z1")],
        orders=[{"_id": "a", "last": "2026-11-02T09:00:00+00:00"}],
        planned=[{"id": "v1", "customer_id": "a", "user_id": "u1", "user_name": "Marko", "date": "2026-11-10", "status": "planned"}],
        zones=[{"id": "z1", "name": "Centar"}],
    )
    assert rows[0]["zone_name"] == "Centar" and rows[0]["last_order"] == "2026-11-02"
    assert rows[0]["planned"] == [{"visit_id": "v1", "user_id": "u1", "user_name": "Marko", "date": "2026-11-10"}]
