"use client";
import Link from "next/link";
import { cn, isActive } from "@/lib/utils";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

//icons
import { X, ChevronLeft, ChevronRight, Building2 } from "lucide-react";

//store
import { useBranchStore } from "@/store/branch.store";

//types
import type { NavGroup } from "@/type";

//hooks
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useFetchBranches } from "@/features/branches/hooks/useFetchBranches";

//components
import NavTootip from "./NavTootip";
import HeaderLogo from "../headers/HeaderLogo";
import SidebarSkeleton from "./SidebarSkeleton";
import BranchDropdown from "@/features/branches/components/BranchDropdown";

//default collapse key
const DEFAULT_COLLAPSED_KEY = "danamotors-sidebar-collapsed";

export interface SideNavBranchConfig {
  branches: { id: string; name: string }[];
  activeBranch: { id: string; name: string } | null;
  isLoading?: boolean;
  canSwitch?: boolean;
  canSeeAll?: boolean;
  onSelect?: (branch: { id: string; name: string }) => void;
  onAllSelect?: () => void;
}

interface SideNavProps {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  /** Nav groups to render. Items with `href === "/logout"` become the sign-out button. */
  navGroups: NavGroup[];
  /**
   * Branch source:
   * - `"store"` (default): fetch branches and drive the dropdown from the branch store (staff).
   * - `"props"`: use the `branch` prop directly (e.g. customer portal read-only branch).
   */
  branchSource?: "store" | "props";
  /** Branch config used when `branchSource === "props"`. */
  branch?: SideNavBranchConfig;
  /** localStorage key used to persist the collapsed state. */
  collapsedKey?: string;
  /** Text shown under the user's name. Defaults to the user's role. */
  roleLabel?: string;
  /** A href that must match the pathname exactly to be active (e.g. "/portal" dashboard). */
  exactRoot?: string;
}

export default function SideNav({
  sidebarOpen,
  setSidebarOpen,
  navGroups,
  branchSource = "store",
  branch,
  collapsedKey = DEFAULT_COLLAPSED_KEY,
  roleLabel,
  exactRoot,
}: SideNavProps) {
  const logout = useLogout();
  const { user, isHydrated, isSuperAdmin, hasAccess } = useAuth();
  const pathname = usePathname();

  // Desktop collapsed state — persisted
  const [collapsed, setCollapsed] = useState(false);
  // Tracks expanded state for nav items with children
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Sync from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    const saved = localStorage.getItem(collapsedKey);
    if (saved === "true") setCollapsed(true);
  }, [collapsedKey]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(collapsedKey, String(next));
      return next;
    });
  }

  // Branch store — fetch for staff so everyone sees the current branch
  useFetchBranches(branchSource === "store");

  const {
    branches,
    activeBranch,
    setActiveBranch,
    isLoading: branchLoading,
    isFetched: branchesFetched,
  } = useBranchStore();

  // For non-SuperAdmin: lock activeBranch to the user's assigned branch
  useEffect(() => {
    if (branchSource !== "store") return;
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
    branchSource,
    branchesFetched,
    branches,
    user?.branchId,
    activeBranch?.id,
    setActiveBranch,
  ]);

  // Resolve the branch config passed to the dropdown
  const branchConfig: SideNavBranchConfig =
    branchSource === "store"
      ? {
          branches,
          activeBranch,
          isLoading: branchLoading,
          canSwitch: isSuperAdmin,
          canSeeAll: isSuperAdmin,
          onSelect: (b) => setActiveBranch(b),
          onAllSelect: () => setActiveBranch(null as any),
        }
      : branch ?? { branches: [], activeBranch: null };

  function isItemActive(href: string, pathname: string) {
    if (href === "/logout") return false;
    if (href === exactRoot) return pathname === href;
    return isActive(href, pathname);
  }

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
          {/* Branch display — current branch; SuperAdmin can switch */}
          {!collapsed && (
            <div className="shrink-0 px-3 pt-3">
              <BranchDropdown
                branches={branchConfig.branches}
                activeBranch={branchConfig.activeBranch}
                isLoading={branchConfig.isLoading ?? false}
                canSwitch={branchConfig.canSwitch ?? false}
                canSeeAll={branchConfig.canSeeAll ?? false}
                onSelect={(b) => branchConfig.onSelect?.(b)}
                onAllSelect={() => branchConfig.onAllSelect?.()}
              />
            </div>
          )}

          {/* Branch icon-only when collapsed */}
          {collapsed && (
            <div className="shrink-0 flex justify-center pt-3">
              <NavTootip label={branchConfig.activeBranch?.name ?? "All Branches"}>
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
            {navGroups
              .filter((group) => hasAccess(group.roles ?? []))
              .map((group) => {
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
                      {visibleItems.map((item) => {
                        const { label, href, icon: Icon, badge, children } = item as any;
                        const isLogout = href === "/logout";
                        const active = href ? isItemActive(href, pathname) : false;
                        const hasChildren = Array.isArray(children) && children.length > 0;

                        // helper: check if any child is active
                        const isAnyChildActive = hasChildren
                          ? children.some((c: any) => isItemActive(c.href, pathname))
                          : false;

                        if (collapsed) {
                          const key = label;
                          const targetHref = href ?? (hasChildren ? children?.[0]?.href : undefined);
                          return (
                            <NavTootip key={key} label={label}>
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
                                  href={targetHref ?? '#'}
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

                        if (hasChildren) {
                          // If the user has explicitly toggled this group, respect that value.
                          // Otherwise, default to expanded when any child is active.
                          const expanded = Object.prototype.hasOwnProperty.call(openGroups, label)
                            ? !!openGroups[label]
                            : isAnyChildActive;
                          return (
                            <div key={label} className="w-full">
                              <button
                                onClick={() =>
                                  setOpenGroups((s) => {
                                    const current = Object.prototype.hasOwnProperty.call(s, label)
                                      ? !!s[label]
                                      : isAnyChildActive;
                                    return { ...s, [label]: !current };
                                  })
                                }
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                  expanded
                                    ? "bg-white/15 text-white"
                                    : "text-white/70 hover:bg-white/10 hover:text-white",
                                )}
                              >
                                <Icon className="size-[17px] shrink-0" />
                                <span className="flex-1 truncate text-left">{label}</span>
                                <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                              </button>

                              {expanded && (
                                <div className="mt-1 ml-8 flex flex-col gap-1">
                                  {children.map((c: any, i: number) => {
                                    const ChildIcon = c.icon;
                                    const childKey = c.href ?? `${label}-${i}`;
                                    return (
                                      <Link
                                        key={childKey}
                                        href={c.href ?? '#'}
                                        onClick={() => setSidebarOpen(false)}
                                        aria-current={isItemActive(c.href, pathname) ? "page" : undefined}
                                        className={cn(
                                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                          isItemActive(c.href, pathname)
                                            ? "bg-white/15 text-white"
                                            : "text-white/70 hover:bg-white/10 hover:text-white",
                                        )}
                                      >
                                        <ChildIcon className="size-[14px] shrink-0" />
                                        <span className="flex-1 truncate">{c.label}</span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Non-parent item: ensure stable key and defined href
                        const itemKey = href ?? `${group.label}-${label}`;
                        const hrefProp = href ?? '#';

                        return (
                          <Link
                            key={itemKey}
                            href={hrefProp}
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
                      })}
                    </div>
                  </div>
                );
              })}
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
              {user?.firstName?.[0] ?? ""}
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-xs capitalize text-white/50">
                  {roleLabel ?? user?.role ?? "Workshop Manager"}
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
