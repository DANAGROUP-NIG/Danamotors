// Public API for the vehicles feature
export { VehiclesPage } from "./components/vehicles-page";
export { VehicleCreateForm } from "./components/VehicleCreateForm";
export { VehicleEditForm } from "./components/VehicleEditForm";
export { VehicleDeleteButton } from "./components/VehicleDeleteButton";
export { VehiclesTable } from "./components/VehiclesTable";
export { useVehicles } from "./hooks/use-vehicles";
export { useVehicle } from "./hooks/use-vehicle";
export { useCreateVehicle } from "./hooks/use-create-vehicle";
export { useUpdateVehicle } from "./hooks/use-update-vehicle";
export { useDeleteVehicle } from "./hooks/use-delete-vehicle";
export { vehicleKeys } from "./api/vehicle.keys";
export {
  getVehiclesRequest,
  getVehicleRequest,
  createVehicleRequest,
  updateVehicleRequest,
  deleteVehicleRequest,
} from "./api/vehicle.api";
export {
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleFormValues,
  type UpdateVehicleFormValues,
} from "./schemas/vehicle.schema";
export type {
  Vehicle,
  CreateVehiclePayload,
  UpdateVehiclePayload,
  VehicleListResponse,
} from "./types/vehicle.types";
