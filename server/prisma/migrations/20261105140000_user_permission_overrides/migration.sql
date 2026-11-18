-- ============================================================
-- Per-user rights (gap analysis §2, §3).
-- 1. UserPermission: per-user overrides of the role. Effective permissions are role + GRANT - DENY.
-- 2. Change log: a grant or deny is logged as a Modify of the User, field "permission".
-- 3. The read-only Auditor role: every *:read permission and the reports, never a write.
-- Additive and idempotent.
-- ============================================================

DO $$ BEGIN
    CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'DENY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserPermission" (
    "userId"       TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect"       "PermissionEffect" NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId", "permissionId"),
    CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- 2. Logged on the user, like role permissions are logged on the role: old/new read "GRANT invoice:read".
CREATE OR REPLACE FUNCTION change_log_user_permission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user_id TEXT;
    v_old     TEXT;
    v_new     TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN v_user_id := OLD."userId"; ELSE v_user_id := NEW."userId"; END IF;
    IF TG_OP = 'UPDATE' AND OLD."userId" = NEW."userId" AND OLD."permissionId" = NEW."permissionId"
       AND OLD."effect" = NEW."effect" THEN
        RETURN NULL;
    END IF;
    IF TG_OP <> 'INSERT' THEN
        SELECT OLD."effect"::text || ' ' || COALESCE(p.name, OLD."permissionId") INTO v_old
        FROM (SELECT 1) one LEFT JOIN "Permission" p ON p.id = OLD."permissionId";
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT NEW."effect"::text || ' ' || COALESCE(p.name, NEW."permissionId") INTO v_new
        FROM (SELECT 1) one LEFT JOIN "Permission" p ON p.id = NEW."permissionId";
    END IF;
    SELECT concat_ws(' ', u."firstName", u."lastName", '<' || u.email || '>') INTO v_label
    FROM "User" u WHERE u.id = v_user_id;
    PERFORM change_log_write('User', v_user_id, COALESCE(v_label, v_user_id), 'UPDATE',
        jsonb_build_array(jsonb_build_object('field', 'permission', 'old', to_jsonb(v_old), 'new', to_jsonb(v_new))));
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "UserPermission_change_log" ON "UserPermission";
CREATE TRIGGER "UserPermission_change_log" AFTER INSERT OR UPDATE OR DELETE ON "UserPermission" FOR EACH ROW
    EXECUTE FUNCTION change_log_user_permission();

-- 3. Auditor (legacy Auditormast). Same rule as ROLE_PERMISSIONS in roles.ts; the role seed rebuilds it.
INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Auditor', 'Read-only access to every module and the reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON (p.name LIKE '%:read' OR p.name LIKE 'report:%') AND p.name <> 'report:settings'
WHERE r.name = 'Auditor'
ON CONFLICT DO NOTHING;
