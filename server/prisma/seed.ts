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
  // 7. Appointments
  // 8. Job cards
  // 9. Inspections & Estimates
  // 10. Approvals, Part Issuances & Invoices
  // 11. Payments & Receipts
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
