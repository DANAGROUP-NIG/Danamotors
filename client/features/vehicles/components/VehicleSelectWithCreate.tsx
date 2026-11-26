"use client";
import { VehicleCustomerField } from "./VehicleCustomerField";
import { VehicleIdentityFields } from "./VehicleIdentityFields";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Check,
  ChevronDown,
  X,
  Car,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAllVehicles } from "@/features/appointments/hooks/use-all-vehicles";
import { useCreateVehicle } from "@/features/vehicles/hooks/use-create-vehicle";
import {
  createVehicleSchema,
  type CreateVehicleFormValues,
} from "@/features/vehicles/schemas/vehicle.schema";
import type { Vehicle } from "@/features/vehicles/types/vehicle.types";
import { NumberInput } from "@/components/forms/NumberInput";

interface VehicleSelectWithCreateProps {
  value?: string;
  onChange: (vehicleId: string) => void;
  onVehicleSelect?: (vehicle: Vehicle) => void;
  initialVehicle?: Partial<Pick<CreateVehicleFormValues, "vin" | "registrationNumber" | "make" | "model" | "year">>;
  customerId?: string;
  branchId?: string;
  error?: string;
  disabled?: boolean;
}

export function VehicleSelectWithCreate({
  value,
  onChange,
  onVehicleSelect,
  initialVehicle,
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
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: vehicles = [], isLoading: loadingVehicles } = useAllVehicles({
    customerId: customerId || undefined,
  });

  const createVehicleMutation = useCreateVehicle();

  // Selected vehicle object — falls back to locally-stored just-created vehicle
  const selectedVehicle = useMemo(() => {
    return (
      vehicles.find((v) => v.id === value) ??
      (lastCreatedVehicleRef.current?.id === value && (!customerId || lastCreatedVehicleRef.current?.customer?.id === customerId)
        ? lastCreatedVehicleRef.current
        : null)
    );
  }, [vehicles, value, customerId]);

  // Filtered vehicle list based on typing
  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles;
    const q = searchQuery.toLowerCase();
    return vehicles.filter((v) => {
      const fullVehicle =
        `${v.registrationNumber ?? ""} ${v.vin ?? ""}`.toLowerCase();
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
    setValue,
    watch: watchVehicle,
    handleSubmit: handleSubmitVehicle,
    reset: resetVehicleForm,
    formState: { errors: vehicleErrors },
  } = useForm<CreateVehicleFormValues>({
    resolver: zodResolver(createVehicleSchema),
    defaultValues: {
      customerId: customerId || "",
      registrationNumber: searchQuery.trim() || "",
      make: searchQuery.split(" ")[0] || "",
      model: searchQuery.split(" ").slice(1).join(" ") || "",
    },
  });

  // Keep customerId synced in form default
  useEffect(() => {
    if (!showInlineCreate) return;
    resetVehicleForm({
      customerId: customerId || "",
      vin: initialVehicle?.vin ?? "",
      registrationNumber: initialVehicle?.registrationNumber ?? searchQuery.trim() ?? "",
      make: initialVehicle?.make ?? searchQuery.split(" ")[0] ?? "",
      model: initialVehicle?.model ?? "",
      catalogueId: null,
      colourId: null,
      year: initialVehicle?.year,
      trim: "",
      color: "",
      vehicleModelId: "",
      ownershipStatus: "",
    });
  }, [customerId, initialVehicle?.vin, initialVehicle?.make, initialVehicle?.model, initialVehicle?.registrationNumber, initialVehicle?.year, resetVehicleForm, searchQuery, showInlineCreate]);

  function handleCreateInlineVehicle(values: CreateVehicleFormValues) {
    if (!customerId || values.customerId !== customerId) return;
    // The inline form has no warranty policy field; never send an empty ID.
    const { vehicleModelId, ...rest } = values;
    const payload = {
      ...rest,
      customerId,
      ...(vehicleModelId && { vehicleModelId }),
    };
    createVehicleMutation.mutate(payload, {
      onSuccess: (res) => {
        const createdVehicle = res.vehicle;
        if (createdVehicle?.id) {
          const formattedVehicle: Vehicle = {
            ...createdVehicle,
            customer: createdVehicle.customer || {
              id: customerId,
              email: "",
              firstName: "",
              lastName: "",
            },
          };

          lastCreatedVehicleRef.current = formattedVehicle;
          onChange(createdVehicle.id);
          onVehicleSelect?.(formattedVehicle);
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
    onVehicleSelect?.(vehicle);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    lastCreatedVehicleRef.current = null;
    onChange("");
    setSearchQuery("");
  };

  // Auto-select the vehicle (and its owner via onVehicleSelect) when the typed
  // query exactly matches a registration number
  useEffect(() => {
    if (!searchQuery.trim() || vehicles.length === 0) return;
    const q = searchQuery.trim().toLowerCase();
    const exactMatch = vehicles.find(
      (v) =>
        v.registrationNumber && v.registrationNumber.toLowerCase() === q,
    );
    if (exactMatch) {
      handleSelectVehicle(exactMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const isDisabled = disabled;

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Selected View (Strict h-10 height with text ellipsis - NEVER extends input box) */}
      {selectedVehicle && !isOpen ? (
        <div className="h-10 w-full flex items-center justify-between rounded-md border border-border bg-background px-3 text-sm shadow-sm overflow-hidden select-none transition-colors hover:border-primary/50">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <Car className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground truncate">
              {selectedVehicle.registrationNumber ?? selectedVehicle.vin}
            </span>
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
              loadingVehicles
                ? "Loading vehicles…"
                : "Type vehicle registration number…"
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

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      {/* Floating Dropdown Portal - position: fixed at z-[99999] floating above ALL text & inputs */}
      {isOpen &&
        !showInlineCreate &&
        mounted &&
        createPortal(
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
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading customer vehicles…
              </div>
            ) : filteredVehicles.length > 0 ? (
              <div className="py-1">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Vehicle Reg No ({filteredVehicles.length})
                </div>
                {filteredVehicles.map((v) => {
                  const isSelected = v.id === value;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVehicle(v)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="truncate">
                          <span className="font-medium">
                            {v.registrationNumber ?? v.vin}
                          </span>
                          {!v.registrationNumber && v.vin && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              (no reg no)
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
                <div className="sticky bottom-0 border-t border-slate-200 bg-white p-1.5">
                  {customerId && (
                    <button
                      type="button"
                      onClick={() => setShowInlineCreate(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add new vehicle for this customer
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No vehicle found matching &quot;{searchQuery}&quot;
                </p>
                {customerId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5 w-full text-sm font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                    onClick={() => setShowInlineCreate(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add new vehicle
                  </Button>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select a customer first to add a new vehicle.
                  </p>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}

      {showInlineCreate &&
        customerId &&
        mounted &&
        createPortal(
          <ModalFame
            isOpen
            title="Add vehicle"
            onClose={() => setShowInlineCreate(false)}
            disableBackdropClose
            preventAccidentalClose={createVehicleMutation.isPending}
            fitViewport
            nested
          >
            <form
              className="flex min-h-0 flex-1 flex-col"
              noValidate
              onSubmit={(event) => {
                // A portal still bubbles React events to the enclosing approval form.
                event.stopPropagation();
                if (createVehicleMutation.isPending) {
                  event.preventDefault();
                  return;
                }
                void handleSubmitVehicle(handleCreateInlineVehicle)(event);
              }}
            >
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain wrap-anywhere p-5 sm:p-6">
                <VehicleCustomerField value={customerId} readOnly branchId={branchId} />
                <fieldset disabled={createVehicleMutation.isPending} className="min-w-0">
                  <legend className="mb-3 text-sm font-semibold">Vehicle details</legend>
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <Field label="Registration number" error={vehicleErrors.registrationNumber?.message}>
                      <input className={inputCls} {...registerVehicle("registrationNumber")} />
                    </Field>
                    <Field label="VIN" error={vehicleErrors.vin?.message}>
                      <input className={inputCls} {...registerVehicle("vin")} />
                    </Field>
                    <Field label="Year" error={vehicleErrors.year?.message}>
                      <NumberInput className={inputCls} {...registerVehicle("year", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })} />
                    </Field>
                  </div>
                </fieldset>
                <section className="space-y-3" aria-label="Catalogue and specifications">
                  <h3 className="text-sm font-semibold">Catalogue and specifications</h3>
                  <VehicleIdentityFields
                    inlineModelOptions
                    value={{
                      catalogueId: watchVehicle("catalogueId"), colourId: watchVehicle("colourId"),
                      modelId: watchVehicle("modelId"), generationId: watchVehicle("generationId"),
                      engineId: watchVehicle("engineId"), customModel: watchVehicle("customModel"),
                      customMake: watchVehicle("customMake"),
                    }}
                    disabled={createVehicleMutation.isPending}
                    modelError={vehicleErrors.modelId?.message || vehicleErrors.customModel?.message}
                    catalogueError={vehicleErrors.catalogueId?.message}
                    colourError={vehicleErrors.colourId?.message}
                    onChange={(next) => {
                      for (const key of ["catalogueId", "colourId", "modelId", "generationId", "engineId", "customModel", "customMake"] as const) {
                        setValue(key, next[key], { shouldDirty: true, shouldValidate: true });
                      }
                    }}
                  />
                </section>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInlineCreate(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createVehicleMutation.isPending}
                  >
                    {createVehicleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save and select vehicle"
                    )}
                  </Button>
              </div>
            </form>
          </ModalFame>,
          document.body,
        )}
    </div>
  );
}
