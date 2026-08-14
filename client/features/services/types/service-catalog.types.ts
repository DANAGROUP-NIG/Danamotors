export type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  durationMins?: number | null;
  price: number;
  isActive: boolean;
  appointmentsCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateServicePayload = {
  name: string;
  description?: string;
  category?: string;
  durationMins?: number;
  price?: number;
  isActive?: boolean;
};

export type UpdateServicePayload = Partial<CreateServicePayload>;

export type ServiceListResponse = {
  services: ServiceItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
