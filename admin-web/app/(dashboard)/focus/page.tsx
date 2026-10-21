"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { localizedDetail } from "@/lib/errors";
import { Field, fieldInput } from "@/components/FormField";

type Reason = "stock" | "expiry" | "promo" | "other";
const REASONS: Reason[] = ["stock", "expiry", "promo", "other"];
const REASON_KEY: Record<Reason, TranslationKey> = {
  stock: "focusReasonStock",
  expiry: "focusReasonExpiry",
  promo: "focusReasonPromo",
  other: "focusReasonOther",
};

type FocusItem = {
  id: string;
  product_id: string;
  product_name: string;
  image?: string;
  reason: Reason;
  note: string;
  recommended_discount: number | null;
  active_to: string | null;
  ended: boolean;
  product_active: boolean;
  stock_qty: number | null;
  next_expiry: string | null;
};
type Suggestion = {
  product_id: string;
  product_name: string;
  image?: string;
  reason: "stock" | "expiry";
  stock_qty: number | null;
  sold_30d: number;
  cover_days: number | null;
  expiry_date: string | null;
  expiry_qty: number | null;
  days_left: number | null;
};
type Product = { id: string; name: string; active?: boolean; additional_discounts?: number[] };
type Draft = { id?: string; product_id: string; reason: Reason; note: string; discount: string; active_to: string };

const emptyDraft: Draft = { product_id: "", reason: "stock", note: "", discount: "", active_to: "" };

const badge: Record<Reason, string> = {
  stock: "bg-blue-100 text-blue-800",
  expiry: "bg-red-100 text-red-800",
  promo: "bg-amber-100 text-amber-800",
  other: "bg-surfaceTertiary text-onSurface",
};

