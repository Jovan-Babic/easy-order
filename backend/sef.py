"""E-invoice (SEF, Serbia) UBL 2.1 builder - plan phase S2 (.claude/DOCS/PLAN_SEF_MODUL.md).

Pure functions, no database and no network: `build_invoice_xml` maps an order, the
issuing company, the customer and the units into a UBL invoice (CIUS-RS profile);
`invoice_problems` lists what is missing before that is possible. Amounts come from
`calc.invoice_amounts`, so the invoice, the order screen and the statistics show the
same cents. Only the standard VAT category `S` (10 % / 20 %) is supported for now.
"""
import base64
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

from cryptography.fernet import Fernet, InvalidToken

from calc import invoice_amounts

NS_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
NS_CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
NS_CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022"
SUPPORTED_VAT_RATES = (10.0, 20.0)
CURRENCY = "RSD"
# UNCL2005 code of the VAT point of time (BT-8): 35 = actual delivery date.
VAT_POINT_DELIVERY = "35"
# UN/CEFACT 4461: 30 = credit transfer.
PAYMENT_MEANS_CREDIT_TRANSFER = "30"
# Serbian endpoint scheme: PIB of the company.
ENDPOINT_SCHEME_PIB = "9948"

ET.register_namespace("", NS_INVOICE)
ET.register_namespace("cac", NS_CAC)
ET.register_namespace("cbc", NS_CBC)


class InvoiceDataError(ValueError):
    """The order cannot be turned into an e-invoice; `problems` are machine codes."""

    def __init__(self, problems: List[str]):
        super().__init__(", ".join(problems))
        self.problems = problems


def _filled(value: Any) -> bool:
    return bool(str(value or "").strip())


def _party_problems(prefix: str, party: Dict[str, Any]) -> List[str]:
    problems = [
        f"{prefix}.{field}"
        for field in ("name", "pib", "registration_number", "street", "city", "postal_code")
        if not _filled(party.get(field))
    ]
    if _filled(party.get("pib")) and not str(party["pib"]).strip().isdigit():
        problems.append(f"{prefix}.pib")
    return problems


def invoice_problems(
    order: Dict[str, Any],
    client: Dict[str, Any],
    customer: Dict[str, Any],
    units: Dict[str, Dict[str, Any]],
    delivery_date: Optional[str],
    by_ordered: bool = False,
) -> List[str]:
    """Everything that stops this order from being invoiced, as codes the portal can
    translate: `seller.pib`, `buyer.street`, `unit.<code>`, `vat_rate.<x>`, `delivery_date`, ..."""
    problems = _party_problems("seller", client) + _party_problems("buyer", customer)
    if client.get("vat_payer") is not True:
        problems.append("seller.vat_payer")
    if not _filled(client.get("bank_account")):
        problems.append("seller.bank_account")
    if not _filled(delivery_date):
        problems.append("delivery_date")
    amounts = invoice_amounts(order, by_ordered)
    if not amounts["lines"]:
        problems.append("no_lines")
    items = order.get("items", [])
    for line in amounts["lines"]:
        item = items[line["index"]]
        code = item.get("unit") or "kom"
        if not _filled((units.get(code) or {}).get("ubl_code")):
            problems.append(f"unit.{code}")
        if float(line["vat_rate"]) not in SUPPORTED_VAT_RATES:
            problems.append(f"vat_rate.{line['vat_rate']:g}")
    # one entry per problem, in order of first appearance
    return list(dict.fromkeys(problems))


def _money(value: float) -> str:
    return f"{value:.2f}"


def _quantity(value: float) -> str:
    """Up to 6 decimals, trailing zeros dropped (250 g sold by the kg = 0.25)."""
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _percent(value: float) -> str:
    return f"{value:g}"


def _text(parent: ET.Element, ns: str, tag: str, value: Any = None, **attrs: str) -> ET.Element:
    element = ET.SubElement(parent, f"{{{ns}}}{tag}", attrs)
    if value is not None:
        element.text = str(value)
    return element


def _cbc(parent: ET.Element, tag: str, value: Any = None, **attrs: str) -> ET.Element:
    return _text(parent, NS_CBC, tag, value, **attrs)


def _cac(parent: ET.Element, tag: str) -> ET.Element:
    return _text(parent, NS_CAC, tag)


def _party(parent: ET.Element, wrapper: str, party: Dict[str, Any]) -> None:
    pib = str(party["pib"]).strip()
    holder = _cac(_cac(parent, wrapper), "Party")
    _cbc(holder, "EndpointID", pib, schemeID=ENDPOINT_SCHEME_PIB)
    _cbc(_cac(holder, "PartyName"), "Name", party["name"].strip())
    address = _cac(holder, "PostalAddress")
    _cbc(address, "StreetName", party["street"].strip())
    _cbc(address, "CityName", party["city"].strip())
    _cbc(address, "PostalZone", party["postal_code"].strip())
    _cbc(_cac(address, "Country"), "IdentificationCode", (party.get("country") or "RS").strip().upper())
    if party.get("vat_payer", True):
        tax = _cac(holder, "PartyTaxScheme")
        _cbc(tax, "CompanyID", f"RS{pib}")
        _cbc(_cac(tax, "TaxScheme"), "ID", "VAT")
    legal = _cac(holder, "PartyLegalEntity")
    _cbc(legal, "RegistrationName", party["name"].strip())
    _cbc(legal, "CompanyID", str(party["registration_number"]).strip())


