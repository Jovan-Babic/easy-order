"use client";

import { useEffect, useState } from "react";
import { Field, fieldInput } from "@/components/FormField";
import { useLanguage } from "@/lib/i18n";
import { localizedDetail } from "@/lib/errors";
import { MODULES } from "@/lib/modules";
import { SEAT_ROLES } from "@/lib/seats";
import { ROLE_KEYS } from "@/components/SeatsPanel";

// One price list for every client: monthly price of an extra account per role and of
// each module that is sold on top of a package. Charges are made from these prices.
export default function PricingPage() {
  const { t } = useLanguage();
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [modules, setModules] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) return setMessage({ ok: false, text: t("loadFailed") });
        const { values } = await res.json();
        setSeats(Object.fromEntries(SEAT_ROLES.map((r) => [r, String(values.seat_prices?.[r] ?? "")])));
        setModules(Object.fromEntries(MODULES.map((m) => [m.key, values.module_prices?.[m.key] ? String(values.module_prices[m.key]) : ""])));
        setLoaded(true);
      })
      .catch(() => setMessage({ ok: false, text: t("loadFailed") }));
  }, [t]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const body = {
      seat_prices: Object.fromEntries(SEAT_ROLES.filter((r) => seats[r] !== "").map((r) => [r, Math.max(0, Number(seats[r]))])),
      module_prices: Object.fromEntries(MODULES.map((m) => [m.key, Math.max(0, Number(modules[m.key]) || 0)])),
    };
    const res = await fetch("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: t("pricingSaved") } : { ok: false, text: localizedDetail(out.detail, t, t("actionFailed")) });
  };

  if (!loaded) return <p className="text-muted">{message ? message.text : t("loading")}</p>;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("pricingTitle")}</h1>
      <p className="mb-6 text-sm text-muted">{t("pricingHint")}</p>
      <div className="space-y-6 rounded-lg bg-surfaceSecondary p-5 shadow-sm">
        <section>
          <h2 className="mb-2 font-bold text-onSurface">{t("pricingSeats")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SEAT_ROLES.map((r) => (
              <Field key={r} label={t(ROLE_KEYS[r])}>
                <input type="number" min="0" step="0.01" value={seats[r]} onChange={(e) => setSeats({ ...seats, [r]: e.target.value })} className={fieldInput} />
              </Field>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-1 font-bold text-onSurface">{t("pricingModules")}</h2>
          <p className="mb-2 text-xs text-muted">{t("pricingModulesHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODULES.map((m) => (
              <Field key={m.key} label={t(m.labelKey)}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={modules[m.key]}
                  placeholder="-"
                  onChange={(e) => setModules({ ...modules, [m.key]: e.target.value })}
                  className={fieldInput}
                />
              </Field>
            ))}
          </div>
        </section>
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={save} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t("save")}
          </button>
          {message && <p className={`text-sm ${message.ok ? "text-brand" : "text-error"}`}>{message.text}</p>}
        </div>
      </div>
    </div>
  );
}
