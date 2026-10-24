import prisma from "../../../src/prisma/client";
import { CustomerService } from "../../../src/modules/customer/customer.service";
import { VehicleService } from "../../../src/modules/vehicle/vehicle.service";
import { PartyAccountService } from "../../../src/modules/finance/party-account.service";
import { DemoContext, Reference } from "./context";
import { CUSTOMERS, CustomerFixture, CustomerKey, DEMO_TAG, VEHICLES, VehicleKey, demoUuid } from "./fixtures";
import { daysAgo } from "./retime";

export interface Parties {
  customers: Record<CustomerKey, { id: string; branchId: string }>;
  vehicles: Record<VehicleKey, { id: string; customerId: string; saleYear: number }>;
}

/** Customers by fixed code, vehicles by VIN: created through the app's services only when missing. */
export async function ensureParties(ctx: DemoContext, ref: Reference): Promise<Parties> {
  const customerService = new CustomerService();
  const customers = {} as Parties["customers"];
  for (const [key, c] of Object.entries(CUSTOMERS) as [CustomerKey, CustomerFixture][]) {
    const branchId = ctx.branches[c.branch].id;
    const existing = await prisma.customer.findUnique({ where: { code: c.code }, select: { id: true, branchId: true } });
    const { branch: _branch, openingCredit, ...fields } = c;
    const customer =
      existing ??
      (await customerService.createCustomer({ ...fields, country: "Nigeria", branchId, createdById: ctx.staff[c.branch].advisor.id }));
    customers[key] = { id: customer.id, branchId: customer.branchId };

    if (openingCredit) {
      // Money held on account: an opening credit note through the party account service.
      const idempotencyKey = demoUuid(`opening-credit:${c.code}`);
      if (!(await prisma.partyNote.findUnique({ where: { idempotencyKey }, select: { id: true } }))) {
        await new PartyAccountService().openingBalance(
          {
            customerId: customer.id,
            branchId: customer.branchId,
            direction: "CREDIT",
            date: daysAgo(30).toISOString(),
            amount: openingCredit,
            narration: `${DEMO_TAG}: advance paid by the customer (demo)`,
            idempotencyKey,
          },
          ctx.admin.id,
        );
      }
    }
  }

  const vehicleService = new VehicleService();
  const vehicles = {} as Parties["vehicles"];
  for (const [key, v] of Object.entries(VEHICLES) as [VehicleKey, (typeof VEHICLES)[VehicleKey]][]) {
    const saleDate = daysAgo(v.saleDaysAgo);
    saleDate.setUTCHours(0, 0, 0, 0);
    const existing = await prisma.vehicle.findUnique({ where: { vin: v.vin }, select: { id: true, customerId: true, saleDate: true } });
    if (existing) {
      if (existing.customerId !== customers[v.customer].id) {
        throw new Error(`VIN ${v.vin} already belongs to another customer. The demo VINs must not be reused.`);
      }
      vehicles[key] = { id: existing.id, customerId: existing.customerId, saleYear: (existing.saleDate ?? saleDate).getUTCFullYear() };
      continue;
    }
    const model = ref.workshopModels[v.model];
    const customer = CUSTOMERS[v.customer];
    const created = await vehicleService.createVehicle({
      customerId: customers[v.customer].id,
      vin: v.vin,
      registrationNumber: v.registrationNumber,
      catalogueId: model.variantId,
      colourId: model.colourId,
      vehicleModelId: ref.warrantyModels[v.model],
      year: saleDate.getUTCFullYear(),
      saleDate: saleDate.toISOString(),
      pdiDone: true,
      pdiDate: daysAgo(v.saleDaysAgo + 3).toISOString(),
      sellingDealer: "Dana Motors (demo)",
      ownershipStatus: "Owned",
      createdById: ctx.staff[customer.branch].advisor.id,
    });
    vehicles[key] = { id: created.id, customerId: customers[v.customer].id, saleYear: saleDate.getUTCFullYear() };
  }
  return { customers, vehicles };
}
