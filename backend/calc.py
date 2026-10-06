"""Order total math. Keep in sync with frontend/src/calc.ts - same formulas,
two languages (backend needs totals for statistics, frontend for the invoice UI)."""
from typing import Any, Dict


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
    return price * qty * (1 - total_discount / 100)


def line_vat(item: Dict[str, Any], shipped: bool = False) -> float:
    vat_rate = item.get("vat_rate") or 0
    return line_net(item, shipped) * (vat_rate / 100)


def compute_order_totals(order: Dict[str, Any], by_ordered: bool = False) -> Dict[str, float]:
    """Totals by effective quantity (picked_qty once shipped). `by_ordered`
    forces the originally ordered quantities."""
    shipped = order.get("status") == "shipped" and not by_ordered
    subtotal = 0.0
    vat = 0.0
    for item in order.get("items", []):
        subtotal += line_net(item, shipped)
        vat += line_vat(item, shipped)
    return {"subtotal": subtotal, "vat": vat, "grand": subtotal + vat}
