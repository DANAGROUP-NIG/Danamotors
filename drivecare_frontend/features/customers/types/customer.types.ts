export type Customer = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerPayload = {
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
};

export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;

export type CustomerListResponse = {
  customers: Customer[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
