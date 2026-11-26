import bcrypt from 'bcryptjs';
import { AdminRepository } from './admin.repository';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import prisma from '../../prisma/client';
import { PermissionEffect, Prisma } from '@prisma/client';
import { effectivePermissions, isAdminLevelPermission, managesAccess } from '../../shared/effectivePermissions';

/**
 * Who may set another user's password. A super admin may reset every other user's password. An Admin may
 * reset the staff of their own branch, but not another Admin's or a super admin's. Nobody resets their own
 * password here: that is Profile → Change password, which asks for the current one.
 */
export function assertCanResetPassword(
  actor: { userId: string; role: string; branchId?: string | null },
  target: { id: string; branchId: string | null; role: { name: string } },
): void {
  if (actor.userId === target.id)
    throw new BadRequestError('Change your own password from your profile');
  if (actor.role === ROLES.SUPER_ADMIN)
    return;
  if (actor.role !== ROLES.ADMIN)
    throw new ForbiddenError('Only an administrator can reset passwords');
  if (target.role.name === ROLES.SUPER_ADMIN || target.role.name === ROLES.ADMIN)
    throw new ForbiddenError("Only a super admin can reset an administrator's password");
  if (!actor.branchId || target.branchId !== actor.branchId)
    throw new ForbiddenError('You can only reset passwords of users in your branch');
}

/** The signed-in user; `permissions` are their effective permissions (req.user). */
type Actor = { userId: string; role: string; branchId?: string | null; permissions?: string[] };
const isAdminRole = (name?: string | null) => name === ROLES.SUPER_ADMIN || name === ROLES.ADMIN;

type PermissionLinks = { permission: { name: string } }[];
type Overrides = { effect: PermissionEffect; permission: { name: string } }[];
type AccessTarget = {
  id: string;
  branchId: string | null;
  role: { name: string; permissions?: PermissionLinks };
  permissionOverrides?: Overrides;
};

/**
 * Admin-level access: the Admin or SuperAdmin role, any role that manages users, roles or the audit log
 * (such as Auditor), or an admin-level permission granted to the user (`isAdminLevelPermission`).
 */
export function hasAdminLevelAccess(user: AccessTarget): boolean {
  return isAdminRole(user.role.name)
    || (user.role.permissions ?? []).some((p) => managesAccess(p.permission.name))
    || (user.permissionOverrides ?? []).some((o) => o.effect === PermissionEffect.GRANT && isAdminLevelPermission(o.permission.name));
}

/**
 * Only a super admin may give admin-level access: a role that is admin-level (see `hasAdminLevelAccess`), or
 * a grant of an admin-level permission (`user:*`, `role:*`, `audit:*`, `branch:all`, branch management).
 * Built-in operational roles that carry `branch:all` stay assignable: only a super admin edits a role's
 * permissions, so the role is already approved. A per-user grant is not, so it is checked here. Anyone
 * but a super admin may also grant only permissions they hold themselves.
 */
export function assertCanGiveAccess(
  actor: Actor,
  give: { roleName?: string; rolePermissions?: string[]; grants?: string[] },
): void {
  if (actor.role === ROLES.SUPER_ADMIN)
    return;
  if (isAdminRole(give.roleName) || (give.rolePermissions ?? []).some(managesAccess))
    throw new ForbiddenError('Only a super admin can give a role with admin-level access, such as Admin, SuperAdmin or Auditor');
  const adminLevel = (give.grants ?? []).filter(isAdminLevelPermission);
  if (adminLevel.length)
    throw new ForbiddenError(`Only a super admin can grant admin-level permissions: ${adminLevel.join(', ')}`);
  const held = new Set(actor.permissions ?? []);
  const notHeld = (give.grants ?? []).filter((name) => !held.has(name));
  if (notHeld.length)
    throw new ForbiddenError(`You can only grant permissions you have yourself: ${notHeld.join(', ')}`);
}

