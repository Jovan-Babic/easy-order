"""SEF phase S2: invoice amounts (calc.invoice_amounts) and the UBL builder (sef.py).
Unit-style: no server needed."""
import os
import random
import sys
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import calc  # noqa: E402
import sef  # noqa: E402

GOLDEN = Path(__file__).parent / "golden" / "invoice_basic.xml"
NS = {"cac": sef.NS_CAC, "cbc": sef.NS_CBC, "i": sef.NS_INVOICE}

UNITS = {
    "kom": {"ubl_code": "H87"},
    "kg": {"ubl_code": "KGM"},
    "l": {"ubl_code": "LTR"},
}


def _client(**extra):
    return {
        "name": "Veleprodaja Test d.o.o.", "pib": "109876541", "registration_number": "20869500",
        "street": "Bulevar 1", "city": "Beograd", "postal_code": "11000", "country": "RS",
        "vat_payer": True, "bank_account": "160-0000000012345-98", **extra,
    }


def _customer(**extra):
    return {
        "name": "Prodavnica Kupac", "pib": "100000000", "registration_number": "12345678",
        "street": "Ulica 5", "city": "Novi Sad", "postal_code": "21000", "country": "RS", **extra,
    }


def _order():
    return {
        "status": "shipped",
        "items": [
            {"name": "Mleko 1l", "price_no_vat": 100.0, "vat_rate": 20, "discount": 10, "additional_discount": 5,
             "unit": "l", "unit_factor": 1000, "ordered_qty": 5000, "picked_qty": 4500},
            {"name": "Hleb", "price_no_vat": 49.99, "vat_rate": 10, "discount": 0, "additional_discount": 0,
             "unit": "kom", "unit_factor": 1, "ordered_qty": 3, "picked_qty": 3},
            {"name": "Nije poslato", "price_no_vat": 10, "vat_rate": 20, "unit": "kom", "unit_factor": 1,
             "ordered_qty": 2, "picked_qty": 0},
        ],
    }


# ---------------------------------------------------------------- amounts


def test_round2_is_half_up_on_the_decimal_form():
    assert calc.round2(1.005) == 1.01
    assert calc.round2(2.675) == 2.68
    assert calc.round2(0.004) == 0.0
    assert calc.round2(10) == 10.0


def test_amounts_follow_the_documented_rules():
    amounts = calc.invoice_amounts(_order())
    milk, bread = amounts["lines"]
    assert [line["index"] for line in amounts["lines"]] == [0, 1]  # the unsent line is skipped
    assert milk["quantity"] == 4.5 and milk["gross"] == 450.0
    assert milk["net"] == 382.5 and milk["allowance"] == 67.5  # 15 % off
    assert bread["net"] == 149.97 and bread["allowance"] == 0
    by_rate = {c["vat_rate"]: c for c in amounts["categories"]}
    assert by_rate[20] == {"vat_rate": 20, "taxable": 382.5, "vat": 76.5}
    assert by_rate[10] == {"vat_rate": 10, "taxable": 149.97, "vat": 15.0}
    assert amounts["subtotal"] == 532.47 and amounts["vat"] == 91.5 and amounts["grand"] == 623.97


def test_order_totals_use_the_same_cents():
    totals = calc.compute_order_totals(_order())
    amounts = calc.invoice_amounts(_order())
    assert totals == {k: amounts[k] for k in ("subtotal", "vat", "grand")}


def test_ordered_quantities_when_not_shipped():
    order = _order()
    order["status"] = "new"
    amounts = calc.invoice_amounts(order)
    assert [line["index"] for line in amounts["lines"]] == [0, 1, 2]
    assert amounts["lines"][0]["quantity"] == 5.0
    assert calc.invoice_amounts(_order(), by_ordered=True)["lines"][0]["quantity"] == 5.0


def _random_order(rng):
    items = []
    for _ in range(rng.randint(1, 8)):
        factor, unit = rng.choice([(1, "kom"), (1000, "kg"), (1000, "l"), (100, "m")])
        qty = rng.randint(1, 20000 if factor > 1 else 60)
        items.append({
            "name": "Artikal", "price_no_vat": round(rng.uniform(0.5, 4000), rng.choice([0, 1, 2, 3])),
            "vat_rate": rng.choice([10, 20]), "discount": rng.choice([0, 3, 7.5, 10, 12.5]),
            "additional_discount": rng.choice([0, 0, 2, 5]), "unit": unit, "unit_factor": factor,
            "ordered_qty": qty, "picked_qty": rng.choice([None, qty, max(1, qty - 1)]),
        })
    return {"status": rng.choice(["new", "shipped"]), "items": items}


