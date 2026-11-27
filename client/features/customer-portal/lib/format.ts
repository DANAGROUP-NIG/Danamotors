const currency = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
});

export function formatDate(value?: string | Date | null): string {
  if (!value) return "Not recorded";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "Not recorded";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCurrency(amount?: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "Not recorded";
  return currency.format(amount);
}
