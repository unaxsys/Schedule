BEGIN;

UPDATE employees
SET sirv_period_months = 1
WHERE sirv_period_months IS NULL OR sirv_period_months < 1 OR sirv_period_months > 4;

UPDATE employees
SET workday_minutes = 480
WHERE workday_minutes IS NULL OR workday_minutes <= 0;

ALTER TABLE employees
ALTER COLUMN is_sirv SET NOT NULL,
ALTER COLUMN sirv_period_months SET NOT NULL,
ALTER COLUMN workday_minutes SET NOT NULL,
ALTER COLUMN is_sirv SET DEFAULT FALSE,
ALTER COLUMN sirv_period_months SET DEFAULT 1,
ALTER COLUMN workday_minutes SET DEFAULT 480;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_sirv_period_months_check'
      AND conrelid = 'employees'::regclass
  ) THEN
    ALTER TABLE employees
    ADD CONSTRAINT employees_sirv_period_months_check
    CHECK (sirv_period_months BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_workday_minutes_check'
      AND conrelid = 'employees'::regclass
  ) THEN
    ALTER TABLE employees
    ADD CONSTRAINT employees_workday_minutes_check
    CHECK (workday_minutes > 0);
  END IF;
END $$;

COMMIT;
