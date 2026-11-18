"use client";

import { inputCls } from "@/components/forms/FormField";
import { useUsers } from "../hooks/use-users";

/**
 * "Copy access from user": picks a user whose role and own grants/denials are copied (legacy "Assign Right
 * Same As Other One"). The server limits the list to the actor's branch unless they are a super admin.
 */
export function CopyAccessSelect({
  value,
  onChange,
  excludeId,
  id,
}: {
  value: string;
  onChange: (userId: string) => void;
  excludeId?: string;
  id?: string;
}) {
  const { data, isLoading } = useUsers({ page: 1, limit: 500 });
  const users = (data?.users ?? [])
    .filter((u) => u.id !== excludeId && u.isActive)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return (
    <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
      <option value="">{isLoading ? "Loading users…" : "Don't copy"}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.firstName} {u.lastName} · {u.role?.name}
          {u._count?.permissionOverrides ? ` +${u._count.permissionOverrides}` : ""}
          {u.branch?.name ? ` · ${u.branch.name}` : ""}
        </option>
      ))}
    </select>
  );
}
