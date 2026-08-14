import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  ROLES,
  ROLE_PERMISSIONS,
  PERMISSIONS,
} from "../src/shared/constants/roles";

const prisma = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────
const hash = (p: string) => bcrypt.hash(p, 10);

async function seedBranches() {
  const branches = [
    {
      name: "Main Branch",
      address: "1 Marina Road",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      phoneNumber: "+2341000001",
      email: "main@danamotors.com",
    },
    {
      name: "Abuja Branch",
      address: "15 Wuse Zone 3",
      city: "Abuja",
      state: "FCT",
      country: "Nigeria",
      phoneNumber: "+2341000002",
      email: "abuja@danamotors.com",
    },
    {
      name: "Port Harcourt Branch",
      address: "8 Trans-Amadi Rd",
      city: "Port Harcourt",
      state: "Rivers",
      country: "Nigeria",
      phoneNumber: "+2341000003",
      email: "ph@danamotors.com",
    },
  ];
  const result = [];
  for (const b of branches) {
    const branch = await prisma.branch.upsert({
      where: { name: b.name },
      update: {},
      create: { ...b, isActive: true },
    });
    result.push(branch);
  }
  console.log(`✅ Seeded ${result.length} branches`);
  return result;
}

async function seedPermissionsAndRoles() {
  const permissionEntries = Object.values(PERMISSIONS);
  for (const permName of permissionEntries) {
    await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: {
        name: permName,
        description: `Permission to perform ${permName.replace(":", " ")} operations`,
      },
    });
  }
  console.log(`✅ Seeded ${permissionEntries.length} permissions`);

  for (const roleName of Object.values(ROLES)) {
    const dbRole = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} user role` },
    });
    const allowedPerms = ROLE_PERMISSIONS[roleName];
    const permRecords = await prisma.permission.findMany({
      where: { name: { in: allowedPerms } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    if (permRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permRecords.map((p) => ({
          roleId: dbRole.id,
          permissionId: p.id,
        })),
      });
    }
    console.log(`  👤 Role '${roleName}' → ${permRecords.length} permissions`);
  }
}

async function seedStaffUsers(branches: { id: string; name: string }[]) {
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];

  const roles = await prisma.role.findMany();
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const staff = [
    // SuperAdmin
    {
      email: process.env.SUPERADMIN_EMAIL ?? "superadmin@danamotors.com",
      password: process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin@123",
      firstName: "Super",
      lastName: "Admin",
      role: ROLES.SUPER_ADMIN,
      branchId: mainBranch.id,
    },
    // Admins
    {
      email: "admin.lagos@danamotors.com",
      password: "Admin@123",
      firstName: "Adaeze",
      lastName: "Okonkwo",
      role: ROLES.ADMIN,
      branchId: mainBranch.id,
    },
    {
      email: "admin.abuja@danamotors.com",
      password: "Admin@123",
      firstName: "Emeka",
      lastName: "Nwosu",
      role: ROLES.ADMIN,
      branchId: abujaBranch.id,
    },
    // Workshop Managers
    {
      email: "wm.lagos@danamotors.com",
      password: "WManager@123",
      firstName: "Rotimi",
      lastName: "Ajayi",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "wm.abuja@danamotors.com",
      password: "WManager@123",
      firstName: "Musa",
      lastName: "Ibrahim",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: abujaBranch.id,
    },
    {
      email: "wm.ph@danamotors.com",
      password: "WManager@123",
      firstName: "Godwin",
      lastName: "Peters",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: phBranch.id,
    },
    // Store Managers
    {
      email: "store.lagos@danamotors.com",
      password: "Store@123",
      firstName: "Amina",
      lastName: "Bello",
      role: ROLES.GENERAL_STORE_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "store.abuja@danamotors.com",
      password: "Store@123",
      firstName: "Chukwuemeka",
      lastName: "Odu",
      role: ROLES.BRANCH_STORE_MANAGER,
      branchId: abujaBranch.id,
    },
    // Service Advisors
    {
      email: "advisor1@danamotors.com",
      password: "Advisor@123",
      firstName: "Chidi",
      lastName: "Eze",
      role: ROLES.SERVICE_ADVISOR,
      branchId: mainBranch.id,
    },
    {
      email: "advisor2@danamotors.com",
      password: "Advisor@123",
      firstName: "Fatima",
      lastName: "Bello",
      role: ROLES.SERVICE_ADVISOR,
      branchId: abujaBranch.id,
    },
    {
      email: "advisor3@danamotors.com",
      password: "Advisor@123",
      firstName: "Blessing",
      lastName: "Obi",
      role: ROLES.SERVICE_ADVISOR,
      branchId: phBranch.id,
    },
    // Technicians
    {
      email: "tech1@danamotors.com",
      password: "Tech@123",
      firstName: "Tunde",
      lastName: "Akinyemi",
      role: ROLES.TECHNICIAN,
      branchId: mainBranch.id,
    },
    {
      email: "tech2@danamotors.com",
      password: "Tech@123",
      firstName: "Kingsley",
      lastName: "Okoro",
      role: ROLES.TECHNICIAN,
      branchId: mainBranch.id,
    },
    {
      email: "tech3@danamotors.com",
      password: "Tech@123",
      firstName: "Usman",
      lastName: "Garba",
      role: ROLES.TECHNICIAN,
      branchId: abujaBranch.id,
    },
    {
      email: "tech4@danamotors.com",
      password: "Tech@123",
      firstName: "Ifeanyi",
      lastName: "Chukwu",
      role: ROLES.TECHNICIAN,
      branchId: phBranch.id,
    },
    // Receptionists
    {
      email: "reception1@danamotors.com",
      password: "Recept@123",
      firstName: "Chidinma",
      lastName: "Okafor",
      role: ROLES.RECEPTIONIST,
      branchId: mainBranch.id,
    },
    {
      email: "reception2@danamotors.com",
      password: "Recept@123",
      firstName: "Hauwa",
      lastName: "Musa",
      role: ROLES.RECEPTIONIST,
      branchId: abujaBranch.id,
    },
    {
      email: "reception3@danamotors.com",
      password: "Recept@123",
      firstName: "Priscilla",
      lastName: "Hart",
      role: ROLES.RECEPTIONIST,
      branchId: phBranch.id,
    },
    // Reception Manager
    {
      email: "recptionmanager@danamotors.com",
      password: "RecpManager@123",
      firstName: "Blessing",
      lastName: "Effiong",
      role: ROLES.RECEPTION_MANAGER,
      branchId: mainBranch.id,
    },
  ];

  const result = [];
  for (const s of staff) {
    const passwordHash = await hash(s.password);
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        isActive: true,
        roleId: roleMap[s.role],
        branchId: s.branchId,
      },
    });
    result.push(user);
  }
  console.log(`✅ Seeded ${result.length} staff users`);
  return result;
}

async function seedSpareParts() {
  const parts = [
    {
      partNumber: "ENG-OIL-5W30",
      name: "Engine Oil 5W-30 (4L)",
      category: "Lubricants",
      unitPrice: 8500,
    },
    {
      partNumber: "FIL-OIL-001",
      name: "Oil Filter",
      category: "Filters",
      unitPrice: 2500,
    },
    {
      partNumber: "FIL-AIR-001",
      name: "Air Filter",
      category: "Filters",
      unitPrice: 3200,
    },
    {
      partNumber: "BRK-PAD-F01",
      name: "Front Brake Pads (Set)",
      category: "Brakes",
      unitPrice: 18000,
    },
    {
      partNumber: "BRK-DSC-F01",
      name: "Front Brake Disc",
      category: "Brakes",
      unitPrice: 25000,
    },
    {
      partNumber: "SPN-SPK-001",
      name: "Spark Plug (each)",
      category: "Ignition",
      unitPrice: 2800,
    },
    {
      partNumber: "BAT-12V-60AH",
      name: "Battery 12V 60Ah",
      category: "Electrical",
      unitPrice: 45000,
    },
    {
      partNumber: "TYR-195-65R15",
      name: "Tyre 195/65R15",
      category: "Tyres",
      unitPrice: 32000,
    },
    {
      partNumber: "COO-THERM-01",
      name: "Thermostat",
      category: "Cooling",
      unitPrice: 7500,
    },
    {
      partNumber: "COO-HOSE-RAD",
      name: "Radiator Hose",
      category: "Cooling",
      unitPrice: 5500,
    },
  ];

  const result = [];
  for (const p of parts) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber: p.partNumber },
      update: {},
      create: { ...p, description: `${p.name} — genuine replacement part` },
    });
    result.push(part);
  }
  console.log(`✅ Seeded ${result.length} spare parts`);
  return result;
}

// ─── Customer portal demo data ──────────────────────────────────────────────
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
      {
        vin: "4T1B11HK5KU123456",
        registrationNumber: "LAG-778-AA",
        make: "Toyota",
        model: "Camry",
        year: 2019,
        color: "Silver",
      },
      {
        vin: "1HGCV1F34LA012345",
        registrationNumber: "LAG-445-BB",
        make: "Honda",
        model: "Accord",
        year: 2020,
        color: "Black",
      },
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
      {
        vin: "KM8J3CA48KU098765",
        registrationNumber: "ABJ-123-CC",
        make: "Hyundai",
        model: "Tucson",
        year: 2021,
        color: "White",
      },
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
      {
        vin: "1FTFW1E56KFA55443",
        registrationNumber: "PHC-556-DD",
        make: "Ford",
        model: "Ranger",
        year: 2018,
        color: "Blue",
      },
    ],
  },
];

async function seedServices() {
  const services = [
    { name: "Full Service", description: "Comprehensive maintenance: oil, filters, fluids, and a full inspection.", category: "Maintenance", durationMins: 120, price: 85000 },
    { name: "Oil Change", description: "Engine oil and filter replacement.", category: "Maintenance", durationMins: 45, price: 25000 },
    { name: "Brake Service", description: "Brake pad inspection and replacement.", category: "Repair", durationMins: 90, price: 45000 },
    { name: "Tyre Rotation & Balancing", description: "Rotate, balance, and align tyres.", category: "Tyre", durationMins: 60, price: 15000 },
    { name: "Engine Diagnostics", description: "Computer diagnostics and fault-code reading.", category: "Diagnostics", durationMins: 60, price: 20000 },
    { name: "Battery Replacement", description: "Battery health check and replacement.", category: "Electrical", durationMins: 30, price: 30000 },
    { name: "Air Conditioning Service", description: "AC gas top-up and system check.", category: "Comfort", durationMins: 60, price: 18000 },
    { name: "Suspension & Steering Check", description: "Inspect and repair suspension and steering components.", category: "Repair", durationMins: 90, price: 50000 },
  ];
  const result = [];
  for (const s of services) {
    const service = await prisma.service.upsert({
      where: { name: s.name },
      update: {},
      create: { ...s, isActive: true },
    });
    result.push(service);
  }
  console.log(`✅ Seeded ${result.length} services`);
  return result;
}

async function seedCustomerPortal(branches: { id: string; name: string }[], services: { id: string; name: string; durationMins: number | null }[]) {
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];
  const branchFor = (email: string) =>
    email.startsWith("customer2")
      ? abujaBranch
      : email.startsWith("customer3")
        ? phBranch
        : mainBranch;

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
      create: {
        customerId: customer.id,
        passwordHash,
      },
    });

    if (demo.creditBalance && demo.creditBalance > 0) {
      const existingTx = await prisma.customerCreditTransaction.findFirst({
        where: { customerId: customer.id },
      });
      if (!existingTx) {
        await prisma.$transaction([
          prisma.customer.update({
            where: { id: customer.id },
            data: { creditBalance: demo.creditBalance },
          }),
          prisma.customerCreditTransaction.create({
            data: {
              customerId: customer.id,
              amount: demo.creditBalance,
              balanceAfter: demo.creditBalance,
              type: "CREDIT_IN",
              description: "Initial credit (demo)",
            },
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

      // One upcoming appointment per vehicle.
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
          },
        });
      }

      // One job card per vehicle.
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

      // Estimates — one pending approval, one already approved.
      const pendingEstimate = await prisma.estimate.findFirst({
        where: { jobCardId: jobCard.id, status: "Pending" },
      });
      if (!pendingEstimate) {
        await prisma.estimate.create({
          data: {
            jobCardId: jobCard.id,
            description: "Engine oil and filter change",
            amount: 12500,
            currency: "NGN",
            status: "Pending",
          },
        });
      }

      const approvedEstimate = await prisma.estimate.findFirst({
        where: { jobCardId: jobCard.id, status: "Approved" },
      });
      if (!approvedEstimate) {
        const created = await prisma.estimate.create({
          data: {
            jobCardId: jobCard.id,
            description: "Front brake pads replacement",
            amount: 22000,
            currency: "NGN",
            status: "Approved",
          },
        });
        await prisma.customerApproval.create({
          data: {
            estimateId: created.id,
            customerId: customer.id,
            approved: true,
            decisionDate: new Date(),
            comments: "Approved via portal",
            status: "Approved",
          },
        });
      }

      // Invoice — paid for the approved work, unpaid for the pending estimate.
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

  console.log(
    `✅ Seeded customer portal demo data (password: ${CUSTOMER_PASSWORD})`,
  );
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting full database seeding...\n");

  // 1. Branches
  const branches = await seedBranches();

  // 2. Permissions & Roles
  console.log("\nSeeding permissions and roles...");
  await seedPermissionsAndRoles();

  // 3. Staff users
  console.log("\nSeeding staff users...");
  await seedStaffUsers(branches);

  // 4. Spare parts
  console.log("\nSeeding spare parts...");
  await seedSpareParts();

  // 5. Services catalog
  console.log("\nSeeding services catalog...");
  const services = await seedServices();

  // 6. Customer portal demo data
  console.log("\nSeeding customer portal demo data...");
  await seedCustomerPortal(branches, services);

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
