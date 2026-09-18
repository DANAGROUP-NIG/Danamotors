import { toast } from "sonner";

type ExportableItem = Record<string, string | number | boolean | null | undefined>;

function sanitizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function buildCsvContent(rows: ExportableItem[], columns?: { key: string; label: string }[]) {
  const keys = columns?.map((c) => c.key) ?? Object.keys(rows[0] ?? {});
  const headers = columns?.map((c) => c.label) ?? keys;

  const escape = (value: string) => {
    const needsQuotes = /[",\n\r]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => escape(sanitizeValue(row[key]))).join(","));
  }
  return lines.join("\n");
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  rows: ExportableItem[],
  columns?: { key: string; label: string }[],
) {
  const content = buildCsvContent(rows, columns);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  downloadFile(blob, `${filename}.csv`);
  toast.success(`Downloaded ${filename}.csv`);
}

export function downloadExcel(
  filename: string,
  rows: ExportableItem[],
  columns?: { key: string; label: string }[],
) {
  // Excel can open CSV files; send with .xlsx extension and a tab-separated
  // body so it opens cleanly in Excel while keeping the implementation lightweight.
  const keys = columns?.map((c) => c.key) ?? Object.keys(rows[0] ?? {});
  const headers = columns?.map((c) => c.label) ?? keys;
  const lines = [headers.join("\t")];
  for (const row of rows) {
    lines.push(keys.map((key) => sanitizeValue(row[key]).replace(/\t/g, " ")).join("\t"));
  }
  const blob = new Blob([lines.join("\n")], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  downloadFile(blob, `${filename}.xlsx`);
  toast.success(`Downloaded ${filename}.xlsx`);
}

export function copyToClipboard(text: string, message = "Copied to clipboard") {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast.success(message));
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      toast.success(message);
    } catch {
      toast.error("Unable to copy");
    } finally {
      textarea.remove();
    }
  }
}

export async function shareItems(options: { title: string; text: string; url?: string }) {
  const shareData: ShareData = {
    title: options.title,
    text: options.text,
    url: options.url,
  };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      toast.success("Shared successfully");
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
  }

  copyToClipboard(options.url ?? options.text, "Share link copied to clipboard");
}

export function buildMailtoLink(options: {
  to?: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}) {
  const params = new URLSearchParams();
  params.set("subject", options.subject);
  params.set("body", options.body);
  if (options.cc) params.set("cc", options.cc);
  if (options.bcc) params.set("bcc", options.bcc);
  return `mailto:${options.to ?? ""}?${params.toString()}`;
}

export function openMailto(options: {
  to?: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}) {
  window.location.href = buildMailtoLink(options);
}

export function buildWhatsAppLink(options: { phone?: string; message: string }) {
  const encoded = encodeURIComponent(options.message);
  if (options.phone) {
    return `https://wa.me/${options.phone.replace(/\D/g, "")}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function openWhatsApp(options: { phone?: string; message: string }) {
  window.open(buildWhatsAppLink(options), "_blank", "noopener,noreferrer");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
