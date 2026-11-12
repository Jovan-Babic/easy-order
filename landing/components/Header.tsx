import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Dict, Lang } from "@/lib/i18n";

// Sticky top bar. Below md the links fold into a <details> menu (works without JavaScript).
export function Header({ t, lang }: { t: Dict; lang: Lang }) {
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL;
  const links = [
    { href: "#funkcije", label: t.nav.features },
    { href: "#moduli", label: t.nav.modules },
    { href: "#cenovnik", label: t.nav.pricing },
    { href: "#kontakt", label: t.nav.contact },
  ];
  const other = lang === "sr" ? "/en" : "/";
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-brand/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={lang === "sr" ? "/" : "/en"} className="flex items-center gap-2 font-extrabold">
          <Image src="/icon-512.png" alt="" width={32} height={32} className="rounded-md" />
          Easy Order
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-white/85 hover:text-white">
              {l.label}
            </a>
          ))}
          <Link href={other} hrefLang={lang === "sr" ? "en" : "sr"} aria-label={t.nav.otherLabel} className="text-white/85 hover:text-white">
            {t.nav.other}
          </Link>
          {portal && (
            <a href={portal} className="rounded-md border border-white/40 px-3 py-1.5 hover:bg-white/10">
              {t.nav.login}
            </a>
          )}
        </nav>
        <details className="relative md:hidden">
          <summary className="flex cursor-pointer list-none items-center rounded-md p-2 hover:bg-white/10" aria-label="Menu">
            <Icon name="menu" />
          </summary>
          <div className="absolute right-0 mt-2 grid w-56 gap-1 rounded-md bg-white p-2 text-sm font-semibold text-onSurface shadow-xl">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="rounded px-3 py-2 hover:bg-surface">
                {l.label}
              </a>
            ))}
            <Link href={other} className="rounded px-3 py-2 hover:bg-surface">
              {t.nav.otherLabel}
            </Link>
            {portal && (
              <a href={portal} className="rounded px-3 py-2 hover:bg-surface">
                {t.nav.login}
              </a>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}
