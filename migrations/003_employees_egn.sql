BEGIN;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS egn CHAR(10) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_egn_unique
  ON employees(egn)
  WHERE egn IS NOT NULL;

COMMIT;
