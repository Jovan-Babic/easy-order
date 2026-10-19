"""Demo data for the user-guide screenshots (in-memory test backend only)."""
import json, os, requests
A = "http://localhost:8000/api"
IMG = "http://localhost:8099/img"
PW = "Primer2026!"

def session(email, password):
    s = requests.Session()
    r = s.post(f"{A}/auth/login", json={"email": email, "password": password}); r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s

def activate(email, temp):
    s = session(email, temp)
    r = s.post(f"{A}/auth/change-password", json={"current_password": temp, "new_password": PW}); r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s

sa = session("admin@easyorder.dev", "ChangeMe123!")
r = sa.post(f"{A}/clients", json={
    "name": "Veleprodaja Morava d.o.o.", "address": "Industrijska 14, Kragujevac", "pib": "109876543",
    "invoice_prefix": "VM", "admin_name": "Jelena Admin", "admin_email": "jelena@morava-primer.rs",
}); r.raise_for_status()
admin = activate("jelena@morava-primer.rs", r.json()["temporary_password"])

def user(name, email, role):
    r = admin.post(f"{A}/users", json={"name": name, "email": email, "role": role, "phone": "+381 64 1234567"}); r.raise_for_status()
    return activate(email, r.json()["temporary_password"])

op = user("Marko Petrović", "marko@morava-primer.rs", "operator")
wh = user("Nikola Magacin", "nikola@morava-primer.rs", "warehouse")

customers = {}
for c in [
    ("Maxi Market d.o.o.", "Bulevar oslobođenja 1, Novi Sad", "nabavka@maxi-primer.rs", "101111111", "021 123 456"),
    ("Market Lipa", "Kralja Petra I 22, Kragujevac", "lipa@primer.rs", "102222222", "034 333 444"),
    ("Prodavnica Kod Mike", "Gospodar Jovanova 5, Čačak", "kodmike@primer.rs", "103333333", "032 555 666"),
    ("Delikates Sunce", "Knez Mihailova 10, Beograd", "sunce@primer.rs", "104444444", "011 765 4321"),
]:
    r = admin.post(f"{A}/customers", json={"name": c[0], "address": c[1], "email": c[2], "pib": c[3], "phone": c[4]}); r.raise_for_status()
    customers[c[0]] = r.json()["id"]

products = {}
for key, name, manu, price, ppp, bpt, disc, add, stock, unit in [
    ("jogurt", "Jogurt 1,5% 1 l", "Mlekara Zlatibor", 145.0, 12, 60, 5, [0, 2, 3, 5], 480, "kom"),
    ("mleko", "Mleko 2,8% 1 l", "Mlekara Zlatibor", 129.9, 12, 80, 5, [0, 2, 3], 300, "kom"),
    ("gauda", "Sir gauda", "Mlekara Zlatibor", 1190.0, 0, 0, 3, [0, 2], 25000, "kg"),
    ("plazma", "Keks Plazma 300 g", "Bambi", 219.0, 20, 40, 8, [0, 2, 4], 200, "kom"),
    ("cokolada", "Mlečna čokolada 100 g", "Štark", 165.0, 24, 50, 6, [0, 3], 30, "kom"),
    ("kafa", "Mlevena kafa 200 g", "Grand", 389.0, 20, 30, 4, [0, 2], None, "kom"),
    ("sok", "Sok od jabuke 1 l", "Fruvita", 159.0, 12, 60, 5, [0, 2, 5], 150, "kom"),
    ("voda", "Mineralna voda 1,5 l", "Knjaz Miloš", 79.9, 6, 80, 2, [0, 1], 600, "kom"),
]:
    body = {"name": name, "manufacturer": manu, "price_no_vat": price, "vat_rate": 20 if key != "voda" else 20,
            "discount": disc, "discounts": [disc], "additional_discounts": add, "pieces_per_package": ppp,
            "boxes_per_transport": bpt, "image": f"{IMG}/{key}.png", "unit": unit, "active": True}
    r = admin.post(f"{A}/products", json=body); r.raise_for_status()
    products[key] = r.json()["id"]
    if stock:
        admin.post(f"{A}/stock/receipts", json={"items": [{"product_id": products[key], "qty": stock}], "note": "Početno stanje"}).raise_for_status()
# kafa: 12 on hand, all reserved soon -> "slobodno" goes to 0
admin.post(f"{A}/stock/receipts", json={"items": [{"product_id": products["kafa"], "qty": 12}]}).raise_for_status()

def order(cust, lines):
    items = [{"product_id": products[k], "ordered_qty": q, "additional_discount": a} for k, q, a in lines]
    r = op.post(f"{A}/orders", json={"customer_id": customers[cust], "items": items}); r.raise_for_status()
    return r.json()

def status(o, st, note=None):
    r = wh.post(f"{A}/orders/{o['id']}/status", json={"status": st, "note": note}); r.raise_for_status()

def pick(o, picks):
    r = wh.patch(f"{A}/orders/{o['id']}/items", json={"items": [{"product_id": products[k], "picked_qty": q} for k, q in picks]}); r.raise_for_status()

o1 = order("Delikates Sunce", [("jogurt", 24, 2), ("plazma", 40, 0), ("cokolada", 24, 3)])
status(o1, "in_progress"); pick(o1, [("jogurt", 24), ("plazma", 40), ("cokolada", 12)]); status(o1, "shipped")
o2 = order("Prodavnica Kod Mike", [("mleko", 36, 0), ("sok", 24, 2)])
status(o2, "in_progress"); status(o2, "rejected", "Kupac traži isporuku tek u petak - poručite ponovo u četvrtak.")
o3 = order("Market Lipa", [("voda", 120, 1), ("kafa", 12, 0)])
status(o3, "in_progress")
o4 = order("Maxi Market d.o.o.", [("mleko", 24, 2), ("gauda", 5000, 0)])
json.dump({"customers": customers, "products": products, "orders": [o1["id"], o2["id"], o3["id"], o4["id"]],
           "operator": "marko@morava-primer.rs", "password": PW},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed.json"), "w"), indent=1)
print("ok")
