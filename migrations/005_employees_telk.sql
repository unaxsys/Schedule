ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE employees
SET base_vacation_allowance = GREATEST(vacation_allowance - 6, 0)
WHERE telk = TRUE
  AND base_vacation_allowance = 20
  AND vacation_allowance >= 26;
