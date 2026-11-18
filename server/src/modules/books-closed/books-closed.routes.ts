import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { closingCheck, getBooksClosed, setBooksClosedSchema, setBranchBooksClosed, setCompanyBooksClosed } from './books-closed.service';

/**
 * Settings → Books closed (/api/books-closed). Any staff user may read the dates, so screens can say why a
 * back-dated entry is refused; setting them needs books:close (SuperAdmin). See doc/books-closed.md.
 */
const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: await getBooksClosed() });
  } catch (error) {
    next(error);
  }
});

const checkQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), branchId: z.string().uuid().optional() });
router.get('/check', requirePermission(PERMISSIONS.BOOKS_CLOSE), validateRequest(z.object({ query: checkQuery })), async (req, res, next) => {
  try {
    const { date, branchId } = checkQuery.parse(req.query);
    res.json({ status: 'success', data: await closingCheck(date, branchId) });
  } catch (error) {
    next(error);
  }
});

router.put('/', requirePermission(PERMISSIONS.BOOKS_CLOSE), validateRequest(z.object({ body: setBooksClosedSchema })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: await setCompanyBooksClosed(req.user!, req.body) });
  } catch (error) {
    next(error);
  }
});

router.put('/branches/:branchId', requirePermission(PERMISSIONS.BOOKS_CLOSE),
  validateRequest(z.object({ params: z.object({ branchId: z.string().uuid() }), body: setBooksClosedSchema })), async (req, res, next) => {
    try {
      res.json({ status: 'success', data: await setBranchBooksClosed(req.user!, req.params.branchId, req.body) });
    } catch (error) {
      next(error);
    }
  });

export default router;
