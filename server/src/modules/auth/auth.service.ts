import bcrypt from 'bcryptjs'
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import prisma from "../../prisma/client";
import { AuthRepository } from "./auth.repository";
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "../../shared/errors/appError";
import { LoginResponse } from "./auth.types";
import { ROLES } from "../../shared/constants/roles";

// Roles users are allowed to request during public self-registration.
// Privileged roles (admins, managers, accountants) must be assigned by an
// administrator through the admin module.
const SELF_SERVICE_ROLES: string[] = [
  ROLES.RECEPTIONIST,
  ROLES.TECHNICIAN,
  ROLES.SERVICE_ADVISOR,
];

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  private generateAccessToken(payload: {
    userId: string;
    email: string;
    role: string;
    permissions: string[];
    branchId?: string | null;
  }): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRATION as any,
    });
  }

  private generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRATION as any,
    });
  }

  private generateCustomerAccessToken(payload: {
    customerId: string;
    email: string;
    branchId?: string | null;
  }): string {
    return jwt.sign(
      {
        customerId: payload.customerId,
        email: payload.email,
        role: "customer",
        permissions: ["customer:self"],
        branchId: payload.branchId ?? null,
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRATION as any },
    );
  }

  private generateCustomerRefreshToken(payload: {
    customerId: string;
  }): string {
    return jwt.sign(
      { type: "customer", customerId: payload.customerId },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRATION as any },
    );
  }

  // Register service
  async register(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleName?: string;
    branchName?: string;
  }): Promise<LoginResponse> {
    const existingUser = await this.authRepository.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError("A user with this email address already exists");
    }

    const passwordHash = await bcrypt.hash(data.passwordHash, 10);
    const userCount = await this.authRepository.countUsers();

    let roleToAssign = ROLES.RECEPTIONIST as string;

    // Auto-promote first user to SuperAdmin
    if (userCount === 0) {
      roleToAssign = ROLES.SUPER_ADMIN;
    } else if (data.roleName) {
      // Only non-privileged roles may be self-assigned
      if (!SELF_SERVICE_ROLES.includes(data.roleName)) {
        throw new BadRequestError(
          `Role '${data.roleName}' cannot be self-assigned. Contact an administrator.`,
        );
      }
      const roleExists = await this.authRepository.findRoleByName(
        data.roleName,
      );
      if (!roleExists) {
        throw new BadRequestError(`Role '${data.roleName}' does not exist`);
      }
      roleToAssign = data.roleName;
    }

    const role = await this.authRepository.findRoleByName(roleToAssign);
    if (!role) {
      throw new BadRequestError("Assigned role was not found in the database");
    }

    // Resolve branchName to branchId if provided
    let branchId: string | undefined;
    if (data.branchName) {
      const branch = await prisma.branch.findFirst({
        where: { name: data.branchName },
      });
      if (!branch) {
        throw new BadRequestError(`Branch '${data.branchName}' does not exist`);
      }
      branchId = branch.id;
    }

    const newUser = await this.authRepository.createUser({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      roleId: role.id,
      branchId,
    });

    const permissions = newUser.role.permissions.map((p) => p.permission.name);

    const jwtPayload = {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role.name,
      permissions,
      branchId: newUser.branchId ?? null,
    };

    const accessToken = this.generateAccessToken(jwtPayload);
    const refreshToken = this.generateRefreshToken({ userId: newUser.id });

    // Expiry date calculation for refresh token
    const refreshExpiry = new Date();
    // Default to 7 days if parsing fails
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.authRepository.saveRefreshToken(
      newUser.id,
      hashToken(refreshToken),
      refreshExpiry,
    );

    await this.authRepository.createAuditLog({
      action: "USER_REGISTERED",
      details: `User registered successfully with role: ${newUser.role.name}`,
      userId: newUser.id,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role.name,
        permissions,
        branchId: newUser.branchId,
      },
    };
  }

  // Login Service. Auto-detects whether the email belongs to a staff user or a
  // customer portal account.
  async login(
    data: { email: string; passwordHash: string }, // passwordHash is the plain text password passed from controller
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    // ── Staff login ────────────────────────────────────────────────────────
    const user = await this.authRepository.findByEmail(data.email);
    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedError("Your account has been deactivated");
      }

      const isPasswordValid = await bcrypt.compare(
        data.passwordHash,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedError("Invalid email or password");
      }

      const permissions = user.role.permissions.map((p) => p.permission.name);

      const jwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role.name,
        permissions,
        branchId: user.branchId ?? null,
      };

      const accessToken = this.generateAccessToken(jwtPayload);
      const refreshToken = this.generateRefreshToken({ userId: user.id });

      const refreshExpiry = new Date();
      refreshExpiry.setDate(refreshExpiry.getDate() + 7);

      await this.authRepository.saveRefreshToken(
        user.id,
        hashToken(refreshToken),
        refreshExpiry,
      );

      await this.authRepository.createAuditLog({
        action: "USER_LOGIN",
        details: "User logged in successfully",
        userId: user.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.name,
          permissions,
          branchId: user.branchId,
        },
      };
    }

    // ── Customer portal login ──────────────────────────────────────────────
    const customer = await this.authRepository.findCustomerByEmail(data.email);
    if (customer) {
      if (!customer.account) {
        throw new UnauthorizedError(
          "No portal account exists for this email. Contact the workshop to set one up.",
        );
      }

      if (!customer.account.isActive) {
        throw new UnauthorizedError("Your account has been deactivated");
      }

      const isPasswordValid = await bcrypt.compare(
        data.passwordHash,
        customer.account.passwordHash,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedError("Invalid email or password");
      }

      await prisma.customerAccount.update({
        where: { id: customer.account.id },
        data: { lastLoginAt: new Date() },
      });

      const accessToken = this.generateCustomerAccessToken({
        customerId: customer.id,
        email: customer.email,
        branchId: customer.branchId,
      });
      const refreshToken = this.generateCustomerRefreshToken({
        customerId: customer.id,
      });

      const refreshExpiry = new Date();
      refreshExpiry.setDate(refreshExpiry.getDate() + 7);

      await this.authRepository.saveCustomerRefreshToken(
        customer.account.id,
        hashToken(refreshToken),
        refreshExpiry,
      );

      return {
        accessToken,
        refreshToken,
        user: {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phoneNumber: customer.phoneNumber ?? undefined,
          role: "customer",
          permissions: ["customer:self"],
          branchId: customer.branchId,
        },
      };
    }

    throw new UnauthorizedError("Invalid email or password");
  }

  // Refresh token service. Handles both staff and customer refresh tokens.
  async refresh(token: string): Promise<{ accessToken: string }> {
    // Verify the signature first so we know which account type this token is for.
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    } catch (error) {
      throw new UnauthorizedError("Invalid refresh token signature");
    }

    // ── Customer refresh ───────────────────────────────────────────────────
    if (decoded.type === "customer") {
      const tokenHash = hashToken(token);
      const dbToken =
        await this.authRepository.findCustomerRefreshToken(tokenHash);
      if (!dbToken || dbToken.expiresAt < new Date()) {
        if (dbToken) {
          await this.authRepository.deleteCustomerRefreshToken(tokenHash);
        }
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      const account = dbToken.customerAccount;
      if (!account.isActive) {
        await this.authRepository.deleteCustomerRefreshToken(tokenHash);
        throw new UnauthorizedError("Your account has been deactivated");
      }

      const accessToken = this.generateCustomerAccessToken({
        customerId: account.customer.id,
        email: account.customer.email,
        branchId: account.customer.branchId,
      });
      return { accessToken };
    }

    // ── Staff refresh (existing behaviour) ─────────────────────────────────
    const tokenHash = hashToken(token);
    const dbToken = await this.authRepository.findRefreshToken(tokenHash);
    if (!dbToken || dbToken.expiresAt < new Date()) {
      if (dbToken) {
        await this.authRepository.deleteRefreshToken(tokenHash);
      }
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const user = dbToken.user;
    const permissions = user.role.permissions.map((p) => p.permission.name);

    if (!user.isActive) {
      await this.authRepository.deleteRefreshToken(tokenHash);
      throw new UnauthorizedError("Your account has been deactivated");
    }

    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      permissions,
      branchId: user.branchId ?? null,
    };

    const accessToken = this.generateAccessToken(jwtPayload);
    return { accessToken };
  }

  // logout
  async logout(token: string): Promise<void> {
    const tokenHash = hashToken(token);

    const customerToken =
      await this.authRepository.findCustomerRefreshToken(tokenHash);
    if (customerToken) {
      await this.authRepository.deleteCustomerRefreshToken(tokenHash);
      return;
    }

    const dbToken = await this.authRepository.findRefreshToken(tokenHash);
    if (dbToken) {
      await this.authRepository.deleteRefreshToken(tokenHash);
      await this.authRepository.createAuditLog({
        action: "USER_LOGOUT",
        details: "User logged out",
        userId: dbToken.userId,
      });
    }
  }

  // logout all
  async logoutAll(userId: string): Promise<void> {
    await this.authRepository.deleteUserRefreshTokens(userId);
    await this.authRepository.createAuditLog({
      action: "USER_LOGOUT_ALL",
      details: "User logged out from all devices",
      userId,
    });
  }

  // ── Customer portal ──────────────────────────────────────────────────────

  // Customer self-registration. Links to an existing Customer record by email
  // so the account is tied to the correct customer profile.
  async registerCustomer(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }): Promise<LoginResponse> {
    const customer = await this.authRepository.findCustomerByEmail(data.email);
    if (!customer) {
      throw new BadRequestError(
        "No customer record matches this email. Contact the workshop to be registered.",
      );
    }
    if (customer.account) {
      throw new ConflictError(
        "A portal account already exists for this email. Please sign in.",
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const account = await this.authRepository.createCustomerAccount(
      customer.id,
      passwordHash,
    );

    const accessToken = this.generateCustomerAccessToken({
      customerId: customer.id,
      email: customer.email,
      branchId: customer.branchId,
    });
    const refreshToken = this.generateCustomerRefreshToken({
      customerId: customer.id,
    });

    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.authRepository.saveCustomerRefreshToken(
      account.id,
      hashToken(refreshToken),
      refreshExpiry,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneNumber: customer.phoneNumber ?? undefined,
        role: "customer",
        permissions: ["customer:self"],
        branchId: customer.branchId,
      },
    };
  }

  // get me (customer)
  async getMeCustomer(customerId: string) {
    const customer = await this.authRepository.findCustomerById(customerId);
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }
    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phoneNumber: customer.phoneNumber,
      role: "customer",
      permissions: ["customer:self"],
      branchId: customer.branchId,
    };
  }

  // update my profile (customer)
  async updateMeCustomer(
    customerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      preferredContactMethod?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const customer = await this.authRepository.findCustomerById(customerId);
    if (!customer) {
      throw new UnauthorizedError("Customer session not found");
    }

    let passwordHash: string | undefined;
    if (data.newPassword) {
      if (!customer.account) {
        throw new BadRequestError("No portal account exists for this customer");
      }
      if (!data.currentPassword) {
        throw new BadRequestError(
          "Current password is required to set a new password",
        );
      }
      const isPasswordValid = await bcrypt.compare(
        data.currentPassword,
        customer.account.passwordHash,
      );
      if (!isPasswordValid) {
        throw new BadRequestError("Current password is incorrect");
      }
      passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    const [updated] = await Promise.all([
      prisma.customer.update({
        where: { id: customerId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          address: data.address,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          country: data.country,
          preferredContactMethod: data.preferredContactMethod,
        },
      }),
      passwordHash
        ? prisma.customerAccount.update({
            where: { customerId },
            data: { passwordHash },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phoneNumber: updated.phoneNumber,
      role: "customer",
      permissions: ["customer:self"],
      branchId: updated.branchId,
    };
  }

  // Request a password reset for either a staff user or a customer account.
  async forgotPassword(email: string): Promise<{ resetLink: string } | null> {
    const user = await this.authRepository.findByEmail(email);
    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: hashToken(token),
          resetTokenExpiry: expiresAt,
        },
      });

      await this.authRepository.createAuditLog({
        action: "PASSWORD_RESET_REQUESTED",
        details: "Password reset link requested",
        userId: user.id,
      });

      const baseUrl =
        (process.env.CLIENT_URL as string | undefined) ??
        "http://localhost:3000";
      return { resetLink: `${baseUrl}/reset-password?token=${token}` };
    }

    const customer = await this.authRepository.findCustomerByEmail(email);
    if (customer && customer.account && customer.account.isActive) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.customerAccount.update({
        where: { id: customer.account.id },
        data: {
          resetTokenHash: hashToken(token),
          resetTokenExpiry: expiresAt,
        },
      });

      const baseUrl =
        (process.env.CLIENT_URL as string | undefined) ??
        "http://localhost:3000";
      return { resetLink: `${baseUrl}/reset-password?token=${token}` };
    }

    // Always resolve successfully so the endpoint cannot be used to probe emails.
    return null;
  }

  // Complete a password reset using a valid, unexpired one-time token.
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Staff user reset.
    const record = await this.authRepository.findByResetTokenHash(tokenHash);
    if (
      record &&
      record.resetTokenExpiry &&
      record.resetTokenExpiry >= new Date()
    ) {
      await prisma.user.update({
        where: { id: record.id },
        data: {
          passwordHash,
          resetTokenHash: null,
          resetTokenExpiry: null,
        },
      });
      await this.authRepository.deleteUserRefreshTokens(record.id);
      await this.authRepository.createAuditLog({
        action: "PASSWORD_RESET_COMPLETED",
        details: "Password reset completed",
        userId: record.id,
      });
      return;
    }

    // Customer account reset.
    const customerRecord =
      await this.authRepository.findCustomerByResetTokenHash(tokenHash);
    if (
      !customerRecord ||
      !customerRecord.resetTokenExpiry ||
      customerRecord.resetTokenExpiry < new Date()
    ) {
      throw new BadRequestError("Invalid or expired password reset token");
    }

    await prisma.customerAccount.update({
      where: { id: customerRecord.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiry: null,
      },
    });
    await this.authRepository.deleteCustomerRefreshTokens(customerRecord.id);
  }

  // get me
  async getMe(userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User session not found");
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role.name,
      permissions: user.role.permissions.map((p) => p.permission.name),
      branchId: user.branchId,
    };
  }

  // update my profile
  async updateMe(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User session not found");
    }

    let passwordHash: string | undefined;
    if (data.newPassword) {
      if (!data.currentPassword) {
        throw new BadRequestError(
          "Current password is required to set a new password",
        );
      }
      const isPasswordValid = await bcrypt.compare(
        data.currentPassword,
        user.passwordHash,
      );
      if (!isPasswordValid) {
        throw new BadRequestError("Current password is incorrect");
      }
      passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        passwordHash,
      },
    });

    await this.authRepository.createAuditLog({
      action: "USER_PROFILE_UPDATED",
      details: "User updated their own profile",
      userId,
    });

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phoneNumber: updated.phoneNumber,
      role: user.role.name,
      permissions: user.role.permissions.map((p) => p.permission.name),
      branchId: updated.branchId,
    };
  }
}
export default AuthService;
