import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../../prisma/client';
import { CustomerRepository } from './customer.repository';
import { NotFoundError, ConflictError } from '../../shared/errors/appError';

export class CustomerService {
  private customerRepository: CustomerRepository;

  constructor() {
    this.customerRepository = new CustomerRepository();
  }

  async listCustomers(params: { page: number; limit: number; search?: string; branchId?: string; createdById?: string }) {
    const skip = (params.page - 1) * params.limit;
    const { customers, total } = await this.customerRepository.listCustomers({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
      createdById: params.createdById,
    });

    return {
      customers: customers.map((customer) => ({
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
  async upsertCustomerAccount(customerId: string, data: {
    password: string;
    isActive?: boolean;
  }) {
    const customer = await this.customerRepository.findCustomerById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const existing = await prisma.customerAccount.findUnique({
      where: { customerId },
    });

    let account;
    let created = false;
    if (existing) {
      account = await prisma.customerAccount.update({
        where: { customerId },
        data: {
          passwordHash,
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    } else {
      created = true;
      account = await prisma.customerAccount.create({
        data: {
          customerId,
          passwordHash,
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
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

  async createCustomer(data: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    driverLicenseNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
    branchId: string;
    createdById?: string;
  }) {
    const existing = await prisma.customer.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictError('A customer with this email address already exists');
    }

    const customer = await this.customerRepository.createCustomerProfile({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      driverLicenseNumber: data.driverLicenseNumber,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      preferredContactMethod: data.preferredContactMethod,
      branchId: data.branchId,
      createdById: data.createdById,
    });

    return {
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
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async updateCustomer(id: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    driverLicenseNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
    branchId?: string;
  }) {
    const customer = await this.customerRepository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const updatedCustomer = await this.customerRepository.updateCustomer(id, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : customer.dateOfBirth,
      driverLicenseNumber: data.driverLicenseNumber,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      preferredContactMethod: data.preferredContactMethod,
      branchId: data.branchId,
    });

    return {
      id: updatedCustomer.id,
      firstName: updatedCustomer.firstName,
      lastName: updatedCustomer.lastName,
      email: updatedCustomer.email,
      phoneNumber: updatedCustomer.phoneNumber,
      dateOfBirth: updatedCustomer.dateOfBirth,
      driverLicenseNumber: updatedCustomer.driverLicenseNumber,
      address: updatedCustomer.address,
      city: updatedCustomer.city,
      state: updatedCustomer.state,
      postalCode: updatedCustomer.postalCode,
      country: updatedCustomer.country,
      preferredContactMethod: updatedCustomer.preferredContactMethod,
      branchId: updatedCustomer.branchId,
      createdAt: updatedCustomer.createdAt,
      updatedAt: updatedCustomer.updatedAt,
    };
  }

  async addCustomerDocument(customerId: string, data: { type: string; url: string; metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput }) {
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

  async addServiceHistory(customerId: string, data: {
    serviceDate: string;
    description: string;
    vehicleInfo?: string;
    status: string;
    amount?: number;
  }) {
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
