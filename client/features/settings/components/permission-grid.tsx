import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const MODULE_GROUPS = [
  { title: "User Management", permissions: ["user:read", "user:create", "user:update", "user:delete"] },
  { title: "Role Management", permissions: ["role:read", "role:update"] },
  { title: "Branch Management", permissions: ["branch:read", "branch:create", "branch:update", "branch:delete"] },
  { title: "Customer Management", permissions: ["customer:read", "customer:create", "customer:update", "customer:delete"] },
  { title: "Vehicle Management", permissions: ["vehicle:read", "vehicle:create", "vehicle:update", "vehicle:delete"] },
  { title: "Service Management", permissions: ["service:read", "service:create", "service:update", "service:delete"] },
  { title: "Services Catalog", permissions: ["services:read", "services:create", "services:update", "services:delete"] },
  { title: "Workshop Management", permissions: ["workshop:read", "workshop:update"] },
  { title: "Inventory Management", permissions: ["inventory:read", "inventory:create", "inventory:update", "inventory:delete"] },
  { title: "Transfer Management", permissions: ["transfer:read", "transfer:create", "transfer:update", "transfer:approve", "transfer:dispatch", "transfer:receive"] },
  { title: "Finance Management", permissions: ["finance:read", "finance:create", "finance:update"] },
  { title: "Audit Log", permissions: ["audit:read"] },
] as const;

const LABELS: Record<string, string> = {
  "user:read": "Read",
  "user:create": "Create",
  "user:update": "Update",
  "user:delete": "Delete",
  "role:read": "Read",
  "role:update": "Update",
  "branch:read": "Read",
  "branch:create": "Create",
  "branch:update": "Update",
  "branch:delete": "Delete",
  "customer:read": "Read",
  "customer:create": "Create",
  "customer:update": "Update",
  "customer:delete": "Delete",
  "vehicle:read": "Read",
  "vehicle:create": "Create",
  "vehicle:update": "Update",
  "vehicle:delete": "Delete",
  "service:read": "Read",
  "service:create": "Create",
  "service:update": "Update",
  "service:delete": "Delete",
  "services:read": "Read",
  "services:create": "Create",
  "services:update": "Update",
  "services:delete": "Delete",
  "workshop:read": "Read",
  "workshop:update": "Update",
  "inventory:read": "Read",
  "inventory:create": "Create",
  "inventory:update": "Update",
  "inventory:delete": "Delete",
  "transfer:read": "Read",
  "transfer:create": "Create",
  "transfer:update": "Update",
  "transfer:approve": "Approve",
  "transfer:dispatch": "Dispatch",
  "transfer:receive": "Receive",
  "finance:read": "Read",
  "finance:create": "Create",
  "finance:update": "Update",
  "audit:read": "Read",
};

export function PermissionGrid({
  selectedPermissions,
  onChange,
}: {
  selectedPermissions: string[];
  onChange: (permissions: string[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MODULE_GROUPS.map((group) => [group.title, true])),
  );
  const selectedSet = new Set(selectedPermissions);

  function togglePermission(permission: string) {
    const next = selectedSet.has(permission)
      ? selectedPermissions.filter((value) => value !== permission)
      : [...selectedPermissions, permission];
    onChange(next);
  }

  function toggleGroup(permissions: readonly string[]) {
    const isAllSelected = permissions.every((permission) => selectedSet.has(permission));
    const next = isAllSelected
      ? selectedPermissions.filter((value) => !permissions.includes(value))
      : Array.from(new Set([...selectedPermissions, ...permissions]));
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {MODULE_GROUPS.map((group) => {
        const groupSelected = group.permissions.every((permission) => selectedSet.has(permission));
        const someSelected = group.permissions.some((permission) => selectedSet.has(permission));
        const isExpanded = expandedGroups[group.title] ?? false;

        return (
          <div
            key={group.title}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className={cn(
              "flex items-center justify-between gap-3 px-4 py-3",
              isExpanded && "border-b border-slate-200",
            )}>
              <button
                type="button"
                onClick={() => setExpandedGroups((current) => ({
                  ...current,
                  [group.title]: !isExpanded,
                }))}
                aria-expanded={isExpanded}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-foreground"
              >
                <ChevronDown className={cn(
                  "size-4 shrink-0 text-slate-400 transition-transform",
                  !isExpanded && "-rotate-90",
                )} />
                {group.title}
              </button>
              <button
                type="button"
                onClick={() => toggleGroup(group.permissions)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium cursor-pointer",
                  groupSelected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {groupSelected ? "Deselect All" : "Select All"}
              </button>
            </div>

            {isExpanded && (
              <div className="grid gap-2 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.permissions.map((permission) => (
                  <label
                    key={permission}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      selectedSet.has(permission)
                        ? "border-primary/20 bg-primary/5 text-foreground"
                        : "border-slate-200 bg-white text-slate-600",
                      someSelected && !selectedSet.has(permission) && "opacity-80",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(permission)}
                      onChange={() => togglePermission(permission)}
                      className="h-4 w-4 rounded border-slate-300 text-primary shadow-sm focus:ring-primary"
                    />
                    <span>{LABELS[permission] ?? permission}</span>
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
