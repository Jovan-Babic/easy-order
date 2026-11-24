"""Phases 2-3 of RBAC_PLAN.md: order statuses, history and warehouse packing (picked_qty)."""
import uuid

import pytest

from helpers import API, activate_invited_user


def _invite(api_client, role, label):
    email = f"test-{label}-{uuid.uuid4().hex[:8]}@easyorder.dev"
    r = api_client.post(f"{API}/users", json={"email": email, "name": f"TEST {label}", "role": role})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["id"], activate_invited_user(email, body["temporary_password"])


class S:
    orders = []


def _new_order(session, qty=10):
    r = session.post(
        f"{API}/orders",
        json={"customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": qty}]},
    )
    assert r.status_code == 200, r.text
    S.orders.append(r.json()["id"])
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def world(api_client, superadmin_client):
    # Shipping assigns an invoice number, so the demo client needs a prefix.
    cid = api_client.get(f"{API}/auth/me").json()["client_id"]
    cur = superadmin_client.get(f"{API}/clients/{cid}").json()
    superadmin_client.put(f"{API}/clients/{cid}", json={**cur, "invoice_prefix": "TST", "invoice_numbering": "auto"})
    S.op_id, S.op = _invite(api_client, "operator", "wf-op")
    S.op2_id, S.op2 = _invite(api_client, "operator", "wf-op2")
    S.wh_id, S.wh = _invite(api_client, "warehouse", "wf-wh")
    S.product = api_client.post(f"{API}/products", json={"name": "TEST_WF_Product", "price_no_vat": 100, "vat_rate": 20}).json()
    S.customer = api_client.post(f"{API}/customers", json={"name": "TEST_WF_Customer"}).json()
    yield
    for oid in S.orders:
        api_client.post(f"{API}/orders/{oid}/status", json={"status": "new", "note": "cleanup"})
        api_client.delete(f"{API}/orders/{oid}")
    api_client.delete(f"{API}/products/{S.product['id']}")
    api_client.delete(f"{API}/customers/{S.customer['id']}")
    for uid in (S.op_id, S.op2_id, S.wh_id):
        api_client.delete(f"{API}/users/{uid}")


def _status(session, oid, status, note=None):
    return session.post(f"{API}/orders/{oid}/status", json={"status": status, "note": note})


def _pick(session, oid, qty):
    return session.patch(f"{API}/orders/{oid}/items", json={"items": [{"product_id": S.product["id"], "picked_qty": qty}]})


class TestHistoryAndFlow:
    def test_create_writes_first_history_entry(self):
        o = _new_order(S.op)
        assert o["status"] == "new"
        assert [(h["from_status"], h["to_status"]) for h in o["status_history"]] == [(None, "new")]

    def test_warehouse_takes_and_returns_order(self):
        o = _new_order(S.op)
        r = _status(S.wh, o["id"], "in_progress")
        assert r.status_code == 200 and r.json()["assigned_to_name"] == "TEST wf-wh"
        r = _status(S.wh, o["id"], "new")
        assert r.status_code == 200 and r.json()["assigned_to_user_id"] is None
        assert len(r.json()["status_history"]) == 3

    def test_same_status_and_forbidden_transitions(self):
        o = _new_order(S.op)
        assert _status(S.wh, o["id"], "new").status_code == 400
        assert _status(S.wh, o["id"], "shipped").status_code == 400  # new -> shipped not in the table
        assert _status(S.wh, o["id"], "canceled").status_code == 403  # in the table, but not for warehouse

    def test_reject_needs_note(self):
        o = _new_order(S.op)
        assert _status(S.wh, o["id"], "rejected").status_code == 400
        r = _status(S.wh, o["id"], "rejected", "nema na stanju")
        assert r.status_code == 200 and r.json()["status_history"][-1]["note"] == "nema na stanju"

    def test_operator_cancels_only_own_new_order(self):
        o = _new_order(S.op)
        assert _status(S.op2, o["id"], "canceled").status_code == 404  # someone else's
        assert _status(S.op, o["id"], "canceled").status_code == 200
        assert _status(S.op, o["id"], "new").status_code == 400  # terminal for operators

    def test_operator_cannot_cancel_in_progress(self):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "in_progress")
        assert _status(S.op, o["id"], "canceled").status_code == 400

    def test_admin_override_needs_note(self, api_client):
        o = _new_order(S.op)
        assert _status(api_client, o["id"], "shipped").status_code == 400
        # canceled -> new is outside the table: needs a note
        _status(S.op, o["id"], "canceled")
        assert _status(api_client, o["id"], "new").status_code == 400
        assert _status(api_client, o["id"], "new", "greškom otkazano").status_code == 200

    def test_taking_twice_is_a_400_not_a_500(self):
        o = _new_order(S.op)
        assert _status(S.wh, o["id"], "in_progress").status_code == 200
        assert _status(S.wh, o["id"], "in_progress").status_code == 400

    def test_delete_only_new(self, api_client):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "in_progress")
        assert api_client.delete(f"{API}/orders/{o['id']}").status_code == 409
        _status(S.wh, o["id"], "new")
        assert api_client.delete(f"{API}/orders/{o['id']}").status_code == 200

    def test_status_filter(self):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "in_progress")
        ids = {x["id"] for x in S.wh.get(f"{API}/orders", params={"status": "in_progress"}).json()}
        assert o["id"] in ids
        ids = {x["id"] for x in S.wh.get(f"{API}/orders", params={"status": "new"}).json()}
        assert o["id"] not in ids


