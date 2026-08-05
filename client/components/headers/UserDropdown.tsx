"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { cn } from "@/lib/utils";
import { ChevronDown, User, Settings, LogOut } from "lucide-react";

export default function UserDropdown() {
  const { user } = useAuth();
  const logout = useLogout();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-100"
        aria-label="Account menu"
      >
        <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden text-sm font-semibold text-slate-700 lg:block">
          {user?.firstName} {user?.lastName}
        </span>
        <ChevronDown
          className={cn(
            "hidden size-3.5 text-slate-400 transition-transform duration-200 lg:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          {/* User info */}
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              <User className="size-4 text-slate-400" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Settings className="size-4 text-slate-400" />
              Settings
            </Link>
          </div>

          <div className="border-t border-slate-100" />

          {/* Logout */}
          <div className="py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout.mutate();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
