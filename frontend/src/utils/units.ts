// Units of measure (PLAN_JEDINICE_MERE.md). The backend stores every quantity as a
// whole number of the unit's BASE unit (g, ml, mm, kom); screens show and take
// quantities in the product's unit (kg, l, m). `factor` = base units per unit.
import { useEffect, useState } from "react";
import { api, Unit } from "@/src/api";

export const PIECE: Unit = {
  code: "kom", name_sr: "komad", name_en: "piece", symbol: "kom", group: "count", base_code: "kom", factor: 1, active: true,
};

let cache: Unit[] | null = null;
let pending: Promise<Unit[]> | null = null;

async function fetchUnits(): Promise<Unit[]> {
  if (cache) return cache;
  if (!pending) {
    pending = api
      .listUnits()
      .catch(() => [PIECE])
      .then((list) => {
        cache = list;
        return list;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function useUnits(): Unit[] {
  const [units, setUnits] = useState<Unit[]>(cache ?? [PIECE]);
  useEffect(() => {
    let live = true;
    fetchUnits().then((list) => live && setUnits(list));
    return () => {
      live = false;
    };
  }, []);
  return units;
}

export const unitOf = (units: Unit[], code?: string | null): Unit =>
  units.find((u) => u.code === (code || "kom")) ?? { ...PIECE, code: code || "kom", symbol: code || "kom" };

export const isCountUnit = (unit: Pick<Unit, "group">) => unit.group === "count";

/** The unit of an order line (snapshot from when the order was made; old lines are pieces). */
export const lineUnit = (item: { unit_symbol?: string; unit_factor?: number }) => ({
  symbol: item.unit_symbol || "kom",
  factor: item.unit_factor || 1,
});

/** Text typed in the unit -> whole base units; null when empty, negative or too fine (0,0005 kg). */
export function parseQty(text: string | undefined, unit: Pick<Unit, "factor">): number | null {
  const clean = (text ?? "").trim().replace(",", ".");
  if (clean === "") return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return null;
  const base = value * (unit.factor || 1);
  return Math.abs(base - Math.round(base)) < 1e-6 ? Math.round(base) : null;
}

/** Base quantity shown in the unit: whole numbers plain, otherwise up to 6 decimals, zeros trimmed. */
export function formatQty(base: number | null | undefined, unit: Pick<Unit, "factor">): string {
  if (base === null || base === undefined) return "";
  return String(Number((base / (unit.factor || 1)).toFixed(6)));
}

export const formatQtyWithUnit = (base: number | null | undefined, unit: Pick<Unit, "factor" | "symbol">) =>
  base === null || base === undefined ? "" : `${formatQty(base, unit)} ${unit.symbol}`;

/** "3,5 kg"; pieces stay a bare number. */
export const lineQtyLabel = (base: number, item: { unit_symbol?: string; unit_factor?: number }) => {
  const u = lineUnit(item);
  return u.symbol === "kom" && u.factor === 1 ? String(base) : formatQtyWithUnit(base, u);
};

/** Keeps what can be typed for a quantity: digits only for pieces, one decimal separator otherwise. */
export function cleanQtyInput(value: string, unit: Pick<Unit, "group">): string {
  if (isCountUnit(unit)) return value.replace(/[^0-9]/g, "");
  const cleaned = value.replace(/[^0-9.,]/g, "");
  const first = cleaned.search(/[.,]/);
  return first === -1 ? cleaned : cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/[.,]/g, "");
}

/** " / kg" for a line sold by weight, volume or length; nothing for pieces. */
export const perUnit = (item: { unit_symbol?: string }) =>
  item.unit_symbol && item.unit_symbol !== "kom" ? ` / ${item.unit_symbol}` : "";
