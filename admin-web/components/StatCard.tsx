// A long value (a big amount) gets smaller type instead of running out of the card.
function sizeFor(text: string) {
  if (text.length > 18) return "text-base";
  if (text.length > 14) return "text-lg";
  if (text.length > 10) return "text-xl";
  return "text-2xl";
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  const text = String(value);
  return (
    <div className="min-w-0 rounded-lg bg-surfaceSecondary p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className={`mt-1 break-words font-extrabold text-onSurface ${sizeFor(text)}`} title={text}>
        {text}
      </p>
    </div>
  );
}
