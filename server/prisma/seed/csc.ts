import { PrismaClient } from "@prisma/client";
import { CSC_DEFAULT_EFFECTIVE_DATE, CSC_DEFAULT_REASONS, CSC_DEFAULT_RULES } from "../../src/modules/csc/csc.defaults";

/**
 * CSC reference data: closure reasons and the legacy schedule for every active model. Insert-if-missing:
 * a re-run never changes or deletes a reason, rule or case edited in the app.
 */
export async function seedCscReference(db: PrismaClient) {
  const reasons = await db.cscCloseReason.createMany({ data: CSC_DEFAULT_REASONS.map((reason) => ({ ...reason })), skipDuplicates: true });
  const [models, types] = await Promise.all([
    db.workshopMaster.findMany({ where: { kind: "MODEL", active: true }, select: { id: true } }),
    db.workshopMaster.findMany({ where: { kind: "SERVICE_TYPE", code: { in: CSC_DEFAULT_RULES.map((rule) => rule.code) } }, select: { id: true, code: true } }),
  ]);
  const typeId = new Map(types.map((type) => [type.code, type.id]));
  const effectiveDate = new Date(`${CSC_DEFAULT_EFFECTIVE_DATE}T00:00:00.000Z`);
  const rules = await db.cscRule.createMany({
    data: models.flatMap((model) =>
      CSC_DEFAULT_RULES.flatMap(({ code, ...values }) => (typeId.has(code) ? [{ modelId: model.id, serviceTypeId: typeId.get(code)!, effectiveDate, ...values }] : [])),
    ),
    skipDuplicates: true,
  });
  return { reasons: reasons.count, rules: rules.count };
}
