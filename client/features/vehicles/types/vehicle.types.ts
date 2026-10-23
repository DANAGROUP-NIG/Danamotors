export type VehicleCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string | null;
  phoneNumber?: string | null;
};


export type VehicleTyre = { makeId: string; make: string; number: string };

/** Legacy vehiclemaster sale, stock and fitment details. */
export type VehicleLegacyFields = {
  colourType?: string | null;
  parkedAt?: "SHOWROOM" | "STOCKYARD" | "SOLD" | null;
  purchaseAmount?: number | null;
  saleInvoiceNumber?: string | null;
  saleInvoiceDate?: string | null;
  saleAmount?: number | null;
  wcoNumber?: string | null;
  wcoDate?: string | null;
  principalInvoiceNumber?: string | null;
  principalInvoiceDate?: string | null;
  theft?: boolean;
  manufactureMonth?: number | null;
  manufactureYear?: number | null;
  tyres?: VehicleTyre[] | null;
  batteryMake?: string | null;
  batteryNumber?: string | null;
};

export type Vehicle = VehicleLegacyFields & {
  modelId?: string | null;
  generationId?: string | null;
  engineId?: string | null;
  customMake?: string | null;
  customModel?: string | null;

  catalogue?: { acFitted: boolean; description: string; parent?: { description: string } | null } | null;
  ownerships?: { id: string; purchaseDate: string; saleDate?: string | null; customer?: { firstName: string; lastName: string; companyName?: string | null } }[];
  jobCards?: { id: string; jobNumber: string; createdAt: string; status: string; mileage?: number | null; description: string; workDone?: string | null }[];
  id: string;
  catalogueId?: string | null;
  colourId?: string | null;
  engineNumber?: string | null;
  keyNumber?: string | null;
  pdiDone?: boolean;
  pdiDate?: string | null;
  saleDate?: string | null;
  sellingDealer?: string | null;
  lastRecordedMileage?: number | null;
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
  ownershipStatus: string | null;
  customer: VehicleCustomer | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  imagesCount: number;
  ownershipsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateVehiclePayload = VehicleLegacyPayload & {
  modelId?: string | null;
  generationId?: string | null;
  engineId?: string | null;
  customMake?: string | null;
  customModel?: string | null;

  customerId?: string;
  catalogueId?: string | null;
  colourId?: string | null;
  engineNumber?: string | null;
  keyNumber?: string | null;
  pdiDone?: boolean;
  pdiDate?: string | null;
  saleDate?: string | null;
  sellingDealer?: string | null;
  lastRecordedMileage?: number | null;
  vin: string;
  registrationNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  color?: string;
  vehicleModelId?: string | null;
  ownershipStatus?: string;
};

export type VehicleLegacyPayload = Omit<VehicleLegacyFields, "tyres" | "batteryMake"> & {
  tyres?: { makeId?: string; number?: string }[];
  batteryMakeId?: string | null;
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
