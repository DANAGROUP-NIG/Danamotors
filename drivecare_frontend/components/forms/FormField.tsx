import type { ReactNode } from "react";

export const inputCls =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}
