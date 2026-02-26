ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
