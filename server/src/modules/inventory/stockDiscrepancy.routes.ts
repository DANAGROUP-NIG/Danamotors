import { Router } from 'express';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { authMiddleware } from '../../middleware/authMiddleware';
import { assertInventoryBranchAccess, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { NotFoundError } from '../../shared/errors/appError';
import { approveDiscrepancy, pendingDiscrepancies } from './stockDiscrepancy';

const router = Router();
router.use('/discrepancies', authMiddleware);
router.use('/mrn/:id/approve-discrepancy', authMiddleware);

/**
 * @openapi
 * /inventory/discrepancies:
 *   get:
 *     tags: [Inventory]
 *     summary: MIT and STN receipts whose shortage or damage awaits approval
 *     description: Own branch, or every branch with inventory:cross-branch. Needs stock:discrepancy:approve.
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "Pending receipts, newest first (at most 200)" }
 */
router.get('/discrepancies', requirePermission(PERMISSIONS.STOCK_DISCREPANCY_APPROVE), async (req, res, next) => {
  try {
    const user = req.user!;
    const allBranches = user.role === ROLES.SUPER_ADMIN || user.permissions.includes(PERMISSIONS.INVENTORY_CROSS_BRANCH);
    const items = await pendingDiscrepancies(allBranches ? undefined : [user.branchId ?? '']);
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
});

const approveSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid MRN ID') }),
  body: z.object({ remark: z.string().max(500).optional() }).strict(),
});

/**
 * @openapi
 * /inventory/mrn/{id}/approve-discrepancy:
 *   patch:
 *     tags: [Inventory]
 *     summary: Approve the shortage / damage on an MIT or STN receipt (legacy S/E approval)
 *     description: |
 *       Needs stock:discrepancy:approve and access to the receiving branch. Stock was already posted at
 *       receipt; approval accepts the shortage. Audited as STOCK_DISCREPANCY_APPROVED.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { remark: { type: string, maxLength: 500 } } }
 *     responses:
 *       200: { description: Approved }
 *       400: { description: The MRN has nothing to approve }
 *       409: { description: Already approved }
 */
router.patch(
  '/mrn/:id/approve-discrepancy',
  requirePermission(PERMISSIONS.STOCK_DISCREPANCY_APPROVE),
  validateRequest(approveSchema),
  async (req, res, next) => {
    try {
      const mrn = await prisma.materialReceiptNote.findUnique({ where: { id: req.params.id }, select: { receivingBranchId: true } });
      if (!mrn) throw new NotFoundError('MRN not found');
      assertInventoryBranchAccess(req, [mrn.receivingBranchId]);
      const result = await approveDiscrepancy(req.params.id, req.user!.userId, req.body.remark);
      res.json({ status: 'success', message: 'Shortage approved', data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
