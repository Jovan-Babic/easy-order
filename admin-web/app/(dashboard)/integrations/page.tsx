"use client";

import { useEffect, useState } from "react";
import { SefIntegration } from "@/components/SefIntegration";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";

// One place for every integration of the company (SEF now; an ERP export and others later): a tab each,
// shown only when the client has the module behind it. A superadmin picks the client first.
const TABS: Array<{ key: string; labelKey: TranslationKey; module: string }> = [{ key: "sef", labelKey: "integrationSef", module: "sef" }];

type ClientRow = { id: string; name: string; modules?: string[] };

export default function IntegrationsPage() {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [tab, setTab] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: ClientRow[]) => setClients(rows))
      .catch(() => setClients([]));
  }, [isSuperAdmin]);

  const modules = isSuperAdmin ? (clients.find((c) => c.id === clientId)?.modules ?? []) : session.modules;
  const tabs = TABS.filter((x) => modules.includes(x.module));
  const current = tabs.find((x) => x.key === tab) ?? tabs[0];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold text-onSurface">{t("integrations")}</h1>
      {isSuperAdmin && (
        <label className="mb-4 block max-w-sm text-sm font-semibold text-onSurface">
          {t("client")}
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setTab("");
            }}
            className="mt-1 w-full rounded-md border border-border bg-surfaceSecondary px-3 py-2 text-sm"
          >
            <option value="">{t("integrationsPickClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      {(!isSuperAdmin || clientId) &&
        (tabs.length === 0 ? (
          <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <p className="font-semibold text-onSurface">{t("moduleNotEnabled")}</p>
            <p className="mt-1 text-sm text-muted">{t("moduleNotEnabledHint")}</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex gap-1 border-b border-border">
              {tabs.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setTab(x.key)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${current?.key === x.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-onSurface"}`}
                >
                  {t(x.labelKey)}
                </button>
              ))}
            </div>
            {current?.key === "sef" && <SefIntegration clientId={isSuperAdmin ? clientId : undefined} />}
          </>
        ))}
    </div>
  );
}
