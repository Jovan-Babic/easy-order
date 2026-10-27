"""Extra demo data for the admin guide: a package, a subscription and one issued charge (run after seed.py)."""
import json, os, requests
from datetime import date, timedelta
A = "http://localhost:8000/api"
seed = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed.json")))

def login(email, password):
    s = requests.Session()
    r = s.post(f"{A}/auth/login", json={"email": email, "password": password}); r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s

sa = login("admin@easyorder.dev", "ChangeMe123!")
sa.put(f"{A}/settings", json={
    "ips_account": "160-0000123456789-56", "ips_recipient_name": "Easy Order d.o.o.", "ips_purpose": "Pretplata Easy Order",
    "payment_instructions_sr": "Uplatu izvršite na tekući račun 160-0000123456789-56, uz poziv na broj iz profakture.",
    "issuer_name": "Easy Order d.o.o.", "issuer_address": "Primer 1, Beograd", "issuer_pib": "100000001",
}).raise_for_status()
plan = sa.post(f"{A}/plans", json={
    "name": "Standard", "description": "Svi moduli", "modules": ["warehouse", "stock", "expiry", "reports", "focus", "targets"],
    "prices": {"1": 6900, "12": 69000}, "included_seats": {"admin": 1, "operator": 3, "warehouse": 1}, "seat_prices": {"operator": 1200, "warehouse": 900},
}); plan.raise_for_status()
client_id = next(c["id"] for c in sa.get(f"{A}/clients").json() if c["name"].startswith("Veleprodaja Morava"))
ends = date.today().isoformat()  # moved to the end of this month -> the next month is billed
sa.post(f"{A}/subscriptions/{client_id}/assign", json={"plan_id": plan.json()["id"], "ends_at": ends}).raise_for_status()
sa.put(f"{A}/subscriptions/{client_id}/seats", json={"extra_seats": {"operator": 1}, "discount_percent": 0}).raise_for_status()
sa.post(f"{A}/billing/drafts/generate", json={"client_ids": [client_id]}).raise_for_status()
sa.post(f"{A}/billing/drafts/approve", json={"all": True}).raise_for_status()
print("ok admin seed", ends)
