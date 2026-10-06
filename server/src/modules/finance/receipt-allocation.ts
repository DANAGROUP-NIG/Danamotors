const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function recalculateReceiptAllocations(
  amount: number,
  previousAllocations: Array<{ invoiceId: string; amount: number; outstandingAmount: number }>,
) {
  let remaining = money(amount);
  const allocations: Array<{ invoiceId: string; amount: number }> = [];
  for (const allocation of previousAllocations) {
    if (remaining <= 0) break;
    const available = money(allocation.outstandingAmount + allocation.amount);
    const allocated = money(Math.min(remaining, available));
    if (allocated > 0) allocations.push({ invoiceId: allocation.invoiceId, amount: allocated });
    remaining = money(remaining - allocated);
  }
  return { allocations, advanceAmount: remaining };
}