/**
 * The 2" x 2" part label (Zebra S4M, 203 dpi: 406 x 402 dots, direct thermal, gap media), in ZPL II.
 * Layout from the Kia factory part labels (user, 2026-10-28): description, large part number, a
 * full-width Code 128 barcode, then the bin. No QTY (user decision). Proven on the store's printer and
 * scanned with the MC3190 on 2026-10-28, including 20-character numbers with spaces.
 *
 *   DANA MOTORS                      CPD
 *   ───────────────────────────────────
 *   HORN ASSY-HIGH PITCH
 *            96610H9100
 *   ║║│║║│║│║║│║║│║║║│║│║║│║║│║║│║║║│║
 *   BIN A-12-03
 *   ───────────────────────────────────
 *   28-10-2026
 *
 * The legacy BarCode.dll printed the same size; it forced ^MTT (thermal transfer) on its 4x4 format,
 * which faults a printer without ribbon, so no media type is set here: the printer keeps its own.
 */

export const LABEL_DEALER = "DANA MOTORS";

const WIDTH = 406;
const MARGIN = 14;
const INNER = WIDTH - 2 * MARGIN;
// Code 128 needs 10 modules of clear space each side of the bars.
const QUIET_MODULES = 10;

export interface PartLabel {
  partNumber: string;
  description: string;
  bin?: string | null;
  copies: number;
}

export interface LabelHeader {
  dealer: string;
  /** Branch short name (legacy storelocation.ShortName), else its code or name. */
  store: string;
  /** Printed date, e.g. 28-10-2026. */
  date: string;
}

/** Field data for ^FH_: the characters ZPL would read as commands are sent as hex. */
function text(value: string) {
  return value.replace(/[_^~\\]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

const field = (value: string) => `^FH_^FD${text(value)}^FS`;

/** Code 128 subset B is 11 modules a character, plus start (11), check (11) and stop (13). */
export function code128Modules(data: string) {
  return 11 * data.length + 35;
}

/**
 * The widest bar module (3 dots at most) for which the bars and their quiet zones fit the label: up to
 * 13 characters at 2 dots. Longer numbers drop to 1 dot, as the legacy labels did for 9 characters and
 * up; those scanned for years with the stores' scanners.
 */
export function barModule(data: string) {
  return Math.max(1, Math.min(3, Math.floor(WIDTH / (code128Modules(data) + 2 * QUIET_MODULES))));
}

/** Part number font height: smaller as the number gets longer, so it stays on one line. */
export function partNumberHeight(length: number) {
  return length <= 10 ? 56 : length <= 13 ? 46 : length <= 16 ? 38 : 32;
}

/** Code 128 data: ">:" starts subset B (so the width above is exact); a literal ">" is sent as "><". */
function barcodeData(value: string) {
  return `>:${text(value).replace(/>/g, "><")}`;
}

/** Code 128 subset B carries printable ASCII only; anything else cannot be on the label. */
export function unprintable(partNumber: string) {
  return /[^\x20-\x7e]/.test(partNumber);
}

export function partLabelZpl(label: PartLabel, header: LabelHeader) {
  const number = label.partNumber;
  const module = barModule(number);
  const barWidth = code128Modules(number) * module;
  const pnHeight = partNumberHeight(number.length);
  return [
    "^XA",
    "^CI28^PW406^LL402^LH0,0^PON",
    `^FO${MARGIN},12^A0N,24,22${field(header.dealer)}`,
    header.store && `^FO${MARGIN},12^A0N,24,22^FB${INNER},1,0,R${field(header.store)}`,
    `^FO${MARGIN},40^GB${INNER},0,2^FS`,
    `^FO${MARGIN},50^A0N,26,24^FB${INNER},2,2,L${field(label.description.toUpperCase())}`,
    `^FO${MARGIN},${114 + (56 - pnHeight)}^A0N,${pnHeight},${Math.round(pnHeight * 0.85)}^FB${INNER},1,0,C${field(number)}`,
    `^BY${module},3,100^FO${Math.round((WIDTH - barWidth) / 2)},182^BCN,100,N,N,N^FH_^FD${barcodeData(number)}^FS`,
    label.bin && `^FO${MARGIN},298^A0N,34,30^FB${INNER},1,0,L${field(`BIN ${label.bin}`)}`,
    `^FO${MARGIN},344^GB${INNER},0,1^FS`,
    `^FO${MARGIN},354^A0N,22,20${field(header.date)}`,
    `^PQ${label.copies}`,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

/** One print job: every label in order, each with its own copy count. */
export function jobZpl(labels: PartLabel[], header: LabelHeader) {
  return labels.map((l) => partLabelZpl(l, header)).join("\n") + "\n";
}

/** dd-mm-yyyy in Lagos time (the stores' clock), as on the legacy documents. */
export function labelDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}
