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
  symbol_en?: string | null; // English screens (kom -> pcs); empty = same as `symbol`
  group: string;
  base_code: string;
  factor: number;
  active: boolean;
  ubl_code?: string | null;
};

// The built-in units (backend DEFAULT_UNITS, never changed there): used until GET /units answers, and if it
// can't be reached. Without them a product sold by the litre would count as pieces (400 l shown as 400000 l).
const builtin = (code: string, name_sr: string, name_en: string, group: string, base_code: string, factor: number, symbol_en?: string): Unit => ({
  code, name_sr, name_en, symbol: code, ...(symbol_en ? { symbol_en } : {}), group, base_code, factor, active: true,
});
export const BUILTIN_UNITS: Unit[] = [
  builtin("kom", "komad", "piece", "count", "kom", 1, "pcs"),
  builtin("g", "gram", "gram", "mass", "g", 1),
  builtin("kg", "kilogram", "kilogram", "mass", "g", 1000),
  builtin("t", "tona", "tonne", "mass", "g", 1_000_000),
  builtin("ml", "mililitar", "millilitre", "volume", "ml", 1),
  builtin("l", "litar", "litre", "volume", "ml", 1000),
  builtin("hl", "hektolitar", "hectolitre", "volume", "ml", 100_000),
  builtin("mm", "milimetar", "millimetre", "length", "mm", 1),
  builtin("cm", "centimetar", "centimetre", "length", "mm", 10),
  builtin("m", "metar", "metre", "length", "mm", 1000),
];
export const PIECE: Unit = BUILTIN_UNITS[0];
export const FALLBACK_UNITS: Unit[] = BUILTIN_UNITS;

// Only a list the backend really sent is kept: a failed request must not leave the page with the fallback.
let cache: Unit[] | null = null;
let pending: Promise<Unit[] | null> | null = null;

async function fetchUnits(): Promise<Unit[] | null> {
  if (cache) return cache;
  if (!pending) {
    pending = fetch("/api/units")
      .then(async (res) => {
        if (!res.ok) return null;
        cache = (await res.json()) as Unit[];
        return cache;
      })
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

// The screen language for unit symbols; set by LanguageProvider, so the helpers below need no hook.
let unitsLang: "sr" | "en" = "sr";
export function setUnitsLang(lang: "sr" | "en") {
  unitsLang = lang;
}

/** The symbol to show: on English screens the unit's `symbol_en` (kom -> pcs), else the stored symbol. */
export function displaySymbol(symbol?: string | null): string {
  const s = symbol || "kom";
  if (unitsLang !== "en") return s;
  const unit = (cache ?? FALLBACK_UNITS).find((u) => u.symbol === s);
  return unit?.symbol_en || (s === "kom" ? "pcs" : s);
}

export function resetUnitsCache() {
  cache = null;
}

// The built-in units right away, the backend's list (custom units too) as soon as it answers; a failed
// request is retried a few times.
export function useUnits(): Unit[] {
  const [units, setUnits] = useState<Unit[]>(cache ?? FALLBACK_UNITS);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetchUnits().then((list) => {
        if (!live) return;
        if (list) setUnits(list);
        else if (attempt < 4) timer = setTimeout(() => load(attempt + 1), 2000 * (attempt + 1));
      });
    };
    load(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  return units;
}

// A code missing from the list (a custom unit while the list is still loading) falls back to the built-in
// one of that code, and only then to a piece.
export const unitOf = (units: Unit[], code?: string | null): Unit =>
  units.find((u) => u.code === (code || "kom")) ??
  BUILTIN_UNITS.find((u) => u.code === (code || "kom")) ?? { ...PIECE, code: code || "kom", symbol: code || "kom" };

// Whole numbers show without decimals; others with up to 6, trailing zeros trimmed.
export function formatQty(base: number | null | undefined, unit: Pick<Unit, "factor">): string {
  if (base === null || base === undefined) return "";
  const shown = base / (unit.factor || 1);
  return Number(shown.toFixed(6)).toLocaleString("sr-RS", { maximumFractionDigits: 6 });
}

export const formatQtyWithUnit = (base: number | null | undefined, unit: Pick<Unit, "factor" | "symbol">) =>
  base === null || base === undefined ? "" : `${formatQty(base, unit)} ${displaySymbol(unit.symbol)}`;

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
