import { Router } from 'express';
import { AdminController } from './admin.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import {
  createUserSchema,
  updateUserSchema,
  createRoleSchema,
  updateRolePermissionsSchema,
  userIdParamSchema,
  roleIdParamSchema,
} from './admin.validation';

const router = Router();
const controller = new AdminController();

// Apply auth middleware to all administration routes
router.use(authMiddleware);

// User Management
/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags:
 *       - Administration
 *     summary: List all users
 *     description: Returns a paginated list of all staff users. Requires USER_READ permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/UserDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags:
 *       - Administration
 *     summary: Create a new user
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, roleName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phoneNumber: { type: string }
 *               roleName: { type: string, example: TECHNICIAN }
 *               branchId: { type: string }
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UserDTO'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
router.get('/users', requirePermission(PERMISSIONS.USER_READ), controller.getUsers);

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags:
 *       - Administration
 *     summary: Get user by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UserDTO'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   put:
 *     tags:
 *       - Administration
 *     summary: Update user (Admin/Super-Admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phoneNumber: { type: string }
 *               roleName: { type: string }
 *               branchId: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/UserDTO'
 *   delete:
 *     tags:
 *       - Administration
 *     summary: Delete a user
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/users/:id', requirePermission(PERMISSIONS.USER_READ), validateRequest(userIdParamSchema), controller.getUser);
router.post('/users', requirePermission(PERMISSIONS.USER_CREATE), validateRequest(createUserSchema), controller.createUser);
// Only admins and superadmins can update users — enforced by role, not just DB permissions
router.put('/users/:id', requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN), requirePermission(PERMISSIONS.USER_UPDATE), validateRequest(updateUserSchema), controller.updateUser);
router.delete('/users/:id', requirePermission(PERMISSIONS.USER_DELETE), validateRequest(userIdParamSchema), controller.deleteUser);

// Roles & Permissions Management
/**
 * @openapi
 * /admin/roles:
 *   get:
 *     tags:
 *       - Administration
 *     summary: List all roles
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   post:
 *     tags:
 *       - Administration
 *     summary: Create a new role
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: SERVICE_ADVISOR }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /admin/roles/{id}:
 *   get:
 *     tags:
 *       - Administration
 *     summary: Get role by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Role details with permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /admin/roles/{id}/permissions:
 *   put:
 *     tags:
 *       - Administration
 *     summary: Update role permissions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [permissions]
 *             properties:
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *                 example: [CUSTOMER_READ, VEHICLE_READ]
 *     responses:
 *       200:
 *         description: Permissions updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /admin/permissions:
 *   get:
 *     tags:
 *       - Administration
 *     summary: List all available permissions
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Full list of system permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/roles', requirePermission(PERMISSIONS.ROLE_READ), controller.getRoles);
router.get('/roles/:id', requirePermission(PERMISSIONS.ROLE_READ), validateRequest(roleIdParamSchema), controller.getRole);
router.post('/roles', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(createRoleSchema), controller.createRole);
router.put('/roles/:id/permissions', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(updateRolePermissionsSchema), controller.updateRolePermissions);

router.get('/permissions', requirePermission(PERMISSIONS.ROLE_READ), controller.getPermissions);

export default router;

