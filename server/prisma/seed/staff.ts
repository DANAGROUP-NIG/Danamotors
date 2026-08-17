import { PrismaClient } from "@prisma/client";
import { ROLES } from "../../src/shared/constants/roles";
import { hash } from "./helpers";

export default async function seedStaffUsers(
  prisma: PrismaClient,
  branches: { id: string; name: string }[]
) {
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];

  const roles = await prisma.role.findMany();
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const staff = [
    {
      email: process.env.SUPERADMIN_EMAIL ?? "superadmin@danamotors.com",
      password: process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin@123",
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
      email: "admin.abuja@danamotors.com",
      password: "Admin@123",
      firstName: "Emeka",
      lastName: "Nwosu",
      role: ROLES.ADMIN,
      branchId: abujaBranch.id,
    },
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
