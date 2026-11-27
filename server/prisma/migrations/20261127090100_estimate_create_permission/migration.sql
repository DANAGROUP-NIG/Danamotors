-- Job card revamp phase 5: the service advisor (and service manager) prepares and edits the staged
-- estimate, which needs estimate:create. Mirrors ROLE_PERMISSIONS; seed resets use the same defaults.
INSERT INTO "Permission" ("id", "name", "description")
VALUES (gen_random_uuid()::text, 'estimate:create', 'Create estimates')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON p.name = 'estimate:create'
WHERE r.name IN ('ServiceAdviser', 'ServiceManager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
