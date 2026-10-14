import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryKeys } from "@/features/inventory/api/inventory.keys";
import { invoiceKeys } from "@/features/invoices/api/invoice.keys";
import {
  cancelCounterSaleRequest,
  cancelOrderRequest,
  createCounterSaleRequest,
  createOrderRequest,
  createReturnRequest,
  getCounterSaleRequest,
  getCounterSalesRequest,
  getOrderRequest,
  getOrdersRequest,
  getReturnsRequest,
  partSaleKeys,
  pickOrderRequest,
  releaseOrderRequest,
  searchSaleCustomersRequest,
  type OrderFilters,
} from "../api/part-sale.api";
import type { CreateCounterSalePayload, CreateOrderPayload, CreateReturnPayload } from "../types/part-sale.types";

export function partSaleErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; errors?: { field?: string; message: string }[] } } })
    ?.response?.data;
  const first = data?.errors?.[0];
  return first ? `${first.field ? `${first.field}: ` : ""}${first.message}` : (data?.message ?? fallback);
}

export function useSaleCustomers(search: string) {
  return useQuery({
    queryKey: partSaleKeys.customers(search),
    queryFn: () => searchSaleCustomersRequest(search),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useCustomerOrders(params: OrderFilters = {}, enabled = true) {
  return useQuery({
    queryKey: partSaleKeys.orders(params),
    queryFn: () => getOrdersRequest(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCustomerOrder(id: string) {
  return useQuery({ queryKey: partSaleKeys.order(id), queryFn: () => getOrderRequest(id), enabled: !!id });
}

export function useCounterSales(params: { customerId?: string; search?: string } = {}) {
  return useQuery({
    queryKey: partSaleKeys.sales(params),
    queryFn: () => getCounterSalesRequest(params),
    placeholderData: keepPreviousData,
  });
}

export function useCounterSale(id: string) {
  return useQuery({ queryKey: partSaleKeys.sale(id), queryFn: () => getCounterSaleRequest(id), enabled: !!id });
}

export function useSaleReturns(params: { search?: string } = {}) {
  return useQuery({
    queryKey: partSaleKeys.returns(params),
    queryFn: () => getReturnsRequest(params),
    placeholderData: keepPreviousData,
  });
}

/** Every part-sale action moves stock, and bills and returns change invoices too. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: partSaleKeys.all });
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  };
}

export function useCreateOrder() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateOrderPayload) => createOrderRequest(payload),
    onSuccess: (order) => {
      refresh();
      toast.success(`CPO ${order.cpoNumber} created`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to create the order")),
  });
}

export function usePickOrder(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (lines?: { lineId: string; quantity: number }[]) => pickOrderRequest(id, lines),
    onSuccess: ({ picked, short }) => {
      refresh();
      if (picked) toast.success(`${picked} unit(s) picked${short ? `, ${short} short of stock` : ""}`);
      else toast.warning("Nothing could be picked: there is no free stock for the open lines");
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to pick the order")),
  });
}

export function useReleaseOrder(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => releaseOrderRequest(id),
    onSuccess: () => {
      refresh();
      toast.success("Picked stock released");
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to release the stock")),
  });
}

export function useCancelOrder(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (remark: string) => cancelOrderRequest(id, remark),
    onSuccess: (order) => {
      refresh();
      toast.success(`CPO ${order.cpoNumber} cancelled`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to cancel the order")),
  });
}

export function useCreateCounterSale() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateCounterSalePayload) => createCounterSaleRequest(payload),
    onSuccess: (sale) => {
      refresh();
      toast.success(`Counter sale ${sale.invoice.invoiceNumber} created`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to create the bill")),
  });
}

export function useCancelCounterSale(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (remark: string) => cancelCounterSaleRequest(id, remark),
    onSuccess: (sale) => {
      refresh();
      toast.success(`Bill ${sale.invoice.invoiceNumber} cancelled`);
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to cancel the bill")),
  });
}

export function useCreateReturn(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (payload: CreateReturnPayload) => createReturnRequest(id, payload),
    onSuccess: (sale) => {
      refresh();
      toast.success(`Sale return ${sale.returns[0]?.returnNumber ?? ""} recorded`.trim());
    },
    onError: (error) => toast.error(partSaleErrorMessage(error, "Failed to record the return")),
  });
}
