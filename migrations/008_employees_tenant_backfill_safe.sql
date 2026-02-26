DO $$
DECLARE
  tenants_total INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO tenants_total FROM tenants;

  IF tenants_total = 1 THEN
    UPDATE employees
    SET tenant_id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
    WHERE tenant_id IS NULL;
  END IF;
END $$;