/**
 * Who may change or delete a user. A super admin may change anyone. Anyone else (an Admin, in their own
 * branch: the controller checks the branch) may not change a user with admin-level access, give admin-level
 * access (`assertCanGiveAccess`), or move a user to another branch. Nobody deactivates, deletes, re-roles or
 * changes the rights of their own account, so nobody can lock themselves out or raise their own access.
 */
export function assertCanChangeUser(
  actor: Actor,
  target: AccessTarget,
  change: {
    roleName?: string;
    rolePermissions?: string[];
    /** Permissions newly granted to the user. */
    grants?: string[];
    /** True when the user's own grants or denials change. */
    access?: boolean;
    branchId?: string;
    isActive?: boolean;
    delete?: boolean;
  },
): void {
  if (actor.userId === target.id) {
    if (change.delete || change.isActive === false)
      throw new BadRequestError('You cannot deactivate or delete your own account');
    if (change.roleName && change.roleName !== target.role.name)
      throw new BadRequestError('You cannot change your own role');
    if (change.access)
      throw new BadRequestError('You cannot change your own access');
  }
  if (actor.role === ROLES.SUPER_ADMIN)
    return;
  if (hasAdminLevelAccess(target))
    throw new ForbiddenError('Only a super admin can change an administrator or a user with admin-level access');
  assertCanGiveAccess(actor, change);
  if (change.branchId !== undefined && change.branchId !== target.branchId)
    throw new ForbiddenError('Only a super admin can move a user to another branch');
}

type OverrideInput = { name: string; effect: PermissionEffect };

/**
 * Checks a set of overrides against a role and resolves the permission ids. A grant must be a permission the
 * role lacks and a denial one it has; anything else would change nothing. Nobody overrides a super admin,
 * who holds every permission.
 */
async function resolveOverrides(
  role: { name: string; permissions: PermissionLinks },
  overrides: OverrideInput[],
): Promise<{ permissionId: string; name: string; effect: PermissionEffect }[]> {
  if (!overrides.length) return [];
  if (role.name === ROLES.SUPER_ADMIN)
    throw new BadRequestError('A super admin holds every permission; their access cannot be changed per user');
  const names = [...new Set(overrides.map((o) => o.name))];
  if (names.length !== overrides.length)
    throw new BadRequestError('A permission is listed more than once');
  const permissions = await prisma.permission.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const unknown = names.filter((n) => !permissions.some((p) => p.name === n));
  if (unknown.length) throw new BadRequestError(`Unknown permission(s): ${unknown.join(', ')}`);
  const inRole = new Set(role.permissions.map((p) => p.permission.name));
  const redundantGrants = overrides.filter((o) => o.effect === PermissionEffect.GRANT && inRole.has(o.name)).map((o) => o.name);
  if (redundantGrants.length)
    throw new BadRequestError(`The ${role.name} role already has: ${redundantGrants.join(', ')}`);
  const pointlessDenies = overrides.filter((o) => o.effect === PermissionEffect.DENY && !inRole.has(o.name)).map((o) => o.name);
  if (pointlessDenies.length)
    throw new BadRequestError(`The ${role.name} role does not have: ${pointlessDenies.join(', ')}`);
  const idByName = new Map(permissions.map((p) => [p.name, p.id]));
  return overrides.map((o) => ({ permissionId: idByName.get(o.name)!, name: o.name, effect: o.effect }));
}

/**
 * Makes the user's overrides exactly `wanted`, touching only the rows that change, so the change log shows
 * what was granted, denied or removed and nothing else.
 */
