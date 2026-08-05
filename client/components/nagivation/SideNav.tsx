"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

//icons
import { X, ChevronLeft, ChevronRight, Building2 } from "lucide-react";

//store
import { useBranchStore } from "@/store/branch.store";

//utils
import { isActive } from "@/lib/utils";

//hooks
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";

//collapse key
const COLLAPSED_KEY = "drivecare-sidebar-collapsed";

//constans
import { NAV_GROUPS } from "@/constant";

//components
import NavTootip from "./NavTootip";
import HeaderLogo from "../headers/HeaderLogo";
import SidebarSkeleton from "./SidebarSkeleton";
import BranchDropdown from "@/features/branches/components/BranchDropdown";

export default function SideNav({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  const logout = useLogout();
  const { user, isHydrated, isSuperAdmin, isAdminOrAbove, hasAccess } =
    useAuth();
  const pathname = usePathname();

  // Desktop collapsed state — persisted
  const [collapsed, setCollapsed] = useState(false);

  // Sync from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved === "true") setCollapsed(true);
  }, []);

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
    if (isSuperAdmin || !branchesFetched || branches.length === 0) return;

    const userBranchId = user?.branchId;
    if (!userBranchId) return;

    // Only update if the current activeBranch doesn't match
    if (activeBranch?.id === userBranchId) return;

    const userBranch = branches.find((b) => b.id === userBranchId);
    if (userBranch) {
      setActiveBranch(userBranch);
    }
  }, [
    isAdminOrAbove,
    branchesFetched,
    branches,
    user?.branchId,
    activeBranch?.id,
    setActiveBranch,
  ]);

  return (
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
        {!collapsed && <HeaderLogo />}

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
                canSwitch={isSuperAdmin}
                canSeeAll={isSuperAdmin}
                onSelect={(b) => setActiveBranch(b)}
                onAllSelect={() => setActiveBranch(null as any)}
              />
            </div>
          )}

          {/* Branch icon-only when collapsed */}
          {collapsed && (
            <div className="shrink-0 flex justify-center pt-3">
              <NavTootip label={activeBranch?.name ?? "All Branches"}>
                <span className="inline-grid size-9 place-items-center rounded-lg bg-white/10 text-white/50">
                  <Building2 className="size-4" />
                </span>
              </NavTootip>
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
                          const active =
                            href !== "/logout" && isActive(href, pathname);
                          const isLogout = href === "/logout";

                          if (collapsed) {
                            return (
                              <NavTootip key={href} label={label}>
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
                              </NavTootip>
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
            {/* {initials} */}
            <span className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white"></span>
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
  );
}
