import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import { nextDocumentNumber } from '../finance/document-number';
import { requireMaster } from '../workshop/workshop-master.service';
import { jobOpeningBody, jobUpdateBody } from './service.validation';
import { NotificationService } from '../notification/notification.service';

export const JOB_TRANSITIONS: Record<string, readonly string[]> = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['QC', 'CANCELLED'],
  QC: ['READY', 'CANCELLED'],
  READY: ['BILLED', 'DELIVERED', 'CANCELLED'],
  BILLED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

// Legacy rows remain readable; new writes always use the canonical lifecycle.
export function canonicalJobStatus(status: string) {
  const aliases: Record<string, string> = {
    Open: 'OPEN',
    Pending: 'OPEN',
    'In Progress': 'IN_PROGRESS',
    'On Hold': 'IN_PROGRESS',
    'Quality Check': 'QC',
    Ready: 'READY',
    Completed: 'READY',
    Billed: 'BILLED',
    Closed: 'DELIVERED',
    Cancelled: 'CANCELLED',
  };

  return aliases[status] ?? status;
}

export function repeatWindowStart(now = new Date(), days = Number(process.env.JOB_REPEAT_WINDOW_DAYS ?? 30)) {
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new BadRequestError('Invalid JOB_REPEAT_WINDOW_DAYS configuration');

  return new Date(now.getTime() - days * 86400000);
}

export function assertTransition(
  from: string,
  to: string,
  input: {
    remarks?: string;
    promisedAt: Date | null;
    lateReasonIds?: string[];
  },
  now: Date,
) {
  if (!JOB_TRANSITIONS[canonicalJobStatus(from)]?.includes(to))
    throw new BadRequestError(`Cannot move from ${from} to ${to}`);

  if (to === 'CANCELLED' && !input.remarks?.trim())
    throw new BadRequestError('Cancellation requires a reason');

  if (to === 'DELIVERED') {
    if (!input.promisedAt)
      throw new BadRequestError('A promised delivery time is required');

    if (now > input.promisedAt && !input.lateReasonIds?.length)
      throw new BadRequestError('Late delivery requires at least one reason');

    if ((input.lateReasonIds?.length ?? 0) > 6)
      throw new BadRequestError('At most six late-delivery reasons are allowed');
  }
}

async function requireStaff(tx: Prisma.TransactionClient, id: string, branchId: string, role?: string) {
  const user = await tx.user.findFirst({
    where: {
      id,
      branchId,
      isActive: true,

      ...(role ? {
        role: {
          name: role,
        },
      } : {}),
    },
  });

  if (!user)
    throw new BadRequestError('Select an active staff member with the required role in this branch');

  return user;
}

