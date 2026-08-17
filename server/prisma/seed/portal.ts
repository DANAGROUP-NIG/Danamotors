import { PrismaClient } from "@prisma/client";
import { hash } from "./helpers";

const CUSTOMER_PASSWORD = "Customer@123";

const customerDemo = [
  {
    email: "customer1@danamotors.com",
    firstName: "Ade",
    lastName: "Oyelaran",
    phoneNumber: "+234800000001",
    address: "12 Admiralty Way, Lekki Phase 1",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    creditBalance: 50000,
    vehicles: [
      { vin: "4T1B11HK5KU123456", registrationNumber: "LAG-778-AA", make: "Toyota", model: "Camry", year: 2019, color: "Silver" },
      { vin: "1HGCV1F34LA012345", registrationNumber: "LAG-445-BB", make: "Honda", model: "Accord", year: 2020, color: "Black" },
    ],
  },
  {
    email: "customer2@danamotors.com",
    firstName: "Ngozi",
    lastName: "Adichie",
    phoneNumber: "+234800000002",
    address: "7 Gana Street, Maitama",
    city: "Abuja",
    state: "FCT",
    country: "Nigeria",
    creditBalance: 25000,
    vehicles: [
      { vin: "KM8J3CA48KU098765", registrationNumber: "ABJ-123-CC", make: "Hyundai", model: "Tucson", year: 2021, color: "White" },
    ],
  },
  {
    email: "customer3@danamotors.com",
    firstName: "Emeka",
    lastName: "Obi",
    phoneNumber: "+234800000003",
    address: "5 Woji Road",
    city: "Port Harcourt",
    state: "Rivers",
    country: "Nigeria",
    creditBalance: 15000,
    vehicles: [
      { vin: "1FTFW1E56KFA55443", registrationNumber: "PHC-556-DD", make: "Ford", model: "Ranger", year: 2018, color: "Blue" },
    ],
  },
];

export default async function seedCustomerPortal(
  prisma: PrismaClient,
  branches: { id: string; name: string }[],
  services: { id: string; name: string; durationMins: number | null }[]
) {
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];
  const branchFor = (email: string) =>
    email.startsWith("customer2") ? abujaBranch : email.startsWith("customer3") ? phBranch : mainBranch;

  const passwordHash = await hash(CUSTOMER_PASSWORD);
  let jobSeq = 0;

  for (const demo of customerDemo) {
    const branch = branchFor(demo.email);

    const customer = await prisma.customer.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        email: demo.email,
        firstName: demo.firstName,
        lastName: demo.lastName,
        phoneNumber: demo.phoneNumber,
        address: demo.address,
        city: demo.city,
        state: demo.state,
        country: demo.country,
        branchId: branch.id,
      },
    });

    await prisma.customerAccount.upsert({
      where: { customerId: customer.id },
      update: {},
      create: { customerId: customer.id, passwordHash },
    });

    if (demo.creditBalance && demo.creditBalance > 0) {
      const existingTx = await prisma.customerCreditTransaction.findFirst({
        where: { customerId: customer.id },
      });
      if (!existingTx) {
        await prisma.$transaction([
          prisma.customer.update({ where: { id: customer.id }, data: { creditBalance: demo.creditBalance } }),
          prisma.customerCreditTransaction.create({
            data: { customerId: customer.id, amount: demo.creditBalance, balanceAfter: demo.creditBalance, type: "CREDIT_IN", description: "Initial credit (demo)" },
          }),
        ]);
      }
    }

    for (const v of demo.vehicles) {
      const vehicle = await prisma.vehicle.upsert({
        where: { vin: v.vin },
        update: {},
        create: {
          customerId: customer.id,
          vin: v.vin,
          registrationNumber: v.registrationNumber,
          make: v.make,
          model: v.model,
          year: v.year,
          color: v.color,
          ownershipStatus: "Owned",
        },
      });

      const existingAppointment = await prisma.serviceAppointment.findFirst({
        where: { vehicleId: vehicle.id },
      });
      if (!existingAppointment) {
        await prisma.serviceAppointment.create({
          data: {
            customerId: customer.id,
            vehicleId: vehicle.id,
            branchId: branch.id,
            serviceId: services[jobSeq % services.length].id,
            scheduledAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            durationMins: services[jobSeq % services.length].durationMins ?? 120,
            notes: `Routine ${services[jobSeq % services.length].name.toLowerCase()}`,
            status: "Pending",
            source: "WalkIn",
          },
        });
      }

      jobSeq += 1;
      const jobNumber = `DM-2026-${String(jobSeq).padStart(4, "0")}`;
      const jobCard = await prisma.jobCard.upsert({
        where: { jobNumber },
        update: {},
        create: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          branchId: branch.id,
          jobNumber,
          description: `${v.year} ${v.make} ${v.model} — routine service and inspection`,
          status: jobSeq % 2 === 0 ? "In Progress" : "Open",
          progress: jobSeq % 2 === 0 ? 45 : 10,
          estimatedHours: 6,
          estimatedCost: 85000,
          qcStatus: "Pending",
        },
      });

      const pendingEstimate = await prisma.estimate.findFirst({
        where: { jobCardId: jobCard.id, status: "Pending" },
      });
      if (!pendingEstimate) {
        await prisma.estimate.create({
          data: { jobCardId: jobCard.id, description: "Engine oil and filter change", amount: 12500, currency: "NGN", status: "Pending" },
        });
      }

      const approvedEstimate = await prisma.estimate.findFirst({
        where: { jobCardId: jobCard.id, status: "Approved" },
      });
      if (!approvedEstimate) {
        const created = await prisma.estimate.create({
          data: { jobCardId: jobCard.id, description: "Front brake pads replacement", amount: 22000, currency: "NGN", status: "Approved" },
        });
        await prisma.customerApproval.create({
          data: { estimateId: created.id, customerId: customer.id, approved: true, decisionDate: new Date(), comments: "Approved via portal", status: "Approved" },
        });
      }

      const invoiceNumber = `INV-2026-${String(jobSeq).padStart(4, "0")}`;
      await prisma.invoice.upsert({
        where: { invoiceNumber },
        update: {},
        create: {
          customerId: customer.id,
          jobCardId: jobCard.id,
          invoiceNumber,
          issuedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          subtotal: 22000,
          tax: 0,
          total: 22000,
          status: jobSeq % 2 === 0 ? "Paid" : "Unpaid",
          notes: "Service charge",
        },
      });
    }

    console.log(`  👤 Demo customer '${demo.email}' (${demo.firstName} ${demo.lastName})`);
  }

  console.log(`✅ Seeded customer portal demo data (password: ${CUSTOMER_PASSWORD})`);
}
