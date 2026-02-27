CREATE TABLE IF NOT EXISTS leave_types (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  affects_norm BOOLEAN NOT NULL DEFAULT TRUE,
  counts_as_work BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS employee_leaves (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id BIGINT NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  minutes_per_day INTEGER NULL,
  note TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_leaves_range_check CHECK (date_from <= date_to)
);

ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS affects_norm BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS counts_as_work BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS color TEXT NULL;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE employee_leaves ADD COLUMN IF NOT EXISTS minutes_per_day INTEGER NULL;
ALTER TABLE employee_leaves ADD COLUMN IF NOT EXISTS note TEXT NULL;
ALTER TABLE employee_leaves ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE employee_leaves ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_tenant_code_unique ON leave_types(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_tenant_employee_range ON employee_leaves(tenant_id, employee_id, date_from, date_to);
