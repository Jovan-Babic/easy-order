"""Units of measure (PLAN_JEDINICE_MERE.md, phase J1): global units in the DB,
a unit on every product, price per unit on orders, unit locking."""
import uuid

import pytest

from helpers import API


def _code():
    return "t" + uuid.uuid4().hex[:6]


class S:
    products = []
    customers = []
    orders = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(api_client):
    yield
    for oid in S.orders:
        api_client.delete(f"{API}/orders/{oid}")
    for pid in S.products:
        api_client.delete(f"{API}/products/{pid}")
    for cid in S.customers:
        api_client.delete(f"{API}/customers/{cid}")


def _product(api_client, **extra):
    body = {"name": f"TEST_Unit_{uuid.uuid4().hex[:6]}", "price_no_vat": 1000, "vat_rate": 10, **extra}
    r = api_client.post(f"{API}/products", json=body)
    assert r.status_code == 200, r.text
    S.products.append(r.json()["id"])
    return r.json()


def _customer(api_client):
    c = api_client.post(f"{API}/customers", json={"name": f"TEST_UnitCust_{uuid.uuid4().hex[:5]}"}).json()
    S.customers.append(c["id"])
    return c


class TestUnitCatalog:
    def test_defaults_are_seeded_and_readable_by_everyone(self, api_client):
        units = {u["code"]: u for u in api_client.get(f"{API}/units").json()}
        for code in ("kom", "g", "kg", "t", "ml", "l", "hl", "mm", "cm", "m"):
            assert code in units
        assert units["kg"]["base_code"] == "g" and units["kg"]["factor"] == 1000
        assert units["m"]["base_code"] == "mm" and units["cm"]["factor"] == 10
        assert units["kom"]["group"] == "count"

    def test_only_superadmin_manages(self, api_client, superadmin_client):
        body = {"code": _code(), "name_sr": "x", "name_en": "x", "symbol": "x", "group": "mass", "base_code": "g", "factor": 5}
        assert api_client.post(f"{API}/units", json=body).status_code == 403
        assert api_client.put(f"{API}/units/kg", json={"symbol": "kg"}).status_code == 403
        assert superadmin_client.post(f"{API}/units", json=body).status_code == 200

    def test_create_validation(self, superadmin_client):
        base = {"name_sr": "x", "name_en": "x", "symbol": "x"}
        c = _code()
        # duplicate
        assert superadmin_client.post(f"{API}/units", json={**base, "code": "kg", "group": "mass", "base_code": "g", "factor": 1000}).status_code == 409
        # unknown base
        assert superadmin_client.post(f"{API}/units", json={**base, "code": c, "group": "mass", "base_code": "nope", "factor": 2}).status_code == 400
        # wrong group for the base
        assert superadmin_client.post(f"{API}/units", json={**base, "code": c, "group": "volume", "base_code": "g", "factor": 2}).status_code == 400
        # a base unit must have factor 1
        assert superadmin_client.post(f"{API}/units", json={**base, "code": c, "group": "area", "base_code": c, "factor": 5}).status_code == 400
        # bad code
        assert superadmin_client.post(f"{API}/units", json={**base, "code": "Kg!", "group": "mass", "base_code": "g", "factor": 5}).status_code == 422
        # a new group with its own base unit, then a derived one
        assert superadmin_client.post(f"{API}/units", json={**base, "code": c, "group": "area", "base_code": c, "factor": 1}).status_code == 200
        assert superadmin_client.post(f"{API}/units", json={**base, "code": c + "b", "group": "area", "base_code": c, "factor": 100}).status_code == 200

    def test_structure_locked_while_in_use(self, superadmin_client, api_client):
        base = {"name_sr": "x", "name_en": "x", "symbol": "x"}
        c = _code()
        superadmin_client.post(f"{API}/units", json={**base, "code": c, "group": "mass", "base_code": "g", "factor": 7})
        # unused: factor may change, names always may
        r = superadmin_client.put(f"{API}/units/{c}", json={"factor": 8, "name_sr": "novi"})
        assert r.status_code == 200 and r.json()["factor"] == 8 and r.json()["name_sr"] == "novi"
        _product(api_client, unit=c)
        assert superadmin_client.put(f"{API}/units/{c}", json={"factor": 9}).status_code == 409
        assert superadmin_client.put(f"{API}/units/{c}", json={"symbol": "q", "active": True}).status_code == 200
        # built-ins: kom and the base units other units depend on
        assert superadmin_client.put(f"{API}/units/kom", json={"factor": 2}).status_code == 409
        assert superadmin_client.put(f"{API}/units/g", json={"group": "length"}).status_code == 409
        assert superadmin_client.put(f"{API}/units/nope", json={"symbol": "q"}).status_code == 404


