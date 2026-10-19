import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { assertBranchOwnership, canAccessAllBranches, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { EmployeeService } from './employee.service';
import { createEmployeeSchema, employeeIdSchema, listEmployeeSchema, updateEmployeeSchema } from './employee.validation';

const router = Router();
const service = new EmployeeService();
router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Employees
 *     description: |
 *       Legacy Employee Master. Every workshop employee, with or without a login. Job cards name
 *       mechanics, the main mechanic and the employee group by employee code. An employee with a
 *       left date drops out of the current list but stays on old documents.
 *
 * /employees:
 *   get:
 *     tags: [Employees]
 *     summary: List employees (own branch unless the user can see all branches)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: teamId, schema: { type: string, format: uuid } }
 *       - { in: query, name: designationId, schema: { type: string, format: uuid } }
 *       - { in: query, name: status, schema: { type: string, enum: [CURRENT, LEFT, ALL], default: CURRENT } }
 *   post:
 *     tags: [Employees]
 *     summary: Create an employee (code is unique per branch)
 * /employees/{id}:
 *   get:
 *     tags: [Employees]
 *     summary: Get an employee
 *   put:
 *     tags: [Employees]
 *     summary: Update an employee; code and branch are fixed
 */
router.get('/', requirePermission(PERMISSIONS.EMPLOYEE_READ), validateRequest(listEmployeeSchema), async (req, res, next) => {
  try {
    const query = listEmployeeSchema.parse({
      query: req.query,
    }).query;

    const branchId = canAccessAllBranches(req.user) ? query.branchId : req.user!.branchId ?? undefined;
    if (!branchId)
      assertBranchOwnership(req);

    res.json({
      status: 'success',
      data: await service.list(query, branchId),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermission(PERMISSIONS.EMPLOYEE_READ), validateRequest(employeeIdSchema), async (req, res, next) => {
  try {
    const item = await service.get(req.params.id);
    assertBranchOwnership(req, item.branchId);

    res.json({
      status: 'success',

      data: {
        item,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission(PERMISSIONS.EMPLOYEE_MANAGE), validateRequest(createEmployeeSchema), async (req, res, next) => {
  try {
    assertBranchOwnership(req, req.body.branchId);

    res.status(201).json({
      status: 'success',

      data: {
        item: await service.create(req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission(PERMISSIONS.EMPLOYEE_MANAGE), validateRequest(updateEmployeeSchema), async (req, res, next) => {
  try {
    assertBranchOwnership(req, (await service.get(req.params.id)).branchId);

    res.json({
      status: 'success',

      data: {
        item: await service.update(req.params.id, req.body),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
