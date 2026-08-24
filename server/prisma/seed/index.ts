import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import seedBranches from "./branches";
import seedPermissionsAndRoles from "./roles";
import seedStaffUsers from "./staff";
import seedServices from "./services";
import seedSpareParts from "./spareParts";
import seedInventoryStock from "./inventory";
import seedStockTransactions from "./transactions";
import seedCustomerPortal from "./portal";
import seedEnquiries from "./enquiries";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting full database seeding...\n");

  // 1. Branches
  const branches = await seedBranches(prisma);

  // 2. Permissions & Roles
  console.log("\nSeeding permissions and roles...");
  await seedPermissionsAndRoles(prisma);

  // 3. Staff users
  console.log("\nSeeding staff users...");
  const staffUsers = await seedStaffUsers(prisma, branches);

  // 4. Services catalog
  console.log("\nSeeding services catalog...");
  const services = await seedServices(prisma);

  // 5. Spare parts
  console.log("\nSeeding spare parts...");
  const parts = await seedSpareParts(prisma);

  // 6. Inventory stock
  console.log("\nSeeding branch-level inventory stock...");
  await seedInventoryStock(prisma, branches, parts);

  // 7. Stock transactions
  console.log("\nSeeding historical stock transactions...");
  await seedStockTransactions(prisma, branches);

  // 8. Customer portal demo data (customers, vehicles, appointments, job cards, invoices)
  console.log("\nSeeding customer portal demo data...");
  await seedCustomerPortal(prisma, branches, services);

  // 9. Enquiries (online booking + walk-in)
  console.log("\nSeeding enquiries...");
  const customers = await prisma.customer.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, customerId: true },
  });
  await seedEnquiries(prisma, branches, staffUsers, customers, vehicles, services);

  // Summary
  console.log("\n── Summary ──");
  const counts = {
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    vehicles: await prisma.vehicle.count(),
    services: await prisma.service.count(),
    spareParts: await prisma.sparePart.count(),
    appointments: await prisma.serviceAppointment.count(),
    jobCards: await prisma.jobCard.count(),
    enquiries: await prisma.enquiry.count(),
  };
  for (const [model, count] of Object.entries(counts)) {
    console.log(`  ${model}: ${count}`);
  }

  console.log("\n🎉 Full database seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