class TestPacking:
    def test_first_pick_takes_the_order(self):
        o = _new_order(S.op)
        r = _pick(S.wh, o["id"], 4)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "in_progress" and body["items"][0]["picked_qty"] == 4
        assert body["status_history"][-1]["to_status"] == "in_progress"

    def test_roles_and_bounds(self, api_client):
        o = _new_order(S.op)
        assert _pick(S.op, o["id"], 1).status_code == 403
        assert _pick(S.wh, o["id"], 11).status_code == 400  # more than ordered
        assert _pick(S.wh, o["id"], -1).status_code == 400
        bad = S.wh.patch(f"{API}/orders/{o['id']}/items", json={"items": [{"product_id": "nope", "picked_qty": 1}]})
        assert bad.status_code == 400
        assert _pick(api_client, o["id"], 5).status_code == 200  # admin may pack too

    def test_uncheck_with_null(self):
        o = _new_order(S.op)
        _pick(S.wh, o["id"], 3)
        r = S.wh.patch(f"{API}/orders/{o['id']}/items", json={"items": [{"product_id": S.product["id"], "picked_qty": None}]})
        assert r.status_code == 200 and r.json()["items"][0]["picked_qty"] is None

    def test_cannot_pack_finished_order(self):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "rejected", "x")
        assert _pick(S.wh, o["id"], 1).status_code == 409

    def test_ship_needs_every_item_picked_and_one_positive(self):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "in_progress")
        assert _status(S.wh, o["id"], "shipped").status_code == 400  # nothing checked
        _pick(S.wh, o["id"], 0)
        assert _status(S.wh, o["id"], "shipped").status_code == 400  # all zero

    def test_partial_shipment_totals(self):
        o = _new_order(S.op, qty=10)
        assert o["totals"]["subtotal"] == 1000.0
        _pick(S.wh, o["id"], 7)
        mid = S.wh.get(f"{API}/orders/{o['id']}").json()
        assert mid["totals"]["subtotal"] == 1000.0  # still by ordered qty before shipping
        r = _status(S.wh, o["id"], "shipped")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["shipped_at"]
        assert body["totals"]["subtotal"] == 700.0 and body["totals"]["grand"] == 840.0
        assert body["ordered_totals"]["subtotal"] == 1000.0
        assert body["items"][0]["line_net"] == 700.0
        # the commercial rep sees the same breakdown
        assert S.op.get(f"{API}/orders/{o['id']}").json()["ordered_totals"]["subtotal"] == 1000.0


