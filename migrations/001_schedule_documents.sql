BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  department TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'schedule_entries'
      AND column_name = 'month_key'
  ) THEN
    ALTER TABLE schedule_entries RENAME TO schedule_entries_legacy;

    CREATE TABLE schedule_entries (
      schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
      PRIMARY KEY (schedule_id, employee_id, day)
    );

    INSERT INTO schedules (name, month_key, department, status)
    SELECT DISTINCT
      'Общ график ' || month_key,
      month_key,
      NULL,
      'draft'
    FROM schedule_entries_legacy se
    ON CONFLICT DO NOTHING;

    INSERT INTO schedule_entries (schedule_id, employee_id, day, shift_code)
    SELECT s.id, se.employee_id, se.day, se.shift_code
    FROM schedule_entries_legacy se
    JOIN schedules s
      ON s.month_key = se.month_key
     AND s.department IS NULL
    ON CONFLICT (schedule_id, employee_id, day)
    DO UPDATE SET shift_code = EXCLUDED.shift_code;

    DROP TABLE schedule_entries_legacy;
  ELSE
    CREATE TABLE IF NOT EXISTS schedule_entries (
      schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
      PRIMARY KEY (schedule_id, employee_id, day)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedules_month_key ON schedules(month_key);
CREATE INDEX IF NOT EXISTS idx_schedules_month_department ON schedules(month_key, department);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_employee ON schedule_entries(employee_id);

COMMIT;