export default function FocusPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<FocusItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([fetch("/api/focus"), fetch("/api/products")]);
      if (f.ok) {
        const data = await f.json();
        setItems(data.items);
        setSuggestions(data.suggestions);
      }
      if (p.ok) setProducts(await p.json());
    } catch {
      setError(t("loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const taken = useMemo(() => new Set(items.map((i) => i.product_id)), [items]);
  const selected = products.find((p) => p.id === draft?.product_id);
  const choices = useMemo(
    () =>
      products
        .filter((p) => p.active !== false && !taken.has(p.id) && p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .slice(0, 50),
    [products, taken, search],
  );
  const discountOptions = useMemo(() => {
    if (!selected) return [];
    return [...new Set(selected.additional_discounts ?? [])].filter((d) => d > 0).sort((a, b) => a - b);
  }, [selected]);

  const openSuggestion = (s: Suggestion) => {
    setError("");
    setSearch("");
    setDraft({ ...emptyDraft, product_id: s.product_id, reason: s.reason });
  };
  const openEdit = (i: FocusItem) => {
    setError("");
    setDraft({
      id: i.id,
      product_id: i.product_id,
      reason: i.reason,
      note: i.note,
      discount: i.recommended_discount == null ? "" : String(i.recommended_discount),
      active_to: i.active_to ?? "",
    });
  };

  const save = async () => {
    if (!draft || !draft.product_id) return;
    setBusy(true);
    setError("");
    const body = {
      ...(draft.id ? {} : { product_id: draft.product_id }),
      reason: draft.reason,
      note: draft.note,
      recommended_discount: draft.discount === "" ? null : Number(draft.discount),
      active_to: draft.active_to || null,
    };
    try {
      const res = await fetch(draft.id ? `/api/focus/${draft.id}` : "/api/focus", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        setError(localizedDetail(out.detail, t, t("saveFailed")));
      } else {
        setDraft(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i: FocusItem) => {
    if (!window.confirm(`${i.product_name}: ${t("focusRemoveConfirm")}`)) return;
    await fetch(`/api/focus/${i.id}`, { method: "DELETE" });
    await load();
  };

  const primary = "rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";
  const secondary = "rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurface hover:bg-surfaceTertiary";

  const suggestionText = (s: Suggestion) => {
    if (s.reason === "expiry") {
      return t("focusSuggestExpiry")
        .replace("{date}", s.expiry_date ?? "")
        .replace("{qty}", String(s.expiry_qty ?? 0))
        .replace("{days}", String(s.days_left ?? 0));
    }
    if (s.cover_days == null) return t("focusSuggestStockNoSales").replace("{stock}", String(s.stock_qty ?? 0));
    return t("focusSuggestStock")
      .replace("{stock}", String(s.stock_qty ?? 0))
      .replace("{sold}", String(s.sold_30d))
      .replace("{days}", String(s.cover_days));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("focus")}</h1>
        <button className={primary} onClick={() => { setError(""); setSearch(""); setDraft({ ...emptyDraft }); }}>
          {t("focusAdd")}
        </button>
      </div>
      <p className="mb-6 text-sm text-muted">{t("focusIntro")}</p>

      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("focusSuggestions")}</h2>
        <p className="mb-2 text-xs text-muted">{t("focusSuggestionsHint")}</p>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">{t("focusNoSuggestions")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((s) => (
              <div key={`${s.reason}-${s.product_id}`} className="flex items-start justify-between gap-3 rounded-lg bg-surfaceSecondary p-4 shadow-sm">
                <div className="min-w-0">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${badge[s.reason]}`}>{t(REASON_KEY[s.reason])}</span>
                  <p className="mt-1 truncate font-semibold text-onSurface">{s.product_name}</p>
                  <p className="text-xs text-muted">{suggestionText(s)}</p>
                </div>
                <button className="shrink-0 text-sm font-semibold text-brand hover:underline" onClick={() => openSuggestion(s)}>
                  {t("focusAddToFocus")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">{t("focusProduct")}</th>
              <th className="px-4 py-3">{t("focusReason")}</th>
              <th className="px-4 py-3">{t("focusNote")}</th>
              <th className="px-4 py-3 text-right">{t("focusDiscount")}</th>
              <th className="px-4 py-3">{t("focusUntil")}</th>
              <th className="px-4 py-3 text-right">{t("focusStock")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-b border-border last:border-0 ${i.ended ? "opacity-60" : ""}`}>
                <td className="px-4 py-3 font-semibold text-onSurface">
                  {i.product_name}
                  {!i.product_active && <span className="ml-2 text-xs font-normal text-error">{t("focusInactiveProduct")}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${badge[i.reason]}`}>{t(REASON_KEY[i.reason])}</span>
                </td>
                <td className="max-w-xs px-4 py-3 text-onSurfaceSecondary">{i.note || "-"}</td>
                <td className="px-4 py-3 text-right">{i.recommended_discount == null ? "-" : `${i.recommended_discount}%`}</td>
                <td className="px-4 py-3">
                  {i.active_to ?? "-"}
                  {i.ended && <span className="ml-2 text-xs font-bold text-error">{t("focusEnded")}</span>}
                </td>
                <td className="px-4 py-3 text-right">{i.stock_qty ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button className="mr-3 font-semibold text-brand hover:underline" onClick={() => openEdit(i)}>{t("edit")}</button>
                  <button className="font-semibold text-error hover:underline" onClick={() => remove(i)}>{t("focusRemove")}</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">{t("focusEmpty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg bg-surfaceSecondary p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-extrabold text-onSurface">{draft.id ? t("focusEdit") : t("focusAdd")}</h2>
            <div className="space-y-4">
              {draft.id || draft.product_id ? (
                <p className="font-semibold text-onSurface">{products.find((p) => p.id === draft.product_id)?.name ?? ""}</p>
              ) : (
                <>
                  <Field label={t("focusSearch")}>
                    <input className={fieldInput} value={search} onChange={(e) => setSearch(e.target.value)} />
                  </Field>
                  <Field label={t("focusProduct")}>
                    <select className={fieldInput} value={draft.product_id} onChange={(e) => setDraft({ ...draft, product_id: e.target.value, discount: "" })}>
                      <option value="">{t("focusPickProduct")}</option>
                      {choices.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label={t("focusReason")}>
                <select className={fieldInput} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value as Reason })}>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{t(REASON_KEY[r])}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("focusNote")}>
                <textarea className={fieldInput} rows={2} maxLength={300} placeholder={t("focusNoteHint")} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </Field>
              <Field label={t("focusDiscount")}>
                <select className={fieldInput} value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })}>
                  <option value="">{t("focusDiscountNone")}</option>
                  {discountOptions.map((d) => (
                    <option key={d} value={d}>{d}%</option>
                  ))}
                </select>
              </Field>
              <Field label={t("focusUntil")}>
                <input type="date" className={fieldInput} value={draft.active_to} onChange={(e) => setDraft({ ...draft, active_to: e.target.value })} />
              </Field>
            </div>
            {error && <p className="mt-3 text-sm text-error">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={() => setDraft(null)}>{t("cancel")}</button>
              <button className={primary} disabled={busy || !draft.product_id} onClick={save}>{t("focusSave")}</button>
            </div>
          </div>
        </div>
      )}
      {!draft && error && <p className="mt-3 text-sm text-error">{error}</p>}
    </div>
  );
}