export class JobCardWorkflowService {
  async open(
    input: z.infer<typeof jobOpeningBody> & {
      createdById?: string;
    },
  ) {
    const {
      createdById,
      ...body
    } = input;

    if (!createdById)
      throw new UnauthorizedError();

    const data = jobOpeningBody.parse(body);

    return prisma.$transaction(async tx => {
      const branch = await tx.branch.findFirst({
        where: {
          name: data.branchName,
          isActive: true,
        },
      });

      if (!branch)
        throw new NotFoundError('Active branch not found');

      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${data.vehicleId} FOR UPDATE`);

      const vehicle = await tx.vehicle.findUnique({
        where: {
          id: data.vehicleId,
        },
      });

      if (!vehicle)
        throw new NotFoundError('Vehicle not found');

      if (!(await tx.customer.findFirst({
        where: {
          id: data.customerId,
          mergedIntoId: null,
        },
      })))
        throw new NotFoundError('Customer not found');

      if (vehicle.lastRecordedMileage !== null && data.mileage < vehicle.lastRecordedMileage)
        throw new BadRequestError('Mileage cannot be less than the last recorded odometer');

      if (data.appointmentId) {
        const appointment = await tx.serviceAppointment.findUnique({
          where: {
            id: data.appointmentId,
          },
        });

        if (!appointment || appointment.branchId !== branch.id || appointment.vehicleId !== vehicle.id)
          throw new BadRequestError('Appointment must match the vehicle and branch');

        if (['Cancelled', 'Completed', 'Closed'].includes(appointment.status))
          throw new BadRequestError('Appointment is no longer open');

        if (await tx.jobCard.count({
          where: {
            appointmentId: appointment.id,

            status: {
              notIn: ['CANCELLED', 'Cancelled'],
            },
          },
        }))
          throw new BadRequestError('Appointment already has a job card');
      }

      await requireMaster(tx, data.serviceTypeId, 'SERVICE_TYPE');
      await requireMaster(tx, data.bayId, 'BAY');

      if (data.teamId)
        await requireMaster(tx, data.teamId, 'TEAM');

      await requireStaff(tx, data.serviceAdvisorId, branch.id, ROLES.SERVICE_ADVISOR);

      if (data.technicianId)
        await requireStaff(tx, data.technicianId, branch.id, ROLES.TECHNICIAN);

      if (data.isRepeat) {
        const previous = await tx.jobCard.findFirst({
          where: {
            id: data.previousJobId,
            vehicleId: vehicle.id,

            createdAt: {
              gte: repeatWindowStart(),
            },

            status: {
              notIn: ['CANCELLED', 'Cancelled'],
            },
          },
        });

        if (!previous)
          throw new BadRequestError('Previous job must be for this vehicle within the repeat window');
      }

      const complaints: { complaintCodeId?: string; defectCode?: string; description: string; spare: number; oil: number; labour: number }[] = [];

      for (const complaint of data.complaints) {
        const code = complaint.complaintCodeId ? await requireMaster(tx, complaint.complaintCodeId, 'COMPLAINT') : null;

        complaints.push({
          complaintCodeId: code?.id,
          defectCode: code?.code ?? complaint.defectCode,
          spare: complaint.spare ?? 0,
          oil: complaint.oil ?? 0,
          labour: complaint.labour ?? 0,
          description: complaint.description || code!.description,
        });
      }

      const tyres = data.tyres ? await Promise.all(data.tyres.map(async tyre => ({
        number: tyre.number ?? '',
        make: tyre.makeId ? (await requireMaster(tx, tyre.makeId, 'TYRE_MAKE')).description : '',
        makeId: tyre.makeId ?? '',
      }))) : undefined;
      const batteryMake = data.batteryMakeId ? (await requireMaster(tx, data.batteryMakeId, 'BATTERY_MAKE')).description : undefined;
      const hasRequestAmounts = data.complaints.some(row => row.spare !== undefined || row.oil !== undefined || row.labour !== undefined);
      const sum = (key: 'spare' | 'oil' | 'labour') => complaints.reduce((total, row) => total + Math.round(row[key] * 100), 0) / 100;
      const estimatedParts = hasRequestAmounts ? sum('spare') : data.estimatedParts;
      const estimatedOil = hasRequestAmounts ? sum('oil') : data.estimatedOil;
      const estimatedLabour = hasRequestAmounts ? sum('labour') : data.estimatedLabour;
      const {
        tyres: _tyres,
        batteryMakeId: _batteryMakeId,
        branchName: _branchName,
        complaints: _complaints,
        promisedAt,
        ...fields
      } = data;

      const card = await tx.jobCard.create({
        data: {
          ...fields,
          tyres,
          batteryMake,
          acFitted: data.acType ? data.acType !== 'NONE' : data.acFitted,
          estimatedParts,
          estimatedOil,
          estimatedLabour,
          estimatedCost: [estimatedParts, estimatedOil, estimatedLabour, data.serviceCharge].some(value => value !== undefined)
            ? [estimatedParts, estimatedOil, estimatedLabour, data.serviceCharge].reduce<number>((total, value) => total + Math.round((value ?? 0) * 100), 0) / 100
            : data.estimatedCost,
          branchId: branch.id,
          createdById,
          promisedAt: new Date(promisedAt),
          status: 'OPEN',
          jobNumber: await nextDocumentNumber(tx, 'JOB_CARD'),

          complaints: {
            create: complaints,
          },

          statusHistory: {
            create: {
              toStatus: 'OPEN',
              actorId: createdById,
            },
          },
        },
      });

      await tx.vehicle.update({
        where: {
          id: vehicle.id,
        },

        data: {
          lastRecordedMileage: data.mileage,
        },
      });

      return card;
    });
  }

  async update(id: string, input: z.infer<typeof jobUpdateBody>, actorId?: string) {
    if (!actorId)
      throw new UnauthorizedError();

    const data = jobUpdateBody.parse(input);

    const card = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);

      const current = await tx.jobCard.findUnique({
        where: {
          id,
        },

        include: {
          invoices: true,
        },
      });

      if (!current)
        throw new NotFoundError('Job card not found');

      const from = canonicalJobStatus(current.status);

      if (['DELIVERED', 'CANCELLED'].includes(from))
        throw new BadRequestError('This job card is closed');

      const billed = !!current.billedAt || current.invoices.some(bill => !['CANCELLED', 'CANCELED', 'VOID'].includes(bill.status.toUpperCase()));

      if (billed && (data.status !== 'DELIVERED' || data.description !== undefined || data.observations !== undefined || data.workDone !== undefined))
        throw new BadRequestError('Billed job cards can only be delivered');

      const now = new Date();

      const update: Prisma.JobCardUncheckedUpdateInput = {
        description: data.description,
        observations: data.observations,
        workDone: data.workDone,
      };

      if (data.status && data.status !== from) {
        assertTransition(from, data.status, {
          ...data,
          promisedAt: current.promisedAt,
        }, now);

        if (data.status === 'DELIVERED') {
          if (!billed && !current.creditApprovedById)
            throw new BadRequestError('Delivery requires a bill or approved credit');

          if (!data.deliveryAdvisorId)
            throw new BadRequestError('Select a delivery advisor');

          await requireStaff(tx, data.deliveryAdvisorId, current.branchId, ROLES.SERVICE_ADVISOR);

          for (const reason of data.lateReasonIds ?? [])
            await requireMaster(tx, reason, 'LATE_REASON');

          update.deliveredAt = now;
          update.deliveryAdvisorId = data.deliveryAdvisorId;
          update.lateReasonIds = data.lateReasonIds ?? [];
          update.gatePassNumber = await nextDocumentNumber(tx, 'GATE_PASS', now);
        }

        if (data.status === 'READY')
          update.readyAt = now;

        update.status = data.status;

        await tx.jobCardStatusHistory.create({
          data: {
            jobCardId: id,
            fromStatus: from,
            toStatus: data.status,
            actorId,
            remarks: data.remarks,
          },
        });
      }

      return tx.jobCard.update({
        where: {
          id,
        },

        data: update,
      });
    });

    if (card.status === 'READY' && data.status === 'READY') {
      await new NotificationService().notifyRole(ROLES.BILLING_OFFICER, card.branchId, {
        type: 'JOB_CARD_READY_FOR_BILLING',
        title: 'Job card ready for billing',
        message: `Job card ${card.jobNumber} is ready to be billed.`,
        link: `/invoices/new?jobCardId=${card.id}`,
        branchId: card.branchId,
      });
    }

    return card;
  }
}
