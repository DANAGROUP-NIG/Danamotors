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
    base: "/customer",
    detail: (id: string) => `/customer/${id}`,
  },
  vehicles: {
    base: "/vehicle",
    detail: (id: string) => `/vehicle/${id}`,
  },
  appointments: {
    base: "/service",
    detail: (id: string) => `/service/${id}`,
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
      base: "/administration/users",
      detail: (id: string) => `/administration/users/${id}`,
    },
    roles: {
      base: "/administration/roles",
      detail: (id: string) => `/administration/roles/${id}`,
    },
  },
} as const;
