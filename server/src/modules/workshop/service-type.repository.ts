import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

export type ServiceTypeDb = Prisma.TransactionClient;
export type EligibleServiceRow = {
  vehicleId: string;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  modelId: string | null;
  id: string | null;
  code: string | null;
  description: string | null;
  chargedTo: string | null;
  displayOrder: number | null;
  serviceCharge: number | null;
  previousCharge: number | null;
  effectiveFrom: Date | null;
};

// One database round trip for vehicle/model resolution and the eligible options.
// Keep the base vehicle row when no model or setting exists, so the service can
// distinguish missing vehicles from unconfigured models without another query.
export function eligibleServiceTypesQuery(vehicleId: string, serviceTypeId?: string) {
  return Prisma.sql`
    WITH RECURSIVE model_path AS (
      SELECT m.id, m.kind, m."parentId", ARRAY[m.id] AS visited
      FROM "WorkshopMaster" m JOIN "Vehicle" v ON v."catalogueId" = m.id
      WHERE v.id = ${vehicleId}
      UNION ALL
      SELECT m.id, m.kind, m."parentId", p.visited || m.id
      FROM "WorkshopMaster" m JOIN model_path p ON m.id = p."parentId"
      WHERE p.kind <> 'MODEL' AND NOT m.id = ANY(p.visited)
    ), vehicle_identity AS (
      SELECT v.id, v."saleDate", v."catalogueId",
        COALESCE(cm.name, NULLIF(NULLIF(trim(v."customModel"), ''), 'Unspecified (legacy)'), v.model) AS name,
        CASE WHEN cm.id IS NOT NULL THEN cm.aliases
          ELSE ARRAY[v.model] END AS aliases,
        COALESCE(mk.name, NULLIF(trim(v."customMake"), ''), v.make) AS make
      FROM "Vehicle" v
      LEFT JOIN "VehicleCatalogModel" cm ON cm.id = v."modelId"
      LEFT JOIN "VehicleCatalogMake" mk ON mk.id = cm."makeId"
      WHERE v.id = ${vehicleId}
    ), matching_models AS (
      SELECT DISTINCT m.id
      FROM vehicle_identity v
      JOIN "WorkshopMaster" m ON m.kind = 'MODEL'
      JOIN "WorkshopMaster" p ON p.id = m."parentId" AND p.kind = 'PRODUCT'
      JOIN "WorkshopMaster" mk ON mk.id = p."parentId" AND mk.kind = 'MAKE'
      WHERE v."catalogueId" IS NULL
        AND regexp_replace(lower(v.make), '[^[:alnum:]]', '', 'g') IN (
          regexp_replace(lower(mk.code), '[^[:alnum:]]', '', 'g'),
          regexp_replace(lower(mk.description), '[^[:alnum:]]', '', 'g'))
        AND EXISTS (
          SELECT 1 FROM unnest(ARRAY[v.name] || v.aliases) name
          WHERE regexp_replace(lower(name), '[^[:alnum:]]', '', 'g') IN (
            regexp_replace(lower(m.code), '[^[:alnum:]]', '', 'g'),
            regexp_replace(lower(m.description), '[^[:alnum:]]', '', 'g'))
        )
    ), vehicle_context AS (
      SELECT v.id, v."saleDate", v.make AS "vehicleMake", v.name AS "vehicleModel",
        CASE WHEN v."catalogueId" IS NOT NULL
          THEN (SELECT id FROM model_path WHERE kind = 'MODEL' LIMIT 1)
          ELSE (SELECT min(id) FROM matching_models HAVING count(*) = 1)
        END AS "modelId"
      FROM vehicle_identity v
    )
    SELECT v.id AS "vehicleId", v."modelId", v."vehicleMake", v."vehicleModel", options.*
    FROM vehicle_context v
    LEFT JOIN LATERAL (
      SELECT st.id, st.code, st.description, st."chargedTo", st."displayOrder",
        s."serviceCharge", s."previousCharge", s."effectiveFrom"
      FROM "ServiceTypeModelSetting" s
      JOIN "WorkshopMaster" st ON st.id = s."serviceTypeId"
      JOIN "WorkshopMaster" model ON model.id = s."modelId"
      WHERE s."modelId" = v."modelId" AND s.active
        AND model.kind = 'MODEL' AND model.active
        AND st.kind = 'SERVICE_TYPE' AND st.active AND st.code <> 'AF'
        AND (v."saleDate" IS NULL OR NOT st."preDelivery")
        ${serviceTypeId ? Prisma.sql`AND st.id = ${serviceTypeId}` : Prisma.empty}
    ) options ON true
    ORDER BY options."displayOrder" ASC NULLS LAST, options.code ASC
  `;
}

export function loadEligibleServiceTypes(vehicleId: string, db: ServiceTypeDb = prisma, serviceTypeId?: string) {
  return db.$queryRaw<EligibleServiceRow[]>(eligibleServiceTypesQuery(vehicleId, serviceTypeId));
}

export const adminSettingSelect = {
  id: true, serviceTypeId: true, modelId: true, serviceCharge: true,
  previousCharge: true, effectiveFrom: true, active: true,
  model: { select: { id: true, code: true, description: true } },
} satisfies Prisma.ServiceTypeModelSettingSelect;
