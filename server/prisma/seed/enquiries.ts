import { PrismaClient } from "@prisma/client";
import { rng } from "./helpers";

export default async function seedEnquiries(
  prisma: PrismaClient,
  branches: { id: string; name: string }[],
  staffUsers: { id: string; firstName: string; lastName: string }[],
  customers: { id: string; firstName: string; lastName: string; email: string }[],
  vehicles: { id: string; customerId: string }[],
  services: { id: string }[],
) {
  const mainBranch = branches[0];
  const abujaBranch = branches[1];
  const phBranch = branches[2];
  const receptionistMain = staffUsers.find((u) => u.firstName === "Chidinma")!;

  const enquiries = [
    {
      firstName: "Amaka", lastName: "Okafor", email: "amaka.okafor@gmail.com",
      phoneNumber: "+2348012345678", vehicleMake: "Toyota", vehicleModel: "Camry",
      vehicleYear: 2019, vehicleRegNumber: "LND 123 AB",
      serviceDescription: "Engine is making a knocking sound when idling. Needs diagnostics.",
      branchId: mainBranch.id, status: "Pending" as const,
    },
    {
      firstName: "Tunde", lastName: "Bakare", email: "tunde.bakare@yahoo.com",
      phoneNumber: "+2348098765432", vehicleMake: "Honda", vehicleModel: "CR-V",
      vehicleYear: 2022, vehicleRegNumber: "ABJ-789-DE",
      serviceDescription: "Brake squealing on front wheels. Pads may need replacement.",
      branchId: abujaBranch.id, status: "Pending" as const,
    },
    {
      firstName: "Chioma", lastName: "Nwosu", email: "chioma.nwosu@gmail.com",
      phoneNumber: "+2347055512345", vehicleMake: "Mercedes-Benz", vehicleModel: "C300",
      vehicleYear: 2020, vehicleRegNumber: "PHC-456-FG",
      serviceDescription: "AC not blowing cold air. Gas top-up and system check needed.",
      branchId: phBranch.id, status: "Pending" as const,
    },
    {
      firstName: "Femi", lastName: "Adebayo", email: "femi.adebayo@outlook.com",
      phoneNumber: "+2348122233444", vehicleMake: "Lexus", vehicleModel: "RX 350",
      vehicleYear: 2021, vehicleRegNumber: "LAG-321-HI",
      serviceDescription: "Routine full service and oil change. Last serviced 6 months ago.",
      branchId: mainBranch.id, status: "Approved" as const,
    },
    {
      firstName: "Yemi", lastName: "Alade", email: "yemi.alade@gmail.com",
      phoneNumber: "+2348033344555", vehicleMake: "Hyundai", vehicleModel: "Elantra",
      vehicleYear: 2018, vehicleRegNumber: "LAG-654-JK",
      serviceDescription: "Suspension noise over bumps. Wants a quote.",
      branchId: mainBranch.id, status: "Rejected" as const,
    },
  ];

  let count = 0;
  for (const e of enquiries) {
    const existing = await prisma.enquiry.findFirst({ where: { email: e.email } });
    if (existing) continue;

    const enquiry = await prisma.enquiry.create({
      data: {
        firstName: e.firstName, lastName: e.lastName, email: e.email,
        phoneNumber: e.phoneNumber, vehicleMake: e.vehicleMake, vehicleModel: e.vehicleModel,
        vehicleYear: e.vehicleYear, vehicleRegNumber: e.vehicleRegNumber,
        serviceDescription: e.serviceDescription, branchId: e.branchId, status: e.status,
        preferredDate: new Date(Date.now() + rng(3, 14) * 24 * 60 * 60 * 1000),
      },
    });

    if (e.status === "Approved" || e.status === "Rejected") {
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          reviewedById: receptionistMain.id,
          reviewNotes: e.status === "Approved"
            ? "Customer confirmed. Converted to appointment."
            : "Insufficient information provided. Please re-submit.",
          reviewedAt: new Date(Date.now() - rng(1, 3) * 24 * 60 * 60 * 1000),
        },
      });
    }

    if (e.status === "Approved") {
      const customer = customers[0];
      const vehicle = vehicles[0];
      const service = services[0];
      const appointment = await prisma.serviceAppointment.create({
        data: {
          customerId: customer.id, vehicleId: vehicle.id, branchId: e.branchId,
          serviceId: service.id,
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          notes: `Approved from enquiry: ${e.serviceDescription}`,
          status: "Pending", source: "OnlineBooking",
        },
      });
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: { appointmentId: appointment.id },
      });
    }

    count++;
  }
  console.log(`✅ Seeded ${count} enquiries (Pending: 3, Approved: 1, Rejected: 1)`);
}
