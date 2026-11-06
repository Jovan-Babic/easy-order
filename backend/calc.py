"""Order total math. Keep in sync with frontend/src/calc.ts - same formulas,
two languages (backend needs totals for statistics, frontend for the invoice UI)."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List


def effective_qty(item: Dict[str, Any], shipped: bool = False) -> int:
    """Quantity that counts for money: what was ordered, except on a shipped
    order, where what the warehouse actually packed (picked_qty) wins."""
    if shipped and item.get("picked_qty") is not None:
        return item["picked_qty"]
    return item.get("ordered_qty") or 0


def line_net(item: Dict[str, Any], shipped: bool = False) -> float:
    price = item.get("price_no_vat") or 0
    qty = effective_qty(item, shipped)
    discount = item.get("discount") or 0
    additional_discount = item.get("additional_discount") or 0
    total_discount = max(0, min(100, discount + additional_discount))
    # Quantities are whole base units (g, ml, mm, kom); the price is per unit_factor of them.
    factor = item.get("unit_factor") or 1
    return price * qty / factor * (1 - total_discount / 100)


def line_vat(item: Dict[str, Any], shipped: bool = False) -> float:
    vat_rate = item.get("vat_rate") or 0
    return line_net(item, shipped) * (vat_rate / 100)


def round2(value: float) -> float:
    """Round half up to 2 decimals on the shortest decimal form of the float
    (so 1.005 gives 1.01). frontend/src/calc.ts does the same."""
    if abs(value) < 1e-9:
        return 0.0
    return float(Decimal(repr(float(value))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def invoice_amounts(order: Dict[str, Any], by_ordered: bool = False) -> Dict[str, Any]:
    """Amounts exactly as an e-invoice states them (plan PLAN_SEF_MODUL.md, D3):
    every line is rounded to 2 decimals, the taxable base of a VAT rate is the sum
    of its rounded lines and the VAT is round(base x rate). The order totals use the
    same rules, so the invoice and the order always show the same cents.
    Lines with nothing to count (zero quantity) are skipped."""
    shipped = order.get("status") == "shipped" and not by_ordered
    lines: List[Dict[str, Any]] = []
    for index, item in enumerate(order.get("items", [])):
        qty = effective_qty(item, shipped)
        if qty <= 0:
            continue
        factor = item.get("unit_factor") or 1
        gross = round2((item.get("price_no_vat") or 0) * qty / factor)
        net = round2(line_net(item, shipped))
        lines.append({
            "index": index,
            "quantity": qty / factor,  # in the product's unit (the invoicing unit)
            "gross": gross,
            "allowance": round2(gross - net),
            "net": net,
            "vat_rate": item.get("vat_rate") if item.get("vat_rate") is not None else 20,
        })
    taxable: Dict[float, float] = {}
    for line in lines:
        taxable[line["vat_rate"]] = round2(taxable.get(line["vat_rate"], 0) + line["net"])
    categories = [
        {"vat_rate": rate, "taxable": base, "vat": round2(base * rate / 100)}
        for rate, base in sorted(taxable.items(), reverse=True)
    ]
    subtotal = round2(sum(c["taxable"] for c in categories))
    vat = round2(sum(c["vat"] for c in categories))
    return {"lines": lines, "categories": categories, "subtotal": subtotal, "vat": vat, "grand": round2(subtotal + vat)}


def compute_order_totals(order: Dict[str, Any], by_ordered: bool = False) -> Dict[str, float]:
    """Totals by effective quantity (picked_qty once shipped). `by_ordered`
    forces the originally ordered quantities. Same cents as the e-invoice."""
    amounts = invoice_amounts(order, by_ordered)
    return {"subtotal": amounts["subtotal"], "vat": amounts["vat"], "grand": amounts["grand"]}
