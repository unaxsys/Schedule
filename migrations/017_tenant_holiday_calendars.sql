BEGIN;

CREATE TABLE IF NOT EXISTS public_holidays_bg (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  is_official BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'holidays') THEN
    ALTER TABLE holidays ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE holidays ADD COLUMN IF NOT EXISTS source TEXT NULL;
    ALTER TABLE holidays ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    UPDATE holidays
    SET is_official = COALESCE(is_official, TRUE),
        source = COALESCE(source, 'BG official')
    WHERE is_official IS NULL OR source IS NULL;
  END IF;
END $$;

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
  CONSTRAINT tenant_holidays_unique_tenant_date UNIQUE (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tenant_holidays_tenant_id_date ON tenant_holidays(tenant_id, date);

INSERT INTO holidays(date, name, is_official, source)
VALUES
  ('2026-01-01', 'Нова година', TRUE, 'BG official'),
  ('2026-03-03', 'Освобождение на България', TRUE, 'BG official'),
  ('2026-04-10', 'Велики петък', TRUE, 'BG official'),
  ('2026-04-11', 'Велика събота', TRUE, 'BG official'),
  ('2026-04-12', 'Великден', TRUE, 'BG official'),
  ('2026-04-13', 'Великден', TRUE, 'BG official'),
  ('2026-05-01', 'Ден на труда', TRUE, 'BG official'),
  ('2026-05-06', 'Гергьовден', TRUE, 'BG official'),
  ('2026-05-24', 'Ден на българската просвета и култура', TRUE, 'BG official'),
  ('2026-09-06', 'Съединението', TRUE, 'BG official'),
  ('2026-09-22', 'Независимостта на България', TRUE, 'BG official'),
  ('2026-12-24', 'Бъдни вечер', TRUE, 'BG official'),
  ('2026-12-25', 'Рождество Христово', TRUE, 'BG official'),
  ('2026-12-26', 'Рождество Христово', TRUE, 'BG official')
ON CONFLICT (date) DO UPDATE SET
  name = EXCLUDED.name,
  is_official = EXCLUDED.is_official,
  source = COALESCE(EXCLUDED.source, holidays.source);

INSERT INTO holidays(date, name, is_official, source)
VALUES
  ('2027-01-01', 'Нова година', TRUE, 'BG official'),
  ('2027-03-03', 'Освобождение на България', TRUE, 'BG official'),
  ('2027-04-30', 'Велики петък', TRUE, 'BG official'),
  ('2027-05-01', 'Велика събота', TRUE, 'BG official'),
  ('2027-05-02', 'Великден', TRUE, 'BG official'),
  ('2027-05-03', 'Великден', TRUE, 'BG official'),
  ('2027-05-06', 'Гергьовден', TRUE, 'BG official'),
  ('2027-05-24', 'Ден на българската просвета и култура', TRUE, 'BG official'),
  ('2027-09-06', 'Съединението', TRUE, 'BG official'),
  ('2027-09-22', 'Независимостта на България', TRUE, 'BG official'),
  ('2027-12-24', 'Бъдни вечер', TRUE, 'BG official'),
  ('2027-12-25', 'Рождество Христово', TRUE, 'BG official'),
  ('2027-12-26', 'Рождество Христово', TRUE, 'BG official')
ON CONFLICT (date) DO UPDATE SET
  name = EXCLUDED.name,
  is_official = EXCLUDED.is_official,
  source = COALESCE(EXCLUDED.source, holidays.source);

COMMIT;
