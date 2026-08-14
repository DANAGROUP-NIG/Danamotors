// Public API for the customers feature
export { CustomersPage } from "./components/customers-page";
export { useCustomers } from "./hooks/use-customers";
export { useCustomer } from "./hooks/use-customer";
export { useCreateCustomer } from "./hooks/use-create-customer";
export { useUpdateCustomer } from "./hooks/use-update-customer";
export { useDeleteCustomer } from "./hooks/use-delete-customer";
export { useManageCustomerAccount } from "./hooks/use-manage-customer-account";
export { customerKeys } from "./api/customer.keys";
export {
  getCustomersRequest,
  getCustomerRequest,
  createCustomerRequest,
  updateCustomerRequest,
  deleteCustomerRequest,
  manageCustomerAccountRequest,
} from "./api/customer.api";
export { getCustomerFullName, getCustomerInitials } from "./services/customer.service";
export {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerFormValues,
  type UpdateCustomerFormValues,
} from "./schemas/customer.schema";
export type {
  Customer,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerListResponse,
} from "./types/customer.types";
