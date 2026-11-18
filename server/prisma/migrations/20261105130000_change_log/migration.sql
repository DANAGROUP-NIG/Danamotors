-- Field-level change log (Data Management gap analysis §1; legacy UserActivity + Tgr_*Trans triggers).
--
-- Postgres triggers on master tables and document heads write one ChangeLog row per inserted, updated or
-- deleted record, with the changed fields and their old and new values. The API sets `app.user_id` in each
-- write transaction (src/prisma/client.ts) and connects with application_name 'danamotors-api'. A change
-- from any other connection (psql, pgAdmin, a script) is stored with source = 'DB': legacy's
-- "Show Back End Updations Only".
--
-- Password hashes and reset tokens are never stored: a change to them is recorded as {"field", "masked": true}.
-- The table is append-only. Rows can be deleted only by a retention job that sets app.change_log_purge = 'on'
-- (doc/audit-log.md).

CREATE TABLE "ChangeLog" (
    "id"          BIGSERIAL PRIMARY KEY,
    "at"          TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    "entity"      TEXT NOT NULL,
    "recordId"    TEXT NOT NULL,
    "recordLabel" TEXT,
    "action"      TEXT NOT NULL CHECK ("action" IN ('INSERT', 'UPDATE', 'DELETE')),
    "changes"     JSONB NOT NULL DEFAULT '[]'::jsonb,
    "userId"      TEXT,
    "source"      TEXT NOT NULL CHECK ("source" IN ('APP', 'DB')),
    "txId"        BIGINT NOT NULL DEFAULT txid_current(),
    "dbUser"      TEXT,
    "appName"     TEXT,
    "clientAddr"  TEXT
);

CREATE INDEX "ChangeLog_at_idx" ON "ChangeLog" ("at");
CREATE INDEX "ChangeLog_entity_recordId_idx" ON "ChangeLog" ("entity", "recordId");
CREATE INDEX "ChangeLog_userId_at_idx" ON "ChangeLog" ("userId", "at");
CREATE INDEX "ChangeLog_txId_idx" ON "ChangeLog" ("txId");
CREATE INDEX "ChangeLog_db_source_at_idx" ON "ChangeLog" ("at") WHERE "source" = 'DB';

