"use client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { usePart, usePartStock } from "@/features/inventory/hooks/use-parts";
import { moneyText } from "../transaction.logic";

export function RequisitionStockPreview({
  partId,
  branchId,
}: {
  partId: string;
  branchId: string;
}) {
  const { hasPermission } = useAuth();
  const canReadPart = hasPermission("sparepart:read");
  const canReadStock = hasPermission("stock:read");
  const part = usePart(canReadPart ? partId : "");
  const stock = usePartStock(partId, canReadStock);
  if (!partId) return null;
  const branchStock = stock.data?.find((row) => row.branchId === branchId);
  return (
    <div className="space-y-2 text-sm">
      {((canReadPart && part.isLoading) ||
        (canReadStock && stock.isLoading)) && (
        <p role="status">Loading part rates and stock…</p>
      )}
      {canReadPart && part.isError && (
        <p role="alert">
          Could not load part rates.{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => void part.refetch()}
          >
            Retry rates
          </Button>
        </p>
      )}
      {canReadStock && stock.isError && (
        <p role="alert">
          Could not load stock.{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => void stock.refetch()}
          >
            Retry stock
          </Button>
        </p>
      )}
      {canReadPart && part.data && (
        <p>
          Flag: {part.data.partFlag} · UOM: {part.data.uom} · Normal rate:{" "}
          {moneyText(part.data.retailRate ?? part.data.unitRate)} · Warranty
          rate:{" "}
          {part.data.warrantyRate == null
            ? "Not set"
            : moneyText(part.data.warrantyRate)}
        </p>
      )}
      {canReadStock && stock.data && (
        <p>
          On hand: {branchStock?.quantity ?? 0} · Available:{" "}
          {branchStock?.availableQuantity ?? 0} · Location:{" "}
          {branchStock?.rackLocation ?? "—"} · Bin card:{" "}
          {branchStock?.binCard ?? "—"}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Stock and rates are checked again when saving.
      </p>
    </div>
  );
}
