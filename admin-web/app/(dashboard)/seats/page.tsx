"use client";

import { useEffect, useState } from "react";
import { SeatsSummary } from "@/components/SeatsPanel";
import { useLanguage } from "@/lib/i18n";
import { SeatsOut } from "@/lib/seats";
import { detailOf } from "@/lib/subscriptions";

// The client admin's view: accounts used / allowed and the monthly amount.
export default function SeatsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<SeatsOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/my-seats").then(async (res) => {
      if (res.ok) setData(await res.json());
      else setError(await detailOf(res, t("loadFailed")));
    });
  }, [t]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("seatsTitle")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("seatsClientHint")}</p>
      {error ? <p className="text-error">{error}</p> : data ? <SeatsSummary data={data} /> : <p className="text-muted">{t("loading")}</p>}
    </div>
  );
}
