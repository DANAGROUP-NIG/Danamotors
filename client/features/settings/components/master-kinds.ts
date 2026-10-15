// Mirrors server/src/modules/workshop/master-kinds.ts: the legacy simple masters
// that share one table and one screen.
export type AttributeField =
  | { key: string; label: string; type: "text" | "textarea" | "number" }
  | { key: string; label: string; type: "checkbox" }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  // Stores the code of another master, as legacy did.
  | { key: string; label: string; type: "master"; kind: string };

export type MasterKindConfig = {
  label: string;
  group: string;
  parent?: { kind: string; label: string; required: boolean; fixed?: boolean };
  attributes?: AttributeField[];
};

export const MASTER_KINDS: Record<string, MasterKindConfig> = {
  MAKE: { label: "Make", group: "Vehicle catalogue" },
  PRODUCT: {
    label: "Product",
    group: "Vehicle catalogue",
    parent: { kind: "MAKE", label: "Make", required: true, fixed: true },
    attributes: [{ key: "includeInReports", label: "Include in reports", type: "checkbox" }],
  },
  MODEL: {
    label: "Model",
    group: "Vehicle catalogue",
    parent: { kind: "PRODUCT", label: "Product", required: true, fixed: true },
    attributes: [
      { key: "modelId", label: "Model ID", type: "text" },
      { key: "basicModel", label: "Basic model", type: "text" },
      { key: "productLine", label: "Product line", type: "text" },
    ],
  },
  VARIANT: {
    label: "Variant",
    group: "Vehicle catalogue",
    parent: { kind: "MODEL", label: "Model", required: true, fixed: true },
    attributes: [{ key: "features", label: "Features", type: "textarea" }],
  },
  COLOUR_TYPE: { label: "Colour type", group: "Vehicle catalogue" },
  COLOUR: {
    label: "Colour",
    group: "Vehicle catalogue",
    parent: { kind: "MODEL", label: "Model", required: true, fixed: true },
    attributes: [{ key: "colourType", label: "Colour type", type: "master", kind: "COLOUR_TYPE" }],
  },
  TYRE_MAKE: { label: "Tyre make", group: "Vehicle catalogue" },
  BATTERY_MAKE: { label: "Battery make", group: "Vehicle catalogue" },
  VEHICLE_SYSTEM: { label: "Vehicle system", group: "Workshop" },
  VEHICLE_GROUP: {
    label: "Vehicle group",
    group: "Workshop",
    parent: { kind: "VEHICLE_SYSTEM", label: "Vehicle system", required: true },
  },
  SERVICE_TYPE: {
    label: "Service",
    group: "Workshop",
    attributes: [{ key: "multiService", label: "Multi-service (can be opened with another service)", type: "checkbox" }],
  },
  CHECKLIST: { label: "Service checklist", group: "Workshop" },
  BAY: {
    label: "Bay",
    group: "Workshop",
    attributes: [{
      key: "bayCategory",
      label: "Bay category",
      type: "select",
      options: [
        { value: "PDI", label: "PDI" },
        { value: "SERVICE", label: "Service & Repair" },
        { value: "ACCIDENTAL", label: "Accidental" },
      ],
    }],
  },
  COMPLAINT: {
    label: "Defect / complaint",
    group: "Workshop",
    parent: { kind: "VEHICLE_GROUP", label: "Vehicle group", required: false },
    attributes: [
      { key: "majorDefect", label: "Major defect", type: "checkbox" },
      {
        key: "usedIn",
        label: "Used in",
        type: "select",
        options: [
          { value: "WARRANTY", label: "Warranty" },
          { value: "BEYOND_WARRANTY", label: "Beyond warranty" },
          { value: "BOTH", label: "Both" },
        ],
      },
    ],
  },
  TEAM: { label: "Employee group / team", group: "Workshop" },
  LATE_REASON: { label: "Late delivery reason", group: "Workshop" },
  DEPARTMENT: { label: "Department", group: "People" },
  DESIGNATION: {
    label: "Designation",
    group: "People",
    attributes: [
      { key: "hierarchy", label: "Hierarchy (1 = top)", type: "number" },
      { key: "department", label: "Department", type: "master", kind: "DEPARTMENT" },
      { key: "containsGroup", label: "Belongs to an employee group", type: "checkbox" },
      { key: "canReceiveVehicle", label: "Can receive vehicles", type: "checkbox" },
      { key: "canDeliverVehicle", label: "Can deliver vehicles", type: "checkbox" },
    ],
  },
  SALUTATION: {
    label: "Salutation",
    group: "People",
    attributes: [{ key: "letterReference", label: "Reference in letters (e.g. SIR/MADAM)", type: "text" }],
  },
  SEGMENT: {
    label: "Customer segment",
    group: "People",
    attributes: [{ key: "segmentType", label: "Segment type", type: "text" }],
  },
  ZONE: { label: "Zone", group: "Geography" },
  STATE: { label: "State", group: "Geography", parent: { kind: "ZONE", label: "Zone", required: false } },
  CITY: { label: "City", group: "Geography", parent: { kind: "STATE", label: "State", required: false } },
  UOM: {
    label: "Unit of measurement",
    group: "Parts & tax",
    attributes: [{ key: "decimalAllowed", label: "Decimal quantities allowed", type: "checkbox" }],
  },
  TAX_CATEGORY: { label: "Tax category", group: "Parts & tax" },
  TAX_FORM: {
    label: "Tax form",
    group: "Parts & tax",
    attributes: [
      { key: "applicableAgainstLocalSale", label: "Applicable against local sale", type: "checkbox" },
      { key: "formRequired", label: "Form required", type: "checkbox" },
    ],
  },
};

export const MASTER_KIND_GROUPS = Array.from(new Set(Object.values(MASTER_KINDS).map(kind => kind.group)));
