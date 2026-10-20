import { PERMISSIONS } from '../../shared/constants/roles';
const monetaryFields = new Set(['amount','rate','price','unitPrice','retailRate','costPrice','cost','margin','total','subtotal','estimatedCost','estimatedParts','estimatedOil','estimatedLabour','serviceCharge','spare','oil','labour','defaultRate','sellingPrice','purchasePrice']);
/** Retain operational structure while removing nested monetary values at the service boundary. */
export function scopeJobCard<T extends object>(card: T, permissions: readonly string[]): T {
 const estimateRead = permissions.includes(PERMISSIONS.ESTIMATE_READ);
 const invoiceRead = permissions.includes(PERMISSIONS.INVOICE_READ);
 function scope(value: unknown): unknown {
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scope);
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
   (key !== 'estimates' || estimateRead) && (key !== 'invoices' || invoiceRead) &&
   (estimateRead || invoiceRead || !monetaryFields.has(key))
  ).map(([key, item]) => [key, scope(item)]));
 }
 return scope(card) as T;
}
