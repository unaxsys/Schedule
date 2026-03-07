CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department TEXT NULL,
  department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT NOT NULL,
  egn CHAR(10) NULL,
  vacation_allowance INTEGER NOT NULL DEFAULT 20,
  base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
  telk BOOLEAN NOT NULL DEFAULT FALSE,
  young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE,
  is_sirv BOOLEAN NOT NULL DEFAULT FALSE,
  sirv_period_months INTEGER NOT NULL DEFAULT 1,
  workday_minutes INTEGER NOT NULL DEFAULT 480,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT employees_employment_period_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_egn_unique ON employees(tenant_id, egn) WHERE egn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date);
CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date);
CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  department TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, month_key, department)
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  shift_code VARCHAR(16) NOT NULL,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  PRIMARY KEY (schedule_id, employee_id, day)
);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_month_key ON schedule_entries(month_key);

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
  minutes_per_day INT NULL,
  note TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_leaves_range_check CHECK (date_from <= date_to)
);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_tenant_employee_range ON employee_leaves(tenant_id, employee_id, date_from, date_to);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_tenant_code_unique ON leave_types(tenant_id, code);

CREATE TABLE IF NOT EXISTS shift_templates (
  code VARCHAR(16) PRIMARY KEY,
  name TEXT NOT NULL,
  start_time CHAR(5) NOT NULL,
  end_time CHAR(5) NOT NULL,
  hours NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_id ON schedules(tenant_id);

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

CREATE TABLE IF NOT EXISTS holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  is_official BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_holidays (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  is_working_day_override BOOLEAN NOT NULL DEFAULT FALSE,
  is_company_day_off BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_holidays_tenant_id_date ON tenant_holidays(tenant_id, date);


CREATE TABLE IF NOT EXISTS calculation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'department', 'schedule', 'platform')),
  priority INTEGER NOT NULL DEFAULT 100,
  conflict_resolution TEXT NOT NULL DEFAULT 'highest-priority-wins',
  department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
  schedule_id UUID NULL REFERENCES schedules(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  calculation_mode TEXT NOT NULL DEFAULT 'worked-hours',
  worked_day_rule TEXT NOT NULL DEFAULT 'working-shift-and-minutes',
  holiday_mode TEXT NOT NULL DEFAULT 'segments-only',
  weekend_mode TEXT NOT NULL DEFAULT 'segments-only',
  night_mode TEXT NOT NULL DEFAULT 'range-22-06',
  include_break_in_worked_hours BOOLEAN NOT NULL DEFAULT FALSE,
  sum_split_intervals BOOLEAN NOT NULL DEFAULT TRUE,
  holiday_only_worked_segments BOOLEAN NOT NULL DEFAULT TRUE,
  weekend_only_worked_segments BOOLEAN NOT NULL DEFAULT TRUE,
  exclude_non_working_codes_from_worked_day BOOLEAN NOT NULL DEFAULT TRUE,
  use_shift_id_priority BOOLEAN NOT NULL DEFAULT TRUE,
  scope_aware_fallback BOOLEAN NOT NULL DEFAULT TRUE,
  non_working_codes TEXT NOT NULL DEFAULT '',
  working_codes TEXT NOT NULL DEFAULT '',
  formula_text TEXT NOT NULL DEFAULT '',
  rule_editor_draft JSONB NULL,
  rule_editor_published JSONB NULL,
  rule_editor_version INTEGER NOT NULL DEFAULT 1,
  rule_editor_published_at TIMESTAMPTZ NULL,
  rule_editor_published_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('platform','company','department','schedule')),
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id UUID NULL REFERENCES departments(id) ON DELETE CASCADE,
  schedule_id UUID NULL REFERENCES schedules(id) ON DELETE CASCADE,
  parent_rule_set_id UUID NULL REFERENCES calculation_rule_sets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rule_editor_draft JSONB NOT NULL,
  rule_editor_published JSONB NULL,
  published_at TIMESTAMPTZ NULL,
  published_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calculation_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_set_id UUID NOT NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  label TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'safe',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  condition_text TEXT NULL,
  formula_text TEXT NULL,
  fallback_text TEXT NULL,
  notes TEXT NULL,
  UNIQUE(rule_set_id, rule_key)
);

CREATE TABLE IF NOT EXISTS calculation_rule_parameters (
  id BIGSERIAL PRIMARY KEY,
  rule_set_id UUID NOT NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE,
  param_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT NULL,
  value_type TEXT NOT NULL DEFAULT 'text',
  helper_text TEXT NULL,
  tooltip_text TEXT NULL,
  UNIQUE(rule_set_id, param_key)
);

CREATE TABLE IF NOT EXISTS calculation_rule_sources (
  id BIGSERIAL PRIMARY KEY,
  rule_set_id UUID NOT NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  label TEXT NOT NULL,
  source_status TEXT NOT NULL DEFAULT 'runtime',
  notes TEXT NULL,
  UNIQUE(rule_set_id, source_key)
);

CREATE TABLE IF NOT EXISTS calculation_rule_steps (
  id BIGSERIAL PRIMARY KEY,
  rule_set_id UUID NOT NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(rule_set_id, step_order)
);

CREATE TABLE IF NOT EXISTS calculation_rule_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_set_id UUID NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE,
  calculation_setting_id UUID NULL REFERENCES calculation_settings(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  action TEXT NOT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  changed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculation_settings_tenant_scope ON calculation_settings (tenant_id, scope, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calculation_rule_sets_scope_status ON calculation_rule_sets(scope, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calculation_rule_audit_ruleset ON calculation_rule_audit(rule_set_id, changed_at DESC);
