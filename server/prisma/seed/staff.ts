import { PrismaClient } from "@prisma/client";
import { ROLES } from "../../src/shared/constants/roles";
import { hash } from "./helpers";
import seedPermissionsAndRoles from "./roles";

export default async function seedStaffUsers(
  prisma: PrismaClient,
  branches: { id: string; name: string }[],
) {
  if (branches.length < 3) {
    throw new Error("Staff seeding requires three branches. Run the branch seed first.");
  }
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];

  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));

  const staff = [
    {
      email: "superadmin@danamotors.com",
      password: "SuperAdmin@123",
      firstName: "Super",
      lastName: "Admin",
      role: ROLES.SUPER_ADMIN,
      branchId: mainBranch.id,
    },
    {
      email: "admin.lagos@danamotors.com",
      password: "Admin@123",
      firstName: "Adaeze",
      lastName: "Okonkwo",
      role: ROLES.ADMIN,
      branchId: mainBranch.id,
    },
    {
      email: "admin.abuja@kiamotors.com",
      password: "Admin@123",
      firstName: "Emeka",
      lastName: "Nwosu",
      role: ROLES.ADMIN,
      branchId: abujaBranch.id,
    },
    {
      email: "wm.lagos@kiaamotors.com",
      password: "WManager@123",
      firstName: "Rotimi",
      lastName: "Ajayi",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "wm.abuja@kiamotors.com",
      password: "WManager@123",
      firstName: "Musa",
      lastName: "Ibrahim",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: abujaBranch.id,
    },
    {
      email: "wm.ph@kiamotors.com",
      password: "WManager@123",
      firstName: "Godwin",
      lastName: "Peters",
      role: ROLES.WORKSHOP_MANAGER,
      branchId: phBranch.id,
    },
    {
      email: "store.lagos@kiamotors.com",
      password: "Store@123",
      firstName: "Amina",
      lastName: "Bello",
      role: ROLES.GENERAL_STORE_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "store.abuja@kiamotors.com",
      password: "Store@123",
      firstName: "Chukwuemeka",
      lastName: "Odu",
      role: ROLES.BRANCH_STORE_MANAGER,
      branchId: abujaBranch.id,
    },
    {
      email: "advisor1@kiamotors.com",
      password: "Advisor@123",
      firstName: "Chidi",
      lastName: "Eze",
      role: ROLES.SERVICE_ADVISOR,
      branchId: mainBranch.id,
    },
    {
      email: "advisor2@kiamotors.com",
      password: "Advisor@123",
      firstName: "Fatima",
      lastName: "Bello",
      role: ROLES.SERVICE_ADVISOR,
      branchId: abujaBranch.id,
    },
    {
      email: "advisor3@kiamotors.com",
      password: "Advisor@123",
      firstName: "Blessing",
      lastName: "Obi",
      role: ROLES.SERVICE_ADVISOR,
      branchId: phBranch.id,
    },
    {
      email: "tech1@kiamotors.com",
      password: "Tech@123",
      firstName: "Tunde",
      lastName: "Akinyemi",
      role: ROLES.TECHNICIAN,
      branchId: mainBranch.id,
    },
    {
      email: "tech2@kiamotors.com",
      password: "Tech@123",
      firstName: "Kingsley",
      lastName: "Okoro",
      role: ROLES.TECHNICIAN,
      branchId: mainBranch.id,
    },
    {
      email: "tech3@kiamotors.com",
      password: "Tech@123",
      firstName: "Usman",
      lastName: "Garba",
      role: ROLES.TECHNICIAN,
      branchId: abujaBranch.id,
    },
    {
      email: "tech4@kiamotors.com",
      password: "Tech@123",
      firstName: "Ifeanyi",
      lastName: "Chukwu",
      role: ROLES.TECHNICIAN,
      branchId: phBranch.id,
    },
    {
      email: "ccuofficer1@kiamotors.com",
      password: "CcuOfficer@123",
      firstName: "Chidinma",
      lastName: "Okafor",
      role: ROLES.CCU_OFFICER,
      branchId: mainBranch.id,
    },
    {
      email: "ccuofficer2@kiamotors.com",
      password: "CcuOfficer@123",
      firstName: "Hauwa",
      lastName: "Musa",
      role: ROLES.CCU_OFFICER,
      branchId: abujaBranch.id,
    },
    {
      email: "ccuofficer3@kiamotors.com",
      password: "CcuOfficer@123",
      firstName: "Priscilla",
      lastName: "Hart",
      role: ROLES.CCU_OFFICER,
      branchId: phBranch.id,
    },
    {
      email: "ccumanager@kiamotors.com",
      password: "CcuManager@123",
      firstName: "Madam",
      lastName: "Ihuoma",
      role: ROLES.CCU_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "warranty@kiamotors.com",
      password: "Warranty@123",
      firstName: "Folake",
      lastName: "Adebayo",
      role: ROLES.WARRANTY_OFFICER,
      branchId: mainBranch.id,
    },
    {
      email: "servicemanager@kiamotors.com",
      password: "ServiceManager@123",
      firstName: "Mr",
      lastName: "Mark",
      role: ROLES.SERVICE_MANAGER,
      branchId: mainBranch.id,
    },
    {
      email: "serviceadvisor@kiamotors.com",
      password: "ServiceAdvisor@123",
      firstName: "Service",
      lastName: "Advisor",
      role: ROLES.SERVICE_ADVISOR,
      branchId: mainBranch.id,
    },
  ];

  const missingRoles = [...new Set(staff.map((s) => s.role))].filter(
    (role) => !roleMap.has(role),
  );
  if (missingRoles.length > 0) {
    throw new Error(`Staff seeding requires these roles: ${missingRoles.join(", ")}. Run the role seed first.`);
  }

  const result = [];
  for (const s of staff) {
    const roleId = roleMap.get(s.role);
    if (!roleId) throw new Error(`Missing staff role: ${s.role}`);
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
        roleId,
        branchId: s.branchId,
      },
    });
    result.push(user);
  }
  console.log(`✅ Seeded ${result.length} staff users`);
  return result;
}

// Self-execute when run directly: `npx ts-node prisma/seed/staff.ts`
if (require.main === module) {
  (async () => {
    const prisma = new PrismaClient();
    try {
      console.log("Synchronizing built-in roles and permissions before seeding staff...");
      await seedPermissionsAndRoles(prisma);
      const branches = await prisma.branch.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });
      await seedStaffUsers(prisma, branches);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
