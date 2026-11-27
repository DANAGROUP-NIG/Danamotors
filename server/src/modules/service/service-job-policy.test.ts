import { ROLES } from "../../shared/constants/roles";
import { canonicalJobStatus } from "./job-card-workflow.service";
import { requireServiceJobAction, type ServiceJobAction } from "./service-job-policy";

const expected: [ServiceJobAction, string[], readonly string[], string | undefined][] = [
  ["assignTechnician", ["OPENED"], [ROLES.SERVICE_ADVISOR, ROLES.WORKSHOP_MANAGER], "TECHNICIAN_ASSIGNED"],
  ["reassignTechnician", ["TECHNICIAN_ASSIGNED", "AWAITING_WARRANTY", "WARRANTY_RESOLVED", "ESTIMATE_PREPARED", "ESTIMATE_APPROVED", "PARTS_REQUESTED", "PARTS_ISSUED", "IN_PROGRESS"], [ROLES.SERVICE_ADVISOR, ROLES.WORKSHOP_MANAGER], undefined],
  ["submitInspection", ["TECHNICIAN_ASSIGNED"], [ROLES.TECHNICIAN], "AWAITING_WARRANTY"],
  ["bypassWarranty", ["AWAITING_WARRANTY"], [ROLES.WARRANTY_OFFICER, ROLES.SERVICE_ADVISOR, ROLES.WORKSHOP_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN], "WARRANTY_RESOLVED"],
  ["completeWarranty", ["AWAITING_WARRANTY"], [ROLES.WARRANTY_OFFICER], "WARRANTY_RESOLVED"],
  ["prepareEstimate", ["WARRANTY_RESOLVED", "ESTIMATE_PREPARED"], [ROLES.SERVICE_ADVISOR], "ESTIMATE_PREPARED"],
  ["requestParts", ["ESTIMATE_APPROVED"], [ROLES.WORKSHOP_MANAGER], "PARTS_REQUESTED"],
  ["issueParts", ["PARTS_REQUESTED"], [ROLES.BRANCH_STORE_MANAGER, ROLES.GENERAL_STORE_MANAGER], "PARTS_ISSUED"],
  ["startWork", ["PARTS_ISSUED"], [ROLES.TECHNICIAN], "IN_PROGRESS"],
  ["finishWork", ["IN_PROGRESS", "REWORK"], [ROLES.TECHNICIAN], "AWAITING_QC"],
  ["passQc", ["AWAITING_QC"], [ROLES.QC_OFFICER], "QC_PASSED"],
  ["failQc", ["AWAITING_QC"], [ROLES.QC_OFFICER], "REWORK"],
  ["readyForBilling", ["QC_PASSED"], [ROLES.SERVICE_ADVISOR], "READY_FOR_BILLING"],
  ["bill", ["READY_FOR_BILLING"], [ROLES.BILLING_OFFICER], "BILLED"],
];

const stages = [...new Set(expected.flatMap(([, from, , to]) => to ? [...from, to] : from)), "DELIVERED", "CANCELLED"];
const assigned = { actorId: "assigned-technician", technicianId: "assigned-technician", warrantyBypassEnabled: true };

it.each(expected)("enforces allowed roles and predecessor stages for %s", (action, from, roles, to) => {
  for (const role of Object.values(ROLES)) {
    for (const stage of stages) {
      const transition = () => requireServiceJobAction(action, { ...assigned, stage, role });
      if (!roles.includes(role)) {
        expect(transition).toThrow(expect.objectContaining({ code: "WORKFLOW_ROLE_REQUIRED", statusCode: 403 }));
      } else if (!from.includes(stage)) {
        expect(transition).toThrow(expect.objectContaining({ code: "WORKFLOW_STAGE_CONFLICT", statusCode: 409 }));
      } else {
        expect(transition()).toBe(to ?? stage);
      }
    }
  }
});

it.each([
  ["submitInspection", "TECHNICIAN_ASSIGNED"],
  ["startWork", "PARTS_ISSUED"],
  ["finishWork", "IN_PROGRESS"],
  ["finishWork", "REWORK"],
] as const)("requires the assigned Technician for %s from %s", (action, stage) => {
  expect(() => requireServiceJobAction(action, { ...assigned, actorId: "other-technician", stage, role: ROLES.TECHNICIAN }))
    .toThrow(expect.objectContaining({ code: "ASSIGNED_TECHNICIAN_REQUIRED" }));
});

it("checks the bypass flag independently of warranty authority", () => {
  expect(() => requireServiceJobAction("bypassWarranty", { ...assigned, warrantyBypassEnabled: false, stage: "AWAITING_WARRANTY", role: ROLES.WARRANTY_OFFICER }))
    .toThrow(expect.objectContaining({ code: "WARRANTY_BYPASS_DISABLED" }));
});

it.each([
  ["Open", "OPEN"], ["Pending", "OPEN"], ["In Progress", "IN_PROGRESS"], ["On Hold", "IN_PROGRESS"],
  ["Quality Check", "QC"], ["Ready", "READY"], ["Completed", "READY"], ["Billed", "BILLED"],
  ["Closed", "DELIVERED"], ["Cancelled", "CANCELLED"], ["WAITING_PARTS", "WAITING_PARTS"],
])("normalises existing job status %s to %s", (legacy, status) => {
  expect(canonicalJobStatus(legacy)).toBe(status);
});
