-- Migration: Add deduplication unique index on webhook_logs
-- Phase 4b: Safe migration that checks for dupes before creating index

-- Step 1: Create backup table for dedup cleanup (if needed)
CREATE TABLE IF NOT EXISTS webhook_logs_dedup_backup (
  LIKE webhook_logs INCLUDING ALL,
  run_id UUID NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2: Clean existing duplicates, then create unique index
DO $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  v_backed_up INTEGER;
  v_deleted INTEGER;
  v_has_dupes BOOLEAN;
BEGIN
  -- Check for existing duplicates
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT booking_id, action, status, webhook_source_timestamp
      FROM webhook_logs WHERE webhook_source_timestamp IS NOT NULL
      GROUP BY booking_id, action, status, webhook_source_timestamp
      HAVING count(*) > 1 LIMIT 1
    ) dupes
  ) INTO v_has_dupes;

  IF v_has_dupes THEN
    RAISE NOTICE 'Found duplicates. Backing up and cleaning with run_id %', v_run_id;

    -- Back up duplicate rows (keep earliest id per group)
    INSERT INTO webhook_logs_dedup_backup
    SELECT wl.*, v_run_id, now()
    FROM (
      SELECT *,
        row_number() OVER (
          PARTITION BY booking_id, action, status, webhook_source_timestamp
          ORDER BY id ASC
        ) AS rn
      FROM webhook_logs
      WHERE webhook_source_timestamp IS NOT NULL
    ) wl
    WHERE wl.rn > 1;

    GET DIAGNOSTICS v_backed_up = ROW_COUNT;
    RAISE NOTICE 'Backed up % duplicate rows', v_backed_up;

    -- Delete duplicates (keep earliest id per group)
    DELETE FROM webhook_logs
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          row_number() OVER (
            PARTITION BY booking_id, action, status, webhook_source_timestamp
            ORDER BY id ASC
          ) AS rn
        FROM webhook_logs
        WHERE webhook_source_timestamp IS NOT NULL
      ) ranked
      WHERE rn > 1
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate rows', v_deleted;
  ELSE
    RAISE NOTICE 'No duplicates found. Proceeding to create index.';
  END IF;

  -- Create the unique index
  CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_dedup
    ON webhook_logs (booking_id, action, status, webhook_source_timestamp)
    WHERE webhook_source_timestamp IS NOT NULL;

  RAISE NOTICE 'Dedup index created successfully.';
END $$;
