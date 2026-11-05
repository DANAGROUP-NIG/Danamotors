"use client";

import { useMemo, useState } from "react";
import { Lock, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { isAdminLevelPermission } from "@/features/auth/roles";
import { useAdminPermissions } from "@/features/settings/hooks/use-admin-roles";
import { useSetUserPermissions } from "../hooks/use-set-user-permissions";
import type { PermissionOverride, UserWithRole } from "../types/user.types";

type Filter = "all" | "effective" | "changes";
type State = "role" | "granted" | "denied" | "none";

/**
 * Mirrors assertCanChangeUser for overrides: a super admin changes anyone's access but their own; an Admin
 * changes own-branch staff without admin-level access. The server enforces it; this only shows the editor.
 */
function canEditAccess(
  actor: { id?: string; branchId?: string | null } | null,
  flags: { isSuperAdmin: boolean; isAdmin: boolean; canUpdate: boolean },
  target: UserWithRole,
): boolean {
  if (!actor || actor.id === target.id || !flags.canUpdate) return false;
  if (target.role?.name === "SuperAdmin") return false;
  if (flags.isSuperAdmin) return true;
  if (!flags.isAdmin || target.adminLevel) return false;
  return !!actor.branchId && actor.branchId === target.branchId;
}

function humanize(name: string): string {
  return name
    .split(":")
    .slice(1)
    .join(" ")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || name;
}

const STATE_TAG: Record<State, { label: string; cls: string } | null> = {
  role: { label: "Role", cls: "bg-slate-100 text-slate-600" },
  granted: { label: "Granted", cls: "bg-emerald-50 text-emerald-700" },
  denied: { label: "Denied", cls: "bg-red-50 text-red-700" },
  none: null,
};

/**
 * The user's access: the role is the template, and the user may have extra permissions granted or role
 * permissions denied. Effective permissions are role + granted − denied. Replaces legacy per-user rights.
 */
export function UserAccessCard({ user }: { user: UserWithRole }) {
  const { user: actor, isSuperAdmin, isAdmin, hasPermission } = useAuth();
  const editable = canEditAccess(actor, { isSuperAdmin, isAdmin, canUpdate: hasPermission("user:update") }, user);
  const { data: permissionData, isLoading } = useAdminPermissions();
  const save = useSetUserPermissions(user.id);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PermissionOverride[]>(user.overrides);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const inRole = useMemo(() => new Set(user.role?.permissions ?? []), [user.role?.permissions]);
  const overrides = editing ? draft : user.overrides;
  const overrideMap = useMemo(() => new Map(overrides.map((o) => [o.name, o.effect])), [overrides]);

  const stateOf = (name: string): State => {
    const effect = overrideMap.get(name);
    if (effect === "GRANT") return "granted";
    if (effect === "DENY") return "denied";
    return inRole.has(name) ? "role" : "none";
  };
  const isEffective = (state: State) => state === "role" || state === "granted";

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (permissionData?.groups ?? [])
      .map((group) => ({
        module: group.module,
        permissions: group.permissions.filter((p) => {
          const state = stateOf(p.name);
          if (filter === "effective" && !isEffective(state)) return false;
          if (filter === "changes" && state !== "granted" && state !== "denied") return false;
          return !term || p.name.toLowerCase().includes(term) || group.module.toLowerCase().includes(term);
        }),
      }))
      .filter((group) => group.permissions.length > 0);
    // stateOf reads overrideMap and inRole
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionData, filter, search, overrideMap, inRole]);

  function toggle(name: string) {
    const rest = draft.filter((o) => o.name !== name);
    const state = stateOf(name);
    if (state === "role") setDraft([...rest, { name, effect: "DENY" }]);
    else if (state === "none") setDraft([...rest, { name, effect: "GRANT" }]);
    else setDraft(rest); // back to the role's setting
  }

  function startEditing() {
    setDraft(user.overrides);
    setEditing(true);
  }

  function onSave() {
    save.mutate(
      {
        grants: draft.filter((o) => o.effect === "GRANT").map((o) => o.name),
        denies: draft.filter((o) => o.effect === "DENY").map((o) => o.name),
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  const granted = user.overrides.filter((o) => o.effect === "GRANT");
  const denied = user.overrides.filter((o) => o.effect === "DENY");

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <ShieldCheck className="size-4 text-slate-500" /> Access
            {user.adminLevel && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Admin-level</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {user.effectivePermissions.length} permissions: the {user.role?.name} role
            {granted.length > 0 && <>, plus {granted.length} granted</>}
            {denied.length > 0 && <>, minus {denied.length} denied</>}.
          </p>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="outline" onClick={startEditing}>
            Change access
          </Button>
        )}
      </div>

      {!editing && user.overrides.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Permissions changed for this user">
          {user.overrides.map((o) => (
            <li
              key={o.name}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                o.effect === "GRANT" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              {o.effect === "GRANT" ? "+ " : "− "}
              {o.name}
            </li>
          ))}
        </ul>
      )}

      {!editing && user.overrides.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">Exactly the role&apos;s permissions; nothing granted or denied.</p>
      )}

      {(editing || open) && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Show">
              {(
                [
                  ["all", "All"],
                  ["effective", "Has"],
                  ["changes", "Changed"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium",
                    filter === value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className={cn(inputCls, "pl-8")}
                placeholder="Find a permission"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
              {groups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No permissions match.</p>}
              {groups.map((group) => (
                <fieldset key={group.module} className="rounded-lg border border-slate-200">
                  <legend className="ml-3 px-1 text-sm font-semibold text-slate-700">{group.module}</legend>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.permissions.map((p) => {
                      const state = stateOf(p.name);
                      const tag = STATE_TAG[state];
                      // Anyone but a super admin may grant only non-admin-level permissions they hold themselves;
                      // anyone may deny one the role has.
                      const lockReason = isSuperAdmin || state !== "none" ? null
                        : isAdminLevelPermission(p.name) ? "Only a super admin can grant this"
                        : !hasPermission(p.name) ? "You can only grant permissions you have yourself" : null;
                      const locked = !!lockReason;
                      return (
                        <label
                          key={p.name}
                          title={lockReason ?? p.description ?? p.name}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                            isEffective(state) ? "border-primary/20 bg-primary/5" : "border-slate-200 bg-white text-slate-600",
                            state === "denied" && "border-red-200 bg-red-50/40",
                            (!editing || locked) && "cursor-default",
                            editing && !locked && "cursor-pointer",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded border-slate-300 text-primary"
                            checked={isEffective(state)}
                            disabled={!editing || locked}
                            onChange={() => toggle(p.name)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{humanize(p.name)}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{p.name}</span>
                          </span>
                          {locked && <Lock className="size-3.5 text-slate-400" aria-label={lockReason ?? undefined} />}
                          {tag && <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", tag.cls)}>{tag.label}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>
      )}

      {!editing && (
        <button
          type="button"
          aria-expanded={open}
          className="mt-3 text-sm font-medium text-primary hover:underline"
          onClick={() => {
            if (!open) setFilter("effective");
            setOpen(!open);
          }}
        >
          {open ? "Hide permissions" : `Show all ${user.effectivePermissions.length} permissions`}
        </button>
      )}

      {editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save access"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <span className="text-sm text-slate-500">
            Ticking a permission the role lacks grants it; unticking one the role has denies it. Every change is logged.
          </span>
        </div>
      )}
    </section>
  );
}
