"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TranslationKey, useLanguage } from "@/lib/i18n";

type Role = "operator" | "warehouse" | "admin";
type Guide = { role: Role; title: string; version: string; markdown: string; available_roles: Role[] };

const ROLE_KEY: Record<Role, TranslationKey> = {
  operator: "userRoleOperator",
  warehouse: "userRoleWarehouse",
  admin: "userRoleAdmin",
};

const slugOf = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Text of the heading children (React nodes) for the anchor ids.
const plain = (children: React.ReactNode): string =>
  Array.isArray(children) ? children.map(plain).join("") : typeof children === "string" ? children : "";

export default function GuidePage() {
  const { t, lang } = useLanguage();
  const [role, setRole] = useState<Role | "">("");
  const [guide, setGuide] = useState<Guide | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch(`/api/guide${role ? `?role=${role}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((g: Guide) => alive && setGuide(g))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [role]);

  const contents = useMemo(() => (guide?.markdown.match(/^## .+$/gm) ?? []).map((h) => h.replace(/^## /, "").trim()), [guide]);

  if (failed) return <p className="text-muted">{t("guideUnavailable")}</p>;
  if (!guide) return <p className="text-muted">{t("loading")}</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("guide")}</h1>
        {guide.available_roles.length > 1 &&
          guide.available_roles.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${guide.role === r ? "border-brand bg-brand text-white" : "border-border bg-surfaceSecondary text-onSurface hover:bg-surfaceTertiary"}`}
            >
              {t(ROLE_KEY[r])}
            </button>
          ))}
        {guide.version && <span className="ml-auto text-xs text-muted">v{guide.version}</span>}
      </div>
      {lang === "en" && <p className="mb-3 text-sm font-semibold text-warning">{t("guideSerbianOnly")}</p>}

      <nav className="mb-6 rounded-lg bg-surfaceSecondary p-4 shadow-sm">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t("guideContents")}</p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {contents.map((c) => (
            <li key={c}>
              <a href={`#${slugOf(c)}`} className="text-sm font-semibold text-brand hover:underline">{c}</a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-3 text-3xl font-extrabold text-brand">{children}</h1>,
            h2: ({ children }) => (
              <h2 id={slugOf(plain(children))} className="mb-3 mt-10 scroll-mt-4 border-b-2 border-brandSecondary pb-1 text-xl font-extrabold text-brand">{children}</h2>
            ),
            h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-bold text-onSurface">{children}</h3>,
            p: ({ children }) => <p className="my-3 leading-relaxed text-onSurface">{children}</p>,
            ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
            ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
            blockquote: ({ children }) => <blockquote className="my-4 rounded-md border-l-4 border-orange-500 bg-orange-50 px-4 py-1">{children}</blockquote>,
            hr: () => <hr className="my-6 border-border" />,
            code: ({ children }) => <code className="rounded bg-surfaceTertiary px-1 text-sm">{children}</code>,
            table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
            th: ({ children }) => <th className="border border-border bg-brandSecondary px-3 py-2">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
            // A screenshot opens in a new tab at full size.
            img: ({ src, alt }) => (
              <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer" className="my-4 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" className="mx-auto max-h-[560px] max-w-full rounded-lg border border-border" />
              </a>
            ),
          }}
        >
          {guide.markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