-- Who and where: shared by both capture functions.
CREATE OR REPLACE FUNCTION change_log_write(
    p_entity TEXT, p_record_id TEXT, p_label TEXT, p_action TEXT, p_changes JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_user TEXT := NULLIF(current_setting('app.user_id', true), '');
    v_app  TEXT := current_setting('application_name', true);
BEGIN
    INSERT INTO "ChangeLog" ("entity", "recordId", "recordLabel", "action", "changes", "userId", "source",
                             "dbUser", "appName", "clientAddr")
    VALUES (p_entity, COALESCE(p_record_id, ''), LEFT(p_label, 300), p_action, p_changes, v_user,
            CASE WHEN v_user IS NOT NULL OR v_app = 'danamotors-api' THEN 'APP' ELSE 'DB' END,
            session_user, NULLIF(v_app, ''), host(inet_client_addr()));
END;
$$;

-- Generic row trigger. TG_ARGV[0]: SQL expression for the record id, over the row aliased "r".
-- TG_ARGV[1] (optional): SQL expression for a readable label (number, code, name).
CREATE OR REPLACE FUNCTION change_log_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_row     RECORD;
    v_old     JSONB;
    v_new     JSONB;
    v_changes JSONB := '[]'::jsonb;
    v_field   TEXT;
    v_o       JSONB;
    v_n       JSONB;
    v_id      TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

    FOR v_field IN
        SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = TG_RELID AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    LOOP
        CONTINUE WHEN v_field IN ('createdAt', 'updatedAt', 'requestHash', 'idempotencyKey');
        v_o := v_old -> v_field;
        v_n := v_new -> v_field;
        CONTINUE WHEN v_o IS NOT DISTINCT FROM v_n;
        -- An insert lists the fields it set, a delete the fields the record had: nulls add nothing.
        CONTINUE WHEN TG_OP = 'INSERT' AND jsonb_typeof(v_n) = 'null';
        CONTINUE WHEN TG_OP = 'DELETE' AND jsonb_typeof(v_o) = 'null';
        IF v_field IN ('passwordHash', 'resetTokenHash', 'resetTokenExpiry') OR v_field ILIKE '%token%' THEN
            v_changes := v_changes || jsonb_build_object('field', v_field, 'masked', true);
        ELSE
            IF length(v_o::text) > 2000 THEN v_o := to_jsonb('(' || length(v_o::text) || ' characters)'); END IF;
            IF length(v_n::text) > 2000 THEN v_n := to_jsonb('(' || length(v_n::text) || ' characters)'); END IF;
            v_changes := v_changes || jsonb_build_object('field', v_field, 'old', v_o, 'new', v_n);
        END IF;
    END LOOP;

    -- Only updatedAt (or nothing) changed: not worth a row.
    IF TG_OP = 'UPDATE' AND v_changes = '[]'::jsonb THEN RETURN NULL; END IF;

    EXECUTE format('SELECT (%s)::text, (%s)::text FROM (SELECT ($1).*) r',
                   TG_ARGV[0], COALESCE(NULLIF(TG_ARGV[1], ''), 'NULL'))
        INTO v_id, v_label USING v_row;

    PERFORM change_log_write(TG_TABLE_NAME, v_id, v_label, TG_OP, v_changes);
    RETURN NULL;
END;
$$;

-- Role permissions are logged on the role: a grant or revoke is an UPDATE of the Role with
-- {"field": "permission", "old": <name or null>, "new": <name or null>}.
CREATE OR REPLACE FUNCTION change_log_role_permission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_role_id TEXT;
    v_perm_id TEXT;
    v_perm    TEXT;
    v_role    TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_role_id := OLD."roleId"; v_perm_id := OLD."permissionId";
    ELSE
        v_role_id := NEW."roleId"; v_perm_id := NEW."permissionId";
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."roleId" = NEW."roleId" AND OLD."permissionId" = NEW."permissionId" THEN
        RETURN NULL;
    END IF;
    SELECT name INTO v_perm FROM "Permission" WHERE id = v_perm_id;
    SELECT name INTO v_role FROM "Role" WHERE id = v_role_id;
    PERFORM change_log_write('Role', v_role_id, v_role, 'UPDATE',
        jsonb_build_array(jsonb_build_object(
            'field', 'permission',
            'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(COALESCE(v_perm, v_perm_id)) END,
            'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(COALESCE(v_perm, v_perm_id)) END)));
    RETURN NULL;
END;
$$;

-- Append-only. The retention job (doc/audit-log.md) sets app.change_log_purge = 'on' for its transaction.
CREATE OR REPLACE FUNCTION change_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF COALESCE(current_setting('app.change_log_purge', true), '') <> 'on' THEN
        RAISE EXCEPTION 'ChangeLog is append-only';
    END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER "ChangeLog_guard" BEFORE UPDATE OR DELETE ON "ChangeLog"
    FOR EACH ROW EXECUTE FUNCTION change_log_guard();
CREATE TRIGGER "ChangeLog_guard_truncate" BEFORE TRUNCATE ON "ChangeLog"
    FOR EACH STATEMENT EXECUTE FUNCTION change_log_guard();

-- ── Masters ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER "User_change_log" AFTER INSERT OR UPDATE OR DELETE ON "User" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r."firstName", r."lastName", ''<'' || r.email || ''>'')');
CREATE TRIGGER "Role_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Role" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r.name');
CREATE TRIGGER "RolePermission_change_log" AFTER INSERT OR UPDATE OR DELETE ON "RolePermission" FOR EACH ROW
    EXECUTE FUNCTION change_log_role_permission();
CREATE TRIGGER "Customer_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Customer" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, NULLIF(r."companyName", ''''), r."firstName", r."lastName")');
CREATE TRIGGER "Vehicle_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Vehicle" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' · '', r."registrationNumber", r.vin)');
CREATE TRIGGER "SparePart_change_log" AFTER INSERT OR UPDATE OR DELETE ON "SparePart" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r."partNumber", r.name)');
CREATE TRIGGER "LabourItem_change_log" AFTER INSERT OR UPDATE OR DELETE ON "LabourItem" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.description)');
CREATE TRIGGER "LabourRate_change_log" AFTER INSERT OR UPDATE OR DELETE ON "LabourRate" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id',
        'concat_ws('' · '', (SELECT l.code FROM "LabourItem" l WHERE l.id = r."labourItemId"), (SELECT m.description FROM "WorkshopMaster" m WHERE m.id = r."modelId"))');
CREATE TRIGGER "WorkshopMaster_change_log" AFTER INSERT OR UPDATE OR DELETE ON "WorkshopMaster" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.kind, r.code, r.description)');
CREATE TRIGGER "VehicleModel_change_log" AFTER INSERT OR UPDATE OR DELETE ON "VehicleModel" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "Branch_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Branch" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "BranchSettings_change_log" AFTER INSERT OR UPDATE OR DELETE ON "BranchSettings" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r."branchId"', '(SELECT b.name FROM "Branch" b WHERE b.id = r."branchId")');
CREATE TRIGGER "Employee_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Employee" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "FinanceSetting_change_log" AFTER INSERT OR UPDATE OR DELETE ON "FinanceSetting" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.key', 'r.key');
CREATE TRIGGER "ReportSetting_change_log" AFTER INSERT OR UPDATE OR DELETE ON "ReportSetting" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.key', 'r.key');
CREATE TRIGGER "DocumentTerms_change_log" AFTER INSERT OR UPDATE OR DELETE ON "DocumentTerms" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' · '', r.type, (SELECT b.name FROM "Branch" b WHERE b.id = r."branchId"))');
CREATE TRIGGER "MileageBand_change_log" AFTER INSERT OR UPDATE OR DELETE ON "MileageBand" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r.label');
CREATE TRIGGER "Bank_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Bank" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "PartCategory_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartCategory" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.code', 'concat_ws('' '', r.code, r.description)');
CREATE TRIGGER "PartCategoryBranchSetting_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartCategoryBranchSetting" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r."categoryCode" || '':'' || r."branchId"',
        'concat_ws('' · '', r."categoryCode", (SELECT b.name FROM "Branch" b WHERE b.id = r."branchId"))');
CREATE TRIGGER "PartTaxCategory_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartTaxCategory" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.code', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "CorporateGroup_change_log" AFTER INSERT OR UPDATE OR DELETE ON "CorporateGroup" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.name)');
CREATE TRIGGER "TallyAccountMapping_change_log" AFTER INSERT OR UPDATE OR DELETE ON "TallyAccountMapping" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' · '', r."documentType", r."accountType")');
CREATE TRIGGER "ServiceTypeModelSetting_change_log" AFTER INSERT OR UPDATE OR DELETE ON "ServiceTypeModelSetting" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id',
        'concat_ws('' · '', (SELECT s.description FROM "WorkshopMaster" s WHERE s.id = r."serviceTypeId"), (SELECT m.description FROM "WorkshopMaster" m WHERE m.id = r."modelId"))');
CREATE TRIGGER "Campaign_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Campaign" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'concat_ws('' '', r.code, r.title)');

-- ── Document heads ──────────────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER "JobCard_change_log" AFTER INSERT OR UPDATE OR DELETE ON "JobCard" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."jobNumber"');
CREATE TRIGGER "Estimate_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Estimate" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."estimateNumber"');
CREATE TRIGGER "Invoice_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Invoice" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."invoiceNumber"');
CREATE TRIGGER "Receipt_change_log" AFTER INSERT OR UPDATE OR DELETE ON "Receipt" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."receiptNumber"');
CREATE TRIGGER "PartyNote_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartyNote" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r.number');
CREATE TRIGGER "CustomerOrder_change_log" AFTER INSERT OR UPDATE OR DELETE ON "CustomerOrder" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."cpoNumber"');
CREATE TRIGGER "CounterSaleReturn_change_log" AFTER INSERT OR UPDATE OR DELETE ON "CounterSaleReturn" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."returnNumber"');
CREATE TRIGGER "BranchIndent_change_log" AFTER INSERT OR UPDATE OR DELETE ON "BranchIndent" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."indentNumber"');
CREATE TRIGGER "StockTransferNote_change_log" AFTER INSERT OR UPDATE OR DELETE ON "StockTransferNote" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."stnNumber"');
CREATE TRIGGER "MaterialInTransit_change_log" AFTER INSERT OR UPDATE OR DELETE ON "MaterialInTransit" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."mitNumber"');
CREATE TRIGGER "MaterialReceiptNote_change_log" AFTER INSERT OR UPDATE OR DELETE ON "MaterialReceiptNote" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."mrnNumber"');
CREATE TRIGGER "PartRequisition_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartRequisition" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."requisitionNumber"');
CREATE TRIGGER "PartReturnSlip_change_log" AFTER INSERT OR UPDATE OR DELETE ON "PartReturnSlip" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."returnNumber"');
CREATE TRIGGER "StockTake_change_log" AFTER INSERT OR UPDATE OR DELETE ON "StockTake" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."batchNumber"');
CREATE TRIGGER "WarrantyCase_change_log" AFTER INSERT OR UPDATE OR DELETE ON "WarrantyCase" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."caseNumber"');
