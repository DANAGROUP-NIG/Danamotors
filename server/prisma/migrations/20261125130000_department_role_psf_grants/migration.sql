-- Grant PSF access inherited by the new department roles.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('GeneralWorkshopManager', 'psf:read'),
  ('GeneralWorkshopManager', 'report:psf-analysis'),
  ('GeneralWorkshopManager', 'report:psf-analysis-model'),
  ('GeneralWorkshopManager', 'report:psf-closed'),
  ('GeneralWorkshopManager', 'report:psf-dissatisfied'),
  ('GeneralWorkshopManager', 'report:psf-history'),
  ('GeneralCCUManager', 'psf:letter'),
  ('GeneralCCUManager', 'psf:read'),
  ('GeneralCCUManager', 'psf:update'),
  ('GeneralCCUManager', 'report:psf-analysis'),
  ('GeneralCCUManager', 'report:psf-analysis-model'),
  ('GeneralCCUManager', 'report:psf-closed'),
  ('GeneralCCUManager', 'report:psf-dissatisfied'),
  ('GeneralCCUManager', 'report:psf-history'),
  ('AuditOfficer', 'psf:read'),
  ('AuditOfficer', 'report:psf-analysis'),
  ('AuditOfficer', 'report:psf-analysis-model'),
  ('AuditOfficer', 'report:psf-closed'),
  ('AuditOfficer', 'report:psf-dissatisfied'),
  ('AuditOfficer', 'report:psf-history'),
  ('AuditManager', 'psf:read'),
  ('AuditManager', 'report:psf-analysis'),
  ('AuditManager', 'report:psf-analysis-model'),
  ('AuditManager', 'report:psf-closed'),
  ('AuditManager', 'report:psf-dissatisfied'),
  ('AuditManager', 'report:psf-history'),
  ('GeneralAuditManager', 'psf:read'),
  ('GeneralAuditManager', 'report:psf-analysis'),
  ('GeneralAuditManager', 'report:psf-analysis-model'),
  ('GeneralAuditManager', 'report:psf-closed'),
  ('GeneralAuditManager', 'report:psf-dissatisfied'),
  ('GeneralAuditManager', 'report:psf-history')
) AS grants(role_name, permission_name)
JOIN "Role" r ON r."name" = grants.role_name
JOIN "Permission" p ON p."name" = grants.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
