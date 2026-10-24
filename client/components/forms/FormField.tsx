import type { ReactNode } from "react";

export const inputCls =
  "h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, error, required, children }: FieldProps) {
  return (
    <label className="grid gap-1.5 min-w-0">
      <span className="text-sm font-semibold">{label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}</span>
      {children}
      {error && <span className="text-sm text-red-500">{error}</span>}
    </label>
  );
}
