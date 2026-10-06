"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

type Row = { row: number; name: string; barcode: string | null; action: "create" | "update" | "error"; errors: string[] };
type Result = { dry_run: boolean; summary: { create: number; update: number; error: number }; rows: Row[] };

type Props = {
  clients: { id: string; name: string }[];
  isSuperAdmin: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function ProductImportModal({ clients, isSuperAdmin, onClose, onImported }: Props) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({ dry_run: String(dryRun) });
      if (isSuperAdmin && clientId) params.set("client_id", clientId);
      const res = await fetch(`/api/products/import?${params}`, { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.detail || t("importFailed"));
        return;
      }
      if (dryRun) setPreview(body);
      else {
        setDone(body);
        onImported();
      }
    } catch {
      setError(t("importFailed"));
    } finally {
      setBusy(false);
    }
  };

  const result = done || preview;
  const actionLabel = (a: Row["action"]) => (a === "create" ? t("importCreate") : a === "update" ? t("importUpdate") : t("importError"));

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 sm:p-6">
      <div className="mx-auto mt-6 w-full max-w-3xl rounded-2xl bg-surfaceSecondary p-6 shadow-xl sm:mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-onSurface">{t("importProducts")}</h2>
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surface">
            {t("close")}
          </button>
        </div>

        {!done && (
          <div className="grid gap-3">
            <p className="text-sm text-onSurfaceSecondary">{t("importHelp")}</p>
            <a href="/api/products/import-template" className="text-sm font-semibold text-brand hover:underline">
              {t("importTemplate")}
            </a>
            {isSuperAdmin && (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="text-sm"
            />
            <div>
              <button
                onClick={() => send(true)}
                disabled={!file || busy || (isSuperAdmin && !clientId)}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurface disabled:opacity-50"
              >
                {busy && !preview ? t("loading") : t("importPreview")}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-error">{error}</p>}

        {result && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-onSurface">
              {done ? t("importDone") : t("importPreview")}: {t("importCreate")} {result.summary.create} · {t("importUpdate")}{" "}
              {result.summary.update} · {t("importError")} {result.summary.error}
            </p>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surfaceSecondary text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">{t("name")}</th>
                    <th className="px-3 py-2">{t("barcode")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.row} className="border-t border-border">
                      <td className="px-3 py-2 text-muted">{r.row}</td>
                      <td className="px-3 py-2">{r.name || "-"}</td>
                      <td className="px-3 py-2 text-onSurfaceSecondary">{r.barcode || "-"}</td>
                      <td className={`px-3 py-2 ${r.action === "error" ? "text-error" : "text-onSurfaceSecondary"}`}>
                        {actionLabel(r.action)}
                        {r.errors.length > 0 && <div className="text-xs">{r.errors.join("; ")}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!done && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => send(false)}
                  disabled={busy || result.summary.create + result.summary.update === 0}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
                >
                  {busy ? t("saving") : t("importConfirm")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
