"""Paging and search of the order list: `limit` + `skip` with the total in X-Total-Count, `q` by customer name
or invoice number; without `limit` everything comes back as before (older app versions)."""
import uuid

import pytest

from helpers import API


class S:
    orders = []


@pytest.fixture(scope="module", autouse=True)
def world(api_client):
    tag = uuid.uuid4().hex[:6]
    S.tag = tag
    S.product = api_client.post(f"{API}/products", json={"name": f"TEST_PG_{tag}", "price_no_vat": 10}).json()
    S.alpha = api_client.post(f"{API}/customers", json={"name": f"TEST_PG_{tag} Alfa (plus)"}).json()
    S.beta = api_client.post(f"{API}/customers", json={"name": f"TEST_PG_{tag} Beta"}).json()
    for customer in (S.alpha, S.alpha, S.alpha, S.beta, S.beta):
        r = api_client.post(f"{API}/orders", json={"customer_id": customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": 1}]})
        assert r.status_code == 200, r.text
        S.orders.append(r.json()["id"])
    yield
    for oid in S.orders:
        api_client.delete(f"{API}/orders/{oid}")
    api_client.delete(f"{API}/products/{S.product['id']}")
    for c in (S.alpha, S.beta):
        api_client.delete(f"{API}/customers/{c['id']}")


def _page(api_client, **params):
    return api_client.get(f"{API}/orders", params={"q": f"TEST_PG_{S.tag}", **params})


def test_pages_cover_everything_once_newest_first(api_client):
    first = _page(api_client, limit=2)
    assert first.status_code == 200 and first.headers["X-Total-Count"] == "5"
    second = _page(api_client, limit=2, skip=2)
    third = _page(api_client, limit=2, skip=4)
    ids = [o["id"] for r in (first, second, third) for o in r.json()]
    assert len(first.json()) == 2 and len(third.json()) == 1
    assert ids == list(reversed(S.orders))
    assert _page(api_client, limit=2, skip=6).json() == []


def test_without_limit_everything_comes_back_and_no_total(api_client):
    r = _page(api_client)
    assert len(r.json()) == 5 and "X-Total-Count" not in r.headers


def test_search_by_customer_name_is_case_insensitive_and_literal(api_client):
    r = api_client.get(f"{API}/orders", params={"q": f"test_pg_{S.tag} beta", "limit": 50})
    assert r.headers["X-Total-Count"] == "2" and {o["customer_id"] for o in r.json()} == {S.beta["id"]}
    # regex characters are plain text: "(plus)" matches the name, ".*" matches nothing
    assert api_client.get(f"{API}/orders", params={"q": f"{S.tag} Alfa (plus)", "limit": 50}).headers["X-Total-Count"] == "3"
    assert api_client.get(f"{API}/orders", params={"q": f"TEST_PG_{S.tag}.*", "limit": 50}).headers["X-Total-Count"] == "0"


def test_search_combines_with_the_status_filter(api_client):
    api_client.post(f"{API}/orders/{S.orders[0]}/status", json={"status": "canceled"})
    r = _page(api_client, limit=50, status="canceled")
    assert r.headers["X-Total-Count"] == "1" and r.json()[0]["id"] == S.orders[0]
    assert _page(api_client, limit=50, status="new").headers["X-Total-Count"] == "4"


def test_overview_respects_the_period(api_client):
    everything = api_client.get(f"{API}/stats/overview").json()["totals"]
    future = api_client.get(f"{API}/stats/overview", params={"from_date": "2099-01-01"}).json()["totals"]
    assert everything["order_count"] >= 4 and future["order_count"] == 0 and future["total_grand"] == 0
    assert future["customer_count"] == everything["customer_count"]  # the catalog is not a matter of period
    assert api_client.get(f"{API}/stats/overview", params={"from_date": "nope"}).status_code == 400