def _tax_category(parent: ET.Element, tag: str, rate: float) -> None:
    category = _cac(parent, tag)
    _cbc(category, "ID", "S")
    _cbc(category, "Percent", _percent(rate))
    _cbc(_cac(category, "TaxScheme"), "ID", "VAT")


def build_invoice_xml(
    order: Dict[str, Any],
    client: Dict[str, Any],
    customer: Dict[str, Any],
    units: Dict[str, Dict[str, Any]],
    number: str,
    issue_date: str,
    due_date: str,
    delivery_date: str,
    by_ordered: bool = False,
) -> str:
    """UBL 2.1 invoice (type 380) as a UTF-8 string. Raises InvoiceDataError when data is missing."""
    problems = invoice_problems(order, client, customer, units, delivery_date, by_ordered)
    if not _filled(number):
        problems.append("number")
    for field, value in (("issue_date", issue_date), ("due_date", due_date), ("delivery_date", delivery_date)):
        try:
            date.fromisoformat(value)
        except (TypeError, ValueError):
            problems.append(field)
    if problems:
        raise InvoiceDataError(list(dict.fromkeys(problems)))

    amounts = invoice_amounts(order, by_ordered)
    root = ET.Element(f"{{{NS_INVOICE}}}Invoice")
    _cbc(root, "CustomizationID", CUSTOMIZATION_ID)
    _cbc(root, "ID", number.strip())
    _cbc(root, "IssueDate", issue_date)
    _cbc(root, "DueDate", due_date)
    _cbc(root, "InvoiceTypeCode", "380")
    _cbc(root, "DocumentCurrencyCode", CURRENCY)
    _cbc(_cac(root, "InvoicePeriod"), "DescriptionCode", VAT_POINT_DELIVERY)
    _party(root, "AccountingSupplierParty", client)
    _party(root, "AccountingCustomerParty", {**customer, "vat_payer": True})
    _cbc(_cac(root, "Delivery"), "ActualDeliveryDate", delivery_date)

    means = _cac(root, "PaymentMeans")
    _cbc(means, "PaymentMeansCode", PAYMENT_MEANS_CREDIT_TRANSFER)
    _cbc(_cac(means, "PayeeFinancialAccount"), "ID", str(client["bank_account"]).strip())

    tax_total = _cac(root, "TaxTotal")
    _cbc(tax_total, "TaxAmount", _money(amounts["vat"]), currencyID=CURRENCY)
    for category in amounts["categories"]:
        subtotal = _cac(tax_total, "TaxSubtotal")
        _cbc(subtotal, "TaxableAmount", _money(category["taxable"]), currencyID=CURRENCY)
        _cbc(subtotal, "TaxAmount", _money(category["vat"]), currencyID=CURRENCY)
        _tax_category(subtotal, "TaxCategory", category["vat_rate"])

    monetary = _cac(root, "LegalMonetaryTotal")
    # Line discounts are already inside the line amounts, so there is no document-level allowance.
    _cbc(monetary, "LineExtensionAmount", _money(amounts["subtotal"]), currencyID=CURRENCY)
    _cbc(monetary, "TaxExclusiveAmount", _money(amounts["subtotal"]), currencyID=CURRENCY)
    _cbc(monetary, "TaxInclusiveAmount", _money(amounts["grand"]), currencyID=CURRENCY)
    _cbc(monetary, "PayableAmount", _money(amounts["grand"]), currencyID=CURRENCY)

    items = order.get("items", [])
    for position, line in enumerate(amounts["lines"], start=1):
        item = items[line["index"]]
        unit_code = units[item.get("unit") or "kom"]["ubl_code"]
        row = _cac(root, "InvoiceLine")
        _cbc(row, "ID", position)
        _cbc(row, "InvoicedQuantity", _quantity(line["quantity"]), unitCode=unit_code)
        _cbc(row, "LineExtensionAmount", _money(line["net"]), currencyID=CURRENCY)
        if line["allowance"]:
            charge = _cac(row, "AllowanceCharge")
            _cbc(charge, "ChargeIndicator", "false")
            _cbc(charge, "AllowanceChargeReason", "Rabat")
            _cbc(charge, "Amount", _money(line["allowance"]), currencyID=CURRENCY)
            _cbc(charge, "BaseAmount", _money(line["gross"]), currencyID=CURRENCY)
        product = _cac(row, "Item")
        _cbc(product, "Name", (item.get("name") or "").strip()[:200])
        _tax_category(product, "ClassifiedTaxCategory", line["vat_rate"])
        price = _cac(row, "Price")
        _cbc(price, "PriceAmount", f"{float(item.get('price_no_vat') or 0):.4f}".rstrip("0").rstrip(".") or "0", currencyID=CURRENCY)

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body


