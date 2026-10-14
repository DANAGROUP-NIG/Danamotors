import { useAuth } from "@/features/auth/hooks/use-auth";
import { INVENTORY_PERMISSIONS } from "@/features/auth/roles";
import type { IndentStatus } from "../types/indent.types";

type IndentLike = {
  status: IndentStatus;
  requestingBranchId: string;
  sourceBranchId: string;
  openPickingList?: unknown;
  stns?: { status: string }[];
  lines?: { dispatchedQuantity: number }[];
};

const IN_TRANSIT = ["DISPATCHED", "PARTIALLY_RECEIVED"];

/**
 * Mirrors the server's rules so buttons only appear when the action would succeed:
 * the requesting branch submits and receives, the supplying branch approves,
 * rejects and dispatches, and either side may cancel before dispatch.
 */
export function useIndentAbilities() {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const crossBranch = isSuperAdmin || hasPermission(INVENTORY_PERMISSIONS.INVENTORY_CROSS_BRANCH);
  const myBranch = user?.branchId ?? null;

  const isRequester = (i: IndentLike) => crossBranch || myBranch === i.requestingBranchId;
  const isSupplier = (i: IndentLike) => crossBranch || myBranch === i.sourceBranchId;

  return {
    crossBranch,
    myBranchId: myBranch,
    canCreate: hasPermission(INVENTORY_PERMISSIONS.TRANSFER_CREATE),
    abilities(i: IndentLike) {
      return {
        submit: i.status === "DRAFT" && isRequester(i) && hasPermission(INVENTORY_PERMISSIONS.TRANSFER_CREATE),
        approve: i.status === "SUBMITTED" && isSupplier(i) && hasPermission(INVENTORY_PERMISSIONS.TRANSFER_APPROVE),
        reject: i.status === "SUBMITTED" && isSupplier(i) && hasPermission(INVENTORY_PERMISSIONS.TRANSFER_REJECT),
        // Picking runs again for the back order after a partial dispatch.
        pick:
          (i.status === "APPROVED" || i.status === "PARTLY_DISPATCHED") &&
          !i.openPickingList &&
          isSupplier(i) &&
          hasPermission(INVENTORY_PERMISSIONS.TRANSFER_APPROVE),
        dispatch: i.status === "PICKED" && isSupplier(i) && hasPermission(INVENTORY_PERMISSIONS.TRANSFER_DISPATCH),
        // Any STN still in transit can be received, even while the back order is open.
        receive:
          (i.stns ?? []).some((s) => IN_TRANSIT.includes(s.status)) &&
          isRequester(i) &&
          hasPermission(INVENTORY_PERMISSIONS.TRANSFER_RECEIVE),
        cancel:
          ["DRAFT", "SUBMITTED", "APPROVED", "PICKED"].includes(i.status) &&
          !(i.stns ?? []).length &&
          (isRequester(i) || isSupplier(i)) &&
          hasPermission(INVENTORY_PERMISSIONS.TRANSFER_CANCEL),
        // Once something has shipped, the supplier closes the back order instead of cancelling.
        close:
          ["APPROVED", "PICKED", "PARTLY_DISPATCHED"].includes(i.status) &&
          (i.stns ?? []).length > 0 &&
          isSupplier(i) &&
          hasPermission(INVENTORY_PERMISSIONS.TRANSFER_CANCEL),
      };
    },
  };
}
