-- Job card revamp phase 7: the quality check is done by the workshop supervisor or the service
-- manager (confirmed decisions). Workshop managers (and general workshop managers, who inherit them)
-- already hold qcstatus:update; this adds the service manager.
-- Mirrors ROLE_PERMISSIONS; seed resets use the same defaults.
INSERT INTO "Permission" ("id", "name", "description")
VALUES (gen_random_uuid()::text, 'qcstatus:update', 'Record quality checks')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON p.name = 'qcstatus:update'
WHERE r.name = 'ServiceManager'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
