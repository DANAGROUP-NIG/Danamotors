import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import { nextSequenceNumber } from "../../shared/db/documentSequence";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/appError";
import {
  BookingCustomerDetails,
  bookingCustomerFieldsToComplete,
  normalizeBookingPhone,
  validateBookingCustomer,
} from "../../shared/booking-customer-details";
import { bookingRequestBody } from "./service.validation";
import { resolveJobComplaints } from "./job-card-complaints";
import { bookingView } from "./booking.logic";

export type BookingFields = {
  serviceId?: string;
  serviceTypeId?: string;
  mileage?: number;
  acFitted?: boolean;
  followUpJobId?: string | null;
  requests?: z.infer<typeof bookingRequestBody>[];
};
export type BookingCreate = BookingFields & {
  customerId: string;
  customerDetails?: BookingCustomerDetails;
  customerDetailsBranchId?: string | null;
  vehicleId: string;
  branchId: string;
  createdById?: string;
  scheduledAt: Date;
  durationMins?: number;
  notes?: string;
  status?: string;
  source?: string;
};

export async function bookingRelations(
  tx: Prisma.TransactionClient,
  data: BookingFields,
  vehicleId: string,
  branchId: string,
) {
  if (
    data.serviceTypeId &&
    !(await tx.workshopMaster.findFirst({
      where: { id: data.serviceTypeId, kind: "SERVICE_TYPE", active: true },
      select: { id: true },
    }))
  )
    throw new BadRequestError("Select an active workshop service type");
  if (
    data.serviceId &&
    !(await tx.service.findFirst({
      where: { id: data.serviceId, isActive: true },
      select: { id: true },
    }))
  )
    throw new BadRequestError("Select an active appointment service");
  if (
    data.followUpJobId &&
    !(await tx.jobCard.findFirst({
      where: {
        id: data.followUpJobId,
        vehicleId,
        branchId,
        createdAt: { lte: new Date() },
        status: { notIn: ["CANCELLED", "Cancelled"] },
      },
      select: { id: true },
    }))
  )
    throw new BadRequestError(
      "Follow-up job must be an earlier job for this vehicle and branch",
    );
  const rows = await resolveJobComplaints(
    tx,
    data.requests === undefined
      ? []
      : z
          .array(bookingRequestBody)
          .min(1, "Add a customer request")
          .parse(data.requests),
  );
  return rows.map((row) => ({
    complaintCodeId: row.complaintCodeId,
    defectCode: row.defectCode,
    description: row.description,
    estimatedParts: row.spare,
    estimatedOil: row.oil,
    estimatedLabour: row.labour,
  }));
}

export async function createBooking(
  data: BookingCreate,
  outer?: Prisma.TransactionClient,
) {
  data = {
    ...data,
    requests: z
      .array(bookingRequestBody)
      .min(1, "Add a customer request")
      .parse(data.requests),
  };
  if (data.status && data.status !== "Pending")
    throw new BadRequestError("New bookings must start as booked");
  const {
    requests: _requests,
    customerDetails,
    customerDetailsBranchId,
    ...fields
  } = data;
  const write = async (tx: Prisma.TransactionClient) => {
    // Match the customer merge lock order and keep the customer details stable until commit.
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${data.customerId} FOR NO KEY UPDATE`;
    // The locking read also establishes existence; keep duplicate detection under this lock.
    const vehicles = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Vehicle" WHERE id = ${data.vehicleId} FOR UPDATE`;
    if (vehicles.length === 0)
      throw new NotFoundError("Vehicle not found");
    const customer = await tx.customer.findFirst({
      where: { id: data.customerId, mergedIntoId: null },
      select: {
        id: true, branchId: true, tin: true, nin: true, email: true,
        address: true, postalCode: true, phoneNumber: true,
      },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    const updates: BookingCustomerDetails = {};
    for (const field of bookingCustomerFieldsToComplete(customer)) {
      const value = customerDetails?.[field]?.trim();
      if (!value) continue;
      updates[field] = field === "email" ? value.toLowerCase()
        : field === "phoneNumber" ? normalizeBookingPhone(value)
        : value;
    }
    if (Object.keys(updates).length && customerDetailsBranchId !== undefined &&
        (!customerDetailsBranchId || customer.branchId !== customerDetailsBranchId)) {
      throw new ForbiddenError("You can only complete customer details for your branch");
    }
    const errors = validateBookingCustomer({ ...customer, ...updates });
    if (Object.keys(errors).length) {
      throw new BadRequestError("Complete the required customer details")
        .withCode("FIELD_VALIDATION", { customerDetails: errors });
    }
    if (
      !(await tx.branch.findFirst({
        where: { id: data.branchId, isActive: true },
        select: { id: true },
      }))
    )
      throw new NotFoundError("Active branch not found");
    if (
      await tx.serviceAppointment.findFirst({
        where: {
          customerId: data.customerId,
          vehicleId: data.vehicleId,
          bookingStatus: "BOOKED",
          status: { notIn: ["Closed", "Cancelled", "Completed", "No Show"] },
        },
        select: { id: true },
      })
    )
      throw new ConflictError(
        "This vehicle already has an active booking for this customer",
      ).withCode("FIELD_VALIDATION", { field: "vehicleId" });
    const requests = await bookingRelations(
      tx,
      data,
      data.vehicleId,
      data.branchId,
    );
    const duplicateEmail = () => {
      const message = "This email address already belongs to another customer";
      return new ConflictError(message)
        .withCode("FIELD_VALIDATION", { customerDetails: { email: message } });
    };
    if (Object.keys(updates).length) {
      if (updates.email && await tx.customer.findFirst({
        where: { id: { not: customer.id }, email: { equals: updates.email, mode: "insensitive" } },
        select: { id: true },
      })) throw duplicateEmail();
      try {
        await tx.customer.update({ where: { id: customer.id }, data: updates, select: { id: true } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw duplicateEmail();
        }
        throw error;
      }
    }
    // Allocate late so the shared branch/year counter is locked only during writes.
    const number = await nextSequenceNumber(
      tx,
      `BOOKING_${data.branchId}`,
    );
    const booking = await tx.serviceAppointment.create({
      data: {
        ...fields,
        source: data.source ?? "WalkIn",
        bookingNumber: `${data.branchId}/${number}`,
        bookingStatus: "BOOKED",
        requests: { create: requests },
      },
      include: { requests: true, service: true },
    });
    await tx.auditLog.create({
      data: {
        userId: data.createdById,
        action: "BOOKING_CREATED",
        details: JSON.stringify({
          bookingId: booking.id,
          branchId: data.branchId,
          bookingNumber: booking.bookingNumber,
        }),
      },
    });
    return booking;
  };
  const booking = outer
    ? await write(outer)
    : await prisma.$transaction(write, { timeout: 10000 });
  return bookingView(booking);
}
