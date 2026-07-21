"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Car,
  CalendarDays,
  ClipboardList,
  ShieldCheck,
  UserCog,
  Package,
  FileText,
  ReceiptText,
  BarChart2,
  Wrench,
  Settings,
  Bell,
  MessageSquare,
  Search,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useAuth, type AppRole } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  roles?: AppRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  roles?: AppRole[];
}

// ─── Nav structure ─────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Customers",
        href: "/customers",
        icon: Users,
        roles: ["admin", "manager", "receptionist"],
      },
      {
        label: "Vehicles",
        href: "/vehicles",
        icon: Car,
        roles: ["admin", "manager", "receptionist", "technician"],
      },
      {
        label: "Appointments",
        href: "/appointments",
        icon: CalendarDays,
        roles: ["admin", "manager", "receptionist"],
      },
    ],
  },
  {
    label: "Workshop",
    roles: ["admin", "manager", "technician", "receptionist"],
    items: [
      {
        label: "Job Cards",
        href: "/job-cards",
        icon: ClipboardList,
        badge: 24,
        roles: ["admin", "manager", "technician", "receptionist"],
      },
      {
        label: "Inspection",
        href: "/inspections",
        icon: ShieldCheck,
        roles: ["admin", "manager", "technician"],
      },
      {
        label: "Repairs",
        href: "/repairs",
        icon: Wrench,
        roles: ["admin", "manager", "technician"],
      },
      {
        label: "Technicians",
        href: "/technicians",
        icon: UserCog,
        roles: ["admin", "manager"],
      },
    ],
  },
  {
    label: "Operations",
    roles: ["admin", "manager", "accountant"],
    items: [
      {
        label: "Inventory",
        href: "/inventory",
        icon: Package,
        roles: ["admin", "manager"],
      },
      {
        label: "Purchasing",
        href: "/purchasing",
        icon: ReceiptText,
        roles: ["admin", "manager", "accountant"],
      },
      {
        label: "Finance",
        href: "/finance",
        icon: BarChart2,
        roles: ["admin", "manager", "accountant"],
      },
      {
        label: "Reports",
        href: "/reports",
        icon: FileText,
        roles: ["admin", "manager", "accountant"],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["admin", "manager"],
      },
      {
        label: "Log out",
        href: "/logout",
        icon: LogOut,
      },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Vehicles",
    href: "/vehicles",
    icon: Car,
    roles: ["admin", "manager", "receptionist", "technician"],
  },
  {
    label: "Book",
    href: "/appointments",
    icon: CalendarDays,
    roles: ["admin", "manager", "receptionist"],
  },
  {
    label: "Jobs",
    href: "/job-cards",
    icon: Bell,
    roles: ["admin", "manager", "technician", "receptionist"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin", "manager"],
  },
];

// ─── Branch Dropdown ───────────────────────────────────────────────────────────

function BranchDropdown({
  branches,
  activeBranch,
  isLoading,
  canSwitch,
  canSeeAll,
  onSelect,
  onAllSelect,
}: {
  branches: { id: string; name: string }[];
  activeBranch: { id: string; name: string } | null;
  isLoading: boolean;
  canSwitch: boolean;
  canSeeAll: boolean;
  onSelect: (branch: { id: string; name: string }) => void;
  onAllSelect: () => void;
}) {
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

  const isAll = canSeeAll && activeBranch === null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((v) => !v)}
        disabled={!canSwitch || isLoading}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5",
          "transition-all duration-150",
          canSwitch
            ? "bg-white/10 hover:bg-white/15 cursor-pointer"
            : "bg-white/5 cursor-default",
        )}
      >
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
          <Building2 className="size-3.5 text-white/60" />
        </span>
        <div className="min-w-0 flex-1 text-left">
          {isLoading ? (
            <div className="h-3.5 w-20 animate-pulse rounded bg-white/10" />
          ) : (
            <>
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-white/40">
                Branch
              </p>
              <p className="truncate text-sm font-semibold text-white">
                {isAll
                  ? "All Branches"
                  : activeBranch?.name ?? branches[0]?.name ?? "No branch"}
              </p>
            </>
          )}
        </div>
        {canSwitch && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-white/40 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && canSwitch && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c1e2e] shadow-2xl shadow-black/40">
          {canSeeAll && (
            <button
              type="button"
              onClick={() => {
                onAllSelect();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                isAll
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold text-white/60">
                All
              </span>
              <span className="text-sm font-medium">All Branches</span>
              {isAll && (
                <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          )}
          {canSeeAll && branches.length > 0 && (
            <div className="mx-3 border-t border-white/5" />
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {branches.map((b) => {
              const isActive = activeBranch?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onSelect(b);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white/60">
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium">{b.name}</span>
                  {isActive && (
                    <span className="ml-auto size-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
          {branches.length === 0 && !isLoading && (
            <p className="px-4 py-3 text-center text-xs text-white/40">
              No branches available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const COLLAPSED_KEY = "drivecare-sidebar-collapsed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const logout = useLogout();
  const { user, isHydrated, isSuperAdmin, isAdminOrAbove, hasAccess } = useAuth();

  // Mobile drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Desktop collapsed state — persisted
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  // Branch store — fetch for all users so everyone sees the current branch
  useFetchBranches(true);
  const {
    branches,
    activeBranch,
    setActiveBranch,
    isLoading: branchLoading,
    isFetched: branchesFetched,
  } = useBranchStore();

  // For non-SuperAdmin: lock activeBranch to the user's assigned branch
  useEffect(() => {
    if (isAdminOrAbove || !branchesFetched || branches.length === 0) return;

    const userBranchId = user?.branchId;
    if (!userBranchId) return;

    // Only update if the current activeBranch doesn't match
    if (activeBranch?.id === userBranchId) return;

    const userBranch = branches.find((b) => b.id === userBranchId);
    if (userBranch) {
      setActiveBranch(userBranch);
    }
  }, [isAdminOrAbove, branchesFetched, branches, user?.branchId, activeBranch?.id, setActiveBranch]);

  function NavTooltip({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    return (
      <div
        ref={ref}
        className="relative"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
        {visible && (
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 ml-3",
              "whitespace-nowrap rounded-md bg-[#0d2a3d] px-2.5 py-1.5",
              "text-xs font-medium text-white shadow-lg",
              // small left arrow
              "before:absolute before:-left-1.5 before:top-1/2 before:-translate-y-1/2",
              "before:border-4 before:border-transparent before:border-r-[#0d2a3d]",
            )}
          >
            {label}
          </div>
        )}
      </div>
    );
  }

  // ─── Skeleton ─────────────────────────────────────────────────────────────────

  function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
    if (collapsed) {
      return (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="mx-auto h-9 w-9 animate-pulse rounded-lg bg-white/10"
            />
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        {[4, 4, 4, 1].map((count, gi) => (
          <div key={gi}>
            <div className="mb-1.5 mx-2 h-2 w-12 animate-pulse rounded bg-white/10" />
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-lg bg-white/10"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Tooltip (shown on collapsed icon-only items) ─────────────────────────────

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : "?";

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f4f8]">
      {/* ── Mobile backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={cn(
          // base
          "fixed inset-y-0 left-0 z-40 flex flex-col",
          "border-r border-white/10",
          "transition-all duration-300 ease-in-out",
          // desktop: always visible, width driven by collapsed
          "lg:relative lg:translate-x-0 lg:z-auto",
          collapsed ? "lg:w-[60px]" : "lg:w-[220px]",
          // mobile: fixed width, slides in/out
          "w-[220px]",
          sidebarOpen
            ? "translate-x-0 shadow-xl"
            : "-translate-x-full lg:translate-x-0",
        )}
        style={{ backgroundColor: "#05141F", color: "white" }}
      >
        {/* ── Logo row ──────────────────────────────────────────────── */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-white/10",
            collapsed ? "justify-center px-0" : "px-5",
          )}
        >
          {/* Logo — hidden when collapsed */}
          {!collapsed && (
            <img
              src="/logo.webp"
              alt="Dana Group DriveCare"
              className="h-5 w-auto object-contain brightness-0 invert"
            />
          )}

          {/* Collapse toggle — desktop only */}
          <button
            className={cn(
              "hidden lg:flex items-center justify-center rounded-md p-1.5",
              "text-white/50 hover:bg-white/10 hover:text-white transition-colors",
              !collapsed && "ml-auto",
            )}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>

          {/* Mobile close button */}
          <button
            className="ml-auto rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Nav content ───────────────────────────────────────────── */}
        {!isHydrated ? (
          <SidebarSkeleton collapsed={collapsed} />
        ) : (
          <>
            {/* Branch display — all users see current branch; SuperAdmin can switch */}
            {!collapsed && (
              <div className="shrink-0 px-3 pt-3">
                <BranchDropdown
                  branches={branches}
                  activeBranch={activeBranch}
                  isLoading={branchLoading}
                  canSwitch={isAdminOrAbove}
                  canSeeAll={isSuperAdmin}
                  onSelect={(b) => setActiveBranch(b)}
                  onAllSelect={() => setActiveBranch(null as any)}
                />
              </div>
            )}

            {/* Branch icon-only when collapsed */}
            {collapsed && (
              <div className="shrink-0 flex justify-center pt-3">
                <NavTooltip label={activeBranch?.name ?? "All Branches"}>
                  <span className="inline-grid size-9 place-items-center rounded-lg bg-white/10 text-white/50">
                    <Building2 className="size-4" />
                  </span>
                </NavTooltip>
              </div>
            )}

            <nav
              className={cn(
                "flex flex-1 flex-col overflow-y-auto py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                collapsed ? "items-center gap-1 px-2" : "gap-5 px-3",
              )}
              aria-label="Main navigation"
            >
              {NAV_GROUPS.filter((group) => hasAccess(group.roles ?? [])).map(
                (group) => {
                  const visibleItems = group.items.filter((item) =>
                    hasAccess(item.roles ?? []),
                  );
                  if (visibleItems.length === 0) return null;

                  return (
                    <div
                      key={group.label}
                      className={cn(
                        "w-full",
                        collapsed && "flex flex-col items-center gap-1",
                      )}
                    >
                      {/* Group label — hidden when collapsed */}
                      {!collapsed && (
                        <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                          {group.label}
                        </p>
                      )}

                      {/* Divider between groups when collapsed */}
                      {collapsed && (
                        <div className="my-1 w-8 border-t border-white/10" />
                      )}

                      <div
                        className={cn(
                          "flex flex-col gap-0.5 w-full",
                          collapsed && "items-center",
                        )}
                      >
                        {visibleItems.map(
                          ({ label, href, icon: Icon, badge }) => {
                            const active = href !== "/logout" && isActive(href);
                            const isLogout = href === "/logout";

                            if (collapsed) {
                              return (
                                <NavTooltip key={href} label={label}>
                                  {isLogout ? (
                                    <button
                                      onClick={() => logout.mutate()}
                                      disabled={logout.isPending}
                                      aria-label={label}
                                      className="relative flex size-9 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                                    >
                                      <Icon className="size-[17px] shrink-0" />
                                    </button>
                                  ) : (
                                    <Link
                                      href={href}
                                      onClick={() => setSidebarOpen(false)}
                                      aria-current={active ? "page" : undefined}
                                      aria-label={label}
                                      className={cn(
                                        "relative flex size-9 items-center justify-center rounded-lg transition-colors",
                                        active
                                          ? "bg-white/15 text-white"
                                          : "text-white/70 hover:bg-white/10 hover:text-white",
                                      )}
                                    >
                                      <Icon className="size-[17px] shrink-0" />
                                      {badge != null && (
                                        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white ring-2 ring-[#05141F]">
                                          {badge > 9 ? "9+" : badge}
                                        </span>
                                      )}
                                    </Link>
                                  )}
                                </NavTooltip>
                              );
                            }

                            if (isLogout) {
                              return (
                                <button
                                  key={href}
                                  onClick={() => logout.mutate()}
                                  disabled={logout.isPending}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                                    "text-red-400 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50",
                                  )}
                                >
                                  <Icon className="size-[17px] shrink-0" />
                                  <span className="flex-1 truncate text-left">
                                    {logout.isPending ? "Logging out…" : label}
                                  </span>
                                </button>
                              );
                            }

                            return (
                              <Link
                                key={href}
                                href={href}
                                onClick={() => setSidebarOpen(false)}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                  active
                                    ? "bg-white/15 text-white"
                                    : "text-white/70 hover:bg-white/10 hover:text-white",
                                )}
                              >
                                <Icon className="size-[17px] shrink-0" />
                                <span className="flex-1 truncate">{label}</span>
                                {badge != null && (
                                  <span
                                    className={cn(
                                      "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none",
                                      active
                                        ? "bg-white/20 text-white"
                                        : "bg-white/10 text-white/70",
                                    )}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </Link>
                            );
                          },
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </nav>
          </>
        )}

        {/* ── User card ────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/10 p-3">
          {!isHydrated ? (
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg p-2",
                collapsed && "justify-center",
              )}
            >
              <div className="size-9 animate-pulse rounded-full bg-white/10 shrink-0" />
              {!collapsed && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                  <div className="h-2.5 w-16 animate-pulse rounded bg-white/10" />
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2",
                collapsed && "justify-center",
              )}
            >
              <span className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white">
                {initials}
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs capitalize text-white/50">
                    {user?.role ?? "Workshop Manager"}
                  </p>
                </div>
              )}
              {!collapsed && (
                <span
                  className="size-2 shrink-0 rounded-full bg-emerald-400"
                  aria-label="Online"
                />
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right column ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f0f4f8] text-[#0f172a]">
        {/* ── Top header ──────────────────────────────────────────── */}
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
          <div className="relative mx-auto hidden max-w-sm flex-1 sm:block lg:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-9 w-full rounded-lg border border-[#e8edf3] bg-[#f8fafc] pl-9 pr-16 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Search customers, vehicles, job cards…"
              aria-label="Global search"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              ⌘ K
            </kbd>
          </div>

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

        {/* ── Page content ────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" id="main-content">
          {children}
        </main>

        {/* ── Mobile bottom nav ───────────────────────────────────── */}
        <nav
          className="flex h-16 shrink-0 items-center justify-around border-t border-[#e8edf3] bg-white px-2 lg:hidden"
          aria-label="Mobile navigation"
        >
          {BOTTOM_NAV.filter((item) => hasAccess(item.roles ?? [])).map(
            ({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-slate-400",
                  )}
                >
                  <Icon className={cn("size-5", active && "stroke-[2.5px]")} />
                  {label}
                </Link>
              );
            },
          )}
        </nav>
      </div>
    </div>
  );
}
