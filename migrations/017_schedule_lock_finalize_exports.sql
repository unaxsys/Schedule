-- Lock/finalize lifecycle hardening (tenant-safe, backward compatible)
ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS lock_note TEXT NULL;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS locked_by UUID NULL;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS sirv_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS sirv_period_months INTEGER NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS work_minutes_total INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS night_minutes INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS weekend_minutes INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS holiday_minutes INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS overtime_estimated_minutes INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS audit_log
  ADD COLUMN IF NOT EXISTS event_type TEXT NULL;

ALTER TABLE IF EXISTS audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedules')
     AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'schedules_sirv_period_months_check'
        AND conrelid = 'schedules'::regclass
    ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_sirv_period_months_check CHECK (sirv_period_months BETWEEN 1 AND 4);
  END IF;
END $$;
