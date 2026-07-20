import prisma from "../../prisma/client";
import { User, Role, RefreshToken } from "@prisma/client";

export interface UserWithRoleAndPermissions extends User {
  role: Role & {
    permissions: {
      permission: {
        name: string;
      };
    }[];
  };
}

export class AuthRepository {
  async findByEmail(email: string): Promise<UserWithRoleAndPermissions | null> {
    return prisma.user.findUnique({
      where: { email },
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
    }) as Promise<UserWithRoleAndPermissions | null>;
  }

  async findById(id: string): Promise<UserWithRoleAndPermissions | null> {
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
    }) as Promise<UserWithRoleAndPermissions | null>;
  }

  async findRoleByName(name: string): Promise<Role | null> {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleId: string;
    branchId?: string;
  }): Promise<UserWithRoleAndPermissions> {
    return prisma.user.create({
      data,
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
    }) as Promise<UserWithRoleAndPermissions>;
  }

  async saveRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  async findRefreshToken(
    token: string,
  ): Promise<(RefreshToken & { user: UserWithRoleAndPermissions }) | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: {
        user: {
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
        },
      },
    }) as Promise<(RefreshToken & { user: UserWithRoleAndPermissions }) | null>;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async countUsers(): Promise<number> {
    return prisma.user.count();
  }

  async createAuditLog(data: {
    action: string;
    details?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await prisma.auditLog.create({
      data,
    });
  }
}
export default AuthRepository;
