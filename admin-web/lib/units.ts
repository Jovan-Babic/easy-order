"use client";

// Units of measure (PLAN_JEDINICE_MERE.md). Every quantity the backend stores is a
// whole number of the unit's BASE unit (g, ml, mm, kom); the screens show and take
// quantities in the product's own unit (kg, l, m). `factor` = base units per unit.
import { useEffect, useState } from "react";

export type Unit = {
  code: string;
  name_sr: string;
  name_en: string;
  symbol: string;
  group: string;
  base_code: string;
  factor: number;
  active: boolean;
};

export const PIECE: Unit = {
  code: "kom", name_sr: "komad", name_en: "piece", symbol: "kom", group: "count", base_code: "kom", factor: 1, active: true,
};

// Built-ins, used until /api/units answers (or when it fails).
export const FALLBACK_UNITS: Unit[] = [PIECE];

let cache: Unit[] | null = null;
let pending: Promise<Unit[]> | null = null;

async function fetchUnits(): Promise<Unit[]> {
  if (cache) return cache;
  if (!pending) {
    pending = fetch("/api/units")
      .then((res) => (res.ok ? res.json() : FALLBACK_UNITS))
      .catch(() => FALLBACK_UNITS)
      .then((list: Unit[]) => {
        cache = list;
        return list;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function resetUnitsCache() {
  cache = null;
}

export function useUnits(): Unit[] {
  const [units, setUnits] = useState<Unit[]>(cache ?? FALLBACK_UNITS);
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

// Whole numbers show without decimals; others with up to 6, trailing zeros trimmed.
export function formatQty(base: number | null | undefined, unit: Pick<Unit, "factor">): string {
  if (base === null || base === undefined) return "";
  const shown = base / (unit.factor || 1);
  return Number(shown.toFixed(6)).toLocaleString("sr-RS", { maximumFractionDigits: 6 });
}

export const formatQtyWithUnit = (base: number | null | undefined, unit: Pick<Unit, "factor" | "symbol">) =>
  base === null || base === undefined ? "" : `${formatQty(base, unit)} ${unit.symbol}`;

// Text typed in the product's unit -> whole base units; null when empty, negative or too fine (0,0005 kg).
export function parseQty(text: string, unit: Pick<Unit, "factor">): number | null {
  const clean = text.trim().replace(",", ".");
  if (clean === "") return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return null;
  const base = value * (unit.factor || 1);
  return Math.abs(base - Math.round(base)) < 1e-6 ? Math.round(base) : null;
}

// Input value for a base quantity (plain number, dot decimal) in the unit.
export const qtyInputValue = (base: number | null | undefined, unit: Pick<Unit, "factor">): string =>
  base === null || base === undefined ? "" : String(Number((base / (unit.factor || 1)).toFixed(6)));

export const isCountUnit = (unit: Pick<Unit, "group">) => unit.group === "count";

// The unit of an order line (snapshot taken when the order was made; old lines are pieces).
export const lineUnit = (item: { unit_symbol?: string; unit_factor?: number }) => ({
  symbol: item.unit_symbol || "kom",
  factor: item.unit_factor || 1,
});

// "3,5 kg"; plain pieces stay a bare number.
export const lineQtyLabel = (base: number, item: { unit_symbol?: string; unit_factor?: number }) => {
  const u = lineUnit(item);
  return u.symbol === "kom" && u.factor === 1 ? String(base) : formatQtyWithUnit(base, u);
};
