"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, Plus, Check, ChevronDown, X, Car, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useQueryClient } from "@tanstack/react-query";
import { vehicleKeys } from "@/features/vehicles/api/vehicle.keys";
import { useAllVehicles } from "@/features/appointments/hooks/use-all-vehicles";
import { useCreateVehicle } from "@/features/vehicles/hooks/use-create-vehicle";
import {
  createVehicleSchema,
  type CreateVehicleFormValues,
} from "@/features/vehicles/schemas/vehicle.schema";
import type { Vehicle } from "@/features/vehicles/types/vehicle.types";

interface VehicleSelectWithCreateProps {
  value?: string;
  onChange: (vehicleId: string) => void;
  customerId?: string;
  branchId?: string;
  error?: string;
  disabled?: boolean;
}

export function VehicleSelectWithCreate({
  value,
  onChange,
  customerId,
  branchId,
  error,
  disabled = false,
}: VehicleSelectWithCreateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lastCreatedVehicleRef = useRef<Vehicle | null>(null);
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

  const { data: vehicles = [], isLoading: loadingVehicles } = useAllVehicles({
    customerId: customerId || undefined,
    branchId,
  });

  const createVehicleMutation = useCreateVehicle();

  // Selected vehicle object — falls back to locally-stored just-created vehicle
  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === value) ?? (lastCreatedVehicleRef.current?.id === value ? lastCreatedVehicleRef.current : null);
  }, [vehicles, value]);

  // Filtered vehicle list based on typing
  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles;
    const q = searchQuery.toLowerCase();
    return vehicles.filter((v) => {
      const fullVehicle = `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""} ${v.vin ?? ""}`.toLowerCase();
      return fullVehicle.includes(q);
    });
  }, [vehicles, searchQuery]);

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
        if (!target.closest("[data-vehicle-dropdown-portal]")) {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Inline Vehicle Form setup
  const {
    register: registerVehicle,
    handleSubmit: handleSubmitVehicle,
    reset: resetVehicleForm,
    formState: { errors: vehicleErrors },
  } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(createVehicleSchema),
    defaultValues: {
      customerId: customerId || "",
      make: searchQuery.split(" ")[0] || "",
      model: searchQuery.split(" ").slice(1).join(" ") || "",
    },
  });

  // Keep customerId synced in form default
  useEffect(() => {
    if (customerId) {
      resetVehicleForm((prev) => ({ ...prev, customerId }));
    }
  }, [customerId, resetVehicleForm]);

  function handleCreateInlineVehicle(values: CreateVehicleFormValues) {
    if (!customerId) return;
    const payload = {
      ...values,
      customerId,
    };
    createVehicleMutation.mutate(payload, {
      onSuccess: async (res: any) => {
        const createdVehicle: Vehicle = res?.vehicle || res;
        if (createdVehicle?.id) {
          const formattedVehicle: Vehicle = {
            ...createdVehicle,
            customer: createdVehicle.customer || ({ id: customerId, email: "", firstName: "", lastName: "" }),
          };

          queryClient.setQueriesData(
            { queryKey: [...vehicleKeys.all, "all"] },
            (old: any) => {
              if (!old) return [formattedVehicle];
              if (Array.isArray(old)) {
                if (old.some((v) => v?.id === formattedVehicle.id)) return old;
                return [formattedVehicle, ...old];
              }
              if (typeof old === "object" && Array.isArray(old.vehicles)) {
                if (old.vehicles.some((v: any) => v?.id === formattedVehicle.id)) return old;
                return { ...old, vehicles: [formattedVehicle, ...old.vehicles] };
              }
              return [formattedVehicle];
            },
          );

          await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });

          lastCreatedVehicleRef.current = formattedVehicle;
          onChange(createdVehicle.id);
        }
        setShowInlineCreate(false);
        setIsOpen(false);
        setSearchQuery("");
        resetVehicleForm();
      },
    });
  }

  const handleSelectVehicle = (vehicle: Vehicle) => {
    lastCreatedVehicleRef.current = null;
    onChange(vehicle.id);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    lastCreatedVehicleRef.current = null;
    onChange("");
    setSearchQuery("");
  };

  const isDisabled = disabled || !customerId;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Selected View (Strict h-10 height with text ellipsis - NEVER extends input box) */}
      {selectedVehicle && !isOpen ? (
        <div className="h-10 w-full flex items-center justify-between rounded-md border border-border bg-background px-3 text-sm shadow-sm overflow-hidden select-none transition-colors hover:border-primary/50">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <Car className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground truncate">
              {selectedVehicle.year ? `${selectedVehicle.year} ` : ""}
              {selectedVehicle.make ?? ""} {selectedVehicle.model ?? ""}
            </span>
            {selectedVehicle.vin && (
              <span className="text-xs text-muted-foreground truncate">
                • VIN: {selectedVehicle.vin}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2 bg-background pl-1">
            <button
              type="button"
              onClick={handleClearSelection}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear vehicle selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Change vehicle"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Car className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            className={`${inputCls} pl-9 pr-8`}
            placeholder={
              !customerId
                ? "Select a customer first"
                : loadingVehicles
                  ? "Loading vehicles…"
                  : "Type make, model, year or VIN…"
            }
            value={searchQuery}
            disabled={isDisabled || loadingVehicles}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              if (!isDisabled) setIsOpen(true);
            }}
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
      {isOpen && !showInlineCreate && customerId && mounted && createPortal(
        <div
          data-vehicle-dropdown-portal="true"
          style={{
            position: "fixed",
            top: `${coords.top + 4}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
          }}
          className="z-[99999] max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xl ring-1 ring-black/10 focus:outline-none"
        >
          {loadingVehicles ? (
            <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading customer vehicles…
            </div>
          ) : filteredVehicles.length > 0 ? (
            <div className="py-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Select Vehicle ({filteredVehicles.length})
              </div>
              {filteredVehicles.map((v) => {
                const isSelected = v.id === value;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectVehicle(v)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${
                      isSelected ? "bg-primary/10 text-primary font-medium" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="truncate">
                        <span className="font-medium">
                          {v.year ? `${v.year} ` : ""}
                          {v.make ?? ""} {v.model ?? ""}
                        </span>
                        {v.vin && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (VIN: {v.vin})
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
              <div className="sticky bottom-0 border-t border-slate-200 bg-white p-1.5">
                <button
                  type="button"
                  onClick={() => setShowInlineCreate(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add new vehicle for this customer
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">
                No vehicle found matching &quot;{searchQuery}&quot;
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                onClick={() => setShowInlineCreate(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add new vehicle
              </Button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Inner Vehicle Modal Portal (z-[99999]) */}
      {showInlineCreate && customerId && mounted && createPortal(
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
                <Car className="h-4 w-4 text-primary" />
                Add New Vehicle
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
              <Field label="VIN" error={vehicleErrors.vin?.message}>
                <input
                  className={inputCls}
                  placeholder="Vehicle Identification Number"
                  {...registerVehicle("vin")}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Make" error={vehicleErrors.make?.message}>
                  <input
                    className={inputCls}
                    placeholder="Toyota"
                    {...registerVehicle("make")}
                  />
                </Field>
                <Field label="Model" error={vehicleErrors.model?.message}>
                  <input
                    className={inputCls}
                    placeholder="Corolla"
                    {...registerVehicle("model")}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Year" error={vehicleErrors.year?.message}>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="2022"
                    {...registerVehicle("year")}
                  />
                </Field>
                <Field label="Trim (optional)" error={vehicleErrors.trim?.message}>
                  <input
                    className={inputCls}
                    placeholder="SE"
                    {...registerVehicle("trim")}
                  />
                </Field>
                <Field label="Color" error={vehicleErrors.color?.message}>
                  <input
                    className={inputCls}
                    placeholder="Silver"
                    {...registerVehicle("color")}
                  />
                </Field>
              </div>

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
                  disabled={createVehicleMutation.isPending}
                  onClick={handleSubmitVehicle(handleCreateInlineVehicle)}
                >
                  {createVehicleMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save & Select Vehicle"
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
