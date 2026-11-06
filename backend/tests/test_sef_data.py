"""SEF plan, phase S1: data an e-invoice needs (registration number, structured address, unit codes)."""
import io
import uuid

import pytest
import requests

from helpers import API, activate_invited_user, login


def _cust(api_client, **extra):
    body = {"name": f"TEST_S1_{uuid.uuid4().hex[:6]}", **extra}
    r = api_client.post(f"{API}/customers", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_customer_new_fields_roundtrip_and_completeness(api_client):
    c = _cust(api_client, pib="123456789")
    assert c["country"] == "RS" and c["registration_number"] == ""
    assert set(c["invoice_missing"]) == {"registration_number", "street", "city", "postal_code"}
    full = {"name": c["name"], "pib": "123456789", "registration_number": "08012345", "street": "Bulevar 1", "city": "Novi Sad", "postal_code": "21000", "country": "rs"}
    u = api_client.put(f"{API}/customers/{c['id']}", json=full)
    assert u.status_code == 200, u.text
    assert u.json()["country"] == "RS" and u.json()["invoice_missing"] == []
    # the list carries the same flag
    row = next(x for x in api_client.get(f"{API}/customers").json() if x["id"] == c["id"])
    assert row["invoice_missing"] == [] and row["registration_number"] == "08012345"
    api_client.delete(f"{API}/customers/{c['id']}")


def test_update_without_the_new_fields_keeps_them(api_client):
    """The mobile app does not know the new fields: its edit must not blank them."""
    c = _cust(api_client, registration_number="08012345", street="Ulica 5", city="Niš", postal_code="18000")
    u = api_client.put(f"{API}/customers/{c['id']}", json={"name": c["name"] + " 2", "phone": "011 111"})
    assert u.status_code == 200
    assert u.json()["street"] == "Ulica 5" and u.json()["registration_number"] == "08012345" and u.json()["city"] == "Niš"
    api_client.delete(f"{API}/customers/{c['id']}")


@pytest.mark.parametrize("bad", [
    {"registration_number": "abc123"}, {"registration_number": "12"}, {"country": "SRB"}, {"country": "1"},
    {"street": "A" * 101}, {"city": "A" * 101}, {"postal_code": "1" * 21},
])
def test_customer_address_validation(api_client, bad):
    r = api_client.post(f"{API}/customers", json={"name": "TEST_S1_bad", **bad})
    assert r.status_code == 422, (bad, r.text)


def test_import_template_and_columns(api_client):
    t = api_client.get(f"{API}/customers/import-template")
    assert t.status_code == 200
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(t.content)).worksheets[0]
    head = [c.value for c in ws[1]]
    assert head == ["Naziv", "Adresa", "Email", "Telefon", "PIB", "Matični broj", "Ulica i broj", "Grad", "Poštanski broj", "Država"]
    pib = str(uuid.uuid4().int)[:9]
    wb = openpyxl.Workbook()
    s = wb.active
    s.append(["Naziv", "PIB", "Matični broj", "Ulica i broj", "Grad", "Poštanski broj", "Država"])
    s.append([f"TEST_S1_imp_{pib}", pib, "08012345", "Ulica 1", "Beograd", "11000", "rs"])
    s.append([f"TEST_S1_bad_{pib}", pib[::-1], "xx", "Ulica 1", "Beograd", "11000", "SRB"])
    buf = io.BytesIO()
    wb.save(buf)
    files = {"file": ("k.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    dry = api_client.post(f"{API}/customers/import", params={"dry_run": "true"}, files=files, headers={"Content-Type": None}).json()
    assert [r["action"] for r in dry["rows"]] == ["create", "error"], dry
    done = api_client.post(f"{API}/customers/import", params={"dry_run": "false"}, files=files, headers={"Content-Type": None}).json()
    assert done["summary"]["create"] == 1
    mine = next(c for c in api_client.get(f"{API}/customers").json() if c["pib"] == pib)
    assert mine["registration_number"] == "08012345" and mine["city"] == "Beograd" and mine["country"] == "RS"
    assert mine["invoice_missing"] == []
    api_client.delete(f"{API}/customers/{mine['id']}")


def test_client_structured_address(superadmin_client, api_client):
    cid = api_client.get(f"{API}/auth/me").json()["client_id"]
    cur = superadmin_client.get(f"{API}/clients/{cid}").json()
    body = {k: cur[k] for k in ("name", "address", "email", "phone", "pib", "bank_account", "logo", "invoice_prefix", "invoice_numbering")}
    r = superadmin_client.put(f"{API}/clients/{cid}", json={**body, "street": "Industrijska 14", "city": "Kragujevac", "postal_code": "34000", "country": "RS", "vat_payer": True})
    assert r.status_code == 200, r.text
    assert r.json()["street"] == "Industrijska 14" and r.json()["vat_payer"] is True
    # an update that does not send them keeps them (the old edit form)
    r2 = superadmin_client.put(f"{API}/clients/{cid}", json=body)
    assert r2.json()["city"] == "Kragujevac" and r2.json()["vat_payer"] is True
    me = api_client.get(f"{API}/clients/me").json()
    assert me["postal_code"] == "34000"
    assert superadmin_client.put(f"{API}/clients/{cid}", json={**body, "country": "SRB"}).status_code == 422


def test_builtin_units_have_ubl_codes(api_client, superadmin_client):
    units = {u["code"]: u for u in api_client.get(f"{API}/units").json()}
    assert units["kom"]["ubl_code"] == "H87" and units["kg"]["ubl_code"] == "KGM" and units["g"]["ubl_code"] == "GRM"
    assert units["l"]["ubl_code"] == "LTR" and units["m"]["ubl_code"] == "MTR"
    # the superadmin can set a code on a custom unit, a bad one is refused
    code = "t" + uuid.uuid4().hex[:5]
    r = superadmin_client.post(f"{API}/units", json={"code": code, "name_sr": "pakovanje", "name_en": "pack", "symbol": "pak", "group": "count", "base_code": "kom", "factor": 6})
    assert r.status_code == 200, r.text
    assert r.json()["ubl_code"] is None  # not invoiceable until it gets a code
    ok = superadmin_client.put(f"{API}/units/{code}", json={"ubl_code": "XPK"})
    assert ok.status_code == 200 and ok.json()["ubl_code"] == "XPK"
    assert superadmin_client.put(f"{API}/units/{code}", json={"ubl_code": "xpk!"}).status_code == 422
