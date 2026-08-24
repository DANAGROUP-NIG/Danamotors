import prisma from "../../prisma/client";
import { User, Role, RefreshToken, Customer, CustomerAccount, CustomerRefreshToken } from "@prisma/client";

export interface UserWithRoleAndPermissions extends User {
  role: Role & {
    permissions: {
      permission: {
        name: string;
      };
    }[];
  };
}

export interface CustomerWithAccount extends Customer {
  account: (CustomerAccount & {
    customer?: Pick<Customer, "id" | "email" | "branchId">;
  }) | null;
}

export interface CustomerRefreshTokenWithAccount
  extends CustomerRefreshToken {
  customerAccount: CustomerAccount & {
    customer: Pick<Customer, "id" | "email" | "branchId">;
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

  async findCustomerByEmail(
    email: string,
  ): Promise<CustomerWithAccount | null> {
    return prisma.customer.findUnique({
      where: { email },
      include: { account: true },
    }) as Promise<CustomerWithAccount | null>;
  }

  async findCustomerById(
    customerId: string,
  ): Promise<CustomerWithAccount | null> {
    return prisma.customer.findUnique({
      where: { id: customerId },
      include: { account: true },
    }) as Promise<CustomerWithAccount | null>;
  }

  async createCustomerAccount(
    customerId: string,
    passwordHash: string,
  ): Promise<CustomerAccount> {
    return prisma.customerAccount.create({
      data: { customerId, passwordHash },
    });
  }

  async saveCustomerRefreshToken(
    customerAccountId: string,
    token: string,
    expiresAt: Date,
  ): Promise<CustomerRefreshToken> {
    return prisma.customerRefreshToken.create({
      data: {
        token,
        customerAccountId,
        expiresAt,
      },
    });
  }

  async findCustomerRefreshToken(
    token: string,
  ): Promise<CustomerRefreshTokenWithAccount | null> {
    return prisma.customerRefreshToken.findUnique({
      where: { token },
      include: {
        customerAccount: {
          include: {
            customer: {
              select: { id: true, email: true, branchId: true },
            },
          },
        },
      },
    }) as Promise<CustomerRefreshTokenWithAccount | null>;
  }

  async deleteCustomerRefreshToken(token: string): Promise<void> {
    await prisma.customerRefreshToken.deleteMany({
      where: { token },
    });
  }

  async deleteCustomerRefreshTokens(customerAccountId: string): Promise<void> {
    await prisma.customerRefreshToken.deleteMany({
      where: { customerAccountId },
    });
  }

  async findCustomerByResetTokenHash(
    tokenHash: string,
  ): Promise<{ id: string; resetTokenExpiry: Date | null } | null> {
    return prisma.customerAccount.findFirst({
      where: { resetTokenHash: tokenHash },
      select: { id: true, resetTokenExpiry: true },
    });
  }

  async findByResetTokenHash(
    tokenHash: string,
  ): Promise<{ id: string; resetTokenExpiry: Date | null } | null> {
    return prisma.user.findFirst({
      where: { resetTokenHash: tokenHash },
      select: { id: true, resetTokenExpiry: true },
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
