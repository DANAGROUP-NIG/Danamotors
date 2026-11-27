export const bookingCustomerFields = {
  tin: "TIN",
  nin: "NIN",
  email: "Email",
  address: "Address",
  postalCode: "Postal code",
  phoneNumber: "Phone number",
} as const;

export type BookingCustomerField = keyof typeof bookingCustomerFields;
export type BookingCustomerDetails = Partial<Record<BookingCustomerField, string | null>>;
export type BookingCustomerErrors = Partial<Record<BookingCustomerField, string>>;

// TODO(confirm): Replace this provisional format after issue #144 open question 2 is resolved.
export function isValidBookingTin(tin: string): boolean {
  return /^[a-z0-9][a-z0-9 ./-]{0,39}$/i.test(tin);
}

export function isValidBookingNin(nin: string): boolean {
  return /^\d{11}$/.test(nin);
}

export function normalizeBookingPhone(value: string): string {
  const compact = value.replace(/[ ()-]/g, "");
  return compact.startsWith("+234") ? `0${compact.slice(4)}` : compact;
}

export function validateBookingCustomer(details: BookingCustomerDetails): BookingCustomerErrors {
  const errors: BookingCustomerErrors = {};
  const tin = details.tin?.trim();
  const nin = details.nin?.trim();
  const email = details.email?.trim();
  const phone = normalizeBookingPhone(details.phoneNumber?.trim() ?? "");

  if (!tin && !nin) errors.tin = "Provide TIN or NIN (at least one)";
  if (tin && !isValidBookingTin(tin)) errors.tin = "Enter a valid TIN (up to 40 letters, digits, spaces, or separators)";
  if (nin && !isValidBookingNin(nin)) errors.nin = "Enter exactly 11 digits for NIN";
  if (!email) errors.email = "Enter an email address";
  else if (email.length > 254 || !/^(?!\.)(?!.*\.\.)([a-z0-9_'+.\-]*)[a-z0-9_+\-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i.test(email))
    errors.email = "Enter a valid email address";
  const address = details.address?.trim();
  if (!address) errors.address = "Enter the customer address";
  else if (address.length > 1000) errors.address = "Enter an address of 1000 characters or fewer";
  const postalCode = details.postalCode?.trim();
  if (!postalCode) errors.postalCode = "Enter the postal code";
  else if (postalCode.length > 40) errors.postalCode = "Enter a postal code of 40 characters or fewer";
  if (!phone) errors.phoneNumber = "Enter the customer phone number";
  // NCC national numbering plan: mobile and 02-prefixed fixed lines.
  else if (!/^0(?:[789][01]\d{8}|20[1-9]\d{7})$/.test(phone))
    errors.phoneNumber = "Enter a valid Nigerian phone number beginning with 0 or +234";
  return errors;
}

export function bookingCustomerFieldsToComplete(details: BookingCustomerDetails): BookingCustomerField[] {
  const errors = validateBookingCustomer(details);
  const fields = Object.keys(errors) as BookingCustomerField[];
  if (!details.tin?.trim() && !details.nin?.trim()) fields.splice(1, 0, "nin");
  return fields;
}
