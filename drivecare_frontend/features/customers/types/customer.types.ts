export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
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