async function saveOverrides(
  tx: Prisma.TransactionClient,
  userId: string,
  current: { permissionId: string; effect: PermissionEffect }[],
  wanted: { permissionId: string; effect: PermissionEffect }[],
): Promise<void> {
  const wantedById = new Map(wanted.map((o) => [o.permissionId, o.effect]));
  const currentById = new Map(current.map((o) => [o.permissionId, o.effect]));
  const removed = current.filter((o) => !wantedById.has(o.permissionId)).map((o) => o.permissionId);
  if (removed.length) await tx.userPermission.deleteMany({ where: { userId, permissionId: { in: removed } } });
  for (const o of wanted) {
    const was = currentById.get(o.permissionId);
    if (was === o.effect) continue;
    if (was) await tx.userPermission.update({ where: { userId_permissionId: { userId, permissionId: o.permissionId } }, data: { effect: o.effect } });
    else await tx.userPermission.create({ data: { userId, permissionId: o.permissionId, effect: o.effect } });
  }
}

/** What changed between two override sets, for the audit event. */
function overrideDiff(before: OverrideInput[], after: OverrideInput[]) {
  const key = (o: OverrideInput) => `${o.effect}:${o.name}`;
  const was = new Set(before.map(key));
  const now = new Set(after.map(key));
  const pick = (list: OverrideInput[], other: Set<string>, effect: PermissionEffect) =>
    list.filter((o) => o.effect === effect && !other.has(key(o))).map((o) => o.name);
  return {
    granted: pick(after, was, PermissionEffect.GRANT),
    ungranted: pick(before, now, PermissionEffect.GRANT),
    denied: pick(after, was, PermissionEffect.DENY),
    undenied: pick(before, now, PermissionEffect.DENY),
  };
}

const overridesOf = (user: { permissionOverrides: Overrides }): OverrideInput[] =>
  user.permissionOverrides.map((o) => ({ name: o.permission.name, effect: o.effect }));

/** A user as sent to the browser: never the password hash or a pending reset token. */
function withoutCredentials<T extends { passwordHash: string; resetTokenHash: string | null; resetTokenExpiry: Date | null }>(user: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, resetTokenHash, resetTokenExpiry, ...rest } = user;
  return rest;
}

export class AdminService {
  private adminRepository: AdminRepository;

  constructor() {
    this.adminRepository = new AdminRepository();
  }

  async getUsers(params: {
    page: number;
    limit: number;
    search?: string;
    roleId?: string;
    branchId?: string;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { users, total } = await this.adminRepository.listUsers({
      skip,
      take: params.limit,
      search: params.search,
      roleId: params.roleId,
      branchId: params.branchId,
    });

    return {
      users: users.map(withoutCredentials),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getUser(id: string) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { permissionOverrides, ...rest } = withoutCredentials(user);

    return {
      ...rest,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions.map((p) => p.permission.name).sort(),
      },
      /** The user's own grants and denials on top of the role. */
      overrides: overridesOf(user).sort((a, b) => a.name.localeCompare(b.name)),
      /** Role + granted - denied: what the user may actually do. */
      effectivePermissions: effectivePermissions(user),
      adminLevel: hasAdminLevelAccess(user),
    };
  }

  /**
   * The user whose access is copied ("Copy access from user"): their role and their overrides. Anyone but a
   * super admin may copy only from a user of their own branch.
   */
  private async copySource(actor: Actor, sourceId: string) {
    const source = await this.adminRepository.findUserById(sourceId);
    if (!source) throw new NotFoundError('The user to copy access from does not exist');
    if (actor.role !== ROLES.SUPER_ADMIN && (!actor.branchId || source.branchId !== actor.branchId))
      throw new ForbiddenError('You can only copy access from a user in your branch');
    return source;
  }

  /**
   * Replaces a user's grants and denials. Each is logged on the user in the change log (by a database
   * trigger), and the whole change is one USER_PERMISSIONS_UPDATED event.
   */
  async setUserPermissions(actor: Actor, id: string, input: { grants: string[]; denies: string[] }) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) throw new NotFoundError('User not found');
    const wanted: OverrideInput[] = [
      ...input.grants.map((name) => ({ name, effect: PermissionEffect.GRANT })),
      ...input.denies.map((name) => ({ name, effect: PermissionEffect.DENY })),
    ];
    const before = overridesOf(user);
    const diff = overrideDiff(before, wanted);
    assertCanChangeUser(actor, user, { access: true, grants: diff.granted });
    const resolved = await resolveOverrides(user.role, wanted);
    const current = user.permissionOverrides.map((o) => ({ permissionId: o.permissionId, effect: o.effect }));

