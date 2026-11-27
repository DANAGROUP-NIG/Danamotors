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

/** A quality check recorded on a job card (job card revamp phase 7). */
export type Inspection = {
  id: string;
  jobCardId: string;
  result: "PASSED" | "FAILED";
  notes: string | null;
  roadTestStartKm: number | null;
  roadTestEndKm: number | null;
  supersededAt: string | null;
  createdAt: string;
  inspector: { id: string; firstName: string; lastName: string } | null;
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
