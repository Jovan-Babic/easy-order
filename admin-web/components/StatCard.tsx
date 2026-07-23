export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surfaceSecondary p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-onSurface">{value}</p>
    </div>
  );
}
