import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { DocumentTermsService, saveTermsSchema, termsScopeSchema } from './document-terms.service';

const router = Router();
const service = new DocumentTermsService();
router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Document Terms
 *     description: |
 *       Legacy Quotation Terms and Conditions Master and the Control screen's terms and footer messages.
 *       Each document (job estimate, job card, job bill, parts quotation, counter sale, receipt) has
 *       company-wide terms and footer; a branch can override them.
 *
 * /document-terms:
 *   get:
 *     tags: [Document Terms]
 *     summary: The terms and footer saved for exactly this document and scope (no branchId = company-wide)
 *   put:
 *     tags: [Document Terms]
 *     summary: Replace the terms and footer of a document for the company (branchId null) or a branch
 * /document-terms/effective:
 *   get:
 *     tags: [Document Terms]
 *     summary: What prints on a branch's document - its own terms and footer, else the company-wide ones
 */
router.get('/', validateRequest(termsScopeSchema), async (req, res, next) => {
  try {
    const query = termsScopeSchema.parse({
      query: req.query,
    }).query;

    res.json({
      status: 'success',
      data: await service.get(query.documentType, query.branchId),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/effective', validateRequest(termsScopeSchema), async (req, res, next) => {
  try {
    const query = termsScopeSchema.parse({
      query: req.query,
    }).query;

    res.json({
      status: 'success',
      data: await service.effective(query.documentType, query.branchId),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), validateRequest(saveTermsSchema), async (req, res, next) => {
  try {
    const saved = await service.save(req.body);

    res.json({
      status: 'success',

      data: {
        terms: saved.terms,
        footer: saved.footer,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
