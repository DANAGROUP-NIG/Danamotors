import { withPartyTransaction } from "../finance/party-account.service";
import { z } from 'zod';
import { customerBody, validateCustomerIdentity } from './customer.validation';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../../prisma/client';
import { CustomerRepository } from './customer.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/appError';

export class CustomerService {
  private customerRepository: CustomerRepository;

  constructor() {
    this.customerRepository = new CustomerRepository();
  }

  async listCustomers(
    params: {
      page: number;
      limit: number;
      search?: string;
      branchId?: string;
      createdById?: string;
    },
  ) {
    const skip = (params.page - 1) * params.limit;

    const {
      customers,
      total,
    } = await this.customerRepository.listCustomers({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
      createdById: params.createdById,
    });

    return {
      customers: customers.map(customer => ({
        ...customer,
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        dateOfBirth: customer.dateOfBirth,
        driverLicenseNumber: customer.driverLicenseNumber,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        postalCode: customer.postalCode,
        country: customer.country,
        preferredContactMethod: customer.preferredContactMethod,
        branchId: customer.branchId,
        createdBy: (customer as any).createdBy ?? null,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })),

      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getCustomer(id: string) {
    const customer = await this.customerRepository.findCustomerById(id);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return {
      ...customer,
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      dateOfBirth: customer.dateOfBirth,
      driverLicenseNumber: customer.driverLicenseNumber,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
      preferredContactMethod: customer.preferredContactMethod,
      branchId: customer.branchId,
      hasAccount: !!customer.account,
      account: customer.account,
      documents: customer.documents,
      serviceHistory: customer.serviceHistory,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  // Create a portal account for a customer, or reset the password of an
  // existing one. Used by staff to provision customer logins.
  async upsertCustomerAccount(
    customerId: string,
    data: {
      password: string;
      isActive?: boolean;
    },
  ) {
    const customer = await this.customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (!customer.email || customer.mergedIntoId)
      throw new BadRequestError('An active customer with an email is required for portal access');

    const passwordHash = await bcrypt.hash(data.password, 10);

    const existing = await prisma.customerAccount.findUnique({
      where: {
        customerId,
      },
    });

    let account;
    let created = false;

    if (existing) {
      account = await prisma.customerAccount.update({
        where: {
          customerId,
        },

        data: {
          passwordHash,

          ...(data.isActive !== undefined ? {
            isActive: data.isActive,
          } : {}),
        },
      });
    } else {
      created = true;

      account = await prisma.customerAccount.create({
        data: {
          customerId,
          passwordHash,

          ...(data.isActive !== undefined ? {
            isActive: data.isActive,
          } : {}),
        },
      });
    }

    return {
      id: account.id,
      created,
      isActive: account.isActive,
      lastLoginAt: account.lastLoginAt,
    };
  }

  async createCustomer(
    input: z.infer<typeof customerBody> & {
      createdById?: string;
    },
  ) {
    const {
      createdById,
      ...body
    } = input;

    const data = customerBody.superRefine(validateCustomerIdentity).parse(body);

    if (data.email && (await prisma.customer.findUnique({
      where: {
        email: data.email,
      },
    })))
      throw new ConflictError('A customer with this email address already exists');

    const duplicates = await this.findDuplicates(data);

    const customer = await prisma.$transaction(async tx => {
      let code = data.code;

      if (!code) {
        const prefix = customerCodePrefix(data.companyName || data.firstName);

        // Admin-supplied legacy codes may occupy generated values; skip them under the sequence lock.
        do {
          const sequence = await tx.documentSequence.upsert({
            where: {
              key: `CUSTOMER_${prefix}`,
            },

            create: {
              key: `CUSTOMER_${prefix}`,
              value: 1,
            },

            update: {
              value: {
                increment: 1,
              },
            },
          });

          code = `${prefix}${String(sequence.value).padStart(6, '0')}`;
        } while (await tx.customer.findUnique({
          where: {
            code,
          },

          select: {
            id: true,
          },
        }));
      }

      return tx.customer.create({
        data: {
          ...data,
          code,
          createdById,
          email: data.email ?? null,
          salutation: data.type === 'CORPORATE' ? 'M/S.' : data.salutation,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        },
      });
    });

    return {
      ...customer,
      duplicates,
    };
  }

  async findDuplicates(
    data: {
      phoneNumber?: string;
      firstName?: string;
      lastName?: string;
      companyName?: string | null;
    },
  ) {
    const OR: Prisma.CustomerWhereInput[] = [];

    if (data.phoneNumber) OR.push({
      phoneNumber: data.phoneNumber,
    });

    if (data.companyName) OR.push({
      companyName: {
        equals: data.companyName,
        mode: 'insensitive',
      },
    });

    if (data.firstName && data.lastName) OR.push({
      firstName: {
        equals: data.firstName,
        mode: 'insensitive',
      },

      lastName: {
        equals: data.lastName,
        mode: 'insensitive',
      },
    });

    return OR.length ? prisma.customer.findMany({
      where: {
        mergedIntoId: null,
        OR,
      },

      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        companyName: true,
        phoneNumber: true,
      },

      take: 10,
    }) : [];
  }

  async updateCustomer(id: string, input: z.infer<ReturnType<typeof customerBody.partial>>) {
    const existing = await prisma.customer.findUnique({
      where: {
        id,
      },
    });

    if (!existing || existing.mergedIntoId)
      throw new NotFoundError('Customer not found');

    const data = customerBody.superRefine(validateCustomerIdentity).parse({
      ...Object.fromEntries(
        Object.keys(customerBody.shape).map(key => [key, existing[key as keyof typeof existing] ?? undefined]),
      ),

      ...input,
      dateOfBirth: input.dateOfBirth ?? existing.dateOfBirth?.toISOString(),
    });

    return prisma.customer.update({
      where: {
        id,
      },

      data: {
        ...data,
        salutation: data.type === 'CORPORATE' ? 'M/S.' : data.salutation,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
    });
  }

  async merge(sourceId: string, targetId: string, actorId: string) {
    if (sourceId === targetId)
      throw new ConflictError('Select two different customers');

    return withPartyTransaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Customer" WHERE id IN (${sourceId}, ${targetId}) ORDER BY id FOR UPDATE`);

      const records = await tx.customer.findMany({
        where: {
          id: {
            in: [sourceId, targetId],
          },

          mergedIntoId: null,
        },
      });

      if (records.length !== 2)
        throw new NotFoundError('Active customers not found');

      const source = records.find(c => c.id === sourceId)!;
      const target = records.find(c => c.id === targetId)!;

      if ((source.tallyLedgerId && target.tallyLedgerId && source.tallyLedgerId !== target.tallyLedgerId) || (source.tallyPartyCode && target.tallyPartyCode && source.tallyPartyCode !== target.tallyPartyCode))
        throw new ConflictError('Resolve different Tally accounts before merging');

      // Disable the old portal identity and revoke sessions instead of transferring credentials.
      const account = await tx.customerAccount.findUnique({
        where: {
          customerId: sourceId,
        },
      });

      if (account) {
        await tx.customerRefreshToken.deleteMany({
          where: {
            customerAccountId: account.id,
          },
        });

        await tx.customerAccount.update({
          where: {
            id: account.id,
          },

          data: {
            isActive: false,
          },
        });
      }

      await tx.vehicle.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.vehicleOwnership.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.jobCard.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.invoice.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.receipt.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.serviceAppointment.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.customerApproval.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.customerDocument.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.serviceHistory.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.outstandingLetter.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.partyNote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
      await tx.partyAdjustmentBatch.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });

      await tx.customerCreditTransaction.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.customerCreditApplication.updateMany({
        where: {
          customerId: sourceId,
        },

        data: {
          customerId: targetId,
        },
      });

      await tx.customer.update({
        where: {
          id: sourceId,
        },

        data: {
          mergedIntoId: targetId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'CUSTOMER_MERGE',

          details: JSON.stringify({
            sourceId,
            targetId,
          }),
        },
      });

      return tx.customer.update({
        where: {
          id: targetId,
        },

        data: {
          tallyLedgerId: target.tallyLedgerId ?? source.tallyLedgerId,
          tallyPartyCode: target.tallyPartyCode ?? source.tallyPartyCode,
        },
      });
    });
  }

  async addCustomerDocument(
    customerId: string,
    data: {
      type: string;
      url: string;
      metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    },
  ) {
    const customer = await this.customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return this.customerRepository.addDocument({
      customerId,
      type: data.type,
      url: data.url,
      metadata: data.metadata,
    });
  }

  async getCustomerDocuments(customerId: string) {
    const customer = await this.customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return this.customerRepository.listDocuments(customerId);
  }

  async addServiceHistory(
    customerId: string,
    data: {
      serviceDate: string;
      description: string;
      vehicleInfo?: string;
      status: string;
      amount?: number;
    },
  ) {
    const customer = await this.customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return this.customerRepository.addServiceHistory({
      customerId,
      serviceDate: new Date(data.serviceDate),
      description: data.description,
      vehicleInfo: data.vehicleInfo,
      status: data.status,
      amount: data.amount,
    });
  }

  async getServiceHistory(customerId: string) {
    const customer = await this.customerRepository.findCustomerById(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return this.customerRepository.listServiceHistory(customerId);
  }
}

export function customerCodePrefix(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'C';
}
