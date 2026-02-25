ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE employees
SET base_vacation_allowance = GREATEST(vacation_allowance - 6, 0)
WHERE (telk = TRUE OR young_worker_benefit = TRUE)
  AND base_vacation_allowance = 20
  AND vacation_allowance >= 26;
