"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, input, link, primary, secondary, useSubmit } from "@/components/SubscriptionDialogs";
import { localizedDetail } from "@/lib/errors";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { Unit, resetUnitsCache } from "@/lib/units";

const GROUP_KEYS: Record<string, TranslationKey> = {
  count: "groupCount",
  mass: "groupMass",
  volume: "groupVolume",
  length: "groupLength",
};

// Superadmin: the global list of units of measure (kom, kg, l, m, ...).
export default function UnitsPage() {
  const { t, lang } = useLanguage();
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ unit: Unit | null } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/units");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(localizedDetail(body.detail, t, t("loadFailed")));
      return;
    }
    setUnits(await res.json());
    setError(null);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("units")}</h1>
        <button className={primary} onClick={() => setDialog({ unit: null })}>
          {t("unitNew")}
        </button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("unitsHint")}</p>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="rtable w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">{t("unitCode")}</th>
              <th className="px-4 py-3">{t("name")}</th>
              <th className="px-4 py-3">{t("unitSymbol")}</th>
              <th className="px-4 py-3">{t("unitGroup")}</th>
              <th className="px-4 py-3 text-right">{t("unitFactor")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.code} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">{u.code}</td>
                <td data-label={t("name")} className="px-4 py-3 text-onSurfaceSecondary">{lang === "en" ? u.name_en : u.name_sr}</td>
                <td data-label={t("unitSymbol")} className="px-4 py-3 text-onSurfaceSecondary">{u.symbol}</td>
                <td data-label={t("unitGroup")} className="px-4 py-3 text-onSurfaceSecondary">{GROUP_KEYS[u.group] ? t(GROUP_KEYS[u.group]) : u.group}</td>
                <td data-label={t("unitFactor")} className="px-4 py-3 text-right text-onSurfaceSecondary">
                  {u.base_code === u.code ? t("unitBaseMark") : `1 ${u.symbol} = ${u.factor.toLocaleString("sr-RS")} ${u.base_code}`}
                </td>
                <td data-label={t("status")} className="px-4 py-3">
                  <span className={u.active ? "text-success" : "text-error"}>{u.active ? t("active") : t("inactive")}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className={link} onClick={() => setDialog({ unit: u })}>
                    {t("edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && (
        <UnitDialog
          unit={dialog.unit}
          units={units}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            resetUnitsCache();
            await load();
          }}
        />
      )}
    </div>
  );
}

function UnitDialog({ unit, units, onClose, onDone }: { unit: Unit | null; units: Unit[]; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [code, setCode] = useState(unit?.code ?? "");
  const [nameSr, setNameSr] = useState(unit?.name_sr ?? "");
  const [nameEn, setNameEn] = useState(unit?.name_en ?? "");
  const [symbol, setSymbol] = useState(unit?.symbol ?? "");
  const [group, setGroup] = useState(unit?.group ?? "mass");
  const [baseCode, setBaseCode] = useState(unit?.base_code ?? "g");
  const [factor, setFactor] = useState(String(unit?.factor ?? 1));
  const [active, setActive] = useState(unit?.active ?? true);
  const { busy, error, send } = useSubmit(onDone);
  const bases = units.filter((u) => u.base_code === u.code && u.group === group);
  const existing = !!unit;
  return (
    <Modal title={existing ? `${t("unitEdit")} · ${unit.code}` : t("unitNew")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body = {
            name_sr: nameSr,
            name_en: nameEn,
            symbol,
            active,
            group,
            base_code: baseCode,
            factor: Number(factor),
          };
          if (existing) send(`/api/units/${unit.code}`, "PUT", body);
          else send("/api/units", "POST", { code, ...body });
        }}
      >
        <p className="text-xs text-muted">{t("unitFormHint")}</p>
        <label className="text-sm font-semibold text-onSurface">
          {t("unitCode")}
          <input required disabled={existing} pattern="[a-z0-9]{1,10}" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} className={`${input} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-onSurface">
            {t("unitNameSr")}
            <input required value={nameSr} onChange={(e) => setNameSr(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-onSurface">
            {t("unitNameEn")}
            <input required value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="text-sm font-semibold text-onSurface">
          {t("unitSymbol")}
          <input required maxLength={10} value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`${input} mt-1`} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm font-semibold text-onSurface">
            {t("unitGroup")}
            <input required pattern="[a-z]{1,20}" list="unit-groups" value={group} onChange={(e) => setGroup(e.target.value.toLowerCase())} className={`${input} mt-1`} />
            <datalist id="unit-groups">
              {Object.keys(GROUP_KEYS).map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label className="text-sm font-semibold text-onSurface">
            {t("unitBase")}
            <input required list="unit-bases" value={baseCode} onChange={(e) => setBaseCode(e.target.value.toLowerCase())} className={`${input} mt-1`} />
            <datalist id="unit-bases">
              {bases.map((b) => (
                <option key={b.code} value={b.code} />
              ))}
              <option value={code} />
            </datalist>
          </label>
          <label className="text-sm font-semibold text-onSurface">
            {t("unitFactor")}
            <input required type="number" min="1" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("active")}
        </label>
        {error && <p className="text-sm text-error">{localizedDetail(error, t, error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy} className={primary}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
