// Pure checks for campaign manual uploads. The server inspects the file content again.

export const ACCEPTED_MANUAL_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const ACCEPTED_MANUAL_EXTENSIONS = ".pdf,.png,.jpg,.jpeg";
export const MAX_MANUAL_BYTES = 10 * 1024 * 1024;

/** Returns what is wrong with a chosen file, or null when it can be uploaded. */
export function manualFileError(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_MANUAL_TYPES.includes(file.type)) return "Choose a PDF, PNG or JPEG file.";
  if (file.size === 0) return "The file is empty. Choose the manual again.";
  if (file.size > MAX_MANUAL_BYTES) return "The manual is larger than 10 MB. Compress it or split it into parts.";
  return null;
}

/** A default title from the file name: "SC-215 procedure.pdf" becomes "SC-215 procedure". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