class TestProductUnit:
    def test_default_is_piece_and_unknown_is_refused(self, api_client):
        assert _product(api_client)["unit"] == "kom"
        assert api_client.post(f"{API}/products", json={"name": "TEST_U", "unit": "nope"}).status_code == 400

    def test_inactive_unit_cannot_be_chosen(self, api_client, superadmin_client):
        c = _code()
        superadmin_client.post(
            f"{API}/units",
            json={"code": c, "name_sr": "x", "name_en": "x", "symbol": "x", "group": "mass", "base_code": "g", "factor": 3, "active": False},
        )
        assert api_client.post(f"{API}/products", json={"name": "TEST_U", "unit": c}).status_code == 400

    def test_update_without_unit_keeps_it(self, api_client):
        p = _product(api_client, unit="kg")
        r = api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "price_no_vat": 1200})
        assert r.status_code == 200 and r.json()["unit"] == "kg"

    def test_packaging_only_for_count_units(self, api_client):
        assert api_client.post(f"{API}/products", json={"name": "TEST_U", "unit": "kg", "pieces_per_package": 6}).status_code == 400
        p = _product(api_client, unit="kom", pieces_per_package=6)
        assert api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "unit": "kg", "pieces_per_package": 6}).status_code == 400

    def test_change_rules(self, api_client):
        free = _product(api_client)
        # no stock, no orders: any unit
        assert api_client.put(f"{API}/products/{free['id']}", json={"name": free["name"], "unit": "kg"}).json()["unit"] == "kg"
        # same base unit is always fine, even with stock
        api_client.post(f"{API}/stock/receipts", json={"items": [{"product_id": free["id"], "qty": 5000}]})
        assert api_client.put(f"{API}/products/{free['id']}", json={"name": free["name"], "unit": "t"}).status_code == 200
        # another base unit once there is stock: refused
        r = api_client.put(f"{API}/products/{free['id']}", json={"name": free["name"], "unit": "l"})
        assert r.status_code == 409


