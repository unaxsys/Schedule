-- Platform-level calculation rulesets + future override chain readiness
ALTER TABLE calculation_settings ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE calculation_settings DROP CONSTRAINT IF EXISTS calculation_settings_scope_check;
ALTER TABLE calculation_settings
  ADD CONSTRAINT calculation_settings_scope_check CHECK (scope IN ('global', 'department', 'schedule', 'platform'));

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

ALTER TABLE calculation_rule_audit ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE calculation_rule_audit ADD COLUMN IF NOT EXISTS rule_set_id UUID NULL REFERENCES calculation_rule_sets(id) ON DELETE CASCADE;
ALTER TABLE calculation_rule_audit ALTER COLUMN calculation_setting_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calculation_rule_sets_scope_status ON calculation_rule_sets(scope, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calculation_rule_audit_ruleset ON calculation_rule_audit(rule_set_id, changed_at DESC);
