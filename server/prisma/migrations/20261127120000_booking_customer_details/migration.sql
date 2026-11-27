BEGIN;

ALTER TABLE "Customer"
    ADD COLUMN IF NOT EXISTS "tin" TEXT,
    ADD COLUMN IF NOT EXISTS "nin" TEXT;

-- Customer identifiers must never enter the change log.
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
        CONTINUE WHEN TG_TABLE_NAME = 'Customer' AND v_field IN ('tin', 'nin');
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

COMMIT;
