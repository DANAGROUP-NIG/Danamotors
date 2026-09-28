export type Branch = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  isActive: boolean;
  usersCount: number;
  /** Legacy store-location code, e.g. A, QS, DH. */
  code?: string | null;
  /** Set when this is a sub-location (store, godown) at another branch's premises. */
  parentBranchId?: string | null;
  parentBranch?: { id: string; name: string; code: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type BranchDetail = Branch & {
  jobCardsCount: number;
  appointmentsCount: number;
  subLocations?: { id: string; name: string; code: string | null }[];
};

export type CreateBranchPayload = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
  code?: string;
  parentBranchId?: string;
};

export type UpdateBranchPayload = Partial<
  Omit<CreateBranchPayload, "code" | "parentBranchId"> & {
    isActive?: boolean;
    /** null clears the code. */
    code: string | null;
    /** null makes the branch top-level again. */
    parentBranchId: string | null;
  }
>;

export type BranchListResponse = {
  branches: Branch[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
