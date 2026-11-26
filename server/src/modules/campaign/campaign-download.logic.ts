/**
 * Pure rules for campaign manuals and bulletins: which files are accepted and how they
 * are named on download. Database-free so they can be unit tested directly.
 */
import { createHash } from "crypto";
import { BadRequestError } from "../../shared/errors/appError";

/** Largest manual accepted, in bytes (10 MB). */
export const MAX_CAMPAIGN_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Most manuals kept on one campaign. */
export const MAX_DOCUMENTS_PER_CAMPAIGN = 20;

interface AcceptedType {
  contentType: string;
  extension: string;
  /** Leading bytes that identify the format, whatever the browser claimed. */
  signature: number[];
}

const ACCEPTED: AcceptedType[] = [
  { contentType: "application/pdf", extension: "pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { contentType: "image/png", extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: "image/jpeg", extension: "jpg", signature: [0xff, 0xd8, 0xff] },
];

export const ACCEPTED_DOCUMENT_TYPES = ACCEPTED.map((t) => t.contentType);

export interface InspectedDocument {
  contentType: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  data: Buffer;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Decodes an uploaded file and checks it is a PDF, PNG or JPEG by its content, not its
 * name. Returns the stored content type, a safe file name and a content hash.
 */
export function inspectCampaignDocument(fileName: string, base64: string): InspectedDocument {
  const compact = base64.replace(/\s/g, "");
  if (!compact || compact.length % 4 !== 0 || !BASE64.test(compact)) {
    throw new BadRequestError("The file could not be read. Choose the manual again and retry.");
  }
  const data = Buffer.from(compact, "base64");
  if (data.length === 0) throw new BadRequestError("The file is empty. Choose the manual again.");
  if (data.length > MAX_CAMPAIGN_DOCUMENT_BYTES) {
    throw new BadRequestError("The manual is larger than 10 MB. Compress it or split it into parts.");
  }
  const type = ACCEPTED.find((t) => t.signature.every((byte, i) => data[i] === byte));
  if (!type) throw new BadRequestError("Upload the manual as a PDF, PNG or JPEG file.");
  return {
    contentType: type.contentType,
    fileName: safeFileName(fileName, type.extension),
    sizeBytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    data,
  };
}

/**
 * Keeps letters, digits, spaces, dots, hyphens and underscores, and makes sure the
 * extension matches the detected type. Falls back to "campaign-manual".
 */
export function safeFileName(raw: string, extension: string): string {
  const base = raw
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^A-Za-z0-9 ._-]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+/, "")
    .trim()
    .slice(0, 150);
  return `${base || "campaign-manual"}.${extension}`;
}

/** Content-Disposition header value with an ASCII name and an RFC 5987 UTF-8 copy. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/["\\]/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// ── Affected VIN list (CSV) ──────────────────────────────────────────────────

export type CsvValue = string | number | null | undefined;

/**
 * Builds a CSV file Excel opens correctly: UTF-8 with a byte order mark, CRLF line ends,
 * quoted fields, and text that starts like a formula prefixed so it is not executed.
 */
export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const cell = (value: CsvValue) => {
    if (value == null) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** File name for a campaign's affected VIN list, e.g. SC215-affected-vins-2026-11-26.csv. */
export function affectedVinFileName(campaignCode: string, isoDate: string): string {
  const code = campaignCode.replace(/[^A-Za-z0-9_-]/g, "") || "campaign";
  return `${code}-affected-vins-${isoDate}.csv`;
}
