// Units of measure (PLAN_JEDINICE_MERE.md). The backend stores every quantity as a
// whole number of the unit's BASE unit (g, ml, mm, kom); screens show and take
// quantities in the product's unit (kg, l, m). `factor` = base units per unit.
import { useEffect, useState } from "react";
import { api, Unit } from "@/src/api";

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

// Only a list the backend really sent is kept: a failed request (no signal, not signed in yet) must not
// leave the app with the fallback for the rest of the session.
let cache: Unit[] | null = null;

// The screen language for unit symbols; set by AppProvider, so the helpers need no hook.
let unitsLang: "sr" | "en" = "sr";
export function setUnitsLang(lang: "sr" | "en") {
  unitsLang = lang;
}

/** The symbol to show: on English screens the unit's `symbol_en` (kom -> pcs), else the stored symbol. */
export function displaySymbol(symbol?: string | null): string {
  const s = symbol || "kom";
  if (unitsLang !== "en") return s;
  const unit = (cache ?? BUILTIN_UNITS).find((u) => u.symbol === s);
  return unit?.symbol_en || (s === "kom" ? "pcs" : s);
}
let pending: Promise<Unit[] | null> | null = null;

async function fetchUnits(): Promise<Unit[] | null> {
  if (cache) return cache;
  if (!pending) {
    pending = api
      .listUnits()
      .then((list) => {
        cache = list;
        return list;
      })
      .catch(() => null) // not kept: the next screen (or the retry below) asks again
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function resetUnitsCache() {
  cache = null;
}

// The built-in units right away, the backend's list (custom units too) as soon as it answers; a failed
// request is retried a few times.
export function useUnits(): Unit[] {
  const [units, setUnits] = useState<Unit[]>(cache ?? BUILTIN_UNITS);
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
  base === null || base === undefined ? "" : `${formatQty(base, unit)} ${displaySymbol(unit.symbol)}`;

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
  item.unit_symbol && item.unit_symbol !== "kom" ? ` / ${displaySymbol(item.unit_symbol)}` : "";
