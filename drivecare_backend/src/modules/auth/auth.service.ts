import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthRepository } from './auth.repository';
import { BadRequestError, UnauthorizedError, ConflictError } from '../../shared/errors/appError';
import { LoginResponse } from './auth.types';
import { ROLES } from '../../shared/constants/roles';

export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  private generateAccessToken(payload: { userId: string; email: string; role: string; permissions: string[] }): string {
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRATION as any,
    });
  }

  private generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRATION as any,
    });
  }

  async register(data: {
    email: string;
    passwordHash: string; // Wait, request validator will pass plain password, we hash it here
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    roleName?: string;
  }): Promise<LoginResponse> {
    const existingUser = await this.authRepository.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(data.passwordHash, 10);
    const userCount = await this.authRepository.countUsers();
    
    let roleToAssign = ROLES.CUSTOMER as string;
    
    // Auto-promote first user to SuperAdmin
    if (userCount === 0) {
      roleToAssign = ROLES.SUPER_ADMIN;
    } else if (data.roleName) {
      // Validate role name
      const roleExists = await this.authRepository.findRoleByName(data.roleName);
      if (!roleExists) {
        throw new BadRequestError(`Role '${data.roleName}' does not exist`);
      }
      roleToAssign = data.roleName;
    }

    const role = await this.authRepository.findRoleByName(roleToAssign);
    if (!role) {
      throw new BadRequestError('Assigned role was not found in the database');
    }

    const newUser = await this.authRepository.createUser({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      roleId: role.id,
    });

    const permissions = newUser.role.permissions.map((p) => p.permission.name);

    const jwtPayload = {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role.name,
      permissions,
    };

    const accessToken = this.generateAccessToken(jwtPayload);
    const refreshToken = this.generateRefreshToken({ userId: newUser.id });

    // Expiry date calculation for refresh token
    const refreshExpiry = new Date();
    // Default to 7 days if parsing fails
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.authRepository.saveRefreshToken(newUser.id, refreshToken, refreshExpiry);
    
    await this.authRepository.createAuditLog({
      action: 'USER_REGISTERED',
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
      },
    };
  }

  async login(
    data: { email: string; passwordHash: string }, // passwordHash is the plain text password passed from controller
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<LoginResponse> {
    const user = await this.authRepository.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated');
    }

    const isPasswordValid = await bcrypt.compare(data.passwordHash, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const permissions = user.role.permissions.map((p) => p.permission.name);

    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      permissions,
    };

    const accessToken = this.generateAccessToken(jwtPayload);
    const refreshToken = this.generateRefreshToken({ userId: user.id });

    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiry);

    await this.authRepository.createAuditLog({
      action: 'USER_LOGIN',
      details: 'User logged in successfully',
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
      },
    };
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    const dbToken = await this.authRepository.findRefreshToken(token);
    if (!dbToken || dbToken.expiresAt < new Date()) {
      if (dbToken) {
        await this.authRepository.deleteRefreshToken(token);
      }
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify token signature
    try {
      jwt.verify(token, config.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token signature');
    }

    const user = dbToken.user;
    const permissions = user.role.permissions.map((p) => p.permission.name);

    const jwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      permissions,
    };

    const accessToken = this.generateAccessToken(jwtPayload);
    return { accessToken };
  }

  async logout(token: string): Promise<void> {
    const dbToken = await this.authRepository.findRefreshToken(token);
    if (dbToken) {
      await this.authRepository.deleteRefreshToken(token);
      await this.authRepository.createAuditLog({
        action: 'USER_LOGOUT',
        details: 'User logged out',
        userId: dbToken.userId,
      });
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.authRepository.deleteUserRefreshTokens(userId);
    await this.authRepository.createAuditLog({
      action: 'USER_LOGOUT_ALL',
      details: 'User logged out from all devices',
      userId,
    });
  }

  async getMe(userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User session not found');
    }
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role.name,
      permissions: user.role.permissions.map((p) => p.permission.name),
    };
  }
}
export default AuthService;
