import { stageForLegacyStatus, stageOwnerFor } from "../../../src/modules/service/job-stage.logic";

/**
 * Stage columns for a demo job card written directly with a finished status (history scenarios).
 * Jobs built through the services get their stage from the stage service instead.
 */
export function stageColumns(status: string, people: { serviceAdvisorId?: string | null; technicianId?: string | null } = {}) {
  const stage = stageForLegacyStatus(status);
  const owner = stageOwnerFor(stage, {
    status,
    serviceAdvisorId: people.serviceAdvisorId ?? null,
    technicianId: people.technicianId ?? null,
    qualityInspectorId: null,
    deliveryAdvisorId: null,
  });
  return { stage, stageOwnerId: owner.ownerId, stageOwnerRole: owner.ownerRole };
}
