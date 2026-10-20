import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/authMiddleware';
import { assertBranchOwnership, requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { CompanySettingsService, branchSettingsSchema, companyProfileSchema, getCompanyProfile } from './company-settings.service';

const router = Router();
const service = new CompanySettingsService();
const admin = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);
const branchParams = z.object({ branchId: z.string().uuid() });
router.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Company Settings
 *     description: |
 *       Legacy Control screen. Company details (name, TIN, RC number, dealer code) are company-wide and
 *       print on documents. Billing and workshop rules are per branch, as each legacy database set its own:
 *       labour VAT %, bill round-off (bills round down to a multiple), repeat-job window (days or km),
 *       booking horizon, shifts, working hours, weekly holiday, VOR order days, reorder months,
 *       court location, reminder-letter designation and signatories.
 *
 * /company-settings/company:
 *   get:
 *     tags: [Company Settings]
 *     summary: Company details printed on documents
 *   put:
 *     tags: [Company Settings]
 *     summary: Update the company details (Admin)
 * /company-settings/branches/{branchId}:
 *   get:
 *     tags: [Company Settings]
 *     summary: A branch's billing and workshop rules (defaults when never saved)
 *   put:
 *     tags: [Company Settings]
 *     summary: Save a branch's billing and workshop rules (Admin)
 */
router.get('/company', async (_req, res, next) => {
  try {
    res.json({ status: 'success', data: { company: await getCompanyProfile() } });
  } catch (error) {
    next(error);
  }
});

router.put('/company', admin, validateRequest(z.object({ body: companyProfileSchema })), async (req, res, next) => {
  try {
    res.json({ status: 'success', data: { company: await service.saveCompany(req.body) } });
  } catch (error) {
    next(error);
  }
});

router.get('/branches/:branchId', validateRequest(z.object({ params: branchParams })), async (req, res, next) => {
  try {
    assertBranchOwnership(req, req.params.branchId);
    res.json({ status: 'success', data: { settings: await service.getBranch(req.params.branchId) } });
  } catch (error) {
    next(error);
  }
});

router.put('/branches/:branchId', admin, validateRequest(z.object({ params: branchParams, body: branchSettingsSchema })), async (req, res, next) => {
  try {
    assertBranchOwnership(req, req.params.branchId);
    res.json({ status: 'success', data: { settings: await service.saveBranch(req.params.branchId, req.body) } });
  } catch (error) {
    next(error);
  }
});

export default router;
