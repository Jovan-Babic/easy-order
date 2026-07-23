import { backendFetch } from "@/lib/backend";

type Order = {
  id: string;
  customer_name: string;
  items: { name: string; ordered_qty: number }[];
  created_at: string;
};

export default async function OrdersPage() {
  const res = await backendFetch("/orders");
  const orders: Order[] = await res.json();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">Orders</h1>
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">{o.customer_name}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{o.items.length}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">
                  {new Date(o.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
