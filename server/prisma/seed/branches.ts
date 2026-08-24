import { PrismaClient } from "@prisma/client";

export default async function seedBranches(prisma: PrismaClient) {
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
