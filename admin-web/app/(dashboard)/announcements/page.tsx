"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal, input, link, primary, secondary, useSubmit } from "@/components/SubscriptionDialogs";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { detailOf } from "@/lib/subscriptions";

type Announcement = {
  id: string;
  message_sr: string;
  message_en: string;
  level: "info" | "warning";
  starts_at: string | null;
  ends_at: string | null;
  client_ids: string[];
  active: boolean;
  status: "live" | "scheduled" | "ended" | "off";
};
type ClientOption = { id: string; name: string };

const STATUS_KEYS: Record<Announcement["status"], TranslationKey> = {
  live: "annStatusLive",
  scheduled: "annStatusScheduled",
  ended: "annStatusEnded",
  off: "annStatusOff",
};
const STATUS_STYLES: Record<Announcement["status"], string> = {
  live: "bg-brandSecondary text-success",
  scheduled: "bg-amber-100 text-warning",
  ended: "bg-surfaceTertiary text-muted",
  off: "bg-surfaceTertiary text-muted",
};

// Messages shown to clients' users as a bar in the portal and the mobile app.
export default function AnnouncementsPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Announcement[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([fetch("/api/announcements"), fetch("/api/clients")]);
    if (!a.ok) {
      setError(await detailOf(a, t("loadFailed")));
      setLoading(false);
      return;
    }
    setItems(await a.json());
    if (c.ok) setClients(await c.json());
    setError(null);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/announcements/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) setError(await detailOf(res, t("deleteFailed")));
    else await load();
  };

  const audience = (a: Announcement) =>
    a.client_ids.length === 0
      ? t("annAllClients")
      : a.client_ids.map((id) => clients.find((c) => c.id === id)?.name ?? id).join(", ");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("announcements")}</h1>
        <button className={primary} onClick={() => setEditing("new")}>
          {t("newAnnouncement")}
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-onSurface">{a.message_sr || a.message_en}</p>
                    {a.message_sr && a.message_en && <p className="text-xs text-muted">{a.message_en}</p>}
                    <p className="mt-1 text-xs text-muted">
                      {audience(a)}
                      {a.starts_at ? ` · ${t("annStarts")} ${a.starts_at}` : ""}
                      {a.ends_at ? ` · ${t("annEnds")} ${a.ends_at}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[a.status]}`}>
                      {t(STATUS_KEYS[a.status])}
                    </span>
                    {a.level === "warning" && <span className="ml-2 text-xs font-bold text-warning">{t("annLevelWarning")}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className={`${link} mr-3`} onClick={() => setEditing(a)}>
                      {t("edit")}
                    </button>
                    <button className="font-semibold text-error hover:underline" onClick={() => setPendingDelete(a)}>
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted">{t("annNone")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <AnnouncementDialog
          item={editing === "new" ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog itemName={pendingDelete.message_sr || pendingDelete.message_en} onCancel={() => setPendingDelete(null)} onConfirm={remove} />
      )}
    </div>
  );
}

function AnnouncementDialog({
  item,
  clients,
  onClose,
  onDone,
}: {
  item: Announcement | null;
  clients: ClientOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [sr, setSr] = useState(item?.message_sr ?? "");
  const [en, setEn] = useState(item?.message_en ?? "");
  const [level, setLevel] = useState<"info" | "warning">(item?.level ?? "info");
  const [starts, setStarts] = useState(item?.starts_at ?? "");
  const [ends, setEnds] = useState(item?.ends_at ?? "");
  const [selected, setSelected] = useState<string[]>(item?.client_ids ?? []);
  const [onlySelected, setOnlySelected] = useState((item?.client_ids ?? []).length > 0);
  const [active, setActive] = useState(item?.active ?? true);
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={item ? t("editAnnouncement") : t("newAnnouncement")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(item ? `/api/announcements/${item.id}` : "/api/announcements", item ? "PUT" : "POST", {
            message_sr: sr,
            message_en: en,
            level,
            starts_at: starts || null,
            ends_at: ends || null,
            client_ids: onlySelected ? selected : [],
            active,
          });
        }}
      >
        <p className="text-xs text-muted">{t("annHint")}</p>
        <label className="text-sm font-semibold text-onSurface">
          {t("annMessageSr")}
          <textarea rows={2} maxLength={500} value={sr} onChange={(e) => setSr(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("annMessageEn")}
          <textarea rows={2} maxLength={500} value={en} onChange={(e) => setEn(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("annLevel")}
          <select value={level} onChange={(e) => setLevel(e.target.value as "info" | "warning")} className={`${input} mt-1`}>
            <option value="info">{t("annLevelInfo")}</option>
            <option value="warning">{t("annLevelWarning")}</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-onSurface">
            {t("annStarts")}
            <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-onSurface">
            {t("annEnds")}
            <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="text-sm font-semibold text-onSurface">
          {t("annAudience")}
          <select value={onlySelected ? "selected" : "all"} onChange={(e) => setOnlySelected(e.target.value === "selected")} className={`${input} mt-1`}>
            <option value="all">{t("annAllClients")}</option>
            <option value="selected">{t("annSelectedClients")}</option>
          </select>
        </label>
        {onlySelected && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("annActive")}
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy || (onlySelected && selected.length === 0)} className={primary}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