class TestOrderPrice:
    def test_cheese_by_the_kilo(self, api_client):
        cheese = _product(api_client, unit="kg", price_no_vat=1000, vat_rate=0)
        cust = _customer(api_client)
        r = api_client.post(
            f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": cheese["id"], "ordered_qty": 3500}]}
        )
        assert r.status_code == 200, r.text
        S.orders.append(r.json()["id"])
        order = r.json()
        item = order["items"][0]
        assert (item["unit"], item["unit_symbol"], item["unit_factor"]) == ("kg", "kg", 1000)
        assert item["line_net"] == 3500 and order["totals"]["grand"] == 3500

    def test_snapshot_survives_changes(self, api_client, superadmin_client):
        p = _product(api_client, unit="m", price_no_vat=200, vat_rate=20)
        cust = _customer(api_client)
        r = api_client.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": p["id"], "ordered_qty": 2500}]})
        S.orders.append(r.json()["id"])
        superadmin_client.put(f"{API}/units/m", json={"symbol": "mtr"})
        again = api_client.get(f"{API}/orders/{r.json()['id']}").json()
        assert again["items"][0]["unit_symbol"] == "m" and again["items"][0]["unit_factor"] == 1000
        assert again["items"][0]["line_net"] == 500  # 200 per m * 2.5 m
        superadmin_client.put(f"{API}/units/m", json={"symbol": "m"})

    def test_pieces_are_unchanged(self, api_client):
        p = _product(api_client, price_no_vat=100, vat_rate=20)
        cust = _customer(api_client)
        r = api_client.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": p["id"], "ordered_qty": 3}]})
        S.orders.append(r.json()["id"])
        assert r.json()["items"][0]["unit_factor"] == 1 and r.json()["totals"]["grand"] == 360

    def test_unit_cannot_change_once_ordered(self, api_client):
        p = _product(api_client, unit="kg", price_no_vat=10)
        cust = _customer(api_client)
        r = api_client.post(f"{API}/orders", json={"customer_id": cust["id"], "items": [{"product_id": p["id"], "ordered_qty": 1}]})
        S.orders.append(r.json()["id"])
        assert api_client.put(f"{API}/products/{p['id']}", json={"name": p["name"], "unit": "l"}).status_code == 409


class TestImportUnits:
    def _xlsx(self, header, rows):
        import io
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(list(header))
        for r in rows:
            ws.append(list(r))
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def _post(self, api_client, content, dry):
        return api_client.post(
            f"{API}/products/import", params={"dry_run": str(dry).lower()},
            files={"file": ("u.xlsx", content, "application/octet-stream")}, headers={"Content-Type": None},
        )

    def test_unit_column_and_stock_in_display_unit(self, api_client):
        name = f"TEST_Imp_{uuid.uuid4().hex[:6]}"
        data = self._xlsx(("Naziv", "Cena bez PDV", "Stanje (u jedinici mere)", "Jedinica mere"), [(name, 1100, "25,5", "kg")])
        assert self._post(api_client, data, True).json()["summary"]["error"] == 0
        r = self._post(api_client, data, False)
        assert r.status_code == 200 and r.json()["summary"]["create"] == 1, r.text
        prod = next(p for p in api_client.get(f"{API}/products").json() if p["name"] == name)
        S.products.append(prod["id"])
        assert prod["unit"] == "kg" and prod["stock_qty"] == 25500

    def test_unit_by_name_and_errors(self, api_client):
        name = f"TEST_Imp_{uuid.uuid4().hex[:6]}"
        ok = self._post(api_client, self._xlsx(("Naziv", "Jedinica"), [(name, "Litar")]), True).json()
        assert ok["summary"]["error"] == 0
        bad = self._post(api_client, self._xlsx(("Naziv", "Jedinica"), [(name, "funta")]), True).json()
        assert bad["summary"]["error"] == 1
        too_fine = self._post(api_client, self._xlsx(("Naziv", "Stanje", "Jedinica"), [(name, "0,0005", "kg")]), True).json()
        assert too_fine["summary"]["error"] == 1
        pack = self._post(api_client, self._xlsx(("Naziv", "Jedinica", "Komada u pakovanju"), [(name, "kg", 6)]), True).json()
        assert pack["summary"]["error"] == 1

    def test_existing_product_keeps_unit_and_blocks_change_with_stock(self, api_client):
        p = _product(api_client, unit="kg")
        api_client.post(f"{API}/stock/receipts", json={"items": [{"product_id": p["id"], "qty": 1000}]})
        keep = self._post(api_client, self._xlsx(("Naziv", "Cena bez PDV"), [(p["name"], 5)]), False).json()
        assert keep["summary"]["update"] == 1
        assert next(x for x in api_client.get(f"{API}/products").json() if x["id"] == p["id"])["unit"] == "kg"
        swap = self._post(api_client, self._xlsx(("Naziv", "Jedinica"), [(p["name"], "l")]), True).json()
        assert swap["summary"]["error"] == 1
