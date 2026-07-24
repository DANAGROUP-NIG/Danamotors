export const API_ROUTES = {
  auth: {
    me: "/auth/me",
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    logoutAll: "/auth/logout-all",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
  },
  customers: {
    base: "/customers",
    detail: (id: string) => `/customers/${id}`,
  },
  branches: {
    base: "/branches",
    detail: (id: string) => `/branches/${id}`,
  },
  vehicles: {
    base: "/vehicles",
    detail: (id: string) => `/vehicles/${id}`,
  },
  appointments: {
    base: "/service/appointments",
    detail: (id: string) => `/service/appointments/${id}`,
  },
  service: {
    jobCards: {
      base: "/service/job-cards",
      detail: (id: string) => `/service/job-cards/${id}`,
    },
  },
  workshop: {
    jobCards: {
      base: "/workshop/job-cards",
      detail: (id: string) => `/workshop/job-cards/${id}`,
    },
    inspections: {
      base: "/workshop/inspections",
      detail: (id: string) => `/workshop/inspections/${id}`,
    },
    technicians: {
      base: "/workshop/technicians",
      detail: (id: string) => `/workshop/technicians/${id}`,
    },
  },
  inventory: {
    base: "/inventory",
    detail: (id: string) => `/inventory/${id}`,
  },
  finance: {
    quotations: {
      base: "/finance/quotations",
      detail: (id: string) => `/finance/quotations/${id}`,
    },
    invoices: {
      base: "/finance/invoices",
      detail: (id: string) => `/finance/invoices/${id}`,
    },
    payments: {
      base: "/finance/payments",
      detail: (id: string) => `/finance/payments/${id}`,
    },
  },
  administration: {
    users: {
      base: "/admin/users",
      detail: (id: string) => `/admin/users/${id}`,
    },
    roles: {
      base: "/admin/roles",
      detail: (id: string) => `/admin/roles/${id}`,
    },
    permissions: {
      base: "/admin/permissions",
    },
  },
  search: {
    base: "/search",
  },
} as const;
