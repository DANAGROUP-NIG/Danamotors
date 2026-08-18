"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, UserPlus, Check, ChevronDown, X, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useQueryClient } from "@tanstack/react-query";
import { customerKeys } from "@/features/customers/api/customer.keys";
import { useAllCustomers } from "@/features/appointments/hooks/use-all-customers";
import { useCreateCustomer } from "@/features/customers/hooks/use-create-customer";
import {
  createCustomerSchema,
  type CreateCustomerFormValues,
} from "@/features/customers/schemas/customer.schema";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { Customer } from "@/features/customers/types/customer.types";

interface CustomerSelectWithCreateProps {
  value?: string;
  onChange: (customerId: string, customerName?: string) => void;
  error?: string;
  branchId?: string;
  disabled?: boolean;
}

export function CustomerSelectWithCreate({
  value,
  onChange,
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

  const effectiveBranchId = branchId || (isSuperAdmin ? undefined : activeBranch?.id);

  const { data: customers = [], isLoading: loadingCustomers } = useAllCustomers(effectiveBranchId);
  const createCustomerMutation = useCreateCustomer();

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === value);
  }, [customers, value]);

  // Filtered customer list based on typing
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const email = c.email?.toLowerCase() ?? "";
      const phone = c.phoneNumber?.toLowerCase() ?? "";
      return fullName.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [customers, searchQuery]);

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
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      firstName: searchQuery.split(" ")[0] || "",
      lastName: searchQuery.split(" ").slice(1).join(" ") || "",
      branchId: isSuperAdmin ? "" : (activeBranch?.id ?? ""),
    },
  });

  function handleCreateInlineCustomer(values: CreateCustomerFormValues) {
    const payload = {
      ...values,
      branchId: isSuperAdmin ? values.branchId : (activeBranch?.id ?? values.branchId),
    };
    createCustomerMutation.mutate(payload, {
      onSuccess: (res: any) => {
        const createdCustomer: Customer = res?.customer || res;
        if (createdCustomer?.id) {
          queryClient.setQueriesData({ queryKey: customerKeys.all }, (old: any) => {
            if (!old) return old;
            if (Array.isArray(old)) {
              if (old.some((c) => c?.id === createdCustomer.id)) return old;
              return [createdCustomer, ...old];
            }
            if (typeof old === "object" && Array.isArray(old.customers)) {
              if (old.customers.some((c: any) => c?.id === createdCustomer.id)) return old;
              return {
                ...old,
                customers: [createdCustomer, ...old.customers],
              };
            }
            return old;
          });
          queryClient.invalidateQueries({ queryKey: customerKeys.all });
          onChange(createdCustomer.id);
        }
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
              {selectedCustomer.firstName} {selectedCustomer.lastName}
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
              loadingCustomers ? "Loading customers…" : "Type customer name, email, or phone…"
            }
            value={searchQuery}
            disabled={disabled || loadingCustomers}
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

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

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
            <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading customer directory…
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
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
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
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add new customer
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">
                No customer found matching &quot;{searchQuery}&quot;
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
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
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in-50"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0"
            onClick={() => setShowInlineCreate(false)}
            aria-hidden="true"
          />
          <div className="relative z-[100000] my-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Add New Customer
              </h4>
              <button
                type="button"
                onClick={() => setShowInlineCreate(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" error={customerErrors.firstName?.message}>
                  <input
                    className={inputCls}
                    placeholder="Jane"
                    {...registerCustomer("firstName")}
                  />
                </Field>
                <Field label="Last name" error={customerErrors.lastName?.message}>
                  <input
                    className={inputCls}
                    placeholder="Doe"
                    {...registerCustomer("lastName")}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" error={customerErrors.email?.message}>
                  <input
                    type="email"
                    className={inputCls}
                    placeholder="jane@example.com"
                    {...registerCustomer("email")}
                  />
                </Field>
                <Field label="Phone" error={customerErrors.phoneNumber?.message}>
                  <input
                    className={inputCls}
                    placeholder="+234 800 000 0000"
                    {...registerCustomer("phoneNumber")}
                  />
                </Field>
              </div>

              <Field label="Address (optional)" error={customerErrors.address?.message}>
                <input
                  className={inputCls}
                  placeholder="123 Main St"
                  {...registerCustomer("address")}
                />
              </Field>

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
                  type="button"
                  size="sm"
                  disabled={createCustomerMutation.isPending}
                  onClick={handleSubmitCustomer(handleCreateInlineCustomer)}
                >
                  {createCustomerMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & Select Customer"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
