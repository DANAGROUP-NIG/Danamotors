export type Vehicle = {
  id: string;
  customerId: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
  color?: string;
  mileage?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateVehiclePayload = {
  customerId: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
  color?: string;
  mileage?: number;
};

export type UpdateVehiclePayload = Partial<Omit<CreateVehiclePayload, "customerId">>;

export type VehicleListResponse = {
  items: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
};
