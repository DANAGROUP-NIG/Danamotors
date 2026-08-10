import bcrypt from "bcrypt";
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

  // Login Service
  async login(
    data: { email: string; passwordHash: string }, // passwordHash is the plain text password passed from controller
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const user = await this.authRepository.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

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

  // Refresh token service
  async refresh(token: string): Promise<{ accessToken: string }> {
    const tokenHash = hashToken(token);
    const dbToken = await this.authRepository.findRefreshToken(tokenHash);
    if (!dbToken || dbToken.expiresAt < new Date()) {
      if (dbToken) {
        await this.authRepository.deleteRefreshToken(tokenHash);
      }
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Verify token signature
    try {
      jwt.verify(token, config.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new UnauthorizedError("Invalid refresh token signature");
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
  async updateMe(userId: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    currentPassword?: string;
    newPassword?: string;
  }) {
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

  // Request a password reset. Returns the reset link because no mail transport
  // is wired up yet; the link carries a one-time token that expires in 1 hour.
  async forgotPassword(email: string): Promise<{ resetLink: string } | null> {
    const user = await this.authRepository.findByEmail(email);
    if (!user || !user.isActive) {
      // Always resolve successfully so the endpoint cannot be used to probe emails.
      return null;
    }

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

    const baseUrl = (process.env.CLIENT_URL as string | undefined) ?? "http://localhost:3000";
    return { resetLink: `${baseUrl}/reset-password?token=${token}` };
  }

  // Complete a password reset using a valid, unexpired one-time token.
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.authRepository.findByResetTokenHash(hashToken(token));
    if (!record || !record.resetTokenExpiry || record.resetTokenExpiry < new Date()) {
      throw new BadRequestError("Invalid or expired password reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: record.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiry: null,
      },
    });

    // Invalidate sessions after a password reset.
    await this.authRepository.deleteUserRefreshTokens(record.id);

    await this.authRepository.createAuditLog({
      action: "PASSWORD_RESET_COMPLETED",
      details: "Password reset completed",
      userId: record.id,
    });
  }
}
export default AuthService;
