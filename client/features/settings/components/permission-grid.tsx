"use client"

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { PermissionGroup } from "../api/role.api";

function permissionLabel(name: string) {
  const action = name.split(":").at(-1) ?? name;
  return action
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function PermissionGrid({
  groups,
  selectedPermissions,
  onChange,
}: {
  groups: PermissionGroup[];
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(groups.map((group) => [group.module, true])),
  );
  const selectedSet = new Set(selectedPermissions);

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = Object.fromEntries(
        groups.map((group) => [group.module, current[group.module] ?? true]),
      );
      return next;
    });
  }, [groups]);

  function togglePermission(permission: string) {
    const next = selectedSet.has(permission)
      ? selectedPermissions.filter((value) => value !== permission)
      : [...selectedPermissions, permission];
    onChange(next);
  }

  function toggleGroup(permissionNames: string[]) {
    const isAllSelected = permissionNames.every((permission) => selectedSet.has(permission));
    const next = isAllSelected
      ? selectedPermissions.filter((value) => !permissionNames.includes(value))
      : Array.from(new Set([...selectedPermissions, ...permissionNames]));
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const permissionNames = group.permissions.map((permission) => permission.name);
        const groupSelected = permissionNames.every((permission) => selectedSet.has(permission));
        const someSelected = permissionNames.some((permission) => selectedSet.has(permission));
        const isExpanded = expandedGroups[group.module] ?? false;

        return (
          <div key={group.module} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className={cn("flex items-center justify-between gap-3 px-4 py-3", isExpanded && "border-b border-slate-200")}>
              <button
                type="button"
                onClick={() => setExpandedGroups((current) => ({ ...current, [group.module]: !isExpanded }))}
                aria-expanded={isExpanded}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-foreground"
              >
                <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform", !isExpanded && "-rotate-90")} />
                {group.module}
              </button>
              <button
                type="button"
                onClick={() => toggleGroup(permissionNames)}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-xs font-medium",
                  groupSelected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {groupSelected ? "Deselect All" : "Select All"}
              </button>
            </div>

            {isExpanded && (
              <div className="grid gap-2 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.permissions.map((permission) => (
                  <label
                    key={permission.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      selectedSet.has(permission.name) ? "border-primary/20 bg-primary/5 text-foreground" : "border-slate-200 bg-white text-slate-600",
                      someSelected && !selectedSet.has(permission.name) && "opacity-80",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(permission.name)}
                      onChange={() => togglePermission(permission.name)}
                      className="h-4 w-4 rounded border-slate-300 text-primary shadow-sm focus:ring-primary"
                    />
                    <span>{permissionLabel(permission.name)}</span>
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
