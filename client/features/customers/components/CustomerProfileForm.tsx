"use client";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { createCustomerSchema, type CreateCustomerFormValues } from "../schemas/customer.schema";
import type { Customer } from "../types/customer.types";

export function CustomerProfileForm(
  {
    customer,
    onSubmit,
    pending,
    failed,
  }: {
    customer?: Customer;
    onSubmit: (data: CreateCustomerFormValues) => void;
    pending: boolean;
    failed: boolean;
  },
) {
  const branches = useBranchStore(s => s.branches);
  const activeBranch = useBranchStore(s => s.activeBranch);

  const {
    isAdminOrAbove,
  } = useAuth();

  const defaults = Object.fromEntries(Object.entries(customer ?? {}).map(([key, value]) => [key, key === "dateOfBirth" ? String(value ?? "").slice(0, 10) : value ?? ""]));

  const {
    register,
    handleSubmit,
    watch,

    formState: {
      errors,
    },
  } = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),

    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      type: "INDIVIDUAL",
      partyStatus: "CUSTOMER",
      branchId: activeBranch?.id ?? "",
      ...defaults,
    },
  });

  const type = watch("type");
  const [firstName, lastName, phoneNumber, companyName] = watch(["firstName", "lastName", "phoneNumber", "companyName"]);

  const duplicateQuery = new URLSearchParams({
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    phoneNumber: phoneNumber ?? "",
    companyName: companyName ?? "",
  });

  const duplicates = useQuery({
    queryKey: ["customer-duplicates", duplicateQuery.toString()],
    enabled: !customer && !!(phoneNumber || (firstName && lastName) || companyName),

    queryFn: () => apiGet<{
      customers: Customer[];
    }>(`/customers/duplicates?${duplicateQuery}`),
  });

  const fields: [keyof CreateCustomerFormValues, string][] = [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["companyName", "Company name"],
    ["contactPerson", "Contact person"],
    ["email", "Email (optional)"],
    ["phoneNumber", "Mobile"],
    ["mobile2", "Mobile 2"],
    ["residencePhone", "Residence phone"],
    ["stdCode", "Dialling code"],
    ["fax", "Fax"],
    ["postalCode", "Postal / PIN code"],
    ["office1", "Office 1"],
    ["office2", "Office 2"],
    ["registeredName", "Registered name"],
    ["house", "House / block"],
    ["street", "Street"],
    ["city", "City"],
    ["state", "State"],
    ["zone", "Zone"],
    ["tallyPartyCode", "Tally party code"],
  ];

  return (
    <form
      className="grid gap-4"
      onSubmit={handleSubmit(data => onSubmit({
        ...data,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : undefined,
        code: isAdminOrAbove ? data.code || undefined : undefined,
        salutation: data.type === "CORPORATE" ? "M/S." : data.salutation || undefined,
      }))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer type"><select className={inputCls} {...register("type")}>{["INDIVIDUAL", "CORPORATE", "GOVERNMENT", "VENDOR"].map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Party status" error={errors.partyStatus?.message}><select className={inputCls} {...register("partyStatus")}><option value="CUSTOMER">Customer</option><option value="DEALER">Dealer</option><option value="FA_PARTY">FA party</option></select></Field>
        <Field label="Salutation">{type === "CORPORATE" ? <input className={inputCls} value="M/S." readOnly /> : <select className={inputCls} {...register("salutation")}><option value="">Select salutation</option>{["Mr.", "Mrs.", "Ms.", "Dr.", "Chief", "M/S."].map(value => <option key={value}>{value}</option>)}</select>}</Field>
        {fields.map(
          ([key, label]) => <Field key={key} label={label} error={errors[key]?.message}><input className={inputCls} type={key === "email" ? "email" : "text"} {...register(key)} /></Field>,
        )}
        <Field label="Birth date"><input type="date" className={inputCls} {...register("dateOfBirth")} /></Field>
        <Field label="Anniversary date"><input type="date" className={inputCls} {...register("anniversaryDate")} /></Field>
        <Field label="Preferred follow-up day"><select className={inputCls} {...register("preferredFollowupDay")}><option value="">No preference</option>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => <option key={day}>{day}</option>)}</select></Field>
        <Field label="Preferred follow-up time"><input type="time" className={inputCls} {...register("preferredFollowupTime")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("vip")} />VIP customer</label>
        <Field label="Home branch"><select className={inputCls} {...register("branchId")}><option value="">Select branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
        {isAdminOrAbove && <Field label="Customer code (leave blank to generate)"><input className={inputCls} {...register("code")} /></Field>}
      </div>
      {!!duplicates.data?.customers.length && <div role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><p>Possible duplicates. Review these before creating another customer:</p>{duplicates.data.customers.map(
          row => <Link className="block underline" href={`/customers/${row.id}`} key={row.id}>{row.code} {row.companyName || `${row.firstName} ${row.lastName}`} {row.phoneNumber}</Link>,
        )}</div>}
      {Object.entries(errors).map(([key, error]) => <p key={key} role="alert" className="text-sm text-red-600">{error.message}</p>)}
      {failed && <p role="alert" className="text-sm text-red-600">Could not save customer. Check the details and try again.</p>}
      <Button disabled={pending}>{pending ? "Saving..." : "Save customer"}</Button>
    </form>
  );
}
