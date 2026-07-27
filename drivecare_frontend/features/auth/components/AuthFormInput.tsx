"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface AuthFormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const AuthFormInput = forwardRef<HTMLInputElement, AuthFormInputProps>(
  ({ label, error, ...props }, ref) => {
    return (
      <label className="grid gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <input
          ref={ref}
          className="h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </label>
    );
  }
);

AuthFormInput.displayName = "AuthFormInput";
