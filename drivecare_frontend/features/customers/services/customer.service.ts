import type { Customer } from "../types/customer.types";

/** Returns customer's full name */
export function getCustomerFullName(customer: Customer): string {
  return `${customer.firstName} ${customer.lastName}`;
}

/** Returns customer initials for avatars */
export function getCustomerInitials(customer: Customer): string {
  return `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();
}
