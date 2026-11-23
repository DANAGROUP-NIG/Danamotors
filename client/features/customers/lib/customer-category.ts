export const customerCategories = ["INDIVIDUAL", "CORPORATE", "GOVERNMENT", "IN_HOUSE", "OTHERS"] as const;

export type CustomerCategory = (typeof customerCategories)[number];

export const customerCategoryLabels: Record<CustomerCategory, string> = {
  INDIVIDUAL: "Individual",
  CORPORATE: "Corporate",
  GOVERNMENT: "Government",
  IN_HOUSE: "In-House",
  OTHERS: "Others",
};

export function customerCategoryLabel(customer?: { type?: string | null; partyStatus?: string | null } | null) {
  if (customer?.partyStatus === "VENDOR" || customer?.type === "VENDOR") return "Not applicable";
  const category = customerCategories.find(value => value === customer?.type);
  return category ? customerCategoryLabels[category] : "Not provided";
}
