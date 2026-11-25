import { PermissionEffect, Prisma } from "@prisma/client";
import {
  GENERAL_DEPARTMENT_ROLES,
  OWN_BRANCH_DEPARTMENT_ROLES,
  PERMISSIONS,
} from "./constants/roles";

/**
 * A user's permissions are their role's, plus the permissions granted to them, minus the role permissions
 * denied to them (`UserPermission`). The role is the template; the overrides are per user, as legacy rights
 * were. Every place that decides what a user may do reads the result of `effectivePermissions`, and every
 * query for "users who hold permission X" uses `holdsPermission`.
 */

type PermissionLink = { permission: { name: string } };
type Override = { effect: PermissionEffect; permission: { name: string } };

/** Prisma `include` for everything `effectivePermissions` needs. */
export const PERMISSION_SOURCES_INCLUDE = {
  role: {
    include: {
      permissions: { include: { permission: { select: { name: true } } } },
    },
  },
  permissionOverrides: { include: { permission: { select: { name: true } } } },
} as const;

/** Prisma `select` for the same, for queries that select fields. */
export const PERMISSION_SOURCES_SELECT = {
  role: {
    select: {
      name: true,
      permissions: { select: { permission: { select: { name: true } } } },
    },
  },
  permissionOverrides: {
    select: { effect: true, permission: { select: { name: true } } },
  },
} as const;

export function effectivePermissions(user: {
  role: { name?: string; permissions: PermissionLink[] };
  permissionOverrides?: Override[] | null;
}): string[] {
  const result = new Set(user.role.permissions.map((p) => p.permission.name));
  for (const override of user.permissionOverrides ?? []) {
    if (override.effect === PermissionEffect.GRANT)
      result.add(override.permission.name);
    else result.delete(override.permission.name);
  }
  if (user.role.name && OWN_BRANCH_DEPARTMENT_ROLES.has(user.role.name)) {
    result.delete(PERMISSIONS.BRANCH_ALL);
    result.delete(PERMISSIONS.INVENTORY_CROSS_BRANCH);
  } else if (user.role.name && GENERAL_DEPARTMENT_ROLES.has(user.role.name)) {
    result.add(PERMISSIONS.BRANCH_ALL);
    result.add(PERMISSIONS.INVENTORY_CROSS_BRANCH);
  }
  return [...result].sort();
}

/** Users who hold the permission: through their role and not denied, or granted to them. */
export function holdsPermission(name: string): Prisma.UserWhereInput {
  return {
    OR: [
      {
        role: { permissions: { some: { permission: { name } } } },
        permissionOverrides: {
          none: { effect: PermissionEffect.DENY, permission: { name } },
        },
      },
      {
        permissionOverrides: {
          some: { effect: PermissionEffect.GRANT, permission: { name } },
        },
      },
    ],
  };
}

/**
 * Admin-level permissions: managing users, roles and rights, reading the audit trail, all-branch access,
 * managing branches, and closing the books. Only a super admin may grant them to a user as an override. For roles see
 * `assertCanChangeUser`: a role that manages access counts as admin-level, while the built-in operational
 * roles that carry `branch:all` stay assignable, because only a super admin edits role permissions.
 */
const ACCESS_PREFIXES = ["user:", "role:", "audit:"];
const ADMIN_LEVEL_NAMES: string[] = [
  PERMISSIONS.BRANCH_ALL,
  PERMISSIONS.BRANCH_CREATE,
  PERMISSIONS.BRANCH_UPDATE,
  PERMISSIONS.BRANCH_DELETE,
  PERMISSIONS.BOOKS_CLOSE,
];

/** Managing users, roles and rights, or reading the audit trail. */
export function managesAccess(name: string): boolean {
  return ACCESS_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function isAdminLevelPermission(name: string): boolean {
  return ADMIN_LEVEL_NAMES.includes(name) || managesAccess(name);
}
