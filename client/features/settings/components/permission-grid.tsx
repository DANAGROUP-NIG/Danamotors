"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminPermissions } from "../hooks/use-admin-roles";
import { PermissionGroup } from "../api/role.api";

function humanize(name: string): string {
  const action = name.split(":")[1] ?? name;
  return action
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PermissionGrid({
  selectedPermissions,
  onChange,
}: {
  groups: PermissionGroup[];
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
}) {
  const { data, isLoading, isError } = useAdminPermissions();
  const groups = data?.groups ?? [];
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const isExpanded = (module: string) => expandedGroups[module] ?? true;

  function toggleGroup(permNames: string[]) {
    const allSelected = permNames.every((p) => selectedSet.has(p));
    const next = allSelected
      ? selectedPermissions.filter((p) => !permNames.includes(p))
      : Array.from(new Set([...selectedPermissions, ...permNames]));
    onChange(next);
  }

  function togglePermission(perm: string) {
    const next = selectedSet.has(perm)
      ? selectedPermissions.filter((p) => p !== perm)
      : [...selectedPermissions, perm];
    onChange(next);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading permissions…
      </div>
    );
  }

  if (isError || groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-red-500">
        Failed to load permissions.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const permNames = group.permissions.map((p) => p.name);
        const groupSelected = permNames.every((p) => selectedSet.has(p));
        const someSelected = permNames.some((p) => selectedSet.has(p));
        const expanded = isExpanded(group.module);

        return (
          <div
            key={group.module}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            {/* Group header */}
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3",
                expanded && "border-b border-slate-200",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((prev) => ({
                    ...prev,
                    [group.module]: !expanded,
                  }))
                }
                aria-expanded={expanded}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-slate-400 transition-transform",
                    !expanded && "-rotate-90",
                  )}
                />
                {group.module}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({permNames.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleGroup(permNames)}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-xs font-medium",
                  groupSelected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {groupSelected ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Permission checkboxes */}
            {expanded && (
              <div className="grid gap-2 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.permissions.map((perm) => (
                  <label
                    key={perm.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      selectedSet.has(perm.name)
                        ? "border-primary/20 bg-primary/5 text-foreground"
                        : "border-slate-200 bg-white text-slate-600",
                      someSelected &&
                        !selectedSet.has(perm.name) &&
                        "opacity-80",
                    )}
                    title={perm.description ?? perm.name}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(perm.name)}
                      onChange={() => togglePermission(perm.name)}
                      className="h-4 w-4 rounded border-slate-300 text-primary shadow-sm focus:ring-primary"
                    />
                    <span className="flex flex-col">
                      <span>{humanize(perm.name)}</span>
                      {/* {perm.description && (
                        <span className="text-[11px] text-muted-foreground">
                          {perm.description}
                        </span>
                      )} */}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
