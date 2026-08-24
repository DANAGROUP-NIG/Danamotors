export type Technician = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  createdAt: string;
  _count: {
    technicianAssignments: number;
  };
};

export type TechnicianListResponse = {
  technicians: Technician[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
