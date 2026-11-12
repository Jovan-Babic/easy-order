import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PublicPlan, PublicPricing } from "@/lib/api";
import { Dict, Lang, MODULE_ORDER, money } from "@/lib/i18n";

const SEAT_ORDER = ["operator", "warehouse", "admin"];

function PlanCard({ plan, t, lang, currency, featured }: { plan: PublicPlan; t: Dict; lang: Lang; currency: string; featured: boolean }) {
  const monthly = plan.prices["1"];
  const yearly = plan.prices["12"];
  const saving = monthly && yearly && yearly < monthly * 12 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;
  const seats = SEAT_ORDER.filter((r) => r !== "warehouse" || plan.modules.includes("warehouse"));
  const modules = MODULE_ORDER.filter((m) => plan.modules.includes(m.key));
  return (
    <div className={`flex flex-col rounded-lg border p-6 ${featured ? "border-brand bg-brandSecondary/60 shadow-lg" : "border-border bg-white shadow-sm"}`}>
      <h3 className="text-xl font-extrabold text-brand">{plan.name}</h3>
      {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
      <div className="mt-5">
        {monthly ? (
          <p>
            <span className="text-3xl font-extrabold text-onSurface">{money(monthly, lang, currency)}</span>
            <span className="ml-1 text-sm text-muted">{t.pricing.monthly}</span>
          </p>
        ) : yearly ? (
          <p>
            <span className="text-3xl font-extrabold text-onSurface">{money(Math.round(yearly / 12), lang, currency)}</span>
            <span className="ml-1 text-sm text-muted">{t.pricing.perMonthYearly}</span>
          </p>
        ) : (
          <p className="text-xl font-bold text-onSurface">{t.pricing.ask}</p>
        )}
        {monthly && yearly ? (
          <p className="mt-1 text-sm text-onSurfaceSecondary">
            {money(yearly, lang, currency)} {t.pricing.yearly}
            {saving > 0 && <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-xs font-bold text-onSurface">{t.pricing.save} {saving}%</span>}
          </p>
        ) : null}
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted">{t.pricing.included}</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {seats.map((r) => (
          <li key={r} className="flex justify-between gap-3">
            <span className="text-onSurfaceSecondary">{t.roleNames[r]}</span>
            <span className="font-semibold text-onSurface">{plan.included_seats[r] !== undefined ? plan.included_seats[r] : t.pricing.unlimited}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted">{t.pricing.modulesInPlan}</p>
      <ul className="mt-2 grid gap-1.5 text-sm">
        <li className="flex items-start gap-2">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          {t.modules.base}
        </li>
        {modules.map((m) => (
          <li key={m.key} className="flex items-start gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {t.moduleNames[m.key]?.title ?? m.key}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <Link
          href={{ query: { paket: plan.name }, hash: "kontakt" }}
          scroll={false}
          className={`block rounded-md px-4 py-2.5 text-center text-sm font-bold ${featured ? "bg-brand text-white hover:bg-brandDark" : "border border-brand text-brand hover:bg-brandSecondary"}`}
        >
          {t.pricing.ask}
        </Link>
      </div>
    </div>
  );
}

// The price list as the superadmin set it on the portal (plans marked "show on the website",
// extra accounts and add-on prices from "Cenovnik"); without data, an invitation to ask for an offer.
export function Pricing({ pricing, t, lang }: { pricing: PublicPricing | null; t: Dict; lang: Lang }) {
  const plans = pricing?.plans ?? [];
  const currency = pricing?.currency ?? "RSD";
  const seatRows = SEAT_ORDER.filter((r) => pricing?.seat_prices[r]);
  const addons = Object.entries(pricing?.module_prices ?? {}).filter(([, v]) => v > 0);
  const featured = plans.length >= 3 ? 1 : -1;
  return (
    <section id="cenovnik" className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.pricing.title}</h2>
        <p className="mt-3 max-w-2xl text-onSurfaceSecondary">{t.pricing.text}</p>
        {plans.length === 0 ? (
          <div className="mt-10 rounded-lg bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-onSurface">{t.pricing.empty}</p>
            <a href="#kontakt" className="mt-4 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brandDark">
              {t.pricing.emptyCta}
            </a>
          </div>
        ) : (
          <div className={`mt-10 grid gap-6 ${plans.length === 1 ? "max-w-md" : plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>
            {plans.map((p, i) => (
              <PlanCard key={p.id} plan={p} t={t} lang={lang} currency={currency} featured={i === featured} />
            ))}
          </div>
        )}
        {(seatRows.length > 0 || addons.length > 0) && (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {seatRows.length > 0 && (
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="text-lg font-extrabold text-onSurface">{t.pricing.extraTitle}</h3>
                <p className="mt-1 text-sm text-muted">{t.pricing.extraText}</p>
                <ul className="mt-4 grid gap-2 text-sm">
                  {seatRows.map((r) => (
                    <li key={r} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="text-onSurfaceSecondary">{t.roleNames[r]}</span>
                      <span className="font-semibold text-onSurface">
                        {money(pricing!.seat_prices[r], lang, currency)} <span className="font-normal text-muted">{t.pricing.perMonth}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {addons.length > 0 && (
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="text-lg font-extrabold text-onSurface">{t.pricing.addonsTitle}</h3>
                <p className="mt-1 text-sm text-muted">{t.pricing.addonsText}</p>
                <ul className="mt-4 grid gap-2 text-sm">
                  {addons.map(([key, price]) => (
                    <li key={key} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="text-onSurfaceSecondary">{t.moduleNames[key]?.title ?? key}</span>
                      <span className="font-semibold text-onSurface">
                        {money(price, lang, currency)} <span className="font-normal text-muted">{t.pricing.perMonth}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <ul className="mt-8 grid gap-2 text-sm text-onSurfaceSecondary">
          {pricing?.first_month_free && (
            <li className="flex items-start gap-2">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {t.pricing.firstFree}
            </li>
          )}
          <li className="flex items-start gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {t.pricing.prepaid}
          </li>
          <li className="flex items-start gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {t.pricing.vat}
          </li>
        </ul>
      </div>
    </section>
  );
}
