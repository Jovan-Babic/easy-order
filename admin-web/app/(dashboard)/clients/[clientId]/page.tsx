import { notFound } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { ClientDetailTabs } from "@/components/ClientDetailTabs";

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

      <ClientDetailTabs client={client} stats={stats} />
    </div>
  );
}
