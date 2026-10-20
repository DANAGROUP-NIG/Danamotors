BEGIN;
CREATE INDEX IF NOT EXISTS "JobCard_deliveredAt_idx" ON "JobCard"("deliveredAt");
CREATE INDEX IF NOT EXISTS "JobCard_appointmentId_idx" ON "JobCard"("appointmentId");
CREATE INDEX IF NOT EXISTS "JobCardLine_kind_chargeType_createdAt_idx" ON "JobCardLine"(kind,"chargeType","createdAt");
CREATE INDEX IF NOT EXISTS "Invoice_issuedDate_idx" ON "Invoice"("issuedDate");
INSERT INTO "Permission" (id,name,description,"createdAt") SELECT md5('issue79:' || p)::uuid::text,p,'Workshop monthly report',CURRENT_TIMESTAMP FROM unnest(ARRAY['report:tax-register','report:booked-vs-availed','report:estimate-vs-job','report:unbilled-parts','report:corporate-bills','report:delivered-model','report:delivered-service','report:warranty-attended','report:warranty-parts','report:vehicle-history-card','corporate:manage']) p ON CONFLICT (name) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE p.name IN ('report:tax-register','report:booked-vs-availed','report:estimate-vs-job','report:unbilled-parts','report:corporate-bills','report:delivered-model','report:delivered-service','report:warranty-attended','report:warranty-parts','report:vehicle-history-card','corporate:manage') AND (r.name IN ('Admin','SuperAdmin','WorkshopManager') OR (r.name IN ('Accountant','BillingOfficer') AND p.name IN ('report:tax-register','report:corporate-bills','report:unbilled-parts')) OR (r.name='WarrantyOfficer' AND p.name IN ('report:warranty-attended','report:warranty-parts')) OR (r.name='ServiceAdviser' AND p.name IN ('report:vehicle-history-card','report:delivered-model','report:delivered-service'))) ON CONFLICT DO NOTHING;
-- History can include PDI only with this explicit permission (issue #69).
INSERT INTO "Permission" (id,name,description,"createdAt") VALUES (md5('issue79:pdi:read')::uuid::text,'pdi:read','Read internal PDI records',CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE r.name IN ('Admin','SuperAdmin') AND p.name='pdi:read' ON CONFLICT DO NOTHING;
COMMIT;
