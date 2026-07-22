import prisma from '../../prisma/client';
import { User, Role, Permission } from '@prisma/client';

export class AdminRepository {
  async listUsers(params: {
    skip: number;
    take: number;
    search?: string;
    roleId?: string;
    branchId?: string;
  }): Promise<{ users: User[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (params.roleId) {
      where.roleId = params.roleId;
    }

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleId: string;
    branchId: string;
  }): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async deleteUser(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }

  async listRoles(): Promise<(Role & { permissionsCount: number })[]> {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: { permissions: true },
        },
      },
    });
    return roles.map((role) => ({
      ...role,
      permissionsCount: role._count.permissions,
    }));
  }

  async findRoleById(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findRoleByName(name: string): Promise<Role | null> {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  async createRole(data: { name: string; description?: string }): Promise<Role> {
    return prisma.role.create({
      data,
    });
  }

  async listPermissions(): Promise<Permission[]> {
    return prisma.permission.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findPermissionsByNames(names: string[]): Promise<Permission[]> {
    return prisma.permission.findMany({
      where: {
        name: { in: names },
      },
    });
  }

  async findBranchByName(name: string) {
    return prisma.branch.findUnique({
      where: { name },
    });
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId },
      }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        })),
      }),
    ]);
  }
}
export default AdminRepository;