class TestEditNewOrder:
    def _edit(self, session, oid, qty, customer_id=None):
        return session.put(
            f"{API}/orders/{oid}",
            json={"customer_id": customer_id or S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": qty}]},
        )

    def test_creator_edits_own_new_order(self):
        o = _new_order(S.op, qty=2)
        r = self._edit(S.op, o["id"], 7)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["items"][0]["ordered_qty"] == 7 and body["totals"]["subtotal"] == 700.0
        assert body["status"] == "new" and body["updated_at"]

    def test_other_operator_gets_404(self):
        o = _new_order(S.op)
        assert self._edit(S.op2, o["id"], 3).status_code == 404

    def test_warehouse_cannot_edit(self):
        o = _new_order(S.op)
        assert self._edit(S.wh, o["id"], 3).status_code == 403

    def test_admin_can_edit_and_unknown_customer_is_400(self, api_client):
        o = _new_order(S.op)
        assert self._edit(api_client, o["id"], 4).status_code == 200
        assert self._edit(S.op, o["id"], 4, customer_id="nope").status_code == 400

    def test_cannot_edit_after_warehouse_takes_it(self):
        o = _new_order(S.op)
        _status(S.wh, o["id"], "in_progress")
        assert self._edit(S.op, o["id"], 3).status_code == 409

    def test_empty_or_zero_quantity_is_400(self):
        o = _new_order(S.op)
        assert S.op.put(f"{API}/orders/{o['id']}", json={"customer_id": S.customer["id"], "items": []}).status_code == 400
        assert self._edit(S.op, o["id"], 0).status_code == 400


class TestReopenedByAdmin:
    """An admin moves a shipped order back to "in progress" for a correction: the warehouse must be able to
    go on with it (it used to be locked to the admin)."""

    def test_reopened_order_goes_back_to_its_packer(self, api_client):
        order = _new_order(S.op)
        assert _pick(S.wh, order["id"], 10).status_code == 200  # the first pick takes the order
        assert _status(S.wh, order["id"], "shipped").status_code == 200
        back = _status(api_client, order["id"], "in_progress", "ispravka količine")
        assert back.status_code == 200 and back.json()["assigned_to_name"] == "TEST wf-wh"
        assert _pick(S.wh, order["id"], 8).status_code == 200
        again = _status(S.wh, order["id"], "shipped")
        assert again.status_code == 200 and again.json()["items"][0]["picked_qty"] == 8

    def test_reopened_order_of_a_gone_packer_is_free_to_take(self, api_client):
        gone_id, gone = _invite(api_client, "warehouse", "wf-gone")
        order = _new_order(S.op)
        assert _pick(gone, order["id"], 10).status_code == 200
        assert _status(gone, order["id"], "shipped").status_code == 200
        user = next(u for u in api_client.get(f"{API}/users").json() if u["id"] == gone_id)
        r = api_client.put(f"{API}/users/{gone_id}", json={"name": user["name"], "email": user["email"], "role": "warehouse", "active": False})
        assert r.status_code == 200, r.text
        back = _status(api_client, order["id"], "in_progress", "ispravka")
        assert back.status_code == 200 and back.json()["assigned_to_user_id"] is None
        taken = _pick(S.wh, order["id"], 9)  # whoever packs first takes it
        assert taken.status_code == 200 and taken.json()["assigned_to_name"] == "TEST wf-wh"

    def test_admin_taking_a_new_order_still_holds_it(self, api_client):
        order = _new_order(S.op)
        r = _status(api_client, order["id"], "in_progress")
        assert r.status_code == 200 and r.json()["assigned_to_user_id"] == api_client.get(f"{API}/auth/me").json()["id"]


class TestQuantityLimit:
    def test_absurd_quantity_is_refused(self):
        body = {"customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": 1_000_001}]}
        r = S.op.post(f"{API}/orders", json=body)
        assert r.status_code == 400 and "too large" in r.json()["detail"]
        # two lines of the same product are added up before the check
        body["items"] = [{"product_id": S.product["id"], "ordered_qty": 600_000}] * 2
        assert S.op.post(f"{API}/orders", json=body).status_code == 400

    def test_edit_cannot_exceed_it_either(self):
        order = _new_order(S.op)
        r = S.op.put(f"{API}/orders/{order['id']}", json={
            "customer_id": S.customer["id"], "items": [{"product_id": S.product["id"], "ordered_qty": 10**12}],
        })
        assert r.status_code == 400
