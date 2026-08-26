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
  updateRoleSchema,
  deleteRoleParamSchema,
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
// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/roles — List all roles
// ──────────────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /admin/roles:
 *   get:
 *     operationId: listRoles
 *     tags:
 *       - Administration
 *     summary: List all roles
 *     description: |
 *       Returns a list of all roles in the system, each including:
 *       - `permissionsCount` — number of permissions assigned to the role.
 *       - `usersCount` — number of active users assigned to the role.
 *
 *       Requires the `role:read` permission.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all roles with permission and user counts.
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
 *                         roles:
 *                           type: array
 *                           description: Array of role objects.
 *                           items:
 *                             $ref: '#/components/schemas/RoleDTO'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `role:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /admin/roles/{id}:
 *   get:
 *     operationId: getRole
 *     tags:
 *       - Administration
 *     summary: Get role by ID
 *     description: |
 *       Returns a single role with its full list of assigned permissions.
 *       Each permission includes `id`, `name`, and `description`.
 *
 *       Requires the `role:read` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         description: The UUID of the role.
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Role details with permissions.
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
 *                         role:
 *                           type: object
 *                           properties:
 *                             id: { type: string, format: uuid }
 *                             name: { type: string, example: 'Technician' }
 *                             description: { type: string, nullable: true }
 *                             permissions:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/PermissionDTO'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `role:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not found — no role exists with the given ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   put:
 *     operationId: updateRole
 *     tags:
 *       - Administration
 *     summary: Update role name and description
 *     description: |
 *       Updates the metadata (name and/or description) of a role.
 *
 *       **System role protection:**
 *       The 10 default system roles (SuperAdmin, Admin, GeneralStoreManager,
 *       BranchStoreManager, WorkshopManager, Accountant, ServiceAdviser,
 *       Technician, Receptionist, ReceptionManager) **cannot be renamed**.
 *       Attempting to rename them returns `403 Forbidden`.
 *
 *       **Duplicate name check:**
 *       If the new name conflicts with an existing role, returns `409 Conflict`.
 *
 *       Requires the `role:update` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         description: The UUID of the role to update.
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 description: New role name (must be unique, cannot rename system roles).
 *                 example: 'Senior Technician'
 *               description:
 *                 type: string
 *                 description: New role description.
 *                 example: 'Senior-level repair technician with QC authority'
 *     responses:
 *       200:
 *         description: Role updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: 'Role updated successfully' }
 *                     data:
 *                       type: object
 *                       properties:
 *                         role:
 *                           type: object
 *                           properties:
 *                             id: { type: string, format: uuid }
 *                             name: { type: string, example: 'Senior Technician' }
 *                             description: { type: string, nullable: true }
 *                             permissions:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/PermissionDTO'
 *       400:
 *         description: Validation error — invalid ID format or empty name.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — cannot rename a system role, or user lacks `role:update` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               statusCode: 403
 *               message: 'System roles cannot be renamed'
 *       404:
 *         description: Not found — no role exists with the given ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict — a role with the proposed name already exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               statusCode: 409
 *               message: 'A role with this name already exists'
 *
 *   delete:
 *     operationId: deleteRole
 *     tags:
 *       - Administration
 *     summary: Delete a role
 *     description: |
 *       Deletes a custom role and its associated permission assignments
 *       (cascaded via `RolePermission`).
 *
 *       **Guards:**
 *       - **System roles** (the 10 defaults) **cannot be deleted** — returns `403 Forbidden` with message: `"System roles cannot be deleted"`.
 *       - **Roles with assigned users** cannot be deleted — returns `409 Conflict` with the count of currently assigned users.
 *
 *       Requires the `role:update` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         description: The UUID of the role to delete.
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Role deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: 'Role deleted successfully' }
 *       400:
 *         description: Validation error — invalid UUID format.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — cannot delete a system role, or user lacks `role:update` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               statusCode: 403
 *               message: 'System roles cannot be deleted'
 *       404:
 *         description: Not found — no role exists with the given ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict — role has active user assignments.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               statusCode: 409
 *               message: "Cannot delete role 'Junior Technician'. 3 user(s) are currently assigned to this role."
 *
 * /admin/roles/{id}/permissions:
 *   put:
 *     operationId: updateRolePermissions
 *     tags:
 *       - Administration
 *     summary: Update role permissions
 *     description: |
 *       Replaces all permissions for a role with the provided set.
 *       Existing permissions are removed and new ones are assigned atomically
 *       in a database transaction.
 *
 *       Requires the `role:update` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         description: The UUID of the role to update.
 *         required: true
 *         schema: { type: string, format: uuid }
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
 *                 description: "Array of permission names to assign (e.g. `user:read`, `service:create`)."
 *                 items: { type: string }
 *                 example: ['customer:read', 'vehicle:read', 'service:read']
 *     responses:
 *       200:
 *         description: Permissions updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: 'Role permissions updated successfully' }
 *                     data:
 *                       type: object
 *                       properties:
 *                         role:
 *                           type: object
 *                           properties:
 *                             id: { type: string, format: uuid }
 *                             name: { type: string }
 *                             permissions:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/PermissionDTO'
 *       400:
 *         description: Validation error — invalid ID or missing permissions array.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `role:update` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not found — no role exists with the given ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /admin/permissions:
 *   get:
 *     operationId: listPermissions
 *     tags:
 *       - Administration
 *     summary: List all available permissions
 *     description: |
 *       Returns the full set of system permissions in two formats:
 *       - **`permissions`** — flat array of all permissions (backwards compatible).
 *       - **`groups`** — permissions grouped by module (e.g. "User Management", "Service Management").
 *
 *       Grouping is derived from the permission name prefix (`user:` → "User Management",
 *       `service:` → "Service Management", etc.).
 *
 *       Requires the `role:read` permission.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Full list of system permissions, flat and grouped.
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
 *                         permissions:
 *                           description: Flat array of all permissions.
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/PermissionDTO'
 *                         groups:
 *                           description: Permissions grouped by module.
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/PermissionGroupDTO'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `role:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/roles', requirePermission(PERMISSIONS.ROLE_READ), controller.getRoles);
router.get('/roles/:id', requirePermission(PERMISSIONS.ROLE_READ), validateRequest(roleIdParamSchema), controller.getRole);
router.post('/roles', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(createRoleSchema), controller.createRole);
router.put('/roles/:id', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(updateRoleSchema), controller.updateRole);
router.delete('/roles/:id', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(deleteRoleParamSchema), controller.deleteRole);
router.put('/roles/:id/permissions', requirePermission(PERMISSIONS.ROLE_UPDATE), validateRequest(updateRolePermissionsSchema), controller.updateRolePermissions);

router.get('/permissions', requirePermission(PERMISSIONS.ROLE_READ), controller.getPermissions);

export default router;

