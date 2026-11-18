"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";

type ClientStats = {
  client_id: string;
  client_name: string;
  order_count: number;
  total_grand: number;
};

export function ByClientChart({ rows }: { rows: ClientStats[] }) {
  const { t, lang } = useLanguage();
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{t("dashNoData")}</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ left: 4, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="client_name" tick={{ fontSize: 12 }} />
        <YAxis width={72} tick={{ fontSize: 12 }} tickFormatter={(value) => formatMoneyShort(Number(value), lang)} />
        <Tooltip formatter={(value) => [formatMoney(Number(value)), t("dashRevenue")]} />
        <Bar dataKey="total_grand" name={t("dashRevenue")} fill="#1A4D2E" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
