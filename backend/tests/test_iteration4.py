"""Iteration 4 backend tests: product `discounts` array (multi-discount) + order flow with chosen discount."""
import os

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# client fixture comes from conftest.py (authenticated as the demo Admin)


# ---------------- Seeded discounts arrays ----------------
class TestSeededDiscounts:
    """Verify seeded/migrated products have the expected discounts arrays + defaults."""

    EXPECTED = {
        "Ulje Bundeve 250ml": ({0, 5, 10}, 5),
        "Kokosovo ulje 150ml": ({0, 3, 7}, 0),
        "Jabukovo sirce 1L": ({0, 10, 15}, 10),
    }

    def test_seeded_products_have_discounts_array_and_default(self, client):
        r = client.get(f"{API}/products")
        assert r.status_code == 200
        by_name = {p["name"]: p for p in r.json()}
        for name, (opts, default) in self.EXPECTED.items():
            assert name in by_name, f"Missing seeded product {name}"
            p = by_name[name]
            assert "discounts" in p, f"{name} missing discounts field"
            assert isinstance(p["discounts"], list), f"{name}.discounts not a list"
            assert set(p["discounts"]) == opts, (
                f"{name} discounts {p['discounts']} != expected {opts}"
            )
            assert p["discount"] == default, (
                f"{name} default discount {p['discount']} != expected {default}"
            )
            assert p["discount"] in p["discounts"], (
                f"{name} default {p['discount']} not present in discounts {p['discounts']}"
            )


# ---------------- CRUD with discounts array ----------------
class TestProductDiscountsCRUD:
    def test_create_persists_discounts_and_default(self, client):
        payload = {
            "name": "TEST_MultiDisc",
            "manufacturer": "TEST_Manu",
            "price_no_vat": 200,
            "vat_rate": 20,
            "discount": 8,
            "discounts": [0, 4, 8, 12],
            "pieces_per_package": 6,
            "boxes_per_transport": 2,
        }
        r = client.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        created = r.json()
        pid = created["id"]
        try:
            assert created["discount"] == 8
            assert sorted(created["discounts"]) == [0, 4, 8, 12]

            # GET verifies persistence
            g = client.get(f"{API}/products").json()
            prod = next(p for p in g if p["id"] == pid)
            assert sorted(prod["discounts"]) == [0, 4, 8, 12]
            assert prod["discount"] == 8

            # PUT updates discounts array and default
            payload_upd = {**payload, "discounts": [0, 20], "discount": 20}
            r2 = client.put(f"{API}/products/{pid}", json=payload_upd)
            assert r2.status_code == 200
            up = r2.json()
            assert sorted(up["discounts"]) == [0, 20]
            assert up["discount"] == 20

            # verify update persisted
            g2 = client.get(f"{API}/products").json()
            prod2 = next(p for p in g2 if p["id"] == pid)
            assert sorted(prod2["discounts"]) == [0, 20]
            assert prod2["discount"] == 20
        finally:
            client.delete(f"{API}/products/{pid}")

    def test_create_without_discounts_defaults_to_empty(self, client):
        """If discounts not provided, backend accepts and defaults [] (backwards compat)."""
        payload = {
            "name": "TEST_NoDiscArr",
            "price_no_vat": 50,
            "discount": 0,
        }
        r = client.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            assert r.json()["discounts"] == []
        finally:
            client.delete(f"{API}/products/{pid}")


# ---------------- Order chosen-discount flow ----------------
class TestOrderChosenDiscount:
    def _get_ulje(self, client):
        prods = client.get(f"{API}/products").json()
        return next(p for p in prods if p["name"] == "Ulje Bundeve 250ml")

    def _get_customer(self, client):
        return client.get(f"{API}/customers").json()[0]

    def test_order_uses_chosen_non_default_discount(self, client):
        """Simulate frontend picking a non-default discount (10) instead of default (5)."""
        ulje = self._get_ulje(client)
        assert ulje["discount"] == 5
        assert 10 in ulje["discounts"]
        cust = self._get_customer(client)

        chosen = 10
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [{
                "product_id": ulje["id"],
                "name": ulje["name"],
                "image": ulje.get("image", ""),
                "manufacturer": ulje.get("manufacturer", ""),
                "price_no_vat": ulje["price_no_vat"],
                "vat_rate": ulje["vat_rate"],
                "pieces_per_package": ulje["pieces_per_package"],
                "boxes_per_transport": ulje["boxes_per_transport"],
                "discount": chosen,          # <-- chosen, not default
                "ordered_qty": 4,
            }],
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]
        try:
            got = client.get(f"{API}/orders/{oid}").json()
            assert got["items"][0]["discount"] == chosen
            # invoice math with chosen discount
            price = ulje["price_no_vat"]  # 450
            qty = 4
            expected_net = price * qty * (1 - chosen / 100.0)   # 450*4*0.9 = 1620
            assert abs(expected_net - 1620.0) < 0.001
            vat = expected_net * ulje["vat_rate"] / 100.0
            expected_gross = expected_net + vat  # 1620*1.2 = 1944
            assert abs(expected_gross - 1944.0) < 0.001
        finally:
            client.delete(f"{API}/orders/{oid}")

    def test_order_uses_product_default_when_untouched(self, client):
        """If UI leaves dropdown untouched, frontend sends product default (5)."""
        ulje = self._get_ulje(client)
        cust = self._get_customer(client)
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [{
                "product_id": ulje["id"],
                "name": ulje["name"],
                "image": ulje.get("image", ""),
                "manufacturer": ulje.get("manufacturer", ""),
                "price_no_vat": ulje["price_no_vat"],
                "vat_rate": ulje["vat_rate"],
                "pieces_per_package": ulje["pieces_per_package"],
                "boxes_per_transport": ulje["boxes_per_transport"],
                "discount": ulje["discount"],   # default
                "ordered_qty": 2,
            }],
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        oid = r.json()["id"]
        try:
            got = client.get(f"{API}/orders/{oid}").json()
            assert got["items"][0]["discount"] == ulje["discount"] == 5
        finally:
            client.delete(f"{API}/orders/{oid}")

    def test_order_zero_discount_choice(self, client):
        """Pick 0% from Kokosovo (defaults 0, options include 3/7)."""
        prods = client.get(f"{API}/products").json()
        koko = next(p for p in prods if p["name"] == "Kokosovo ulje 150ml")
        assert 7 in koko["discounts"]
        cust = self._get_customer(client)
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [{
                "product_id": koko["id"],
                "name": koko["name"],
                "manufacturer": koko.get("manufacturer", ""),
                "price_no_vat": koko["price_no_vat"],
                "vat_rate": koko["vat_rate"],
                "pieces_per_package": koko["pieces_per_package"],
                "boxes_per_transport": koko["boxes_per_transport"],
                "discount": 7,   # chosen non-default
                "ordered_qty": 5,
            }],
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        oid = r.json()["id"]
        try:
            got = client.get(f"{API}/orders/{oid}").json()
            assert got["items"][0]["discount"] == 7
        finally:
            client.delete(f"{API}/orders/{oid}")
