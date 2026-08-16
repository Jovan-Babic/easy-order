"""Order total math. Keep in sync with frontend/src/calc.ts - same formulas,
two languages (backend needs totals for statistics, frontend for the invoice UI)."""
from typing import Any, Dict


def line_net(item: Dict[str, Any]) -> float:
    price = item.get("price_no_vat") or 0
    qty = item.get("ordered_qty") or 0
    discount = item.get("discount") or 0
    additional_discount = item.get("additional_discount") or 0
    total_discount = max(0, min(100, discount + additional_discount))
    return price * qty * (1 - total_discount / 100)


def line_vat(item: Dict[str, Any]) -> float:
    vat_rate = item.get("vat_rate") or 0
    return line_net(item) * (vat_rate / 100)


def compute_order_totals(order: Dict[str, Any]) -> Dict[str, float]:
    subtotal = 0.0
    vat = 0.0
    for item in order.get("items", []):
        subtotal += line_net(item)
        vat += line_vat(item)
    return {"subtotal": subtotal, "vat": vat, "grand": subtotal + vat}
