import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';
import { assertBranchOwnership } from '../../middleware/authorize';
import { ROLES } from '../../shared/constants/roles';
import prisma from '../../prisma/client';

export class AdminController {
  private adminService: AdminService;

  constructor() {
    this.adminService = new AdminService();
  }

  getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = zCoerceNumber(req.query.page, 1);
      const limit = zCoerceNumber(req.query.limit, 10);
      const search = req.query.search as string | undefined;
      const roleId = req.query.roleId as string | undefined;
      let branchId = req.query.branchId as string | undefined;

      // Only SuperAdmin can see all branches; admin and everyone else are locked to their branch
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN) {
        branchId = req.user.branchId ?? undefined;
      }

      const result = await this.adminService.getUsers({
        page,
        limit,
        search,
        roleId,
        branchId,
      });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.adminService.getUser(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          user: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, firstName, lastName, phoneNumber, roleId, branchName } = req.body;

      // Admin can only create users in their own branch — override branchName with their branch
      let enforcedBranchName = branchName;
      if (req.user && req.user.role !== ROLES.SUPER_ADMIN && req.user.branchId) {
        const userBranch = await prisma.branch.findUnique({ where: { id: req.user.branchId } });
        enforcedBranchName = userBranch?.name ?? branchName;
      }

      const result = await this.adminService.createUser({
        email,
        passwordHash: password,
        firstName,
        lastName,
        phoneNumber,
        roleId,
        branchName: enforcedBranchName,
      });

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'User created successfully by administrator',
        data: {
          user: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { firstName, lastName, phoneNumber, roleId, isActive } = req.body;

      const existingUser = await this.adminService.getUser(id);
      assertBranchOwnership(req, (existingUser as any).branchId);

      const result = await this.adminService.updateUser(id, {
        firstName,
        lastName,
        phoneNumber,
        roleId,
        isActive,
      });

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'User updated successfully',
        data: {
          user: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existingUser = await this.adminService.getUser(id);
      assertBranchOwnership(req, (existingUser as any).branchId);

      await this.adminService.deleteUser(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getRoles = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.adminService.getRoles();

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          roles: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.adminService.getRole(id);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          role: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  createRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description, permissions } = req.body;
      const result = await this.adminService.createRole({
        name,
        description,
        permissions,
      });

      res.status(201).json({
        status: 'success',
        statusCode: 201,
        message: 'Role created successfully',
        data: {
          role: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateRolePermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      const result = await this.adminService.updateRolePermissions(id, permissions);

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        message: 'Role permissions updated successfully',
        data: {
          role: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getPermissions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.adminService.getPermissions();

      res.status(200).json({
        status: 'success',
        statusCode: 200,
        data: {
          permissions: result,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

function zCoerceNumber(val: any, fallback: number): number {
  if (val === undefined || val === null) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

export default AdminController;
