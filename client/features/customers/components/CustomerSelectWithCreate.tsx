"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ModalFame from "@/components/modals/ModalFame";
import { normalizeBookingPhone } from "../../../../server/src/shared/booking-customer-details";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, UserPlus, Check, ChevronDown, X, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/features/customers/api/customer.keys";
import { getCustomersRequest } from "@/features/customers/api/customer.api";
import { useCustomer } from "@/features/customers/hooks/use-customer";
import { useCreateCustomer } from "@/features/customers/hooks/use-create-customer";
import {
  createBookingCustomerSchema,
  type CreateCustomerFormValues,
} from "@/features/customers/schemas/customer.schema";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { Customer } from "@/features/customers/types/customer.types";

/** Customer code first, then the company or personal name. */
function customerName(c: Customer) {
  return [c.code, c.companyName || `${c.firstName} ${c.lastName}`].filter(Boolean).join(" · ");
}

interface CustomerSelectWithCreateProps {
  value?: string;
  onChange: (customerId: string, customerName?: string) => void;
  initialCustomer?: Pick<CreateCustomerFormValues, "firstName" | "lastName" | "email" | "phoneNumber">;
  error?: string;
  branchId?: string;
  disabled?: boolean;
}

export function CustomerSelectWithCreate({
  value,
  onChange,
  initialCustomer,
  error,
  branchId,
  disabled = false,
}: CustomerSelectWithCreateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branches = useBranchStore((s) => s.branches);
  const { isSuperAdmin } = useAuth();

  // Search the whole directory on the server: code, name, phone, email or vehicle.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const { data: filteredCustomers = [], isFetching } = useQuery({
    queryKey: [...customerKeys.all, "picker", debouncedSearch],
    queryFn: () => getCustomersRequest({ limit: 50, search: debouncedSearch || undefined }).then((r) => r.customers),
    enabled: isOpen,
    staleTime: 30_000,
  });
  const loadingCustomers = isFetching || searchQuery.trim() !== debouncedSearch;
  const createCustomerMutation = useCreateCustomer();

  const { data: selectedCustomer } = useCustomer(value ?? "");

  // Update fixed position dropdown coordinates (Viewport relative)
  const updateCoords = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      // Listen to scroll on window AND capture scroll inside modal container
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
      return () => {
        window.removeEventListener("scroll", updateCoords, true);
        window.removeEventListener("resize", updateCoords);
      };
    }
  }, [isOpen, updateCoords]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-customer-dropdown-portal]")) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Inline Customer Form setup
  const {
    register: registerCustomer,
    handleSubmit: handleSubmitCustomer,
    reset: resetCustomerForm,
    formState: { errors: customerErrors },
  } = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createBookingCustomerSchema),
    defaultValues: {
      firstName: searchQuery.split(" ")[0] || "",
      lastName: searchQuery.split(" ").slice(1).join(" ") || "",
      branchId: isSuperAdmin ? "" : (activeBranch?.id ?? ""),
    },
  });

  useEffect(() => {
    if (!showInlineCreate) return;
    resetCustomerForm({
      firstName: initialCustomer?.firstName ?? searchQuery.split(" ")[0] ?? "",
      lastName: initialCustomer?.lastName ?? searchQuery.split(" ").slice(1).join(" ") ?? "",
      email: initialCustomer?.email ?? "",
      phoneNumber: initialCustomer?.phoneNumber ?? "",
      address: "",
      branchId: isSuperAdmin ? "" : (activeBranch?.id ?? ""),
    });
  }, [activeBranch?.id, initialCustomer?.email, initialCustomer?.firstName, initialCustomer?.lastName, initialCustomer?.phoneNumber, isSuperAdmin, resetCustomerForm, searchQuery, showInlineCreate]);

  function handleCreateInlineCustomer(values: CreateCustomerFormValues) {
    const payload = {
      ...values,
      tin: values.tin?.trim() || undefined,
      nin: values.nin?.trim() || undefined,
      phoneNumber: normalizeBookingPhone(values.phoneNumber),
      branchId: isSuperAdmin ? values.branchId : (activeBranch?.id ?? values.branchId),
    };
    createCustomerMutation.mutate(payload, {
      onSuccess: (createdCustomer) => {
        queryClient.setQueryData(customerKeys.detail(createdCustomer.id), createdCustomer);
        onChange(createdCustomer.id, customerName(createdCustomer));
        setShowInlineCreate(false);
        setIsOpen(false);
        setSearchQuery("");
        resetCustomerForm();
      },
    });
  }

  const handleSelectCustomer = (customer: Customer) => {
    onChange(customer.id);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchQuery("");
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Selected View (Strict h-10 height with text ellipsis - NEVER extends input box) */}
      {selectedCustomer && !isOpen ? (
        <div className="h-10 w-full flex items-center justify-between rounded-md border border-border bg-background px-3 text-sm shadow-sm overflow-hidden select-none transition-colors hover:border-primary/50">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <User className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground truncate">
              {customerName(selectedCustomer)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2 bg-background pl-1">
            <button
              type="button"
              onClick={handleClearSelection}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear customer selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Change customer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            className={`${inputCls} pl-9 pr-8`}
            placeholder={
              "Type customer code, name, email, or phone…"
            }
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      {/* Floating Dropdown Portal - position: fixed at z-[99999] floating above ALL text & inputs */}
      {isOpen && !showInlineCreate && mounted && createPortal(
        <div
          data-customer-dropdown-portal="true"
          style={{
            position: "fixed",
            top: `${coords.top + 4}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
          }}
          className="z-[99999] max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xl ring-1 ring-black/10 focus:outline-none"
        >
          {loadingCustomers ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching customers…
            </div>
          ) : filteredCustomers.length > 0 ? (
            <div className="py-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Select Customer ({filteredCustomers.length})
              </div>
              {filteredCustomers.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${
                      isSelected ? "bg-primary/10 text-primary font-medium" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="truncate">
                        <span className="font-medium">
                          {customerName(c)}
                        </span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {c.email} {c.phoneNumber ? `• ${c.phoneNumber}` : ""}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineCreate(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add new customer
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No customer found matching &quot;{searchQuery}&quot;
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full text-sm font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                onClick={() => setShowInlineCreate(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add new customer
              </Button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Inner Customer Modal Portal (z-[99999]) */}
      {showInlineCreate && mounted && createPortal(
        <ModalFame isOpen nested preventAccidentalClose title="Add new customer"
          onClose={() => setShowInlineCreate(false)}>
          <form className="grid gap-3.5" noValidate onSubmit={(event) => {
            event.stopPropagation();
            void handleSubmitCustomer(handleCreateInlineCustomer)(event);
          }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" required error={customerErrors.firstName?.message}>
                  <input
                    className={inputCls}
                    aria-required="true" aria-invalid={!!customerErrors.firstName} {...registerCustomer("firstName")}
                  />
                </Field>
                <Field label="Last name" required error={customerErrors.lastName?.message}>
                  <input
                    className={inputCls}
                    aria-required="true" aria-invalid={!!customerErrors.lastName} {...registerCustomer("lastName")}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" required error={customerErrors.email?.message}>
                  <input
                    type="email"
                    className={inputCls}
                    aria-required="true" aria-invalid={!!customerErrors.email} {...registerCustomer("email")}
                  />
                </Field>
                <Field label="Phone number" required error={customerErrors.phoneNumber?.message}>
                  <input
                    className={inputCls}
                    type="tel"
                    aria-required="true" aria-invalid={!!customerErrors.phoneNumber} {...registerCustomer("phoneNumber")}
                  />
                </Field>
              </div>

              <Field label="Address" required error={customerErrors.address?.message}>
                <input
                  className={inputCls}
                  aria-required="true" aria-invalid={!!customerErrors.address} {...registerCustomer("address")}
                />
              </Field>

              <Field label="Postal code" required error={customerErrors.postalCode?.message}>
                <input className={inputCls} aria-required="true" aria-invalid={!!customerErrors.postalCode} {...registerCustomer("postalCode")} />
              </Field>
              <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-sm text-muted-foreground">Provide TIN or NIN (at least one)</legend>
                <Field label="TIN" error={customerErrors.tin?.message}>
                  <input className={inputCls} aria-invalid={!!customerErrors.tin} {...registerCustomer("tin")} />
                </Field>
                <Field label="NIN" error={customerErrors.nin?.message}>
                  <input className={inputCls} inputMode="numeric" aria-invalid={!!customerErrors.nin} {...registerCustomer("nin")} />
                </Field>
              </fieldset>

              {isSuperAdmin && (
                <Field label="Branch" error={customerErrors.branchId?.message}>
                  <select className={inputCls} {...registerCustomer("branchId")}>
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInlineCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createCustomerMutation.isPending}
                >
                  {createCustomerMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save and select customer"
                  )}
                </Button>
              </div>
          </form>
        </ModalFame>,
        document.body
      )}
    </div>
  );
}
