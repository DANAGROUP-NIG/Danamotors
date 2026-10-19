import prisma from "../../../src/prisma/client";
import { CAMPAIGNS, CUSTOMERS, CustomerFixture, PARTS, VEHICLES, jobKey, JOBS } from "./fixtures";
import { DemoContext } from "./context";
import { checkVehicleWarranty } from "../../../src/modules/warranty/warranty.coverage";

/** Prints what the Demo account now holds, so testers know which records to open. */
export async function printSummary(ctx: DemoContext) {
  const branchName = new Map(Object.values(ctx.branches).map((b) => [b.id, b.name]));
  const jobs = await prisma.jobCard.findMany({
    where: { customField1: { in: JOBS.map((j) => jobKey(j.id)) } },
    include: {
      vehicle: { select: { registrationNumber: true } },
      estimates: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { status: true } },
      invoices: { select: { invoiceNumber: true, status: true, total: true, vatAmount: true, roundOff: true, outstandingAmount: true } },
      warrantyCase: { select: { caseNumber: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\nJob cards");
  for (const j of jobs) {
    const key = j.customField1!.split("/")[1];
    const estimates = j.estimates.map((e) => (e.status === "Declined" ? "Sent back" : e.status)).join(" > ") || "-";
    const bill = j.invoices.map((i) => `${i.invoiceNumber} ${i.status} ₦${i.total.toLocaleString("en-NG")} (VAT ${i.vatAmount}, round-off ${i.roundOff}, due ₦${i.outstandingAmount})`).join("; ") || "unbilled";
    const wc = j.warrantyCase ? `${j.warrantyCase.caseNumber} ${j.warrantyCase.status}` : "-";
    console.log(`  ${key.padEnd(8)} ${j.jobNumber}  ${j.status.padEnd(11)} ${j.vehicle?.registrationNumber?.padEnd(12)} ${branchName.get(j.branchId) ?? ""}${j.isRepeat ? " (repeat)" : ""}`);
    console.log(`           estimates: ${estimates} | bill: ${bill} | warranty case: ${wc}`);
  }

  console.log("\nParts stock (available / minimum)");
  for (const p of Object.values(PARTS)) {
    const rows = await prisma.inventoryStock.findMany({ where: { part: { partNumber: p.partNumber }, branchId: { in: [...branchName.keys()] } } });
    const at = (branchId: string) => rows.find((r) => r.branchId === branchId);
    const cell = (branchId: string) => {
      const r = at(branchId);
      return r ? `${r.quantity - r.reservedQuantity} / ${r.minimumStock}` : "none";
    };
    console.log(`  ${p.partNumber.padEnd(14)} ${p.name.padEnd(28)} ${ctx.branches.main.name}: ${cell(ctx.branches.main.id).padEnd(8)} ${ctx.branches.second.name}: ${cell(ctx.branches.second.id)}`);
  }

  console.log("\nCampaigns");
  for (const c of Object.values(CAMPAIGNS)) {
    const row = await prisma.campaign.findUnique({ where: { code: c.code }, include: { vehicles: { orderBy: { vin: "asc" }, include: { completedJobCard: { select: { jobNumber: true } } } } } });
    if (!row) continue;
    const vins = row.vehicles.map((v) => `${v.vin} ${v.status}${v.vehicleId ? "" : " (no vehicle record)"}${v.completedJobCard ? ` via ${v.completedJobCard.jobNumber}` : ""}`);
    console.log(`  ${row.code} ${row.type} ${row.status}: ${vins.join(", ")}`);
  }

  console.log("\nCustomers and vehicles");
  for (const c of Object.values(CUSTOMERS) as CustomerFixture[]) {
    const row = await prisma.customer.findUnique({ where: { code: c.code }, select: { creditBalance: true, branch: { select: { name: true } } } });
    console.log(`  ${c.code} ${(c.companyName ?? `${c.firstName} ${c.lastName}`).padEnd(30)} ${row?.branch.name ?? ""}${row?.creditBalance ? `  credit ₦${row.creditBalance.toLocaleString("en-NG")}` : ""}`);
  }
  for (const v of Object.values(VEHICLES)) {
    const vehicle = await prisma.vehicle.findUnique({ where: { vin: v.vin }, select: { id: true } });
    if (!vehicle) continue;
    const check = await checkVehicleWarranty(vehicle.id);
    const campaigns = check.openCampaigns.map((c) => c.code).join(", ");
    console.log(`  ${v.registrationNumber.padEnd(12)} ${v.vin}  Kia ${v.model.toLowerCase().padEnd(9)} warranty ${check.coverage.status}${campaigns ? `, open campaign ${campaigns}` : ""}`);
  }
}
