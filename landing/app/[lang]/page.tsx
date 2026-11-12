import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContactForm } from "@/components/ContactForm";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Pricing } from "@/components/Pricing";
import { Browser, Phone } from "@/components/Screen";
import { getContact, getPricing } from "@/lib/api";
import { DICTS, MODULE_ORDER, isLang, money } from "@/lib/i18n";

// Static page, re-rendered in the background at most every minute with fresh prices and contacts.
export const revalidate = 60;

const PROBLEM_ICONS = ["phone", "keyboard", "box", "eyeOff"];
const FLOW_ICONS = ["user", "warehouse", "file"];

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const t = DICTS[lang];
  const [pricing, contact] = await Promise.all([getPricing(), getContact()]);
  const modulePrices = pricing?.module_prices ?? {};

  return (
    <>
      <Header t={t} lang={lang} />
      <main>
        {/* Hero */}
        <section className="overflow-hidden bg-brand text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-accent">{t.hero.kicker}</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight md:text-5xl">{t.hero.title}</h1>
              <p className="mt-5 max-w-xl text-lg text-white/80">{t.hero.text}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#kontakt" className="rounded-md bg-accent px-5 py-3 text-sm font-bold text-onSurface hover:brightness-95">
                  {t.hero.cta}
                </a>
                <a href="#cenovnik" className="rounded-md border border-white/40 px-5 py-3 text-sm font-bold hover:bg-white/10">
                  {t.hero.secondary}
                </a>
              </div>
              {pricing?.first_month_free && <p className="mt-4 text-sm text-white/70">{t.hero.note}</p>}
            </div>
            <div className="relative mx-auto w-56 md:w-64">
              <div className="absolute -inset-10 rounded-full bg-brandMid/60 blur-2xl" aria-hidden="true" />
              <Phone src="/screens/katalog.webp" alt={t.hero.alt} className="relative" />
            </div>
          </div>
        </section>

        {/* Problems */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.problems.title}</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {t.problems.items.map((p, i) => (
                <div key={p.title} className="rounded-lg bg-surface p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#B85042] text-white">
                    <Icon name={PROBLEM_ICONS[i]} />
                  </span>
                  <h3 className="mt-4 font-bold text-onSurface">{p.title}</h3>
                  <p className="mt-1 text-sm text-onSurfaceSecondary">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Flow */}
        <section className="bg-brandSecondary py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.flow.title}</h2>
            <p className="mt-3 text-onSurfaceSecondary">{t.flow.text}</p>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {t.flow.steps.map((s, i) => (
                <li key={s.title} className="relative rounded-lg bg-white p-6 shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white">
                    <Icon name={FLOW_ICONS[i]} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-onSurface">
                    {i + 1}. {s.title}
                  </h3>
                  <p className="mt-1 text-sm text-onSurfaceSecondary">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Roles */}
        <section id="funkcije" className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.roles.title}</h2>
            <div className="mt-12 grid gap-20">
              {t.roles.items.map((r, i) => (
                <div key={r.key} className={`grid items-center gap-10 ${r.wide ? "md:grid-cols-[1fr_1.4fr]" : "md:grid-cols-2"}`}>
                  <div className={i % 2 === 1 ? "md:order-2" : ""}>
                    <h3 className="text-2xl font-extrabold text-onSurface">{r.title}</h3>
                    <p className="mt-2 text-lg text-onSurfaceSecondary">{r.lead}</p>
                    <ul className="mt-6 grid gap-3">
                      {r.points.map((p) => (
                        <li key={p} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brandSecondary text-brand">
                            <Icon name="check" className="h-4 w-4" />
                          </span>
                          <span className="text-onSurfaceSecondary">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={i % 2 === 1 ? "md:order-1" : ""}>
                    {r.wide ? (
                      <Browser src={r.image} alt={r.alt} />
                    ) : (
                      <Phone src={r.image} alt={r.alt} height={r.key === "warehouse" ? 1286 : 1720} className="mx-auto w-56 md:w-64" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Modules */}
        <section id="moduli" className="bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.modules.title}</h2>
            <p className="mt-3 max-w-2xl text-onSurfaceSecondary">{t.modules.text}</p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-brand p-6 text-white">
                <h3 className="text-lg font-bold">{t.modules.base}</h3>
                <p className="mt-1 text-sm text-white/80">{t.modules.baseText}</p>
              </div>
              {MODULE_ORDER.map((m) => (
                <div key={m.key} className="rounded-lg bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-onSurface">{t.moduleNames[m.key].title}</h3>
                    {m.addon && <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-bold uppercase text-onSurface">{t.modules.addon}</span>}
                  </div>
                  <p className="mt-1 text-sm text-onSurfaceSecondary">{t.moduleNames[m.key].text}</p>
                  {m.requires && (
                    <p className="mt-2 text-xs text-muted">
                      {t.modules.requires} {t.moduleNames[m.requires].title}
                    </p>
                  )}
                  {m.addon && modulePrices[m.key] ? (
                    <p className="mt-3 text-sm font-semibold text-brand">
                      {money(modulePrices[m.key], lang, pricing?.currency)} {t.modules.perMonth}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <Pricing pricing={pricing} t={t} lang={lang} />

        {/* Getting started */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.start.title}</h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {t.start.steps.map((s, i) => (
                <li key={s.title}>
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-extrabold ${i === t.start.steps.length - 1 ? "bg-accent text-onSurface" : "bg-brand text-white"}`}>
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-onSurface">{s.title}</h3>
                  <p className="mt-1 text-sm text-onSurfaceSecondary">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-surface py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.faq.title}</h2>
            <div className="mt-8 grid gap-3">
              {t.faq.items.map((q) => (
                <details key={q.title} className="group rounded-lg bg-white p-5 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-onSurface">
                    {q.title}
                    <Icon name="chevron" className="h-5 w-5 shrink-0 text-muted transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-onSurfaceSecondary">{q.text}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="kontakt" className="py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="text-3xl font-extrabold text-brand md:text-4xl">{t.contact.title}</h2>
              <p className="mt-3 text-onSurfaceSecondary">{t.contact.text}</p>
              <ul className="mt-8 grid gap-5">
                {contact?.phone && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brandSecondary text-brand"><Icon name="phone" className="h-5 w-5" /></span>
                    <span>
                      <span className="block text-xs font-semibold uppercase text-muted">{t.contact.phone}</span>
                      <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className="font-semibold text-onSurface hover:text-brand">{contact.phone}</a>
                    </span>
                  </li>
                )}
                {contact?.email && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brandSecondary text-brand"><Icon name="mail" className="h-5 w-5" /></span>
                    <span>
                      <span className="block text-xs font-semibold uppercase text-muted">{t.contact.email}</span>
                      <a href={`mailto:${contact.email}`} className="font-semibold text-onSurface hover:text-brand">{contact.email}</a>
                    </span>
                  </li>
                )}
                {contact?.address && (
                  <li className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brandSecondary text-brand"><Icon name="pin" className="h-5 w-5" /></span>
                    <span>
                      <span className="block text-xs font-semibold uppercase text-muted">{t.contact.address}</span>
                      <span className="font-semibold text-onSurface">{contact.address}</span>
                    </span>
                  </li>
                )}
              </ul>
            </div>
            <div className="relative rounded-lg border border-border bg-white p-6 shadow-sm md:p-8">
              <h3 className="mb-5 text-xl font-extrabold text-onSurface">{t.contact.formTitle}</h3>
              <Suspense fallback={null}>
                <ContactForm t={t} lang={lang} plans={(pricing?.plans ?? []).map((p) => p.name)} />
              </Suspense>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-brandDark py-10 text-sm text-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <p>
            © {new Date().getFullYear()} Easy Order. {t.footer.rights}
          </p>
          {process.env.NEXT_PUBLIC_PORTAL_URL && (
            <a href={process.env.NEXT_PUBLIC_PORTAL_URL} className="hover:text-white">
              {t.footer.portal}
            </a>
          )}
        </div>
      </footer>
    </>
  );
}
