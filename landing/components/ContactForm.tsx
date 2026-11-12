"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Dict, Lang } from "@/lib/i18n";

type State = "idle" | "sending" | "sent";
const field = "mt-1 block w-full rounded-md border border-border bg-white px-3 py-2 text-onSurface focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

// The inquiry form; sent to this site's /api/contact, which passes it to the backend.
export function ContactForm({ t, lang, plans }: { t: Dict; lang: Lang; plans: string[] }) {
  const params = useSearchParams();
  const [plan, setPlan] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  // "Request an offer" on a plan card links here with ?paket=<name>.
  useEffect(() => {
    const asked = params.get("paket");
    if (asked && plans.includes(asked)) setPlan(asked);
  }, [params, plans]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!data.email?.trim() && !data.phone?.trim()) {
      setError(t.contact.needContact);
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, plan: plan || null, lang }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      setError(res.status === 429 ? t.contact.tooMany : res.status === 422 || res.status === 400 ? t.contact.invalid : t.contact.failed);
    } catch {
      setError(t.contact.failed);
    }
    setState("idle");
  };

  if (state === "sent") {
    return <p className="rounded-lg bg-brandSecondary p-6 font-semibold text-brand" role="status">{t.contact.sent}</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-onSurface">
          {t.contact.name} *
          <input name="name" required maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t.contact.company}
          <input name="company" maxLength={200} autoComplete="organization" className={field} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t.contact.emailField}
          <input name="email" type="email" maxLength={254} autoComplete="email" className={field} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t.contact.phoneField}
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} />
        </label>
      </div>
      {plans.length > 0 && (
        <label className="text-sm font-semibold text-onSurface">
          {t.contact.plan}
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={field}>
            <option value="">{t.contact.planNone}</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm font-semibold text-onSurface">
        {t.contact.message} *
        <textarea name="message" required maxLength={3000} rows={5} placeholder={t.contact.messagePlaceholder} className={field} />
      </label>
      {/* Honeypot: hidden from people (and screen readers), bots fill it and the backend drops the message. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && <p className="text-sm font-semibold text-error" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"} className="rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brandDark disabled:opacity-60">
          {state === "sending" ? t.contact.sending : t.contact.send}
        </button>
        <p className="text-xs text-muted">{t.contact.privacy}</p>
      </div>
    </form>
  );
}
