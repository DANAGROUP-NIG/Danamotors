import bcrypt from 'bcrypt';
import { AdminRepository } from './admin.repository';
import { BadRequestError, NotFoundError, ConflictError } from '../../shared/errors/appError';

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
  }) {
    const skip = (params.page - 1) * params.limit;
    const { users, total } = await this.adminRepository.listUsers({
      skip,
      take: params.limit,
      search: params.search,
      roleId: params.roleId,
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

  async getPermissions() {
    return this.adminRepository.listPermissions();
  }
}
export default AdminService;
