export type VehicleCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type Vehicle = {
  id: string;
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  warrantyProvider: string | null;
  warrantyStatus: string | null;
  warrantyExpiresAt: string | null;
  ownershipStatus: string | null;
  customer: VehicleCustomer;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  imagesCount: number;
  ownershipsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateVehiclePayload = {
  customerId: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  color?: string;
  warrantyProvider?: string;
  warrantyStatus?: string;
  warrantyExpiresAt?: string;
  ownershipStatus?: string;
};

export type UpdateVehiclePayload = Partial<Omit<CreateVehiclePayload, "customerId" | "vin">>;

export type VehicleListResponse = {
  vehicles: Vehicle[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
