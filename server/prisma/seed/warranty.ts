import { PrismaClient } from "@prisma/client";

/**
 * Warranty & campaign reference data:
 * - Kia model warranty policies (legacy `model`: 1,825 or 1,095 days and 100,000 km)
 * - Sample claim codes (the legacy import replaces these with warrcomp/warrdef/warrpos/warrrej)
 * - A demo Kia vehicle under warranty and a DRAFT recall campaign that includes it
 *
 * Idempotent: safe to run repeatedly.
 */
export default async function seedWarranty(prisma: PrismaClient) {
  const models = [
    { code: "KIA-SPG", name: "Sportage", warrantyDays: 1825, warrantyKm: 100_000 },
    { code: "KIA-SRN", name: "Sorento", warrantyDays: 1825, warrantyKm: 100_000 },
    { code: "KIA-SLT", name: "Seltos", warrantyDays: 1825, warrantyKm: 100_000 },
    { code: "KIA-K5", name: "K5", warrantyDays: 1825, warrantyKm: 100_000 },
    { code: "KIA-CAR", name: "Carens", warrantyDays: 1825, warrantyKm: 100_000 },
    { code: "KIA-PCN", name: "Picanto", warrantyDays: 1095, warrantyKm: 100_000 },
    { code: "KIA-RIO", name: "Rio", warrantyDays: 1095, warrantyKm: 100_000 },
  ];
  const modelIds: Record<string, string> = {};
  for (const m of models) {
    const row = await prisma.vehicleModel.upsert({
      where: { code: m.code },
      update: {},
      create: { ...m, make: "Kia", warrantyCovered: true },
    });
    modelIds[m.name] = row.id;
  }
  console.log(`✅ Seeded ${models.length} vehicle model warranty policies`);

  const codes = {
    complaint: [
      ["C101", "Engine noise"],
      ["C104", "Engine misfire"],
      ["C210", "Warning light on"],
      ["C305", "Air conditioning not cooling"],
      ["C410", "Electrical fault"],
      ["C520", "Oil leak"],
    ],
    defect: [
      ["D07", "Internal short"],
      ["D11", "Fouled"],
      ["D15", "Contaminated"],
      ["D21", "Cracked or broken"],
      ["D30", "Leaking"],
      ["D42", "Worn prematurely"],
    ],
    position: [
      ["P01", "Cylinder 1"],
      ["P02", "Cylinder 2"],
      ["P03", "Cylinder 3"],
      ["P04", "Cylinder 4"],
      ["PFL", "Front left"],
      ["PFR", "Front right"],
      ["PRL", "Rear left"],
      ["PRR", "Rear right"],
    ],
    reject: [
      ["R01", "Not a manufacturing defect"],
      ["R02", "Outside warranty period"],
      ["R03", "Outside warranty mileage"],
      ["R04", "Insufficient documentation"],
      ["R05", "Damage from misuse or accident"],
    ],
  };
  const upsertAll = async (
    rows: string[][],
    upsert: (code: string, description: string) => Promise<unknown>,
  ) => {
    for (const [code, description] of rows) await upsert(code, description);
  };
  await upsertAll(codes.complaint, (code, description) =>
    prisma.warrantyComplaintCode.upsert({ where: { code }, update: {}, create: { code, description } }),
  );
  await upsertAll(codes.defect, (code, description) =>
    prisma.warrantyDefectCode.upsert({ where: { code }, update: {}, create: { code, description } }),
  );
  await upsertAll(codes.position, (code, description) =>
    prisma.warrantyPositionCode.upsert({ where: { code }, update: {}, create: { code, description } }),
  );
  await upsertAll(codes.reject, (code, description) =>
    prisma.warrantyRejectReason.upsert({ where: { code }, update: {}, create: { code, description } }),
  );
  console.log("✅ Seeded warranty complaint, defect, position and reject codes");

  // Link existing Kia vehicles to their model policy by name.
  for (const [name, id] of Object.entries(modelIds)) {
    await prisma.vehicle.updateMany({
      where: { vehicleModelId: null, make: { equals: "Kia", mode: "insensitive" }, model: { equals: name, mode: "insensitive" } },
      data: { vehicleModelId: id },
    });
  }

  // Demo vehicle under warranty, owned by the first seeded customer.
  const customer = await prisma.customer.findFirst({ orderBy: { createdAt: "asc" } });
  const demoVin = "KNAPU81BDP7123456";
  if (customer) {
    await prisma.vehicle.upsert({
      where: { vin: demoVin },
      update: {},
      create: {
        customerId: customer.id,
        vin: demoVin,
        registrationNumber: "LSD-482-KJ",
        make: "Kia",
        model: "Sportage",
        trim: "2.0 EX",
        year: 2023,
        color: "White",
        vehicleModelId: modelIds.Sportage,
        warrantyStartDate: new Date("2023-03-12T00:00:00Z"),
        lastRecordedMileage: 58_210,
        lastMileageAt: new Date("2026-04-14T09:00:00Z"),
      },
    });
  }

  // Draft recall campaign. Activate it in the app to see the job card and check-in banners.
  const campaign = await prisma.campaign.upsert({
    where: { code: "RC-2026-014" },
    update: {},
    create: {
      code: "RC-2026-014",
      title: "Engine wiring harness inspection",
      type: "RECALL",
      description: "Inspect the engine wiring harness and correct routing or replace the harness where necessary.",
      defectDescription: "The engine wiring harness may chafe against nearby components, which can cause electrical faults.",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      labourCovered: true,
      partsCovered: true,
      models: { create: [{ vehicleModelId: modelIds.Sportage, yearFrom: 2021, yearTo: 2023 }] },
      coveredItems: {
        create: [
          { kind: "PART", partNumber: "91200-D3XXX", description: "Wiring harness", maxQuantity: 1 },
          { kind: "LABOUR", operationCode: "HRN-01", description: "Harness inspection", maxQuantity: 1.2 },
        ],
      },
    },
  });
  const vehicle = await prisma.vehicle.findUnique({ where: { vin: demoVin }, select: { id: true } });
  for (const vin of [demoVin, "KNAPU81BDP7000011", "KNAPU81BDP7000012"]) {
    await prisma.campaignVehicle.upsert({
      where: { campaignId_vin: { campaignId: campaign.id, vin } },
      update: {},
      create: { campaignId: campaign.id, vin, vehicleId: vin === demoVin ? vehicle?.id ?? null : null },
    });
  }
  console.log("✅ Seeded demo Kia Sportage and draft recall campaign RC-2026-014");
}

// Self-execute when run directly: `npx ts-node prisma/seed/warranty.ts`
if (require.main === module) {
  (async () => {
    const prisma = new PrismaClient();
    try {
      await seedWarranty(prisma);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
