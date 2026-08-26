import bcrypt from 'bcryptjs';
import { AdminRepository } from './admin.repository';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

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
      users: users.map((u) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...rest } = u as any;
        return rest;
      }),
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
    const { passwordHash, ...rest } = user as any;
    
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...rest } = user as any;
    return rest;
  }

  async updateUser(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      roleId?: string;
      isActive?: boolean;
    }
  ) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (data.roleId) {
      const role = await this.adminRepository.findRoleById(data.roleId);
      if (!role) {
        throw new NotFoundError('The specified role does not exist');
      }
    }

    const updated = await this.adminRepository.updateUser(id, data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = updated as any;
    return rest;
  }

  async deleteUser(id: string) {
    const user = await this.adminRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    await this.adminRepository.deleteUser(id);
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
      user: 'User Management',
      role: 'Role Management',
      branch: 'Branch Management',
      customer: 'Customer Management',
      vehicle: 'Vehicle Management',
      appointment: 'Service — Appointments',
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
      credit: 'Credit Management',
      audit: 'Audit Management',
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
