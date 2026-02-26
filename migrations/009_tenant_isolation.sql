ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'departments'::regclass AND conname = 'departments_name_key') THEN
    ALTER TABLE departments DROP CONSTRAINT departments_name_key;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_schedules_month_department;
DROP INDEX IF EXISTS idx_employees_egn_unique;

-- Best-effort backfill based on existing employee links.
UPDATE departments d
SET tenant_id = m.tenant_id
FROM (
  SELECT e.department_id, MIN(e.tenant_id) AS tenant_id
  FROM employees e
  WHERE e.department_id IS NOT NULL AND e.tenant_id IS NOT NULL
  GROUP BY e.department_id
) m
WHERE d.id = m.department_id
  AND d.tenant_id IS NULL;

UPDATE schedules s
SET tenant_id = m.tenant_id
FROM (
  SELECT e2.tenant_id, s2.id AS schedule_id
  FROM schedules s2
  JOIN schedule_entries se ON se.schedule_id = s2.id
  JOIN employees e2 ON e2.id = se.employee_id
  WHERE e2.tenant_id IS NOT NULL
  GROUP BY e2.tenant_id, s2.id
) m
WHERE s.id = m.schedule_id
  AND s.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_id ON schedules(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_tenant_name_unique ON departments(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_tenant_month_department_unique ON schedules(tenant_id, month_key, department);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_egn_unique ON employees(tenant_id, egn) WHERE egn IS NOT NULL;