    if (Object.values(diff).some((list) => list.length)) {
      await prisma.$transaction(async (tx) => {
        await saveOverrides(tx, id, current, resolved);
        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: 'USER_PERMISSIONS_UPDATED',
            details: JSON.stringify({ targetUserId: id, targetEmail: user.email, role: user.role.name, ...diff }),
          },
        });
      });
    }
    return this.getUser(id);
  }

  /**
   * Creates a user. With `copyFromUserId` the new user gets that user's role and overrides (legacy "Assign
   * Right Same As Other One"); `roleId` is then ignored. Only a super admin may give admin-level access.
   */
  async createUser(actor: Actor, data: {
    email: string;
    passwordHash: string; // Plain password passed in
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleId?: string;
    copyFromUserId?: string;
    branchName: string;
  }) {
    const existing = await this.adminRepository.findUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const source = data.copyFromUserId ? await this.copySource(actor, data.copyFromUserId) : null;
    const roleId = source?.roleId ?? data.roleId;
    if (!roleId) {
      throw new BadRequestError('Choose a role or a user to copy access from');
    }
    const role = source?.role ?? await this.adminRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('The specified role does not exist');
    }
    const overrides = source ? overridesOf(source) : [];
    assertCanGiveAccess(actor, {
      roleName: role.name,
      rolePermissions: role.permissions.map((p) => p.permission.name),
      grants: overrides.filter((o) => o.effect === PermissionEffect.GRANT).map((o) => o.name),
    });
    const resolved = await resolveOverrides(role, overrides);

    const branch = await this.adminRepository.findBranchByName(data.branchName);
    if (!branch) {
      throw new NotFoundError(`Branch '${data.branchName}' does not exist`);
    }

    const passwordHash = await bcrypt.hash(data.passwordHash, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          roleId,
          branchId: branch.id,
        },
      });
      await saveOverrides(tx, created.id, [], resolved);
      if (source) {
        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: 'USER_ACCESS_COPIED',
            details: JSON.stringify({ targetUserId: created.id, targetEmail: created.email, fromUserId: source.id, fromEmail: source.email, role: role.name, overrides }),
          },
        });
      }
      return created;
    });

    return withoutCredentials(user);
  }

  async updateUser(
    actor: Actor,
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      roleId?: string;
      branchId?: string;
      isActive?: boolean;
      /** Copy this user's role and overrides; `roleId` is then ignored. */
      copyFromUserId?: string;
    }
  ) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { copyFromUserId, ...fields } = data;
    const source = copyFromUserId ? await this.copySource(actor, copyFromUserId) : null;
    if (source?.id === id) {
      throw new BadRequestError('Choose another user to copy access from');
    }
    if (source) fields.roleId = source.roleId;

    const role = fields.roleId && fields.roleId !== user.roleId
      ? (source?.role ?? await this.adminRepository.findRoleById(fields.roleId))
      : null;
    if (fields.roleId && fields.roleId !== user.roleId && !role) {
      throw new NotFoundError('The specified role does not exist');
    }
    const newRole = role ?? user.role;

    const branch = fields.branchId && fields.branchId !== user.branchId
      ? await prisma.branch.findUnique({ where: { id: fields.branchId }, select: { id: true, name: true, isActive: true } })
      : null;
    if (fields.branchId && fields.branchId !== user.branchId && (!branch || !branch.isActive)) {
      throw new NotFoundError('The specified branch does not exist or is inactive');
    }

    // The overrides after the change. Copying takes the source's. A new role drops the overrides it makes
    // pointless (a grant the role now has, a denial of a permission it lacks); effective access is the same.
    const before = overridesOf(user);
    const inNewRole = new Set(newRole.permissions.map((p) => p.permission.name));
    const after = source
      ? overridesOf(source)
      : before.filter((o) => (o.effect === PermissionEffect.GRANT ? !inNewRole.has(o.name) : inNewRole.has(o.name)));
    const diff = overrideDiff(before, after);
    const accessChanges = Object.values(diff).some((list) => list.length);

    assertCanChangeUser(actor, user, {
      roleName: role?.name,
      rolePermissions: role?.permissions.map((p) => p.permission.name),
      grants: diff.granted,
      access: !!source,
      branchId: fields.branchId,
      isActive: fields.isActive,
    });
    const resolved = accessChanges ? await resolveOverrides(newRole, after) : [];

    // What changed, for the audit log: old → new.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['firstName', 'lastName', 'phoneNumber', 'isActive'] as const) {
      if (fields[key] !== undefined && fields[key] !== user[key]) changes[key] = { from: user[key], to: fields[key] };
    }
    if (role) changes.role = { from: user.role.name, to: role.name };
    if (branch) changes.branch = { from: user.branch?.name ?? null, to: branch.name };
    if (accessChanges) changes.overrides = { from: before, to: after };
    if (source) changes.copiedFrom = { from: null, to: source.email };

    const updated = await prisma.$transaction(async tx => {
      const saved = await tx.user.update({ where: { id }, data: fields });
      if (accessChanges) {
        const current = user.permissionOverrides.map((o) => ({ permissionId: o.permissionId, effect: o.effect }));
        await saveOverrides(tx, id, current, resolved);
      }
      if (Object.keys(changes).length) {
        await tx.auditLog.create({
          data: { userId: actor.userId, action: 'USER_UPDATED', details: JSON.stringify({ targetUserId: id, targetEmail: user.email, changes }) },
        });
      }
      return saved;
    });
    return withoutCredentials(updated);
  }

  /**
   * Sets a new password for another user. Their sessions are signed out and any pending reset token is
   * cleared. The audit entry names both users but never holds the password.
   */
  async resetUserPassword(
    actor: Actor,
    id: string,
    newPassword: string,
  ) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    assertCanResetPassword(actor, user);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'USER_PASSWORD_RESET',
          details: JSON.stringify({ targetUserId: id, targetEmail: user.email, sessionsSignedOut: true }),
        },
      }),
    ]);
  }

  async deleteUser(actor: Actor, id: string) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    assertCanChangeUser(actor, user, { delete: true });
    await this.adminRepository.deleteUser(id);
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: 'USER_DELETED', details: JSON.stringify({ targetUserId: id, targetEmail: user.email, role: user.role.name }) },
    });
  }

  async getRoles() {
    return this.adminRepository.listRoles();
  }

  async getRole(id: string) {
    const role = await this.adminRepository.findRoleById(id);
    if (!role) {
      throw new NotFoundError('Role not found');
    }
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((p) => ({
        id: p.permission.id,
        name: p.permission.name,
        description: p.permission.description,
      })),
    };
  }

  async createRole(data: { name: string; description?: string; permissions?: string[] }) {
    const existing = await this.adminRepository.findRoleByName(data.name);
    if (existing) {
      throw new ConflictError('A role with this name already exists');
    }

    const role = await this.adminRepository.createRole({
      name: data.name,
      description: data.description,
    });

    if (data.permissions && data.permissions.length > 0) {
      const permissions = await this.adminRepository.findPermissionsByNames(data.permissions);
      const permissionIds = permissions.map((p) => p.id);
      await this.adminRepository.updateRolePermissions(role.id, permissionIds);
    }

    return this.getRole(role.id);
  }

  async updateRolePermissions(roleId: string, permissionNames: string[]) {
    const role = await this.adminRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const permissions = await this.adminRepository.findPermissionsByNames(permissionNames);
    if (permissions.length !== permissionNames.length) {
      throw new BadRequestError('One or more specified permission names are invalid');
    }

    const permissionIds = permissions.map((p) => p.id);
    await this.adminRepository.updateRolePermissions(roleId, permissionIds);

    return this.getRole(roleId);
  }

  async updateRole(id: string, data: { name?: string; description?: string }) {
    const role = await this.adminRepository.findRoleById(id);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const systemRoles = Object.values(ROLES) as string[];
    if (data.name && systemRoles.includes(role.name)) {
      throw new ForbiddenError('System roles cannot be renamed');
    }

    if (data.name && data.name !== role.name) {
      const existing = await this.adminRepository.findRoleByName(data.name);
      if (existing) {
        throw new ConflictError('A role with this name already exists');
      }
    }

    await this.adminRepository.updateRole(id, data);
    return this.getRole(id);
  }

  async deleteRole(id: string) {
    const role = await this.adminRepository.findRoleById(id);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const systemRoles = Object.values(ROLES) as string[];
    if (systemRoles.includes(role.name)) {
      throw new ForbiddenError('System roles cannot be deleted');
    }

    const usersCount = await this.adminRepository.countUsersByRole(id);
    if (usersCount > 0) {
      throw new ConflictError(
        `Cannot delete role '${role.name}'. ${usersCount} user(s) are currently assigned to this role.`
      );
    }

    await this.adminRepository.deleteRole(id);
  }

  async getPermissions() {
    const permissions = await this.adminRepository.listPermissions();

    const MODULE_LABELS: Record<string, string> = {
      dashboard: 'Dashboard',
      notification: 'Notifications',
      search: 'Search',
      user: 'User Management',
      role: 'Role Management',
      branch: 'Branch Management',
      customer: 'Customer Management',
      vehicle: 'Vehicle Management',
      appointment: 'Service — Appointments',
      enquiry: 'Enquiries',
      jobcard: 'Service — Job Cards',
      'labour-item': 'Labour Catalogue',
      'labour-rate': 'Model Labour Rates',
      inspection: 'Service — Inspections',
      estimate: 'Service — Estimates',
      services: 'Services Catalog',
      assignment: 'Workshop — Assignments',
      jobprogress: 'Workshop — Job Progress',
      qcstatus: 'Workshop — Quality Control',
      workshop: 'Workshop',
      sparepart: 'Inventory — Spare Parts',
      stock: 'Inventory — Stock',
      purchaserequest: 'Inventory — Purchase Requests',
      partissuance: 'Inventory — Issuances',
      partreturn: 'Inventory — Returns',
      transfer: 'Inventory — Transfers',
      invoice: 'Finance — Invoices',
      payment: 'Finance — Payments',
      receipt: 'Finance — Receipts',
      financereport: 'Finance — Reports',
      report: 'Reports',
      corporate: 'Corporate Groups',
      credit: 'Credit Management',
      audit: 'Audit Management',
      books: 'Books Closed (Year End)',
      warranty: 'Warranty',
      campaign: 'Campaigns (Recall / Field Fix)',
    };

    const groupsMap = new Map<string, typeof permissions>();
    for (const permission of permissions) {
      const prefix = permission.name.split(':')[0];
      const isCsi = prefix === 'csi' || /^report:csi(?:-|$)/.test(permission.name);
      const module = isCsi
        ? 'Customer satisfaction (CSI)'
        : MODULE_LABELS[prefix] || `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Management`;
      if (!groupsMap.has(module)) {
        groupsMap.set(module, []);
      }
      groupsMap.get(module)!.push(permission);
    }

    const groups = Array.from(groupsMap.entries()).map(([module, perms]) => ({
      module,
      permissions: perms.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
    }));

    return {
      permissions: permissions.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
      groups,
    };
  }
}
export default AdminService;
