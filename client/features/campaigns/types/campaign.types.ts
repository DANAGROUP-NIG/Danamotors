import type { CampaignType, CampaignVehicleStatus, Person } from "@/features/warranty/types/warranty.types";

export type { CampaignType, CampaignVehicleStatus };
export type CampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type ContactChannel = "PHONE" | "SMS" | "WHATSAPP" | "EMAIL" | "VISIT";
export type ContactOutcome = "REACHED" | "NO_ANSWER" | "WRONG_NUMBER" | "CALL_BACK" | "DECLINED";

export type Progress = {
  affected: number;
  pending: number;
  contacted: number;
  scheduled: number;
  completed: number;
  notReachable: number;
  notApplicable: number;
  outstanding: number;
  percentComplete: number;
};

export type CampaignModelLink = {
  vehicleModelId: string;
  yearFrom: number | null;
  yearTo: number | null;
  vehicleModel: { id: string; name: string; code?: string; make?: string };
};

export type CoveredItem = {
  id?: string;
  kind: "PART" | "LABOUR";
  partNumber: string | null;
  operationCode: string | null;
  description: string;
  maxQuantity: number | null;
};

export type Campaign = {
  id: string;
  code: string;
  title: string;
  type: CampaignType;
  status: CampaignStatus;
  description: string | null;
  defectDescription: string | null;
  startDate: string;
  endDate: string | null;
  labourCovered: boolean;
  partsCovered: boolean;
  activatedAt: string | null;
  closedAt: string | null;
  models: CampaignModelLink[];
  coveredItems?: CoveredItem[];
  progress: Progress;
  byBranch?: (Progress & { branchId: string | null; branchName: string })[];
  unmatchedVins?: number;
  createdBy?: Person | null;
};

export type CampaignList = { items: Campaign[]; total: number; page: number; limit: number };
export type CampaignSummary = Progress & { activeCampaigns: number };

export type CampaignPayload = {
  code: string;
  title: string;
  type: CampaignType;
  description?: string | null;
  defectDescription?: string | null;
  startDate: string;
  endDate?: string | null;
  labourCovered?: boolean;
  partsCovered?: boolean;
  models?: { vehicleModelId: string; yearFrom?: number | null; yearTo?: number | null }[];
  coveredItems?: Omit<CoveredItem, "id">[];
};

export type CampaignCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string;
  branch: { id: string; name: string };
};

export type CampaignVehicleRow = {
  id: string;
  vin: string;
  status: CampaignVehicleStatus;
  contactAttempts: number;
  lastContactAt: string | null;
  lastContactOutcome: ContactOutcome | null;
  nextFollowUpAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  vehicle: {
    id: string;
    model: string | null;
    make: string | null;
    year?: number | null;
    registrationNumber: string | null;
    customer: CampaignCustomer;
  } | null;
  appointment: { id: string; scheduledAt: string; status: string } | null;
  completedJobCard: { id: string; jobNumber: string } | null;
};

export type ContactLog = {
  id: string;
  channel: ContactChannel;
  outcome: ContactOutcome;
  notes: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  actor: Person | null;
};

export type CampaignVehicleDetail = CampaignVehicleRow & {
  campaign: { id: string; code: string; title: string; type: CampaignType };
  contactLogs: ContactLog[];
};

export type CampaignVehicleList = { items: CampaignVehicleRow[]; total: number; page: number; limit: number; counts: Progress };

export type AddVehiclesResult = {
  valid: number;
  invalid: { line: number; value: string; error: string }[];
  duplicatesInInput: number;
  alreadyInCampaign: number;
  notInSystem: number;
  toAdd: number;
  added: number;
};

export type AddVehiclesPayload =
  | { vins: string[]; dryRun?: boolean }
  | {
      criteria: { vehicleModelIds: string[]; yearFrom?: number | null; yearTo?: number | null; vinFrom?: string | null; vinTo?: string | null };
      dryRun?: boolean;
    };
