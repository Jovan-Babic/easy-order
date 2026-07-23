"""Iteration 3 backend tests: locked per-product discount + customer contact fields."""
import os

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://order-invoice-app-2.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

# client fixture comes from conftest.py (authenticated as the demo Admin)


# ---------------- Product discount ----------------
class TestProductDiscount:
    def test_seeded_discounts_correct(self, client):
        r = client.get(f"{API}/products")
        assert r.status_code == 200
        by_name = {p["name"]: p for p in r.json()}
        assert by_name["Ulje Bundeve 250ml"]["discount"] == 5
        assert by_name["Kokosovo ulje 150ml"]["discount"] == 0
        assert by_name["Jabukovo sirce 1L"]["discount"] == 10

    def test_create_product_persists_discount(self, client):
        payload = {
            "name": "TEST_DiscountProd",
            "manufacturer": "TEST_Manu",
            "price_no_vat": 100,
            "vat_rate": 20,
            "discount": 15,
            "pieces_per_package": 5,
            "boxes_per_transport": 2,
        }
        r = client.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        created = r.json()
        assert created["discount"] == 15
        pid = created["id"]

        # verify with GET
        g = client.get(f"{API}/products")
        prod = next(p for p in g.json() if p["id"] == pid)
        assert prod["discount"] == 15

        # update discount
        payload["discount"] = 25
        r2 = client.put(f"{API}/products/{pid}", json=payload)
        assert r2.status_code == 200
        assert r2.json()["discount"] == 25

        # verify update persisted
        g2 = client.get(f"{API}/products")
        prod2 = next(p for p in g2.json() if p["id"] == pid)
        assert prod2["discount"] == 25

        # cleanup
        client.delete(f"{API}/products/{pid}")


# ---------------- Customer contact ----------------
class TestCustomerContact:
    def test_seeded_customers_have_phone_address_pib(self, client):
        r = client.get(f"{API}/customers")
        assert r.status_code == 200
        by_name = {c["name"]: c for c in r.json()}
        for cname in ["Maxi Market d.o.o.", "Delikates Prodavnica"]:
            assert cname in by_name, f"Missing seeded customer {cname}"
            c = by_name[cname]
            assert c.get("pib"), f"{cname} missing pib"
            assert c.get("phone"), f"{cname} missing phone"
            assert c.get("address"), f"{cname} missing address"
            assert c.get("email"), f"{cname} missing email"


# ---------------- Order item discount from product ----------------
class TestOrderDiscount:
    def test_order_line_uses_product_discount(self, client):
        # Get Ulje Bundeve (discount=5)
        prods = client.get(f"{API}/products").json()
        ulje = next(p for p in prods if p["name"] == "Ulje Bundeve 250ml")
        assert ulje["discount"] == 5

        # Get a customer
        custs = client.get(f"{API}/customers").json()
        assert len(custs) > 0
        cust = custs[0]

        # Create order using product discount (frontend maps product.discount -> item.discount)
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [
                {
                    "product_id": ulje["id"],
                    "name": ulje["name"],
                    "image": ulje.get("image", ""),
                    "manufacturer": ulje.get("manufacturer", ""),
                    "price_no_vat": ulje["price_no_vat"],
                    "vat_rate": ulje["vat_rate"],
                    "pieces_per_package": ulje["pieces_per_package"],
                    "boxes_per_transport": ulje["boxes_per_transport"],
                    "discount": ulje["discount"],
                    "ordered_qty": 3,
                }
            ],
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200, r.text
        order = r.json()
        oid = order["id"]

        # GET back the order and verify item.discount == product.discount
        g = client.get(f"{API}/orders/{oid}")
        assert g.status_code == 200
        got = g.json()
        assert len(got["items"]) == 1
        item = got["items"][0]
        assert item["discount"] == 5
        assert item["ordered_qty"] == 3
        # Line net should be price*qty*(1-discount/100) net-of-VAT
        expected_net = ulje["price_no_vat"] * 3 * (1 - 5 / 100.0)
        actual_net = item["price_no_vat"] * item["ordered_qty"] * (1 - item["discount"] / 100.0)
        assert abs(actual_net - expected_net) < 0.001

        # cleanup
        client.delete(f"{API}/orders/{oid}")

    def test_order_line_zero_discount(self, client):
        prods = client.get(f"{API}/products").json()
        koko = next(p for p in prods if p["name"] == "Kokosovo ulje 150ml")
        assert koko["discount"] == 0
        cust = client.get(f"{API}/customers").json()[0]
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [
                {
                    "product_id": koko["id"],
                    "name": koko["name"],
                    "manufacturer": koko["manufacturer"],
                    "price_no_vat": koko["price_no_vat"],
                    "vat_rate": koko["vat_rate"],
                    "pieces_per_package": koko["pieces_per_package"],
                    "boxes_per_transport": koko["boxes_per_transport"],
                    "discount": koko["discount"],
                    "ordered_qty": 2,
                }
            ],
        }
        r = client.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        oid = r.json()["id"]
        g = client.get(f"{API}/orders/{oid}").json()
        assert g["items"][0]["discount"] == 0
        client.delete(f"{API}/orders/{oid}")
