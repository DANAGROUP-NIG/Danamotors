import { PrismaClient } from "@prisma/client";
import { pick, rng, sleep } from "./helpers";

export default async function seedStockTransactions(
  prisma: PrismaClient,
  branches: { id: string }[]
) {
  const types = ["RECEIVED", "ISSUED", "ADJUSTMENT"];
  let count = 0;
  for (const branch of branches) {
    const stockRecords = await prisma.inventoryStock.findMany({
      where: { branchId: branch.id },
      take: 30,
    });
    for (const s of stockRecords) {
      const txs: { branchId: string; partId: string; type: string; quantity: number; notes: string }[] = [];
      let runningQty = Math.max(1, s.quantity - rng(5, 15));
      const type = pick(types);
      const qty = type === "ISSUED" ? -rng(1, 5) : type === "RECEIVED" ? rng(5, 20) : rng(-3, 8);
      runningQty += qty;
      if (runningQty < 0) runningQty = 0;
      txs.push({
        branchId: branch.id,
        partId: s.partId,
        type,
        quantity: qty,
        notes: `Seed: ${type.toLowerCase().replace("_", " ")} via seeding`,
      });
      if (txs.length > 0) {
        await prisma.stockTransaction.createMany({ data: txs, skipDuplicates: true });
        count += txs.length;
        await sleep(150);
      }
    }
  }
  console.log(`✅ Seeded ${count} stock transactions`);
}
