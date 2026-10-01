export type VehicleCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
};

export type Vehicle = {
  id: string;
  vin: string;
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  /** Model master the warranty policy comes from. Coverage itself is calculated by the server. */
  vehicleModelId?: string | null;
  vehicleModel?: { id: string; code: string; make: string; name: string } | null;
  /** Sale / delivery date that starts the warranty. */
  warrantyStartDate?: string | null;
  lastRecordedMileage?: number | null;
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
  registrationNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  color?: string;
  vehicleModelId?: string | null;
  /** YYYY-MM-DD; needs warranty:update. */
  warrantyStartDate?: string | null;
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
