import { useAuth } from "@/features/auth/hooks/use-auth";

//components
import HeaderSearch from "./HeaderSearch";

//icons
import { Menu, Search, Bell, MessageSquare, ChevronDown } from "lucide-react";

type mainHeaderProbs = {
  setSidebarOpen: (v: boolean) => void;
};

export default function MainHeader({ setSidebarOpen }: mainHeaderProbs) {
  const { user, isHydrated, isSuperAdmin, isAdminOrAbove, hasAccess } =
    useAuth();

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e8edf3] bg-white px-4 lg:px-6">
      {/* Mobile hamburger */}
      <button
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      {/* Global search */}
      <HeaderSearch />

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1">
        <button
          className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Notifications"
        >
          <Bell className="size-[18px]" />
          <span
            className="absolute right-1.5 top-1.5 flex size-2"
            aria-hidden="true"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
        </button>

        <button
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Messages"
        >
          <MessageSquare className="size-[18px]" />
        </button>

        <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-100"
          aria-label="Account menu"
        >
          <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
            {initials}
          </span>
          <span className="hidden text-sm font-semibold text-slate-700 lg:block">
            {user?.firstName} {user?.lastName}
          </span>
          <ChevronDown className="hidden size-3.5 text-slate-400 lg:block" />
        </button>
      </div>
    </header>
  );
}
