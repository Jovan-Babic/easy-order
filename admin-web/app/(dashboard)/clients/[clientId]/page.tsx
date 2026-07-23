import { notFound } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { StatCard } from "@/components/StatCard";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [clientRes, statsRes] = await Promise.all([
    backendFetch(`/clients/${clientId}`),
    backendFetch(`/stats/clients/${clientId}`),
  ]);

  if (!clientRes.ok) notFound();

  const client = await clientRes.json();
  const stats = statsRes.ok ? await statsRes.json() : null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-onSurface">{client.name}</h1>
      <p className="mb-6 text-sm text-muted">{client.email || "No contact email"}</p>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Orders" value={stats.order_count} />
          <StatCard label="Customers" value={stats.customer_count} />
          <StatCard label="Products" value={stats.product_count} />
          <StatCard label="Revenue (incl. VAT)" value={stats.total_grand.toFixed(2)} />
        </div>
      )}
    </div>
  );
}
