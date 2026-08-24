import { PrismaClient } from "@prisma/client";

export default async function seedServices(prisma: PrismaClient) {
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