# ---------------------------------------------------------------------------------------------
# API key storage and the SEF HTTP client (plan phase S3)
# ---------------------------------------------------------------------------------------------

SEF_HOSTS = {"demo": "https://demoefaktura.mfin.gov.rs", "production": "https://efaktura.mfin.gov.rs"}

# What SEF reports as `Status` -> our status. Anything else is kept as it is in `sef_status`.
STATUS_MAP = {
    "Sending": "sending", "New": "sent", "Draft": "sent", "Sent": "sent", "Seen": "sent", "Paid": "sent",
    "Mistake": "sent", "OverDue": "sent", "Archived": "sent", "Approved": "approved", "Rejected": "rejected",
    "Cancelled": "cancelled", "Storno": "storno", "Deleted": "cancelled",
}


def _fernet(secret: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest()))


def encrypt_secret(plain: str, secret: str) -> str:
    return _fernet(secret).encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str, secret: str) -> Optional[str]:
    try:
        return _fernet(secret).decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None  # a different secret or a damaged value: treated as "no key"


class SefError(Exception):
    """A failed SEF call. `status` is the HTTP status (None = no answer: network, timeout);
    `retryable` = the same request may be repeated later (no answer, 5xx, 429)."""

    def __init__(self, message: str, status: Optional[int] = None, code: Optional[str] = None, raw: str = ""):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.raw = raw[:2000]

    @property
    def retryable(self) -> bool:
        return self.status is None or self.status >= 500 or self.status == 429


def _error_from_body(status: int, body: str) -> SefError:
    message, code = body.strip()[:300] or f"HTTP {status}", None
    try:
        data = json.loads(body)
    except ValueError:
        data = None
    if isinstance(data, dict):
        lowered = {str(k).lower(): v for k, v in data.items()}
        message = str(lowered.get("message") or lowered.get("detail") or lowered.get("title") or lowered.get("error") or message)
        code = lowered.get("errorcode") or lowered.get("code")
        errors = lowered.get("errors")
        if isinstance(errors, dict) and errors:  # ASP.NET validation shape: {"errors": {"field": ["text"]}}
            message = "; ".join(f"{k}: {', '.join(map(str, v)) if isinstance(v, list) else v}" for k, v in errors.items())
    return SefError(message[:500], status=status, code=str(code) if code else None, raw=body)


class SefClient:
    """Blocking client (run it in a thread): the ApiKey goes only into the request header and
    never into a message or log."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 25):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _call(self, method: str, path: str, query: Optional[dict] = None, body: Optional[bytes] = None,
              content_type: Optional[str] = None) -> Any:
        url = f"{self.base_url}/api/publicApi/{path}"
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        headers = {"ApiKey": self.api_key, "Accept": "application/json"}
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 (host is fixed by config)
                raw = response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            raise _error_from_body(err.code, err.read().decode("utf-8", "replace")) from None
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            reason = getattr(err, "reason", err)
            raise SefError(f"No answer from SEF ({type(reason).__name__})") from None
        if not raw.strip():
            return {}
        try:
            return json.loads(raw)
        except ValueError:
            return {"raw": raw[:2000]}

    def version(self) -> Dict[str, Any]:
        return self._call("GET", "getEfakturaVersion")

    def upload(self, xml: str, request_id: str, validate_only: bool = False) -> Dict[str, Any]:
        boundary = uuid.uuid4().hex
        part = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"ublFile\"; filename=\"invoice.xml\"\r\n"
            "Content-Type: text/xml\r\n\r\n"
        ).encode("utf-8") + xml.encode("utf-8") + f"\r\n--{boundary}--\r\n".encode("ascii")
        return self._call(
            "POST", "sales-invoice/ubl/upload",
            {"requestId": request_id, "executeValidation": "true" if validate_only else "false"},
            part, f"multipart/form-data; boundary={boundary}",
        )

    def status(self, invoice_id: int) -> Dict[str, Any]:
        return self._call("GET", "sales-invoice", {"invoiceId": invoice_id})

    def cancel(self, invoice_id: int, comment: str) -> Dict[str, Any]:
        body = json.dumps({"invoiceId": invoice_id, "cancelComments": comment}).encode("utf-8")
        return self._call("POST", "sales-invoice/cancel", body=body, content_type="application/json")

    def storno(self, invoice_id: int, number: Optional[str], comment: str) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"invoiceId": invoice_id, "stornoComment": comment}
        if number:
            payload["stornoNumber"] = number
        return self._call("POST", "sales-invoice/storno", body=json.dumps(payload).encode("utf-8"),
                          content_type="application/json")
