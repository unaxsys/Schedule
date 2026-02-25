BEGIN;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE employees
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

ALTER TABLE employees
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN base_vacation_allowance SET DEFAULT 20,
  ALTER COLUMN telk SET DEFAULT FALSE,
  ALTER COLUMN young_worker_benefit SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_employment_period_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_employment_period_check
      CHECK (end_date IS NULL OR end_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date);
CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date);
CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schedule_entries_employee_id_fkey'
      AND conrelid = 'schedule_entries'::regclass
  ) THEN
    ALTER TABLE schedule_entries
      DROP CONSTRAINT schedule_entries_employee_id_fkey;
  END IF;

  ALTER TABLE schedule_entries
    ADD CONSTRAINT schedule_entries_employee_id_fkey
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
