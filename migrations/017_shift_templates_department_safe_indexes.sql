BEGIN;

ALTER TABLE IF EXISTS shift_templates
  ADD COLUMN IF NOT EXISTS department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shift_templates_department_id
  ON shift_templates(department_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_tenant_department_code_unique_v2
  ON shift_templates(tenant_id, department_id, code)
  WHERE department_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_tenant_global_code_unique_v2
  ON shift_templates(tenant_id, code)
  WHERE department_id IS NULL;

COMMIT;
