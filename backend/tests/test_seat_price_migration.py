"""Startup migration: the price of an extra account moves from the plans to the price list.
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

    async def to_list(self, _n):
        return self.rows


class _Plans:
    def __init__(self, rows):
        self.rows = rows
        self.unset = False

    def find(self, *_a, **_k):
        return _Cursor([r for r in self.rows if "seat_prices" in r])

    async def update_many(self, _q, update):
        self.unset = "$unset" in update
        for r in self.rows:
            r.pop("seat_prices", None)


class _Settings:
    def __init__(self, doc):
        self.doc = doc

    async def find_one(self, *_a, **_k):
        return self.doc

    async def update_one(self, _q, update, upsert=False):
        self.doc = {**(self.doc or {}), **update["$set"]}


class _Db:
    def __init__(self, plans, settings):
        self.plans = _Plans(plans)
        self.app_settings = _Settings(settings)


def _run(monkeypatch, plans, settings=None):
    db = _Db(plans, settings)
    monkeypatch.setattr(server, "db", db)

    async def no_refresh(force=False):
        return None

    monkeypatch.setattr(server, "refresh_settings", no_refresh)
    asyncio.run(server._migrate_seat_prices())
    return db


def test_equal_prices_are_taken_over_and_removed_from_plans(monkeypatch):
    db = _run(monkeypatch, [
        {"id": "a", "name": "A", "seat_prices": {"operator": 1200, "warehouse": 900}},
        {"id": "b", "name": "B", "seat_prices": {"operator": 1200}},
    ])
    # operator agrees (1200), warehouse is set in one plan only (900), admin was never set: the default
    assert db.app_settings.doc["seat_prices"] == {"operator": 1200.0, "warehouse": 900.0, "admin": 2000}
    assert db.plans.unset and all("seat_prices" not in p for p in db.plans.rows)


def test_differing_prices_fall_back_to_the_default(monkeypatch):
    db = _run(monkeypatch, [
        {"id": "a", "name": "A", "seat_prices": {"operator": 1200}},
        {"id": "b", "name": "B", "seat_prices": {"operator": 800}},
    ])
    assert db.app_settings.doc["seat_prices"]["operator"] == 1000


def test_stored_price_list_wins_and_plans_are_cleaned(monkeypatch):
    db = _run(monkeypatch, [{"id": "a", "name": "A", "seat_prices": {"operator": 1}}], {"seat_prices": {"operator": 1111}})
    assert db.app_settings.doc["seat_prices"] == {"operator": 1111} and db.plans.unset


def test_nothing_to_do_without_old_prices(monkeypatch):
    db = _run(monkeypatch, [{"id": "a", "name": "A"}])
    assert db.app_settings.doc is None and not db.plans.unset


# ---- SEF: one key per client -> one key per environment


class _Clients:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *_a, **_k):
        class _It:
            def __init__(self, rows):
                self.rows = list(rows)

            def __aiter__(self):
                return self

            async def __anext__(self):
                if not self.rows:
                    raise StopAsyncIteration
                return self.rows.pop(0)

        return _It([r for r in self.rows if "api_key_enc" in (r.get("sef") or {})])

    async def update_one(self, query, update):
        row = next(r for r in self.rows if r["id"] == query["id"])
        for key in update.get("$unset", {}):
            row["sef"].pop(key.split(".", 1)[1], None)
        for key, value in update.get("$set", {}).items():
            _, _, env = key.split(".")
            row["sef"].setdefault("keys", {})[env] = value


def test_single_sef_key_moves_to_its_environment(monkeypatch):
    rows = [
        {"id": "a", "sef": {"env": "production", "api_key_enc": "ENC", "key_set_at": "t", "key_hint": "…1234", "enabled": True}},
        {"id": "b", "sef": {"env": "demo", "api_key_enc": None, "last_check_ok": True}},
    ]

    class _Db:
        clients = _Clients(rows)

    monkeypatch.setattr(server, "db", _Db())
    asyncio.run(server._migrate_sef_keys())
    assert rows[0]["sef"]["keys"]["production"]["enc"] == "ENC" and rows[0]["sef"]["keys"]["production"]["hint"] == "…1234"
    assert "api_key_enc" not in rows[0]["sef"] and rows[0]["sef"]["enabled"] is True
    assert "keys" not in rows[1]["sef"] and "api_key_enc" not in rows[1]["sef"]
