"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "../api/pdi.api";
import { pdiKeys, type PdiListParams, type PdiRegisterParams } from "../api/pdi.api";
import { apiError } from "../lib/pdi.logic";
import type {
  LabourLinePayload, LabourSlipPayload, Paged, PdiBillPayload, PdiOpenPayload, PdiPrintKind, PdiSettingsPayload, PdiUpdatePayload,
  PdiVehiclePayload, RequisitionPayload, ReturnPayload,
} from "../types/pdi.types";

export const usePdiList = (params: PdiListParams) =>
  useQuery({ queryKey: pdiKeys.list(params), queryFn: () => api.getPdiList(params), placeholderData: keepPreviousData });

export const usePdi = (id: string) => useQuery({ queryKey: pdiKeys.detail(id), queryFn: () => api.getPdi(id), enabled: !!id });

export const usePdiVehicles = (vin: string) =>
  useQuery({ queryKey: pdiKeys.vehicles(vin), queryFn: () => api.findPdiVehicles(vin), enabled: vin.trim().length >= 3 });

export const useVehiclePdiJobs = (vehicleId: string, enabled = true) =>
  useQuery({ queryKey: pdiKeys.vehicleJobs(vehicleId), queryFn: () => api.getVehiclePdiJobs(vehicleId), enabled: enabled && !!vehicleId });

export const usePdiDefects = (vehicleId?: string) =>
  useQuery({ queryKey: pdiKeys.defects(vehicleId), queryFn: () => api.getPdiDefects(vehicleId), staleTime: 60_000 });

export const usePdiServiceTypes = (vehicleId: string) =>
  useQuery({ queryKey: pdiKeys.serviceTypes(vehicleId), queryFn: () => api.getPdiServiceTypes(vehicleId), enabled: !!vehicleId });

/** Live bill totals from the server; amounts are never edited on the client. */
export const usePdiBillPreview = (jobCardId: string, partsDiscount: number, labourDiscount: number, enabled = true) =>
  useQuery({
    queryKey: pdiKeys.billPreview(jobCardId, partsDiscount, labourDiscount),
    queryFn: () => api.previewPdiBill(jobCardId, partsDiscount, labourDiscount),
    enabled: enabled && !!jobCardId,
    placeholderData: keepPreviousData,
    retry: false,
  });

export const usePdiBill = (id: string) => useQuery({ queryKey: pdiKeys.bill(id), queryFn: () => api.getPdiBill(id), enabled: !!id });
export const usePdiSettings = () => useQuery({ queryKey: pdiKeys.settings(), queryFn: api.getPdiSettings });

export function usePdiRegister(kind: "requisitions" | "returns" | "labour-slips" | "bills", params: PdiRegisterParams) {
  const fetchers = { requisitions: api.getPdiRequisitions, returns: api.getPdiReturns, "labour-slips": api.getPdiLabourSlips, bills: api.getPdiBills } as const;
  // Each register has its own row type; the register page picks the columns for its kind.
  return useQuery<Paged<unknown>>({ queryKey: pdiKeys.register(kind, params), queryFn: () => fetchers[kind](params) as Promise<Paged<unknown>>, placeholderData: keepPreviousData });
}

/** Every PDI write refreshes the PDI caches (lists, detail, registers, preview) and toasts. */
function usePdiMutation<V, R>(fn: (vars: V) => Promise<R>, success: string | ((result: R) => string), failure: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: pdiKeys.all });
      toast.success(typeof success === "function" ? success(result) : success);
    },
    onError: error => toast.error(apiError(error, failure)),
  });
}

export const useOpenPdi = () => usePdiMutation((payload: PdiOpenPayload) => api.openPdi(payload), job => `PDI job card ${job.jobNumber} opened`, "Could not open the PDI job card");
export const useUpdatePdi = (id: string) => usePdiMutation((payload: PdiUpdatePayload) => api.updatePdi(id, payload), "PDI job card saved", "Could not save the PDI job card");
export const useWorkDone = (id: string) => usePdiMutation((workDone?: string) => api.markWorkDone(id, workDone), "Work done recorded", "Could not record work done");
export const useVehicleReady = (id: string) => usePdiMutation((remarks?: string) => api.markVehicleReady(id, remarks), "Vehicle marked ready for billing", "Could not mark the vehicle ready");
export const useCancelPdi = (id: string) => usePdiMutation((reason: string) => api.cancelPdi(id, reason), "PDI job card cancelled", "Could not cancel the PDI job card");
export const useCreatePdiVehicle = () => usePdiMutation((payload: PdiVehiclePayload) => api.createPdiVehicle(payload), vehicle => `Vehicle ${vehicle.vin} created`, "Could not create the vehicle");

export const useCreateRequisition = () => usePdiMutation((payload: RequisitionPayload) => api.createPdiRequisition(payload), doc => `Requisition ${doc.requisitionNumber} issued`, "Could not issue the parts");
export const useCancelRequisition = () => usePdiMutation(({ id, reason }: { id: string; reason: string }) => api.cancelPdiRequisition(id, reason), "Requisition cancelled; stock returned", "Could not cancel the requisition");
export const useCreateReturn = () => usePdiMutation((payload: ReturnPayload) => api.createPdiReturn(payload), doc => `Return ${doc.returnNumber} saved; stock added back`, "Could not save the return");
export const useCancelReturn = () => usePdiMutation(({ id, reason }: { id: string; reason: string }) => api.cancelPdiReturn(id, reason), "Return cancelled", "Could not cancel the return");
export const useCreateLabourSlip = () => usePdiMutation((payload: LabourSlipPayload) => api.createPdiLabourSlip(payload), slip => `Labour slip ${slip.slipNumber} saved`, "Could not save the labour slip");
export const useAddLabourLine = () => usePdiMutation(({ slipId, line }: { slipId: string; line: LabourLinePayload }) => api.addPdiLabourLine(slipId, line), "Labour line added", "Could not add the labour line");

export const useCreatePdiBill = () => usePdiMutation((payload: PdiBillPayload) => api.createPdiBill(payload), bill => `PDI bill ${bill.invoiceNumber} created`, "Could not create the PDI bill");
export const useCancelPdiBill = () => usePdiMutation(({ id, reason }: { id: string; reason: string }) => api.cancelPdiBill(id, reason), "PDI bill cancelled", "Could not cancel the PDI bill");
export const useSavePdiSettings = () => usePdiMutation((payload: PdiSettingsPayload) => api.savePdiSettings(payload), "PDI settings saved", "Could not save the PDI settings");

/** Records the first print (edit-after-print rules start then), then opens the browser print dialog. */
export function usePrintPdi() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: PdiPrintKind; id: string }) => api.markPdiPrinted(kind, id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: pdiKeys.all });
      window.setTimeout(() => window.print(), 50);
    },
    onError: error => toast.error(apiError(error, "Could not record the print")),
  });
}
