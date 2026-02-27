-- Production schedule hardening: snapshot minutes, lock workflow, audit trail, and tenant-safe shifts.

ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS shift_id UUID NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS work_minutes INTEGER NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS night_minutes INTEGER NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS holiday_minutes INTEGER NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS weekend_minutes INTEGER NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE IF EXISTS schedule_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS schedules ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'draft';
ALTER TABLE IF EXISTS schedules ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS schedules ADD COLUMN IF NOT EXISTS locked_by UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedules_status_check'
      AND conrelid = 'schedules'::regclass
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_status_check CHECK (status IN ('draft', 'locked'));
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  schedule_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  old_shift_code VARCHAR(8) NULL,
  new_shift_code VARCHAR(8) NULL,
  old_shift_id UUID NULL,
  new_shift_id UUID NULL,
  action VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NULL
);

ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS schedule_id UUID NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS employee_id UUID NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS entry_date DATE NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS old_shift_code VARCHAR(8) NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS new_shift_code VARCHAR(8) NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS old_shift_id UUID NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS new_shift_id UUID NULL;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

CREATE TABLE IF NOT EXISTS shift_templates_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(8) NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  is_night BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'shift_templates'
      AND column_name = 'tenant_id'
  ) THEN
    INSERT INTO shift_templates_v2 (tenant_id, code, name, start_time, end_time)
    SELECT st.tenant_id,
           UPPER(TRIM(st.code)),
           st.name,
           COALESCE(NULLIF(st.start_time::text, '')::time, TIME '00:00'),
           COALESCE(NULLIF(st.end_time::text, '')::time, TIME '00:00')
    FROM shift_templates st
    WHERE st.tenant_id IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          updated_at = NOW();
  END IF;
END $$;
