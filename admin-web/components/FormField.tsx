// A label above an input / select, so a filled-in form still says what each
// value is (a placeholder disappears once there is a value).
export const fieldLabel = "block text-sm font-semibold text-onSurfaceSecondary";
export const fieldInput = "mt-1 block w-full rounded-md border border-border px-3 py-2 font-normal text-onSurface";

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`${fieldLabel} ${className}`}>
      {label}
      {children}
    </label>
  );
}

// For a group of controls (e.g. country code + number) under one label.
export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={fieldLabel}>{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
