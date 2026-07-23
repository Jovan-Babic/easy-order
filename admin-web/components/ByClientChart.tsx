"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ClientStats = {
  client_id: string;
  client_name: string;
  order_count: number;
  total_grand: number;
};

export function ByClientChart({ rows }: { rows: ClientStats[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="client_name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="total_grand" name="Revenue" fill="#1A4D2E" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
