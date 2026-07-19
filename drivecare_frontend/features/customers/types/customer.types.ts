export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
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
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
};
