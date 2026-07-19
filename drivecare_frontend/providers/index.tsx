"use client";

import { AuthProvider } from "./authProvider";
import { QueryProvider } from "./queryProvider";
import { ToastProvider } from "./toastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        {children}
        <ToastProvider />
      </AuthProvider>
    </QueryProvider>
  );
}
