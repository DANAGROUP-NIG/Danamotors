-- Provision department roles for Settings on deploy. These templates match the role seed.
WITH role_defaults (role_name, template, all_branches) AS (
  VALUES
    ('GeneralWorkshopManager', 'WorkshopManager', true),
    ('AccountOfficer', 'Accountant', false),
    ('AccountManager', 'Accountant', false),
    ('GeneralAccountManager', 'Accountant', true),
    ('BillingManager', 'BillingOfficer', false),
    ('GeneralBillingManager', 'BillingOfficer', true),
    ('GeneralCCUManager', 'CCUManager', true),
    ('AuditOfficer', 'Auditor', false),
    ('AuditManager', 'Auditor', false),
    ('GeneralAuditManager', 'Auditor', true)
), templates (template, permissions) AS (
  VALUES
    ('WorkshopManager', ARRAY[
      'assignment:create', 'campaign:read', 'corporate:manage', 'csi:master:read',
      'csi:response:read', 'customer:read', 'dashboard:read', 'employee:manage',
      'employee:read', 'estimate:create', 'estimate:print', 'estimate:read',
      'inspection:create', 'inspection:read', 'invoice:read', 'jobcard:create',
      'jobcard:labour:update', 'jobcard:late-reason:update', 'jobcard:line:update', 'jobcard:multi-vehicle:read',
      'jobcard:picking-list:print', 'jobcard:read', 'jobcard:remarks:update', 'jobcard:update',
      'jobprogress:update', 'labour-item:create', 'labour-item:read', 'labour-item:update',
      'notification:read', 'notification:update', 'payment:read', 'pdi:create',
      'pdi:read', 'pdi:update', 'qcstatus:update', 'repeatjob:read',
      'repeatjob:review', 'report:birthday-anniversary', 'report:booked-vs-availed', 'report:business-product-mix',
      'report:corporate-bills', 'report:csi', 'report:csi-attribute', 'report:csi-checklist',
      'report:delayed-deliveries', 'report:delivered-model', 'report:delivered-service', 'report:engineer-part-consumption',
      'report:engineer-performance', 'report:estimate-vs-job', 'report:fpc-analysis', 'report:fpc-vehicles',
      'report:group-productivity', 'report:job-analysis', 'report:major-problems', 'report:mis-monthly',
      'report:new-customers', 'report:promise-date-analysis', 'report:promise-date-discrepancy', 'report:promise-time-analysis',
      'report:promise-time-discrepancy', 'report:regular-customers', 'report:repeat-analysis', 'report:repeat-list',
      'report:repeat-summary', 'report:requisition-return-register', 'report:settings', 'report:skipped-free-service',
      'report:tax-register', 'report:unbilled-parts', 'report:vehicle-history-card', 'report:vehicle-list',
      'report:vehicle-resale', 'report:warranty-attended', 'report:warranty-parts', 'requisition:read',
      'search:read', 'services:create', 'services:delete', 'services:read',
      'services:update', 'sparepart:read', 'stock:read', 'vehicle:create',
      'vehicle:delete', 'vehicle:image:create', 'vehicle:ownership:create', 'vehicle:read',
      'vehicle:update', 'warranty:read', 'workshop:read'
    ]),
    ('Accountant', ARRAY[
      'creditnote:cancel', 'creditnote:create', 'creditnote:read', 'customer:read',
      'dashboard:read', 'debitnote:cancel', 'debitnote:create', 'debitnote:read',
      'financereport:read', 'invoice:create', 'invoice:read', 'invoice:update',
      'letter:outstanding', 'mobispricing:manage', 'notification:read', 'notification:update',
      'partsale:bill', 'partsale:read', 'partsale:return', 'payment:create',
      'payment:read', 'receipt:adjust', 'receipt:read', 'report:corporate-bills',
      'report:credit-note-register', 'report:debit-note-register', 'report:party-ledger', 'report:party-outstanding',
      'report:party-outstanding-age', 'report:party-outstanding-bill', 'report:tax-register', 'report:unbilled-parts',
      'search:read', 'sparepart:cost:read', 'stockaudit:manage', 'stockaudit:read',
      'stocktake:read', 'warranty:read'
    ]),
    ('BillingOfficer', ARRAY[
      'customer:read', 'customer:tally-mapping', 'dashboard:read', 'invoice:cancel',
      'invoice:job-bill:create', 'invoice:read', 'jobcard:multi-vehicle:read', 'jobcard:read',
      'letter:outstanding', 'notification:read', 'notification:update', 'partsale:bill',
      'partsale:read', 'partsale:return', 'pdi:bill', 'pdi:read',
      'receipt:adjust', 'receipt:cancel', 'receipt:create', 'receipt:read',
      'receipt:update', 'report:corporate-bills', 'report:party-ledger', 'report:party-outstanding',
      'report:party-outstanding-age', 'report:party-outstanding-bill', 'report:receipt-register', 'report:tax-register',
      'report:unbilled-parts', 'search:read', 'tally:import', 'tally:post'
    ]),
    ('CCUManager', ARRAY[
      'appointment:create', 'appointment:delete', 'appointment:read', 'appointment:update',
      'campaign:read', 'campaign:vehicle:update', 'csc:case:generate', 'csc:case:read',
      'csc:followup:update', 'csc:master:read', 'csi:card:generate', 'csi:response:read',
      'csi:response:update', 'customer:account:manage', 'customer:create', 'customer:delete',
      'customer:document:create', 'customer:history:create', 'customer:read', 'customer:update',
      'dashboard:read', 'enquiry:create', 'enquiry:delete', 'enquiry:read',
      'enquiry:update', 'jobcard:read', 'notification:read', 'notification:update',
      'report:csc-followup', 'report:csc-no-show', 'report:csc-not-visited', 'report:fpc-vehicles',
      'search:read', 'services:read', 'vehicle:create', 'vehicle:delete',
      'vehicle:image:create', 'vehicle:ownership:create', 'vehicle:read', 'vehicle:update',
      'warranty:read'
    ]),
    ('Auditor', ARRAY[
      'appointment:read', 'audit:read', 'branch:read', 'campaign:read',
      'creditnote:read', 'csc:case:read', 'csc:master:read', 'csi:master:read',
      'csi:response:read', 'customer:read', 'dashboard:read', 'debitnote:read',
      'employee:read', 'enquiry:read', 'estimate:read', 'financereport:read',
      'inspection:read', 'invoice:read', 'jobcard:multi-vehicle:read', 'jobcard:read',
      'labour-item:read', 'notification:read', 'partissuance:read', 'partreturn:read',
      'partsale:read', 'payment:read', 'pdi:read', 'purchaserequest:read',
      'receipt:read', 'repeatjob:read', 'report:birthday-anniversary', 'report:booked-vs-availed',
      'report:business-product-mix', 'report:corporate-bills', 'report:credit-note-register', 'report:csc-followup',
      'report:csc-no-show', 'report:csc-not-visited', 'report:csi', 'report:csi-attribute',
      'report:csi-checklist', 'report:debit-note-register', 'report:delayed-deliveries', 'report:delivered-model',
      'report:delivered-service', 'report:engineer-part-consumption', 'report:engineer-performance', 'report:estimate-vs-job',
      'report:fpc-analysis', 'report:fpc-vehicles', 'report:group-productivity', 'report:job-analysis',
      'report:major-problems', 'report:management-information', 'report:mis-monthly', 'report:new-customers',
      'report:party-ledger', 'report:party-outstanding', 'report:party-outstanding-age', 'report:party-outstanding-bill',
      'report:promise-date-analysis', 'report:promise-date-discrepancy', 'report:promise-time-analysis', 'report:promise-time-discrepancy',
      'report:receipt-register', 'report:regular-customers', 'report:repeat-analysis', 'report:repeat-list',
      'report:repeat-summary', 'report:requisition-return-register', 'report:skipped-free-service', 'report:tax-register',
      'report:unbilled-parts', 'report:vehicle-history-card', 'report:vehicle-list', 'report:vehicle-resale',
      'report:warranty-attended', 'report:warranty-parts', 'requisition:read', 'role:read',
      'search:read', 'services:read', 'sparepart:cost:read', 'sparepart:read',
      'stock:read', 'stockaudit:read', 'stocktake:read', 'transfer:read',
      'user:read', 'vehicle:read', 'warranty:read', 'workshop:read'
    ])
), inserted_roles AS (
  INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, role_name, role_name || ' user role', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM role_defaults
  ON CONFLICT ("name") DO NOTHING
  RETURNING "id", "name"
), grants AS (
  SELECT r."id" AS role_id,
         unnest(t.permissions || CASE WHEN d.all_branches THEN ARRAY['branch:all'] ELSE ARRAY[]::text[] END) AS permission_name
  FROM inserted_roles r
  JOIN role_defaults d ON d.role_name = r."name"
  JOIN templates t ON t.template = d.template
), inserted_permissions AS (
  INSERT INTO "Permission" ("id", "name", "description", "createdAt")
  SELECT gen_random_uuid()::text, permission_name, 'Permission to perform ' || replace(permission_name, ':', ' ') || ' operations', CURRENT_TIMESTAMP
  FROM (SELECT DISTINCT permission_name FROM grants) names
  ON CONFLICT ("name") DO NOTHING
  RETURNING "id", "name"
), permission_ids AS (
  SELECT "id", "name" FROM inserted_permissions
  UNION ALL
  SELECT p."id", p."name"
  FROM "Permission" p
  WHERE p."name" IN (SELECT permission_name FROM grants)
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT g.role_id, p."id"
FROM grants g
JOIN permission_ids p ON p."name" = g.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
