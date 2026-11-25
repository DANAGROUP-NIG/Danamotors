import { KIA_BADGE, KIA_LOGO } from "./labels.logo";

/**
 * The 2" x 2" part label (Zebra S4M, 203 dpi: 406 x 402 dots, direct thermal, gap media), in ZPL II.
 * Laid out like the Kia Genuine Parts box labels (user photos, 2026-11-23): description top left, the Kia
 * logo and "Genuine Parts" top right, the part number large and split as Kia prints it, the Code 128
 * barcode, and along the bottom a QR code of the part number beside the black Kia badge. Kept from our
 * own label (user, 2026-11-23): bin, print date, dealer and branch. Left out: QTY (user decision
 * 2026-10-28), and "Made in", the Mobis lot codes and the serial, for which we hold no data.
 * The barcode was proven on the store's printer and scanned with the MC3190 on 2026-10-28, including
 * 20-character numbers with spaces.
 *
 *   HORN ASSY-HIGH PITCH           [KIA]
 *                           Genuine Parts
 *   96610 H9100
 *   ║║│║║│║│║║│║║│║║║│║│║║│║║│║║│║║║│║
 *   BIN A-12-03                23-11-2026
 *   [QR] [■KIA■]              DANA MOTORS
 *                                     CPD
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

/**
 * The part number as Kia prints it: a plain 10 to 13 character Kia/Hyundai number is split after the
 * fifth character ("96610H9100" -> "96610 H9100"). Anything else (hyphens, spaces, local numbers) is
 * printed as stored. The barcode always carries the number as stored.
 */
export function displayPartNumber(partNumber: string) {
  return /^[A-Z0-9]{10,13}$/i.test(partNumber) ? `${partNumber.slice(0, 5)} ${partNumber.slice(5)}` : partNumber;
}

const LOGO_X = WIDTH - MARGIN - KIA_LOGO.width;
const DESCRIPTION_WIDTH = LOGO_X - MARGIN - 12;
const BADGE_X = 104;
const BOTTOM = 286;

export function partLabelZpl(label: PartLabel, header: LabelHeader) {
  const number = label.partNumber;
  const shown = displayPartNumber(number);
  const module = barModule(number);
  const barWidth = code128Modules(number) * module;
  const pnHeight = partNumberHeight(shown.length);
  const storeX = BADGE_X + KIA_BADGE.width + 10;
  return [
    "^XA",
    "^CI28^PW406^LL402^LH0,0^PON",
    `^FO${MARGIN},14^A0N,24,22^FB${DESCRIPTION_WIDTH},2,2,L${field(label.description.toUpperCase())}`,
    `^FO${LOGO_X},12${KIA_LOGO.zpl}^FS`,
    `^FO${LOGO_X - 30},44^A0N,20,18^FB${KIA_LOGO.width + 30},1,0,R^FDGenuine Parts^FS`,
    `^FO${MARGIN},${76 + (56 - pnHeight)}^A0N,${pnHeight},${Math.round(pnHeight * 0.85)}^FB${INNER},1,0,L${field(shown)}`,
    `^BY${module},3,80^FO${Math.round((WIDTH - barWidth) / 2)},142^BCN,80,N,N,N^FH_^FD${barcodeData(number)}^FS`,
    label.bin && `^FO${MARGIN},234^A0N,30,26^FB${INNER - 130},1,0,L${field(`BIN ${label.bin}`)}`,
    `^FO${MARGIN},240^A0N,22,20^FB${INNER},1,0,R${field(header.date)}`,
    // QR of the part number (model 2, 3 dots a module, error level M); ^BQ starts about 10 dots below ^FO.
    `^FO${MARGIN - 4},${BOTTOM - 10}^BQN,2,3^FH_^FDMA,${text(number)}^FS`,
    `^FO${BADGE_X},${BOTTOM + 8}${KIA_BADGE.zpl}^FS`,
    `^FO${storeX},${BOTTOM + 10}^A0N,22,20^FB${WIDTH - MARGIN - storeX},1,0,R${field(header.dealer)}`,
    header.store && `^FO${storeX},${BOTTOM + 38}^A0N,26,24^FB${WIDTH - MARGIN - storeX},1,0,R${field(header.store)}`,
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
