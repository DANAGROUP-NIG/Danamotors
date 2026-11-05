import bcrypt from 'bcryptjs';
import { AdminRepository } from './admin.repository';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import prisma from '../../prisma/client';

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

type Actor = { userId: string; role: string; branchId?: string | null };
const isAdminRole = (name?: string | null) => name === ROLES.SUPER_ADMIN || name === ROLES.ADMIN;

/**
 * Who may change or delete a user. A super admin may change anyone. Anyone else (an Admin, in their own
 * branch: the controller checks the branch) may not change an Admin or a super admin, give someone the
 * Admin or SuperAdmin role, or move a user to another branch. Nobody deactivates, deletes or re-roles
 * their own account, so a super admin cannot lock themselves out.
 */
export function assertCanChangeUser(
  actor: Actor,
  target: { id: string; branchId: string | null; role: { name: string } },
  change: { roleName?: string; branchId?: string; isActive?: boolean; delete?: boolean },
): void {
  if (actor.userId === target.id) {
    if (change.delete || change.isActive === false)
      throw new BadRequestError('You cannot deactivate or delete your own account');
    if (change.roleName && change.roleName !== target.role.name)
      throw new BadRequestError('You cannot change your own role');
  }
  if (actor.role === ROLES.SUPER_ADMIN)
    return;
  if (isAdminRole(target.role.name))
    throw new ForbiddenError('Only a super admin can change an administrator');
  if (isAdminRole(change.roleName))
    throw new ForbiddenError('Only a super admin can give the Admin or SuperAdmin role');
  if (change.branchId !== undefined && change.branchId !== target.branchId)
    throw new ForbiddenError('Only a super admin can move a user to another branch');
}

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
    const rest = withoutCredentials(user);

    // Map permissions cleanly
    const permissions = user.role.permissions.map((p) => p.permission.name);
    return {
      ...rest,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions,
      },
    };
  }

  async createUser(data: {
    email: string;
    passwordHash: string; // Plain password passed in
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleId: string;
    branchName: string;
  }) {
    const existing = await this.adminRepository.findUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const role = await this.adminRepository.findRoleById(data.roleId);
    if (!role) {
      throw new NotFoundError('The specified role does not exist');
    }

    const branch = await this.adminRepository.findBranchByName(data.branchName);
    if (!branch) {
      throw new NotFoundError(`Branch '${data.branchName}' does not exist`);
    }

    const passwordHash = await bcrypt.hash(data.passwordHash, 10);
    const user = await this.adminRepository.createUser({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      roleId: data.roleId,
      branchId: branch.id,
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
    }
  ) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const role = data.roleId && data.roleId !== user.roleId ? await this.adminRepository.findRoleById(data.roleId) : null;
    if (data.roleId && data.roleId !== user.roleId && !role) {
      throw new NotFoundError('The specified role does not exist');
    }

    const branch = data.branchId && data.branchId !== user.branchId
      ? await prisma.branch.findUnique({ where: { id: data.branchId }, select: { id: true, name: true, isActive: true } })
      : null;
    if (data.branchId && data.branchId !== user.branchId && (!branch || !branch.isActive)) {
      throw new NotFoundError('The specified branch does not exist or is inactive');
    }

    assertCanChangeUser(actor, user, { roleName: role?.name, branchId: data.branchId, isActive: data.isActive });

    // What changed, for the audit log: old → new.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['firstName', 'lastName', 'phoneNumber', 'isActive'] as const) {
      if (data[key] !== undefined && data[key] !== user[key]) changes[key] = { from: user[key], to: data[key] };
    }
    if (role) changes.role = { from: user.role.name, to: role.name };
    if (branch) changes.branch = { from: user.branch?.name ?? null, to: branch.name };

    const updated = await prisma.$transaction(async tx => {
      const saved = await tx.user.update({ where: { id }, data });
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
      warranty: 'Warranty',
      campaign: 'Campaigns (Recall / Free Fix)',
    };

    const groupsMap = new Map<string, typeof permissions>();
    for (const permission of permissions) {
      const prefix = permission.name.split(':')[0];
      const module = MODULE_LABELS[prefix] || `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Management`;
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
