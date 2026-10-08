import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../shared/errors/appError';

type Colour = { id: string; code: string; description: string; active: boolean };
type Variant = {
  id: string; code: string; description: string; modelId: string;
  make: string; model: string; product: string; active: boolean;
};
type VariantDetail = Variant & { colours: Colour[] };

// Fixed-depth joins use primary keys; the kind/code index narrows variants.
// Search returns compact rows and never performs a separate count query.
const hierarchy = Prisma.sql`
  FROM "WorkshopMaster" v
  JOIN "WorkshopMaster" m ON m.id = v."parentId" AND m.kind = 'MODEL'
  JOIN "WorkshopMaster" p ON p.id = m."parentId" AND p.kind = 'PRODUCT'
  JOIN "WorkshopMaster" mk ON mk.id = p."parentId" AND mk.kind = 'MAKE'
`;
const fields = Prisma.sql`
  v.id, v.code, v.description, m.id AS "modelId",
  mk.description AS make, m.description AS model, p.description AS product,
  (v.active AND m.active AND p.active AND mk.active) AS active
`;

export class WorkshopVehicleCatalog {
  async search(search: string, limit: number, db: Prisma.TransactionClient = prisma) {
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const filters = tokens.map(token => Prisma.sql`
      strpos(lower(concat_ws(' ', mk.code, mk.description, p.code, p.description,
        m.code, m.description, v.code, v.description)), lower(${token})) > 0
    `);
    const items = await db.$queryRaw<Variant[]>(Prisma.sql`
      SELECT ${fields} ${hierarchy}
      WHERE v.kind = 'VARIANT' AND v.active AND m.active AND p.active AND mk.active
        ${filters.length ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty}
      ORDER BY mk.code, m.code, v.code, v.id LIMIT ${limit}
    `);
    return { items };
  }

  async detail(id: string, db: Prisma.TransactionClient = prisma) {
    const rows = await db.$queryRaw<VariantDetail[]>(Prisma.sql`
      SELECT ${fields}, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code,
          'description', c.description, 'active', c.active) ORDER BY c.code)
        FROM "WorkshopMaster" c WHERE c.kind = 'COLOUR' AND c."parentId" = m.id
      ), '[]'::jsonb) AS colours
      ${hierarchy} WHERE v.kind = 'VARIANT' AND v.id = ${id}
    `);
    if (!rows.length) throw new NotFoundError('Catalogue variant not found');
    return rows[0];
  }

  async identity(db: Prisma.TransactionClient, catalogueId: string, colourId?: string | null) {
    if (!colourId) throw new BadRequestError('Select a catalogue colour');
    const variant = await this.detail(catalogueId, db);
    if (!variant.active) throw new BadRequestError('Select an active catalogue variant');
    const colour = variant.colours.find(item => item.id === colourId && item.active);
    if (!colour) throw new BadRequestError('Select an active colour belonging to the selected model');
    return {
      catalogueId, colourId, make: variant.make, model: variant.model,
      trim: variant.description, color: colour.description,
      modelId: null, generationId: null, engineId: null,
      // The identity constraint also supports legacy workshop records through these fields.
      customMake: variant.make, customModel: variant.model,
    };
  }
}
