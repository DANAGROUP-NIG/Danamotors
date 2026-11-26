import { ROLES } from "../../shared/constants/roles";
import { ConflictError, ForbiddenError } from "../../shared/errors/appError";

const assignmentRoles = [ROLES.SERVICE_ADVISOR, ROLES.WORKSHOP_MANAGER];
const technician = [ROLES.TECHNICIAN];
const adviser = [ROLES.SERVICE_ADVISOR];
const quality = [ROLES.QC_OFFICER];

type Rule = {
  from: readonly string[];
  to?: string;
  roles: readonly string[];
  waiting: string;
  assignedTechnician?: boolean;
};

export const SERVICE_JOB_ACTIONS = {
  assignTechnician: {
    from: ["OPENED"],
    to: "TECHNICIAN_ASSIGNED",
    roles: assignmentRoles,
    waiting: "Open the job card before assigning a Technician",
  },
  reassignTechnician: {
    from: [
      "TECHNICIAN_ASSIGNED",
      "AWAITING_WARRANTY",
      "WARRANTY_RESOLVED",
      "ESTIMATE_PREPARED",
      "ESTIMATE_APPROVED",
      "PARTS_REQUESTED",
      "PARTS_ISSUED",
      "IN_PROGRESS",
    ],
    roles: assignmentRoles,
    waiting: "Technician assignment is locked once work is complete",
  },
  submitInspection: {
    from: ["TECHNICIAN_ASSIGNED"],
    to: "AWAITING_WARRANTY",
    roles: technician,
    assignedTechnician: true,
    waiting: "Waiting for Technician assignment",
  },
  bypassWarranty: {
    from: ["AWAITING_WARRANTY"],
    to: "WARRANTY_RESOLVED",
    roles: [
      ROLES.WARRANTY_OFFICER,
      ...assignmentRoles,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
    ],
    waiting: "Waiting for Technician inspection",
  },
  completeWarranty: {
    from: ["AWAITING_WARRANTY"],
    to: "WARRANTY_RESOLVED",
    roles: [ROLES.WARRANTY_OFFICER],
    waiting: "Waiting for Technician inspection",
  },
  prepareEstimate: {
    from: ["WARRANTY_RESOLVED", "ESTIMATE_PREPARED"],
    to: "ESTIMATE_PREPARED",
    roles: adviser,
    waiting: "Waiting for warranty resolution",
  },
  requestParts: {
    from: ["ESTIMATE_APPROVED"],
    to: "PARTS_REQUESTED",
    roles: [ROLES.WORKSHOP_MANAGER],
    waiting: "Waiting for estimate approval",
  },
  issueParts: {
    from: ["PARTS_REQUESTED"],
    to: "PARTS_ISSUED",
    roles: [ROLES.BRANCH_STORE_MANAGER, ROLES.GENERAL_STORE_MANAGER],
    waiting: "Waiting for the parts request",
  },
  startWork: {
    from: ["PARTS_ISSUED", "REWORK"],
    to: "IN_PROGRESS",
    roles: technician,
    assignedTechnician: true,
    waiting: "Waiting for parts fulfilment",
  },
  finishWork: {
    from: ["IN_PROGRESS", "REWORK"],
    to: "AWAITING_QC",
    roles: technician,
    assignedTechnician: true,
    waiting: "Start work before marking it complete",
  },
  passQc: {
    from: ["AWAITING_QC"],
    to: "QC_PASSED",
    roles: quality,
    waiting: "Waiting for the Technician to complete work",
  },
  failQc: {
    from: ["AWAITING_QC"],
    to: "REWORK",
    roles: quality,
    waiting: "Waiting for the Technician to complete work",
  },
  readyForBilling: {
    from: ["QC_PASSED"],
    to: "READY_FOR_BILLING",
    roles: adviser,
    waiting: "Waiting for QC to pass",
  },
  bill: {
    from: ["READY_FOR_BILLING"],
    to: "BILLED",
    roles: [ROLES.BILLING_OFFICER],
    waiting: "Waiting for the job to be marked ready for billing",
  },
} satisfies Record<string, Rule>;

export type ServiceJobAction = keyof typeof SERVICE_JOB_ACTIONS;

type ActionContext = {
  stage: string;
  technicianId: string | null;
  actorId: string;
  role: string;
  warrantyBypassEnabled: boolean;
};

export function serviceJobActionAvailability(
  action: ServiceJobAction,
  context: ActionContext,
) {
  const rule: Rule = SERVICE_JOB_ACTIONS[action];
  if (!rule.roles.includes(context.role)) {
    return {
      allowed: false,
      code: "WORKFLOW_ROLE_REQUIRED",
      reason: "Your role cannot perform this action",
    } as const;
  }
  if (action === "bypassWarranty" && !context.warrantyBypassEnabled) {
    return {
      allowed: false,
      code: "WARRANTY_BYPASS_DISABLED",
      reason: "Warranty bypass is disabled",
    } as const;
  }
  if (!rule.from.includes(context.stage)) {
    return {
      allowed: false,
      code: "WORKFLOW_STAGE_CONFLICT",
      reason: rule.waiting,
    } as const;
  }
  if (rule.assignedTechnician && context.technicianId !== context.actorId) {
    return {
      allowed: false,
      code: "ASSIGNED_TECHNICIAN_REQUIRED",
      reason: "Only the assigned Technician can perform this action",
    } as const;
  }
  return { allowed: true, stage: rule.to ?? context.stage } as const;
}

export function requireServiceJobAction(
  action: ServiceJobAction,
  context: ActionContext,
) {
  const result = serviceJobActionAvailability(action, context);
  if (result.allowed) return result.stage;
  const unauthorized =
    result.code === "WORKFLOW_ROLE_REQUIRED" ||
    result.code === "ASSIGNED_TECHNICIAN_REQUIRED";
  const error = unauthorized
    ? new ForbiddenError(result.reason)
    : new ConflictError(result.reason);
  throw error.withCode(result.code, { action, stage: context.stage });
}
