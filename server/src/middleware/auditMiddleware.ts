import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';

// ── Action Mapping ───────────────────────────────────────────────────────────
// Maps "METHOD /api/route" to a human-readable audit action string.
// Keys are normalised — dynamic :id segments are stripped before lookup.
const ACTION_MAP: Record<string, string> = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  'POST /api/auth/register': 'USER_REGISTERED',
  'POST /api/auth/customer/register': 'CUSTOMER_REGISTERED',
  'POST /api/auth/login': 'USER_LOGIN',
  'POST /api/auth/logout': 'USER_LOGOUT',
  'POST /api/auth/logout-all': 'USER_LOGOUT_ALL',
  'POST /api/auth/forgot-password': 'PASSWORD_RESET_REQUESTED',
  'POST /api/auth/reset-password': 'PASSWORD_RESET_COMPLETED',
  'POST /api/auth/refresh': 'TOKEN_REFRESHED',
  'PUT /api/auth/me': 'USER_PROFILE_UPDATED',

  // ── Administration — Users ─────────────────────────────────────────────────
  'POST /api/admin/users': 'USER_CREATE',
  'PUT /api/admin/users': 'USER_UPDATE',
  'DELETE /api/admin/users': 'USER_DELETE',

  // ── Administration — Roles & Permissions ───────────────────────────────────
  'POST /api/admin/roles': 'ROLE_CREATE',
  'PUT /api/admin/roles': 'ROLE_UPDATE',
  'DELETE /api/admin/roles': 'ROLE_DELETE',
  'PUT /api/admin/roles/permissions': 'ROLE_PERMISSIONS_UPDATE',

  // ── Customers ─────────────────────────────────────────────────────────────
  'POST /api/customers': 'CUSTOMER_CREATE',
  'PUT /api/customers': 'CUSTOMER_UPDATE',
  'POST /api/customers/documents': 'CUSTOMER_DOCUMENT_ADD',
  'POST /api/customers/service-history': 'CUSTOMER_SERVICE_HISTORY_ADD',
  'POST /api/customers/account': 'CUSTOMER_ACCOUNT_UPDATE',

  // ── Vehicles ──────────────────────────────────────────────────────────────
  'POST /api/vehicles': 'VEHICLE_CREATE',
  'PUT /api/vehicles': 'VEHICLE_UPDATE',
  'DELETE /api/vehicles': 'VEHICLE_DELETE',
  'POST /api/vehicles/images': 'VEHICLE_IMAGE_ADD',
  'POST /api/vehicles/ownerships': 'VEHICLE_OWNERSHIP_ADD',

  // ── Service — Appointments ────────────────────────────────────────────────
  'POST /api/service/appointments': 'APPOINTMENT_CREATE',
  'PUT /api/service/appointments': 'APPOINTMENT_UPDATE',
  'DELETE /api/service/appointments': 'APPOINTMENT_DELETE',

  // ── Service — Job Cards ──────────────────────────────────────────────────
  'POST /api/service/job-cards': 'JOB_CARD_CREATE',
  'PUT /api/service/job-cards': 'JOB_CARD_UPDATE',
  'POST /api/service/job-cards/inspections': 'JOB_CARD_INSPECTION_CREATE',
  'POST /api/service/job-cards/estimates': 'JOB_CARD_ESTIMATE_CREATE',

  // ── Service — Estimates ──────────────────────────────────────────────────
  'POST /api/service/estimates/approvals': 'ESTIMATE_APPROVAL_CREATE',

  // ── Services Catalog ─────────────────────────────────────────────────────
  'POST /api/services': 'SERVICE_CREATE',
  'PUT /api/services': 'SERVICE_UPDATE',
  'DELETE /api/services': 'SERVICE_DELETE',

  // ── Workshop ─────────────────────────────────────────────────────────────
  'POST /api/workshop/assign': 'TECHNICIAN_ASSIGN',
  'PATCH /api/workshop/progress': 'JOB_PROGRESS_UPDATE',
  'PATCH /api/workshop/qc': 'QC_STATUS_UPDATE',

  // ── Inventory — Parts ────────────────────────────────────────────────────
  'POST /api/inventory/parts': 'SPARE_PART_CREATE',
  'PUT /api/inventory/parts': 'SPARE_PART_UPDATE',
  'DELETE /api/inventory/parts': 'SPARE_PART_DELETE',

  // ── Inventory — Stock ────────────────────────────────────────────────────
  'POST /api/inventory/stock/adjust': 'STOCK_ADJUST',

  // ── Inventory — Purchase Requests ────────────────────────────────────────
  'POST /api/inventory/purchase-requests': 'PURCHASE_REQUEST_CREATE',
  'PATCH /api/inventory/purchase-requests/status': 'PURCHASE_REQUEST_STATUS_UPDATE',

  // ── Inventory — Issuances & Returns ──────────────────────────────────────
  'POST /api/inventory/issuances': 'PART_ISSUANCE_CREATE',
  'POST /api/inventory/returns': 'PART_RETURN_CREATE',

  // ── Inventory — Transfers ────────────────────────────────────────────────
  'POST /api/inventory/transfers': 'TRANSFER_CREATE',
  'PATCH /api/inventory/transfers/approve': 'TRANSFER_APPROVE',
  'PATCH /api/inventory/transfers/dispatch': 'TRANSFER_DISPATCH',
  'PATCH /api/inventory/transfers/receive': 'TRANSFER_RECEIVE',
  'PATCH /api/inventory/transfers/reject': 'TRANSFER_REJECT',
  'PATCH /api/inventory/transfers/cancel': 'TRANSFER_CANCEL',

  // ── Finance ──────────────────────────────────────────────────────────────
  'POST /api/finance/invoices': 'INVOICE_CREATE',
  'PUT /api/finance/invoices': 'INVOICE_UPDATE',
  'DELETE /api/finance/invoices': 'INVOICE_DELETE',
  'POST /api/finance/payments': 'PAYMENT_CREATE',
  'POST /api/finance/receipts': 'RECEIPT_CREATE',

  // ── Branches ─────────────────────────────────────────────────────────────
  'POST /api/branches': 'BRANCH_CREATE',
  'PUT /api/branches': 'BRANCH_UPDATE',
  'DELETE /api/branches': 'BRANCH_DELETE',

  // ── Credit ───────────────────────────────────────────────────────────────
  'POST /api/credit/applications': 'CREDIT_APPLICATION_CREATE',
  'POST /api/credit/customers/credit': 'CREDIT_ADJUST',

  // ── Enquiries ────────────────────────────────────────────────────────────
  'POST /api/enquiries': 'ENQUIRY_CREATE',
  'PATCH /api/enquiries/review': 'ENQUIRY_REVIEW',
  'DELETE /api/enquiries': 'ENQUIRY_DELETE',

  // ── Notifications ────────────────────────────────────────────────────────
  'PATCH /api/notifications/read-all': 'NOTIFICATIONS_MARK_ALL_READ',
  'PATCH /api/notifications/read': 'NOTIFICATION_MARK_READ',

  // ── Customer Portal ──────────────────────────────────────────────────────
  'PUT /api/portal/me': 'PORTAL_PROFILE_UPDATE',
  'PUT /api/portal/me/password': 'PORTAL_PASSWORD_CHANGE',
  'POST /api/portal/vehicles': 'PORTAL_VEHICLE_REGISTER',
  'POST /api/portal/appointments': 'PORTAL_APPOINTMENT_BOOK',
  'POST /api/portal/estimates/approval': 'PORTAL_ESTIMATE_APPROVAL',
  'POST /api/portal/credit/applications/decision': 'PORTAL_CREDIT_DECISION',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip dynamic segments from a URL path so it can be matched against
 * the ACTION_MAP.  Both UUIDs and plain numeric IDs are removed.
 *
 *   /api/admin/users/abc-123-def  →  /api/admin/users
 *   /api/inventory/parts/42       →  /api/inventory/parts
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\/\d+/g, '')
    .replace(/\/+$/, '') || '/';
}

