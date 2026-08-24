import { Router } from 'express';
import { SearchController } from './search.controller';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();
const controller = new SearchController();

router.use(authMiddleware);

/**
 * @openapi
 * /search:
 *   get:
 *     tags:
 *       - Search
 *     summary: Global search
 *     description: Search across customers, vehicles, job cards, and spare parts simultaneously.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *         description: Search query string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, customers, vehicles, job-cards, parts]
 *           default: all
 *         description: Restrict search to a specific entity type
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Search results grouped by entity type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     customers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CustomerDTO'
 *                     vehicles:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/VehicleDTO'
 *                     jobCards:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/JobCardDTO'
 *                     parts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SparePartDTO'
 */
router.get('/', controller.search);

export default router;

