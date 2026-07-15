import { Router } from 'express';
import { AdminController } from './admin.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
  updateRolePermissionsSchema,
  userIdParamSchema,
} from './admin.validation';

const router = Router();
const controller = new AdminController();

// Apply auth middleware to all administration routes
router.use(authMiddleware);

// User Management
router.get('/users', requirePermission(PERMISSIONS.USER_READ), controller.getUsers);
router.get('/users/:id', requirePermission(PERMISSIONS.USER_READ), validateRequest(userIdParamSchema), controller.getUser);
router.post('/users', requirePermission(PERMISSIONS.USER_CREATE), validateRequest(createUserSchema), controller.createUser);
router.put('/users/:id', requirePermission(PERMISSIONS.USER_UPDATE), validateRequest(updateUserSchema), controller.updateUser);

// Roles & Permissions Management
router.get('/roles', requirePermission(PERMISSIONS.ROLE_READ), controller.getRoles);
router.get('/roles/:id', requirePermission(PERMISSIONS.ROLE_READ), controller.getRole);
router.post('/roles', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(createRoleSchema), controller.createRole);
router.put('/roles/:id/permissions', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(updateRolePermissionsSchema), controller.updateRolePermissions);

router.get('/permissions', requirePermission(PERMISSIONS.ROLE_READ), controller.getPermissions);

export default router;
