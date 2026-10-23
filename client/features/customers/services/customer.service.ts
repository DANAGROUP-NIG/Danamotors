import type { Customer } from "../types/customer.types";

/** Returns customer's display name (company name for corporate customers) */
export function getCustomerFullName(customer: Customer): string {
  return (
    customer.companyName?.trim() ||
    [customer.firstName, customer.lastName].filter(Boolean).join(" ")
  );
}

/** Returns the first phone number on file (legacy customers often only have office/residence numbers) */
export function getCustomerPhone(customer: Customer): string | null {
  const phones = [customer.phoneNumber, customer.mobile2, customer.office1, customer.office2, customer.residencePhone];
  return phones.map((p) => p?.trim()).find(Boolean) ?? null;
}

/** Returns a one-line address, built from house/street/city/state when the free-text address is empty */
export function getCustomerAddress(customer: Customer): string | null {
  if (customer.address?.trim()) return customer.address.trim();
  const parts = [customer.house, customer.street, customer.city, customer.state]
    .map((p) => p?.trim().replace(/,+$/, "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Returns customer initials for avatars */
export function getCustomerInitials(customer: Customer): string {
  const words = getCustomerFullName(customer).split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  return words.slice(0, 2).map((w) => w.match(/[a-z0-9]/i)![0]).join("").toUpperCase() || "?";
}
