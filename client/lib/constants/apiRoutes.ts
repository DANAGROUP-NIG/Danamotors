export const API_ROUTES = {
  auth: {
    me: "/auth/me",
    updateMe: "/auth/me",
    login: "/auth/login",
    register: "/auth/register",
    customerRegister: "/auth/customer/register",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    logoutAll: "/auth/logout-all",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
  },
  customers: {
    base: "/customers",
    detail: (id: string) => `/customers/${id}`,
    account: (id: string) => `/customers/${id}/account`,
  },
  portal: {
    me: "/portal/me",
    changePassword: "/portal/me/password",
    dashboard: "/portal/dashboard",
    vehicles: {
      base: "/portal/vehicles",
      detail: (id: string) => `/portal/vehicles/${id}`,
    },
    jobCards: {
      base: "/portal/job-cards",
      detail: (id: string) => `/portal/job-cards/${id}`,
    },
    appointments: {
      base: "/portal/appointments",
    },
    services: {
      base: "/portal/services",
    },
    invoices: {
      base: "/portal/invoices",
      detail: (id: string) => `/portal/invoices/${id}`,
    },
    estimateApproval: (estimateId: string) => `/portal/estimates/${estimateId}/approval`,
    credit: "/portal/credit",
    creditApplications: "/portal/credit/applications",
    creditDecision: (id: string) => `/portal/credit/applications/${id}/decision`,
  },
  credit: {
    applications: {
      base: "/credit/applications",
      detail: (id: string) => `/credit/applications/${id}`,
    },
    customerCredit: (customerId: string) =>
      `/credit/customers/${customerId}/credit`,
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
  enquiries: {
    base: "/enquiries",
    detail: (id: string) => `/enquiries/${id}`,
    review: (id: string) => `/enquiries/${id}/review`,
  },
  service: {
    jobCards: {
      base: "/service/job-cards",
      detail: (id: string) => `/service/job-cards/${id}`,
    },
  },
  services: {
    base: "/services",
    detail: (id: string) => `/services/${id}`,
  },
  inventory: {
    base: "/inventory",
    detail: (id: string) => `/inventory/${id}`,
    stock: {
      base: "/inventory/stock",
      byBranch: (branchId: string) => `/inventory/stock/${branchId}`,
    },
    parts: {
      base: "/inventory/parts",
      detail: (id: string) => `/inventory/parts/${id}`,
    },
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
  notifications: {
    base: "/notifications",
    unreadCount: "/notifications/unread-count",
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: "/notifications/read-all",
  },
} as const;
