CREATE TABLE jobcard_notification_events (
  id TEXT PRIMARY KEY,
  "jobCardId" TEXT NOT NULL,
  "actorId" TEXT,
  before JSONB,
  after JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE INDEX jobcard_notification_events_pending ON jobcard_notification_events ("processedAt", "createdAt");
CREATE INDEX jobcard_notification_events_job ON jobcard_notification_events ("jobCardId", "createdAt");
CREATE TABLE jobcard_notification_audit (
  id TEXT PRIMARY KEY,
  "jobCardId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in-app',
  status TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventId", "eventType", "recipientId", channel)
);
CREATE INDEX jobcard_notification_audit_job ON jobcard_notification_audit ("jobCardId", "createdAt");
CREATE TABLE notification_failures (
  id TEXT PRIMARY KEY,
  "jobCardId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Deferred until commit so nested status-history writes are available. This is
-- notification capture only: it does not modify JobCard, workflow or permissions.
CREATE FUNCTION capture_jobcard_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous JSONB := NULL;
  actor TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.status, OLD."technicianId", OLD."qualityInspectorId", OLD."qcStatus") IS NOT DISTINCT FROM
       ROW(NEW.status, NEW."technicianId", NEW."qualityInspectorId", NEW."qcStatus") THEN RETURN NULL; END IF;
    previous := to_jsonb(OLD);
  END IF;
  actor := NULLIF(current_setting('app.notification_actor', true), '');
  IF actor IS NULL THEN
    SELECT h."actorId" INTO actor FROM "JobCardStatusHistory" h
    WHERE h."jobCardId" = NEW.id AND h."toStatus" = NEW.status
      -- xmin identifies this transaction without timestamp precision/timezone
      -- assumptions (Prisma may provide client-side UTC timestamps).
      AND h.xmin::text::bigint = (txid_current() % 4294967296)
    ORDER BY h."createdAt" DESC, h.id DESC LIMIT 1;
  END IF;
  IF TG_OP = 'INSERT' THEN actor := COALESCE(actor, NEW."createdById"); END IF;
  INSERT INTO jobcard_notification_events(id, "jobCardId", "actorId", before, after, "createdAt")
    VALUES (gen_random_uuid()::text, NEW.id, actor, previous, to_jsonb(NEW), clock_timestamp() AT TIME ZONE 'UTC');
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER jobcard_notification_capture
AFTER INSERT OR UPDATE ON "JobCard" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION capture_jobcard_notification();
