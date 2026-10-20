export const MONTHLY_REPORTS = [
  {
    slug: "tax-register",
    code: "M1",
    title: "Tax register",
    description: "Bill details and VAT annexure, reconciled for the period.",
    wide: true,
  },
  {
    slug: "booked-vs-availed",
    code: "M2",
    title: "Booked vs. availed",
    description: "Booking conversions, missed bookings and walk-ins.",
    wide: false,
  },
  {
    slug: "estimate-vs-job",
    code: "M3",
    title: "Estimate vs. job",
    description: "Compare approved scope with parts and labour actually used.",
    wide: true,
  },
  {
    slug: "unbilled-parts",
    code: "M4",
    title: "Unbilled parts",
    description: "Net parts issued, grouped by job and who pays.",
    wide: true,
  },
  {
    slug: "corporate-bills",
    code: "M5",
    title: "Corporate bills",
    description: "Fleet billing grouped by the vehicle’s corporate group.",
    wide: false,
  },
  {
    slug: "delivered-model",
    code: "M6",
    title: "Deliveries by model",
    description: "Daily delivery counts across vehicle models.",
    wide: false,
  },
  {
    slug: "delivered-service",
    code: "M7",
    title: "Deliveries by service",
    description: "Daily delivery counts across service types.",
    wide: false,
  },
  {
    slug: "warranty-attended",
    code: "M8",
    title: "Warranty attendance",
    description: "Vehicles attended under and beyond warranty.",
    wide: false,
  },
  {
    slug: "warranty-parts",
    code: "M9",
    title: "Warranty parts",
    description: "Parts issued under warranty and claim progress.",
    wide: false,
  },
  {
    slug: "vehicle-history-card",
    code: "M10",
    title: "Vehicle history card",
    description: "A complete service and ownership record for a vehicle.",
    wide: false,
  },
] as const;
export type MonthlySlug = (typeof MONTHLY_REPORTS)[number]["slug"];
export type FilterConfig = {
  key: string;
  label: string;
  kind: "select" | "check" | "number" | "text" | "dimension";
  options?: string[][];
  source?: string;
  default?: string;
};
const select = (
  key: string,
  label: string,
  options: string[][],
): FilterConfig => ({
  key,
  label,
  kind: "select",
  options,
  default: options[0][0],
});
const check = (key: string, label: string, value = "false"): FilterConfig => ({
  key,
  label,
  kind: "check",
  default: value,
});
const dimension = (
  key: string,
  label: string,
  source: string,
): FilterConfig => ({ key, label, kind: "dimension", source });
const bill = select("billType", "Bill type", [
  ["BOTH", "Cash and credit"],
  ["CASH", "Cash"],
  ["CREDIT", "Credit"],
]);
const address = check("printAddress", "Include customer address");
export const MONTHLY_FILTERS: Record<MonthlySlug, FilterConfig[]> = {
  "tax-register": [
    bill,
    address,
    check("pageBreak", "Start each bill type on a new page"),
    select("order", "Order by", [
      ["NUMBER", "Bill number"],
      ["DATE", "Bill date"],
    ]),
    select("view", "Show", [
      ["DETAIL_ANNEXURE", "Detail and annexure"],
      ["DETAIL", "Detail only"],
      ["ANNEXURE", "Annexure only"],
    ]),
  ],
  "booked-vs-availed": [
    {
      key: "graceDays",
      label: "Grace period (days)",
      kind: "number",
      default: "0",
    },
  ],
  "estimate-vs-job": [
    select("basedOn", "Variation based on", [
      ["ESTIMATE", "Estimate"],
      ["JOB", "Job"],
    ]),
    select("variation", "Report type", [
      ["SHORTAGE", "Shortage"],
      ["EXCESS", "Excess"],
    ]),
  ],
  "unbilled-parts": [
    select("chargeType", "Who pays", [
      ["ALL", "All charge types"],
      ["CUSTOMER", "Non-warranty (customer)"],
      ["WARRANTY", "Warranty"],
      ["FREE", "Free of charge"],
      ["GOODWILL", "Goodwill"],
    ]),
    select("category", "Part category", [
      ["BOTH", "Spares and oil"],
      ["SPARES", "Spares and accessories"],
      ["OIL", "Oil"],
    ]),
    select("view", "Show", [
      ["DETAIL_SUMMARY", "Detail and summary"],
      ["SUMMARY", "Summary only"],
      ["DETAIL", "Detail only"],
    ]),
  ],
  "corporate-bills": [
    bill,
    select("order", "Corporate order", [
      ["CODE", "Code"],
      ["NAME", "Name"],
    ]),
    dimension("fromCorporateId", "From corporate", "corporate"),
    dimension("toCorporateId", "To corporate", "corporate"),
  ],
  "delivered-model": [
    dimension("modelIds", "Model", "MODEL"),
    check("detail", "Include delivery details"),
  ],
  "delivered-service": [check("detail", "Include delivery details")],
  "warranty-attended": [
    select("warranty", "Coverage at job opening", [
      ["BOTH", "Under and beyond"],
      ["UNDER", "Under warranty"],
      ["BEYOND", "Beyond warranty"],
    ]),
    address,
  ],
  "warranty-parts": [
    dimension("modelIds", "Model", "MODEL"),
    dimension("variantIds", "Variant", "VARIANT"),
    dimension("serviceTypeIds", "Service type", "SERVICE_TYPE"),
    dimension("teamIds", "Service group", "TEAM"),
    dimension("engineerIds", "Engineer", "staff"),
    dimension("technicianIds", "Technician", "staff"),
    dimension("vehicleIds", "Vehicle", "vehicles"),
    select("category", "Part category", [
      ["ALL", "All categories"],
      ["SPARES", "Spares"],
      ["OIL", "Oil"],
      ["ACCESSORIES", "Accessories"],
    ]),
    select("claims", "Claims", [
      ["ALL", "All claims"],
      ["GENERATED", "Generated"],
      ["NOT_GENERATED", "Not generated"],
    ]),
    check("billedOnly", "Show billed jobs only"),
  ],
  "vehicle-history-card": [
    ["customerName", "Customer name"],
    ["registration", "Registration"],
    ["product", "Product / make"],
    ["model", "Model"],
    ["variant", "Variant"],
    ["vin", "VIN"],
  ]
    .map(([key, label]): FilterConfig => ({ key, label, kind: "text" }))
    .concat([
      check("parts", "Parts and oil details", "true"),
      check("labour", "Labour details", "true"),
      check("demands", "Customer requests", "true"),
      check("includePdi", "Include PDI visits"),
    ]),
};
