import { Router } from 'express';
import { BranchController } from './branch.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  createBranchSchema,
  updateBranchSchema,
  branchIdParamSchema,
} from './branch.validation';

const router = Router();
const controller = new BranchController();

/**
 * @openapi
 * /branches:
 *   get:
 *     tags:
 *       - Branches
 *     summary: List all branches (public)
 *     description: Returns all branches. No authentication required.
 *     security: []
 *     responses:
 *       200:
 *         description: List of branches
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BranchDTO'
 *   post:
 *     tags:
 *       - Branches
 *     summary: Create a new branch
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, address]
 *             properties:
 *               name: { type: string, example: Ikeja Branch }
 *               address: { type: string, example: 14 Allen Avenue, Ikeja }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Branch created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BranchDTO'
 *
 * /branches/{id}:
 *   get:
 *     tags:
 *       - Branches
 *     summary: Get branch by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Branch details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BranchDTO'
 *   put:
 *     tags:
 *       - Branches
 *     summary: Update branch details
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
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               email: { type: string, format: email }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Branch updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *   delete:
 *     tags:
 *       - Branches
 *     summary: Delete a branch
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Branch deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/', controller.getBranches);

router.use(authMiddleware);

router.get('/:id', requirePermission(PERMISSIONS.BRANCH_READ), validateRequest(branchIdParamSchema), controller.getBranch);
router.post('/', requirePermission(PERMISSIONS.BRANCH_CREATE), validateRequest(createBranchSchema), controller.createBranch);
router.put('/:id', requirePermission(PERMISSIONS.BRANCH_UPDATE), validateRequest(updateBranchSchema), controller.updateBranch);
router.delete('/:id', requirePermission(PERMISSIONS.BRANCH_DELETE), validateRequest(branchIdParamSchema), controller.deleteBranch);

export default router;

