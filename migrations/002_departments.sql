BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_department_id_fkey'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_department_id_fkey
      FOREIGN KEY (department_id)
      REFERENCES departments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);

INSERT INTO departments (name)
VALUES ('Производство'), ('Администрация'), ('Продажби')
ON CONFLICT (name) DO NOTHING;

UPDATE employees e
SET department_id = d.id
FROM departments d
WHERE e.department_id IS NULL
  AND NULLIF(TRIM(e.department), '') IS NOT NULL
  AND d.name = TRIM(e.department);

COMMIT;
