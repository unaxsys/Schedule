BEGIN;

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS is_sirv BOOLEAN DEFAULT false;

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS sirv_period_months INTEGER DEFAULT 1;

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS workday_minutes INTEGER DEFAULT 480;

UPDATE employees
SET is_sirv = COALESCE(is_sirv, FALSE),
    sirv_period_months = CASE WHEN sirv_period_months IN (1,2,3,4) THEN sirv_period_months ELSE 1 END,
    workday_minutes = CASE WHEN workday_minutes > 0 THEN workday_minutes ELSE 480 END
WHERE is_sirv IS NULL
   OR sirv_period_months IS NULL
   OR workday_minutes IS NULL
   OR sirv_period_months NOT IN (1,2,3,4)
   OR workday_minutes <= 0;

ALTER TABLE employees
ALTER COLUMN is_sirv SET DEFAULT FALSE,
ALTER COLUMN sirv_period_months SET DEFAULT 1,
ALTER COLUMN workday_minutes SET DEFAULT 480;

COMMIT;
