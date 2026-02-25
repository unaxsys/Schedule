CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT NULL,
  department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT NOT NULL,
  egn CHAR(10) NULL,
  vacation_allowance INTEGER NOT NULL DEFAULT 20,
  base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
  telk BOOLEAN NOT NULL DEFAULT FALSE,
  young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT employees_employment_period_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_egn_unique ON employees(egn) WHERE egn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date);
CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date);
CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  department TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  shift_code VARCHAR(16) NOT NULL,
  PRIMARY KEY (schedule_id, employee_id, day)
);

CREATE TABLE IF NOT EXISTS shift_templates (
  code VARCHAR(16) PRIMARY KEY,
  name TEXT NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  hours NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  eik TEXT NOT NULL DEFAULT '',
  owner_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS tenant_users (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  actor_user_id UUID NULL,
  action TEXT NOT NULL,
  entity TEXT NULL,
  entity_id TEXT NULL,
  before_json JSONB NULL,
  after_json JSONB NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  user_id UUID NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log(created_at DESC);
