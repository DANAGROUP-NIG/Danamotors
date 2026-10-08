export type Customer = {
  residencePhone?: string | null;
  fax?: string | null;
  stdCode?: string | null;
  vip?: boolean;
  anniversaryDate?: string | null;
  preferredFollowupDay?: string | null;
  preferredFollowupTime?: string | null;
  code?: string | null;
  partyStatus?: "CUSTOMER" | "DEALER" | "FA_PARTY";
  type?: "INDIVIDUAL" | "CORPORATE" | "GOVERNMENT" | "VENDOR";
  salutation?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  registeredName?: string | null;
  mobile2?: string | null;
  office1?: string | null;
  office2?: string | null;
  house?: string | null;
  street?: string | null;
  zone?: string | null;
  tallyPartyCode?: string | null;
  vehicles?: { id: string; vin: string; registrationNumber?: string | null }[];
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
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
  tallyLedgerId?: string | null;
  tallyLedger?: { id: string; code: string; name: string; active: boolean } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  hasAccount?: boolean;
  account?: {
    id: string;
    isActive: boolean;
    lastLoginAt?: string | null;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerPayload = {
  partyStatus?: "CUSTOMER" | "DEALER" | "FA_PARTY";
  firstName: string;
  lastName: string;
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