/**
 * Derive a human-readable action string from the HTTP method and URL.
 * First checks the ACTION_MAP; falls back to a generic pattern
 * derived from the last path segment.
 */
function deriveAction(method: string, originalUrl: string): string {
  const urlPath = originalUrl.split('?')[0];
  const normalized = normalizePath(urlPath);
  const key = `${method} ${normalized}`;

  if (ACTION_MAP[key]) {
    return ACTION_MAP[key];
  }

  // Fallback: derive from last path segment
  const segments = normalized.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || 'RESOURCE';
  const entity = lastSegment.replace(/-/g, '_').toUpperCase();

  switch (method) {
    case 'POST': return `${entity}_CREATE`;
    case 'PUT':
    case 'PATCH': return `${entity}_UPDATE`;
    case 'DELETE': return `${entity}_DELETE`;
    default: return `${method}_${entity}`;
  }
}

/**
 * Return a shallow copy of the request body with sensitive fields
 * replaced by `[REDACTED]`.  Returns `undefined` when the body is
 * empty or not an object.
 */
function sanitizeDetails(body: any): string | undefined {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    return undefined;
  }

  const SENSITIVE_FIELDS = [
    'password', 'passwordHash', 'token', 'refreshToken',
    'resetTokenHash', 'accessToken', 'newPassword', 'currentPassword',
  ];

  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  try {
    return JSON.stringify(sanitized);
  } catch {
    return '[Unserializable body]';
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Audit logging middleware.
 *
 * Automatically logs every write operation (POST, PUT, PATCH, DELETE)
 * after the response has been successfully sent (status < 400).
 *
 * Captures:
 *  - action   — derived from HTTP method + route path via ACTION_MAP
 *  - details  — stringified request body (sensitive fields redacted)
 *  - userId   — from req.user.userId (set by authMiddleware)
 *  - ipAddress — from x-forwarded-for header or req.ip
 *  - userAgent — from user-agent header
 *
 * Skips:
 *  - GET / HEAD / OPTIONS requests
 *  - Audit module routes (/api/audit/*) to prevent double-logging
 */
export const auditMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const method = req.method.toUpperCase();

  // Only log write operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Skip audit module routes — the audit module manages its own logs directly.
  const urlPath = req.originalUrl.split('?')[0];
  if (urlPath.startsWith('/api/audit')) {
    return next();
  }

  // Capture request data before the handler runs
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const action = deriveAction(method, req.originalUrl);
  const details = sanitizeDetails(req.body);

  // Log after the response has been fully sent and the status code is final
  res.on('finish', () => {
    if (res.statusCode < 400 && req.user?.userId) {
      prisma.auditLog
        .create({
          data: {
            action,
            details,
            userId: req.user.userId,
            ipAddress,
            userAgent,
          },
        })
        .catch(() => {});
    }
  });

  next();
};

export default auditMiddleware;
