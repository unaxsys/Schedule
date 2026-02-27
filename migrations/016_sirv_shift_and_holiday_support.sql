BEGIN;

ALTER TABLE IF EXISTS shift_templates
  ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS shift_templates
  ADD COLUMN IF NOT EXISTS break_included BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS shift_templates
  ADD COLUMN IF NOT EXISTS is_sirv_shift BOOLEAN NULL;

ALTER TABLE IF EXISTS shift_templates_v2
  ADD COLUMN IF NOT EXISTS break_included BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS shift_templates_v2
  ADD COLUMN IF NOT EXISTS is_sirv_shift BOOLEAN NULL;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS sirv_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS schedules
  ADD COLUMN IF NOT EXISTS sirv_period_months INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schedules')
     AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'schedules_sirv_period_months_check'
        AND conrelid = 'schedules'::regclass
    ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_sirv_period_months_check CHECK (sirv_period_months BETWEEN 1 AND 4);
  END IF;
END $$;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS work_minutes_total INTEGER NULL;

ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS break_minutes_applied INTEGER NULL;

CREATE TABLE IF NOT EXISTS holidays (
  date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO holidays(date, name)
VALUES
  ('2026-01-01', 'Нова година'),
  ('2026-03-03', 'Освобождение на България'),
  ('2026-05-01', 'Ден на труда'),
  ('2026-05-06', 'Гергьовден'),
  ('2026-05-24', 'Ден на българската просвета и култура'),
  ('2026-09-06', 'Съединението'),
  ('2026-09-22', 'Независимостта на България'),
  ('2026-12-24', 'Бъдни вечер'),
  ('2026-12-25', 'Рождество Христово'),
  ('2026-12-26', 'Рождество Христово')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays(date, name)
VALUES
  ('2027-01-01', 'Нова година'),
  ('2027-03-03', 'Освобождение на България'),
  ('2027-05-01', 'Ден на труда'),
  ('2027-05-06', 'Гергьовден'),
  ('2027-05-24', 'Ден на българската просвета и култура'),
  ('2027-09-06', 'Съединението'),
  ('2027-09-22', 'Независимостта на България'),
  ('2027-12-24', 'Бъдни вечер'),
  ('2027-12-25', 'Рождество Христово'),
  ('2027-12-26', 'Рождество Христово')
ON CONFLICT (date) DO NOTHING;

COMMIT;
