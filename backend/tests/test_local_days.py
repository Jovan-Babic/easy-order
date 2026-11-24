"""Days are days in Serbia: date filters, report months and "today" follow Europe/Belgrade, not UTC.
Unit-style: no server needed."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("MONGO_URL", "mongodb://unused")
os.environ.setdefault("DB_NAME", "unused")

import server  # noqa: E402


def test_day_starts_at_local_midnight_winter_and_summer():
    assert server.day_start_utc(date(2026, 1, 15)) == "2026-01-14T23:00:00+00:00"  # UTC+1
    assert server.day_start_utc(date(2026, 7, 15)) == "2026-07-14T22:00:00+00:00"  # UTC+2 (summer time)


def test_order_just_after_local_midnight_belongs_to_the_new_day():
    stored = "2026-10-31T23:30:00.123456+00:00"  # 00:30 on 1 November in Belgrade (winter time again)
    assert server.local_date_of(stored) == date(2026, 11, 1)
    # the string comparison Mongo does on created_at: inside November, outside October
    assert server.day_start_utc(date(2026, 11, 1)) <= stored < server.day_start_utc(date(2026, 12, 1))
    assert not (server.day_start_utc(date(2026, 10, 1)) <= stored < server.day_start_utc(date(2026, 11, 1)))


def test_boundary_strings_compare_correctly_with_stored_timestamps():
    bound = server.day_start_utc(date(2026, 3, 10))  # 2026-03-09T23:00:00+00:00
    assert "2026-03-09T22:59:59.999999+00:00" < bound
    assert bound <= "2026-03-09T23:00:00+00:00"
    assert bound < "2026-03-09T23:00:00.000001+00:00"
