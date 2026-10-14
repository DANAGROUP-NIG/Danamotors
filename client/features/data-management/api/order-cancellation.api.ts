import { apiGet, apiPatch } from "@/lib/api/apiClient";
import type { CancellationKind } from "../lib/order-cancellation";
import type { CancelLinesResult, PendingOrder, PendingOrderFilters } from "../types/order-cancellation.types";

export const orderCancellationKeys = {
  all: ["order-cancellation"] as const,
  pending: (kind: CancellationKind, filters: PendingOrderFilters) => [...orderCancellationKeys.all, kind, filters] as const,
};

/** CPOs live under part sale; indents under transfers, where INWARD / OUTWARD picks the side. */
function endpoint(kind: CancellationKind) {
  return kind === "cpo-cancellation" ? "/part-sale/orders/pending-lines" : "/inventory/indents/pending-lines";
}

export async function getPendingOrdersRequest(kind: CancellationKind, { partyId, ...filters }: PendingOrderFilters) {
  const params: Record<string, string | undefined> =
    kind === "cpo-cancellation"
      ? { ...filters, customerId: partyId }
      : { ...filters, otherBranchId: partyId, direction: kind === "indent-inward-cancellation" ? "INWARD" : "OUTWARD" };
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  return (await apiGet<{ orders: PendingOrder[] }>(`${endpoint(kind)}?${query}`)).orders;
}

export async function cancelLinesRequest(kind: CancellationKind, lineIds: string[], remark: string): Promise<CancelLinesResult> {
  if (kind === "cpo-cancellation") {
    const data = await apiPatch<{ units: number; orders: { id: string; cpoNumber: string; status: string }[] }>(
      `${endpoint(kind)}/cancel`,
      { lineIds, remark },
    );
    return { units: data.units, documents: data.orders.map((o) => ({ id: o.id, number: o.cpoNumber, status: o.status })) };
  }
  const data = await apiPatch<{ units: number; indents: { id: string; indentNumber: string; status: string }[] }>(
    `${endpoint(kind)}/cancel`,
    { lineIds, reason: remark },
  );
  return { units: data.units, documents: data.indents.map((i) => ({ id: i.id, number: i.indentNumber, status: i.status })) };
}
