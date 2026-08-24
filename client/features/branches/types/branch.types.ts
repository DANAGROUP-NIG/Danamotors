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
  createdAt: string;
  updatedAt: string;
};

export type BranchDetail = Branch & {
  jobCardsCount: number;
  appointmentsCount: number;
};

export type CreateBranchPayload = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phoneNumber?: string;
  email?: string;
};

export type UpdateBranchPayload = Partial<CreateBranchPayload>;

export type BranchListResponse = {
  branches: Branch[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
