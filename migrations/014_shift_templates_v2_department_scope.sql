BEGIN;

ALTER TABLE IF EXISTS shift_templates_v2
  ADD COLUMN IF NOT EXISTS department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_v2_tenant_department_code_unique
  ON shift_templates_v2(tenant_id, department_id, code)
  WHERE department_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_v2_tenant_global_code_unique
  ON shift_templates_v2(tenant_id, code)
  WHERE department_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_shift_templates_v2_tenant_department_id
  ON shift_templates_v2(tenant_id, department_id);

COMMIT;
