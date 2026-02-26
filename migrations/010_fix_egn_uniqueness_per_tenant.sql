-- Ensure EGN uniqueness is tenant-scoped only.

DO $$
BEGIN
  -- Drop legacy UNIQUE constraint on employees(egn) if present.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'employees'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (egn)%'
  ) THEN
    EXECUTE (
      SELECT format('ALTER TABLE employees DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'employees'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE 'UNIQUE (egn)%'
      LIMIT 1
    );
  END IF;
END $$;

DROP INDEX IF EXISTS idx_employees_egn_unique;

DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT i.indexname
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = 'employees'
      AND i.indexdef ILIKE 'CREATE UNIQUE INDEX % ON public.employees USING btree (egn%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_egn_unique
  ON employees(tenant_id, egn)
  WHERE egn IS NOT NULL;
