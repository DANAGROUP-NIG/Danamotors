import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { CustomerRepository } from './customer.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';

export class CustomerService {
  private customerRepository: CustomerRepository;

  constructor() {
    this.customerRepository = new CustomerRepository();
  }

  async listCustomers(params: { page: number; limit: number; search?: string; branchId?: string }) {
    const skip = (params.page - 1) * params.limit;
    const { customers, total } = await this.customerRepository.listCustomers({
      skip,
      take: params.limit,
      search: params.search,
      branchId: params.branchId,
    });

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        email: customer.user.email,
        firstName: customer.user.firstName,
        lastName: customer.user.lastName,
        phoneNumber: customer.user.phoneNumber,
        dateOfBirth: customer.dateOfBirth,
        driverLicenseNumber: customer.driverLicenseNumber,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        postalCode: customer.postalCode,
        country: customer.country,
        preferredContactMethod: customer.preferredContactMethod,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        documentsCount: customer.documents.length,
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
      user: {
        id: customer.user.id,
        email: customer.user.email,
        firstName: customer.user.firstName,
        lastName: customer.user.lastName,
        phoneNumber: customer.user.phoneNumber,
      },
      dateOfBirth: customer.dateOfBirth,
      driverLicenseNumber: customer.driverLicenseNumber,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
      preferredContactMethod: customer.preferredContactMethod,
      documents: customer.documents,
      serviceHistory: customer.serviceHistory,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async createCustomer(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    driverLicenseNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
  }) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new ConflictError('A customer with this email address already exists');
    }

    const customerRole = await prisma.role.findUnique({ where: { name: ROLES.CUSTOMER } });
    if (!customerRole) {
      throw new BadRequestError('Customer role is not configured');
    }

    const passwordHash = await bcrypt.hash(data.passwordHash, 10);

    const user = await this.customerRepository.createUser({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      roleId: customerRole.id,
    });

    const customer = await this.customerRepository.createCustomerProfile({
      userId: user.id,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      driverLicenseNumber: data.driverLicenseNumber,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      preferredContactMethod: data.preferredContactMethod,
    });

    return {
      id: customer.id,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
      },
      dateOfBirth: customer.dateOfBirth,
      driverLicenseNumber: customer.driverLicenseNumber,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      country: customer.country,
      preferredContactMethod: customer.preferredContactMethod,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async updateCustomer(id: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    driverLicenseNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    preferredContactMethod?: string;
  }) {
    const customer = await this.customerRepository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const updatedCustomer = await this.customerRepository.updateCustomer(id, {
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : customer.dateOfBirth,
      driverLicenseNumber: data.driverLicenseNumber,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country,
      preferredContactMethod: data.preferredContactMethod,
    });

    await prisma.user.update({
      where: { id: customer.userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
      },
    });

    return {
      id: updatedCustomer.id,
      user: {
        id: customer.user.id,
        email: customer.user.email,
        firstName: data.firstName ?? customer.user.firstName,
        lastName: data.lastName ?? customer.user.lastName,
        phoneNumber: data.phoneNumber ?? customer.user.phoneNumber,
      },
      dateOfBirth: updatedCustomer.dateOfBirth,
      driverLicenseNumber: updatedCustomer.driverLicenseNumber,
      address: updatedCustomer.address,
      city: updatedCustomer.city,
      state: updatedCustomer.state,
      postalCode: updatedCustomer.postalCode,
      country: updatedCustomer.country,
      preferredContactMethod: updatedCustomer.preferredContactMethod,
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