def test_random_orders_add_up_exactly():
    rng = random.Random(2026)
    for _ in range(300):
        order = _random_order(rng)
        amounts = calc.invoice_amounts(order)
        cents = lambda value: Decimal(str(value)).quantize(Decimal("0.01"))  # noqa: E731
        for line in amounts["lines"]:
            assert cents(line["gross"]) - cents(line["allowance"]) == cents(line["net"])
        for category in amounts["categories"]:
            base = sum(cents(x["net"]) for x in amounts["lines"] if x["vat_rate"] == category["vat_rate"])
            assert cents(category["taxable"]) == base
            assert cents(category["vat"]) == (base * Decimal(str(category["vat_rate"])) / 100).quantize(
                Decimal("0.01"), rounding="ROUND_HALF_UP")
        assert cents(amounts["subtotal"]) == sum(cents(x["net"]) for x in amounts["lines"])
        assert cents(amounts["vat"]) == sum(cents(c["vat"]) for c in amounts["categories"])
        assert cents(amounts["grand"]) == cents(amounts["subtotal"]) + cents(amounts["vat"])


# ---------------------------------------------------------------- UBL


def _xml(**overrides):
    args = dict(order=_order(), client=_client(), customer=_customer(), units=UNITS, number="TEST/0001",
                issue_date="2026-11-10", due_date="2026-11-25", delivery_date="2026-11-09")
    args.update(overrides)
    return sef.build_invoice_xml(**args)


def test_xml_matches_the_golden_file():
    xml = _xml()
    if os.environ.get("UPDATE_GOLDEN"):
        GOLDEN.write_text(xml, encoding="utf-8")
    assert xml == GOLDEN.read_text(encoding="utf-8")


def test_xml_structure_and_totals():
    root = ET.fromstring(_xml().encode("utf-8"))
    text = lambda path: root.find(path, NS).text  # noqa: E731
    assert text("cbc:CustomizationID") == sef.CUSTOMIZATION_ID
    assert text("cbc:InvoiceTypeCode") == "380" and text("cbc:DocumentCurrencyCode") == "RSD"
    assert text("cac:Delivery/cbc:ActualDeliveryDate") == "2026-11-09"
    assert text("cac:InvoicePeriod/cbc:DescriptionCode") == "35"
    assert text("cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID") == "RS109876541"
    assert text("cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID") == "12345678"
    assert text("cac:LegalMonetaryTotal/cbc:PayableAmount") == "623.97"
    assert text("cac:TaxTotal/cbc:TaxAmount") == "91.50"
    rows = root.findall("cac:InvoiceLine", NS)
    assert len(rows) == 2
    assert rows[0].find("cbc:InvoicedQuantity", NS).attrib == {"unitCode": "LTR"}
    assert rows[0].find("cbc:InvoicedQuantity", NS).text == "4.5"
    assert sum(Decimal(r.find("cbc:LineExtensionAmount", NS).text) for r in rows) == Decimal(
        text("cac:LegalMonetaryTotal/cbc:LineExtensionAmount"))
    # the order of the top-level elements is part of the UBL schema
    tags = [child.tag.split("}")[1] for child in root]
    assert tags == ["CustomizationID", "ID", "IssueDate", "DueDate", "InvoiceTypeCode", "DocumentCurrencyCode",
                    "InvoicePeriod", "AccountingSupplierParty", "AccountingCustomerParty", "Delivery",
                    "PaymentMeans", "TaxTotal", "LegalMonetaryTotal", "InvoiceLine", "InvoiceLine"]


def test_xml_escapes_user_text():
    order = _order()
    order["items"][0]["name"] = 'Mleko <&> "ukusno"'
    root = ET.fromstring(_xml(order=order).encode("utf-8"))
    assert root.find("cac:InvoiceLine/cac:Item/cbc:Name", NS).text == 'Mleko <&> "ukusno"'


def test_missing_data_is_listed_not_guessed():
    problems = sef.invoice_problems(
        _order(), _client(pib="", bank_account="", vat_payer=None), _customer(street="", registration_number=""),
        {"l": {}, "kom": {"ubl_code": "H87"}}, None)
    assert problems == ["seller.pib", "buyer.registration_number", "buyer.street", "seller.vat_payer",
                        "seller.bank_account", "delivery_date", "unit.l"]
    with pytest.raises(sef.InvoiceDataError) as err:
        _xml(customer=_customer(city=""), number="")
    assert err.value.problems == ["buyer.city", "number"]


def test_only_standard_vat_rates_are_invoiced():
    order = _order()
    order["items"][1]["vat_rate"] = 8
    assert "vat_rate.8" in sef.invoice_problems(order, _client(), _customer(), UNITS, "2026-11-09")
    empty = {"status": "shipped", "items": [{"name": "x", "price_no_vat": 1, "unit": "kom", "ordered_qty": 1, "picked_qty": 0}]}
    assert "no_lines" in sef.invoice_problems(empty, _client(), _customer(), UNITS, "2026-11-09")


def test_bad_dates_are_rejected():
    with pytest.raises(sef.InvoiceDataError) as err:
        _xml(issue_date="10.11.2026")
    assert err.value.problems == ["issue_date"]
