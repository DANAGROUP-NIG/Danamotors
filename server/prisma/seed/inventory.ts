import { PrismaClient } from "@prisma/client";
import { rng, sleep } from "./helpers";

export default async function seedInventoryStock(
  prisma: PrismaClient,
  branches: { id: string; name: string }[],
  parts: { id: string; category: string | null }[]
) {
  let count = 0;
  for (const branch of branches) {
    const isMain = branch.name.toLowerCase().includes("main");
    const isAbuja = branch.name.toLowerCase().includes("abuja");
    const stockChance = isMain ? 0.9 : isAbuja ? 0.60 : 0.45;

    const ops: { branchId: string; partId: string; quantity: number; minimumStock: number; rackLocation: string; maximumStock: number }[] = [];
    for (const p of parts) {
      if (Math.random() > stockChance) continue;
      const base = isMain ? rng(15, 60) : rng(5, 30);
      ops.push({
        branchId: branch.id,
        partId: p.id,
        quantity: base,
        minimumStock: Math.max(3, Math.floor(base * 0.15)),
        rackLocation: `Aisle ${rng(1, 6)} Rack ${rng(1, 12)}`,
        maximumStock: base * 4,
      });
    }

    const BATCH = 20;
    let branchCount = 0;
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = ops.slice(i, i + BATCH);
      await prisma.$transaction(
        batch.map((o) =>
          prisma.inventoryStock.upsert({
            where: { branchId_partId: { branchId: o.branchId, partId: o.partId } },
            update: {},
            create: o,
          }),
        ),
      );
      branchCount += batch.length;
      console.log(`  ⏳ ${branch.name}: ${branchCount}/${ops.length} stock records...`);
      await sleep(500);
    }
    count += branchCount;
  }
  console.log(`✅ Seeded inventory stock for ${branches.length} branches (${count} records)`);
}
