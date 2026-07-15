export const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  SERVICE_ADVISOR: 'ServiceAdvisor',
  TECHNICIAN: 'Technician',
  CUSTOMER: 'Customer',
} as const;

export type RoleType = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  // Administration
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  ROLE_READ: 'role:read',
  ROLE_UPDATE: 'role:update',

  // Customer Management
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',

  // Vehicle Management
  VEHICLE_READ: 'vehicle:read',
  VEHICLE_CREATE: 'vehicle:create',
  VEHICLE_UPDATE: 'vehicle:update',
  VEHICLE_DELETE: 'vehicle:delete',

  // Service Management (Jobs, bookings, estimates)
  SERVICE_READ: 'service:read',
  SERVICE_CREATE: 'service:create',
  SERVICE_UPDATE: 'service:update',
  SERVICE_DELETE: 'service:delete',

  // Workshop Management
  WORKSHOP_READ: 'workshop:read',
  WORKSHOP_UPDATE: 'workshop:update',

  // Inventory Management
  INVENTORY_READ: 'inventory:read',
  INVENTORY_CREATE: 'inventory:create',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_DELETE: 'inventory:delete',

  // Finance Management
  FINANCE_READ: 'finance:read',
  FINANCE_CREATE: 'finance:create',
  FINANCE_UPDATE: 'finance:update',
} as const;

export type PermissionType = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Mapping roles to their default initial permissions for seeding
export const ROLE_PERMISSIONS: Record<RoleType, PermissionType[]> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.ROLE_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.VEHICLE_READ,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_UPDATE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_CREATE,
    PERMISSIONS.SERVICE_UPDATE,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.WORKSHOP_UPDATE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_CREATE,
    PERMISSIONS.INVENTORY_UPDATE,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_CREATE,
  ],
  [ROLES.SERVICE_ADVISOR]: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.VEHICLE_READ,
    PERMISSIONS.VEHICLE_CREATE,
    PERMISSIONS.VEHICLE_UPDATE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_CREATE,
    PERMISSIONS.SERVICE_UPDATE,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_CREATE,
  ],
  [ROLES.TECHNICIAN]: [
    PERMISSIONS.VEHICLE_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.WORKSHOP_UPDATE,
    PERMISSIONS.INVENTORY_READ,
  ],
  [ROLES.CUSTOMER]: [
    PERMISSIONS.VEHICLE_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.FINANCE_READ,
  ],
};
