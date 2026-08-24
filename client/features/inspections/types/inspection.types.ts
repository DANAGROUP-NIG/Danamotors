export type InspectionJobCard = {
  id: string;
  jobNumber: string;
  status: string;
  branchId: string;
  branch: { id: string; name: string };
  customer: { id: string; firstName: string; lastName: string };
  vehicle: {
    id: string;
    make: string | null;
    model: string | null;
    registrationNumber: string | null;
    vin: string;
  };
};

export type Inspection = {
  id: string;
  jobCardId: string;
  inspectorId?: string;
  findings: string;
  passed?: boolean;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  jobCard: InspectionJobCard;
};

export type InspectionListResponse = {
  inspections: Inspection[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
