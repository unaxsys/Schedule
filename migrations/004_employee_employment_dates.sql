ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE NULL;

UPDATE employees
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;
