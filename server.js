require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const {
  DEFAULT_WEEKEND_RATE,
  DEFAULT_HOLIDAY_RATE,
  computeMonthlySummary,
} = require('./labor_rules');

const app = express();
const port = Number(process.env.PORT || 4000);

const pool =
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'schedule_db',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      });

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Role'],
  })
);

app.use(express.json());

function isValidUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function cleanStr(v) {
  return String(v ?? '').trim();
}

function ensureAdmin(req, res) {
  const role = cleanStr(req.get('x-user-role')).toLowerCase();
  if (!['admin', 'super_admin'].includes(role)) {
    res.status(403).json({ message: 'Само администратор може да изтрива служители.' });
    return false;
  }
  return true;
}

const JWT_SECRET = cleanStr(process.env.JWT_SECRET);
const JWT_EXPIRES_IN = cleanStr(process.env.JWT_EXPIRES_IN || '12h');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAuth(req, res, next) {
  try {
    const authHeader = cleanStr(req.get('authorization'));
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!JWT_SECRET) {
      return next(createHttpError(500, 'JWT secret is not configured.'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      first_name: decoded.first_name,
      last_name: decoded.last_name,
      is_super_admin: decoded.is_super_admin === true,
      tenant_id: cleanStr(decoded.tenant_id || decoded.tenantId) || null,
      active_tenant_id: cleanStr(decoded.active_tenant_id || decoded.activeTenantId) || null,
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return next(error);
  }
}

function isPlatformRoute(req) {
  return String(req.path || '').startsWith('/api/platform/');
}

function requireSuperAdmin(req, res, next) {
  const roleHeader = cleanStr(req.get('x-user-role')).toLowerCase();
  if (roleHeader === 'super_admin') {
    req.user = req.user || {
      id: null,
      email: '',
      first_name: '',
      last_name: '',
      is_super_admin: true,
    };
    return next();
  }

  return requireAuth(req, res, (authError) => {
    if (authError) {
      return next(authError);
    }

    if (!req.user || req.user.is_super_admin !== true) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  });
}

async function resolveTenantId(req) {
  const isSuperAdmin = req.user?.is_super_admin === true;
  if (isSuperAdmin) {
    const requestedTenantId = cleanStr(req.body?.tenantId || req.body?.registrationId || req.query?.tenantId);
    if (isPlatformRoute(req)) {
      if (!requestedTenantId) {
        throw createHttpError(400, 'Липсва tenantId (избери организация).');
      }
      if (!isValidUuid(requestedTenantId)) {
        throw createHttpError(400, 'Невалиден tenantId.');
      }
      return requestedTenantId;
    }

    const explicitActiveTenantId = cleanStr(req.user?.active_tenant_id || req.user?.tenant_id);
    if (!explicitActiveTenantId || !isValidUuid(explicitActiveTenantId)) {
      console.warn('TENANT RESOLUTION BLOCKED: super admin without explicit active tenant on non-platform route', {
        path: req.path,
        userId: req.user?.id || null,
      });
      throw createHttpError(403, 'Изберете организация (tenant) преди достъп до този ресурс.');
    }

    return explicitActiveTenantId;
  }

  const membership = await pool.query(
    `SELECT tenant_id AS "tenantId", role
     FROM tenant_users
     WHERE user_id = $1
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, tenant_id`,
    [req.user?.id]
  );

  if (!membership.rowCount) {
    throw createHttpError(403, 'Нямате организация за управление.');
  }

  const tokenTenantId = cleanStr(req.user?.active_tenant_id || req.user?.tenant_id);
  if (!tokenTenantId) {
    if (membership.rowCount > 1) {
      throw createHttpError(403, 'Потребителят има достъп до повече от една организация. Изберете tenant при вход.');
    }
    return membership.rows[0].tenantId;
  }

  if (!isValidUuid(tokenTenantId)) {
    throw createHttpError(403, 'Невалиден tenant контекст в токена.');
  }

  const membershipForTokenTenant = membership.rows.find((row) => row.tenantId === tokenTenantId);
  if (!membershipForTokenTenant) {
    throw createHttpError(403, 'Нямате права за избрания tenant.');
  }

  return tokenTenantId;
}

async function resolveActorTenant(req) {
  const tenantId = await resolveTenantId(req);

  if (req.user?.is_super_admin === true) {
    return { tenantId, role: 'super_admin' };
  }

  const membership = await pool.query(
    `SELECT role
     FROM tenant_users
     WHERE user_id = $1 AND tenant_id = $2
     LIMIT 1`,
    [req.user?.id, tenantId]
  );

  if (!membership.rowCount) {
    throw createHttpError(403, 'Нямате права за избрания tenant.');
  }

  return {
    tenantId,
    role: cleanStr(membership.rows[0].role).toLowerCase(),
  };
}

async function requireTenantContext(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      console.warn('TENANT ASSERTION FAILED: tenant_id missing for tenant route', {
        path: req.path,
        userId: req.user?.id || null,
      });
      return res.status(403).json({ message: 'Missing tenant context.' });
    }
    req.tenantId = tenantId;
    return next();
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function insertAuditLog(action, entity, payload = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity, entity_id, before_json, after_json, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        payload.tenantId || null,
        payload.actorUserId || null,
        action,
        entity || null,
        payload.entityId || null,
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
        payload.ip || null,
        payload.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('AUDIT LOG ERROR:', error.message);
  }
}

function splitFullName(fullName) {
  const parts = cleanStr(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1)[0],
  };
}

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(cleanStr(value));
}

function normalizeDepartmentName(value) {
  const text = cleanStr(value);
  return text.length ? text : null;
}

async function tableExists(tableName) {
  const check = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return Boolean(check.rows[0]?.exists);
}

async function tableHasColumn(tableName, columnName) {
  const check = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return Boolean(check.rowCount);
}


function normalizeDateOnly(value) {
  const text = cleanStr(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isValidEmploymentRange(startDate, endDate) {
  if (!startDate) {
    return false;
  }
  if (!endDate) {
    return true;
  }
  return endDate >= startDate;
}


function getMonthBounds(monthKey) {
  if (!isValidMonthKey(monthKey)) {
    return null;
  }

  const [year, month] = monthKey.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { monthStart, monthEnd };
}

function buildEmploymentOverlapClause(monthStartParam, monthEndParam) {
  return `e.start_date <= ${monthEndParam}::date AND (e.end_date IS NULL OR e.end_date >= ${monthStartParam}::date)`;
}

const EMPLOYEE_SELECT_FIELDS = `e.id,
              e.name,
              e.department_id AS "departmentId",
              COALESCE(d.name, e.department, 'Без отдел') AS department,
              e.position,
              e.egn,
              e.base_vacation_allowance AS "baseVacationAllowance",
              e.telk,
              e.young_worker_benefit AS "youngWorkerBenefit",
              e.start_date::text AS "startDate",
              e.end_date::text AS "endDate",
              (e.base_vacation_allowance + CASE WHEN e.telk THEN 6 ELSE 0 END + CASE WHEN e.young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
              (e.base_vacation_allowance + CASE WHEN e.telk THEN 6 ELSE 0 END + CASE WHEN e.young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`;

function getReleaseDateFromRequest(req) {
  const requestedEndDate = normalizeDateOnly(req.body?.end_date || req.body?.endDate || req.query.end_date);
  if (requestedEndDate) {
    return requestedEndDate;
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateEmployeeInput(data = {}) {
  const normalizeString = (value) =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim();

  const name = normalizeString(data.name);
  const nameParts = name.split(/\s+/).filter(Boolean);
  if (nameParts.length < 3) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'name',
        message: 'Моля, въведете 3 имена (собствено, бащино и фамилия).',
      },
    };
  }

  const position = normalizeString(data.position);
  if (position.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'position',
        message: 'Позицията е задължителна и трябва да съдържа поне 2 символа.',
      },
    };
  }


  const egn = normalizeString(data.egn);
  if (!/^\d{10}$/.test(egn)) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'egn',
        message: 'ЕГН е задължително и трябва да съдържа точно 10 цифри.',
      },
    };
  }

  const rawVacationAllowance = data.baseVacationAllowance ?? data.vacationAllowance;
  if (
    rawVacationAllowance === undefined ||
    rawVacationAllowance === null ||
    String(rawVacationAllowance).trim() === ''
  ) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.',
      },
    };
  }

  const telk = Boolean(data.telk);
  const youngWorkerBenefit = Boolean(data.youngWorkerBenefit ?? data.young_worker_benefit);
  const baseVacationAllowance = Number(rawVacationAllowance);
  const vacationAllowance = baseVacationAllowance + (telk ? 6 : 0) + (youngWorkerBenefit ? 6 : 0);
  if (!Number.isFinite(baseVacationAllowance) || baseVacationAllowance < 0) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.',
      },
    };
  }

  const startDate = normalizeDateOnly(data.startDate || data.start_date);
  const endDate = normalizeDateOnly(data.endDate || data.end_date);
  if (!isValidEmploymentRange(startDate, endDate)) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'employmentDates',
        message: 'Началната дата е задължителна, а последният работен ден не може да е преди нея.',
      },
    };
  }

  return {
    valid: true,
    value: {
      name,
      department: normalizeDepartmentName(data.department),
      departmentId: cleanStr(data.department_id || data.departmentId) || null,
      position,
      egn,
      startDate,
      endDate,
      vacationAllowance,
      baseVacationAllowance,
      telk,
      youngWorkerBenefit,
    },
  };
}

async function initDatabase() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      eik TEXT NOT NULL DEFAULT '',
      owner_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','user')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      department TEXT NULL,
      position TEXT NOT NULL,
      egn CHAR(10) NULL,
      vacation_allowance INTEGER NOT NULL DEFAULT 20,
      base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
      telk BOOLEAN NOT NULL DEFAULT FALSE,
      young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
      department TEXT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
      month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
      PRIMARY KEY (schedule_id, employee_id, day)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_templates (
      code VARCHAR(16) PRIMARY KEY,
      name TEXT NOT NULL,
      start_time CHAR(5) NOT NULL,
      end_time CHAR(5) NOT NULL,
      hours NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL,
      user_id UUID NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS egn CHAR(10) NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_department_id_fkey'
      ) THEN
        ALTER TABLE employees
          ADD CONSTRAINT employees_department_id_fkey
          FOREIGN KEY (department_id)
          REFERENCES departments(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'schedule_entries_employee_id_fkey'
      ) THEN
        ALTER TABLE schedule_entries DROP CONSTRAINT schedule_entries_employee_id_fkey;
      END IF;

      ALTER TABLE schedule_entries
        ADD CONSTRAINT schedule_entries_employee_id_fkey
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_period_check'
      ) THEN
        ALTER TABLE employees
          ADD CONSTRAINT employees_employment_period_check
          CHECK (end_date IS NULL OR end_date >= start_date);
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'departments'::regclass
          AND conname = 'departments_name_key'
      ) THEN
        ALTER TABLE departments DROP CONSTRAINT departments_name_key;
      END IF;
    END $$;
  `);

  await pool.query(`DROP INDEX IF EXISTS idx_schedules_month_department`);
  await pool.query(`DROP INDEX IF EXISTS idx_employees_egn_unique`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_egn_unique ON employees(tenant_id, egn) WHERE egn IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_tenant_name_unique ON departments(tenant_id, name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_tenant_month_department_unique ON schedules(tenant_id, month_key, department)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedules_tenant_id ON schedules(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_entries_month_key ON schedule_entries(month_key)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log(created_at DESC)');

  await pool.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS eik TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT NOT NULL DEFAULT ''");

  // Backwards-compatible bootstrap for existing single-tenant installations:
  // if legacy employees exist without tenant_id and there is exactly one tenant,
  // assign them to that tenant so old data remains visible.
  try {
    const tenantsCountResult = await pool.query('SELECT COUNT(*)::int AS total FROM tenants');
    const tenantsCount = tenantsCountResult.rows[0]?.total || 0;
    if (tenantsCount === 1) {
      await pool.query(
        `UPDATE employees
         SET tenant_id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
         WHERE tenant_id IS NULL`
      );
    }
  } catch (bootstrapError) {
    console.error('EMPLOYEE TENANT BACKFILL WARN:', bootstrapError.message);
  }

  await pool.query(`
    UPDATE employees e
    SET department_id = d.id
    FROM departments d
    WHERE e.department_id IS NULL
      AND NULLIF(TRIM(e.department), '') IS NOT NULL
      AND d.name = TRIM(e.department)
      AND e.tenant_id IS NOT DISTINCT FROM d.tenant_id
  `);

  await pool.query(`
    UPDATE employees e
    SET tenant_id = d.tenant_id
    FROM departments d
    WHERE e.department_id = d.id
      AND e.tenant_id IS NULL
      AND d.tenant_id IS NOT NULL
  `);

  await pool.query(`
    UPDATE employees
    SET base_vacation_allowance = GREATEST(vacation_allowance - (CASE WHEN telk THEN 6 ELSE 0 END) - (CASE WHEN young_worker_benefit THEN 6 ELSE 0 END), 0)
    WHERE (telk = TRUE OR young_worker_benefit = TRUE)
      AND base_vacation_allowance = 20
      AND vacation_allowance >= 26
  `);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/state', requireAuth, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [employees, schedules, scheduleEntries, shiftTemplates, departments] = await Promise.all([
      pool.query(
        `SELECT ${EMPLOYEE_SELECT_FIELDS}
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.tenant_id = $1
         ORDER BY e.name ASC`,
        [tenantId]
      ),
      pool.query(
        `SELECT id, name, month_key AS month, department, status,
         created_at AS "createdAt"
         FROM schedules
         WHERE tenant_id = $1
         ORDER BY created_at, id`,
        [tenantId]
      ),
      pool.query(
        `SELECT se.schedule_id, se.employee_id, se.day, se.shift_code
         FROM schedule_entries se
         JOIN schedules s ON s.id = se.schedule_id
         WHERE s.tenant_id = $1`,
        [tenantId]
      ),
      pool.query(
        `SELECT code, name,
         start_time AS start,
         end_time AS "end",
         hours
         FROM shift_templates ORDER BY created_at, code`
      ),
      pool.query(
        `SELECT id, name, created_at AS "createdAt"
         FROM departments
         WHERE tenant_id = $1
         ORDER BY name ASC`,
        [tenantId]
      ),
    ]);

    const schedule = {};
    for (const row of scheduleEntries.rows) {
      schedule[`${row.schedule_id}|${row.employee_id}|${row.day}`] = row.shift_code;
    }

    res.json({
      employees: employees.rows,
      schedules: schedules.rows,
      schedule,
      shiftTemplates: shiftTemplates.rows,
      departments: departments.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/departments', requireAuth, requireTenantContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, created_at AS "createdAt"
       FROM departments
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [req.tenantId]
    );

    res.json({ departments: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/departments', requireAuth, requireTenantContext, async (req, res) => {
  const name = normalizeDepartmentName(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'Името на отдела е задължително.' });
  }

  try {
    const created = await pool.query(
      `INSERT INTO departments (tenant_id, name)
       VALUES ($1, $2)
       RETURNING id, name, created_at AS "createdAt"`,
      [req.tenantId, name]
    );
    res.status(201).json({ ok: true, department: created.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/departments/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  const name = normalizeDepartmentName(req.body?.name);

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден department id.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Името на отдела е задължително.' });
  }

  try {
    const updated = await pool.query(
      `UPDATE departments
       SET name = $3
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, created_at AS "createdAt"`,
      [id, req.tenantId, name]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    await pool.query('UPDATE employees SET department = $3 WHERE department_id = $1 AND tenant_id = $2', [id, req.tenantId, name]);

    res.json({ ok: true, department: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/departments/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден department id.' });
  }

  try {
    const employeesCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM employees
       WHERE department_id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );

    if ((employeesCount.rows[0]?.total || 0) > 0) {
      return res.status(409).json({
        message: 'Отделът не може да бъде изтрит, защото има прикачени служители.',
      });
    }

    const deleted = await pool.query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!deleted.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/employees', requireAuth, requireTenantContext, async (req, res) => {
  const departmentId = cleanStr(req.query.department_id);
  const monthKey = cleanStr(req.query.month_key || req.query.month);

  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }
  if (monthKey && !isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Невалиден month_key. Използвайте YYYY-MM.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const params = [];
    const where = [];

    params.push(actor.tenantId);
    where.push(`e.tenant_id = $${params.length}`);

    if (departmentId) {
      params.push(departmentId);
      where.push(`e.department_id = $${params.length}`);
    }

    if (monthKey) {
      const bounds = getMonthBounds(monthKey);
      params.push(bounds.monthStart);
      const monthStartParam = `$${params.length}`;
      params.push(bounds.monthEnd);
      const monthEndParam = `$${params.length}`;
      where.push(buildEmploymentOverlapClause(monthStartParam, monthEndParam));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT ${EMPLOYEE_SELECT_FIELDS}
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ${whereSql}
       ORDER BY e.name ASC`,
      params
    );

    res.json({ employees: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/employees', requireAuth, requireTenantContext, async (req, res) => {
  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, department, departmentId, position, egn, startDate, endDate, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit } = validation.value;

  try {
    const actor = await resolveActorTenant(req);
    let resolvedDepartmentId = null;
    let departmentName = department;

    if (departmentId) {
      if (!isValidUuid(departmentId)) {
        return res.status(400).json({ message: 'Невалиден department_id.' });
      }
      const depById = await pool.query('SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, actor.tenantId]);
      if (!depById.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      resolvedDepartmentId = depById.rows[0].id;
      departmentName = depById.rows[0].name;
    } else if (department) {
      const depByName = await pool.query('SELECT id, name FROM departments WHERE tenant_id = $1 AND name = $2', [actor.tenantId, department]);
      if (depByName.rowCount) {
        resolvedDepartmentId = depByName.rows[0].id;
        departmentName = depByName.rows[0].name;
      }
    }

    const result = await pool.query(
      `INSERT INTO employees (name, department, department_id, position, egn, vacation_allowance, base_vacation_allowance, telk, young_worker_benefit, start_date, end_date, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, department_id AS "departmentId", department, position, egn,
                 base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [name, departmentName, resolvedDepartmentId, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, startDate, endDate, actor.tenantId]
    );

    res.status(201).json({ ok: true, employee: result.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('egn')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    console.error('EMPLOYEE POST ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});


app.put('/api/employees/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, position, egn, startDate, endDate, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit } = validation.value;

  try {
    const actor = await resolveActorTenant(req);
    const updated = await pool.query(
      `UPDATE employees
       SET name = $2,
           position = $3,
           egn = $4,
           vacation_allowance = $5,
           base_vacation_allowance = $6,
           telk = $7,
           young_worker_benefit = $8,
           start_date = $9,
           end_date = $10,
           tenant_id = COALESCE(tenant_id, $11)
       WHERE id = $1 AND tenant_id = $11
       RETURNING id, name, department_id AS "departmentId", COALESCE(department, 'Без отдел') AS department,
                 position, egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, name, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, startDate, endDate, actor.tenantId]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('egn')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/employees/:id/department', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  const departmentId = req.body?.department_id === null ? null : cleanStr(req.body?.department_id);

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }
  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    let departmentName = null;
    if (departmentId) {
      const dep = await pool.query('SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, actor.tenantId]);
      if (!dep.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      departmentName = dep.rows[0].name;
    }

    const updated = await pool.query(
      `UPDATE employees
       SET department_id = $2,
           department = $3,
           tenant_id = COALESCE(tenant_id, $4)
       WHERE id = $1 AND tenant_id = $4
       RETURNING id, name, department_id AS "departmentId", COALESCE($3, 'Без отдел') AS department, position,
                 egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, departmentId, departmentName, actor.tenantId]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function releaseEmployee(req, res) {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  const requestedEndDate = getReleaseDateFromRequest(req);

  try {
    const actor = await resolveActorTenant(req);
    const employeeResult = await pool.query(
      'SELECT id, start_date::text AS "startDate" FROM employees WHERE id = $1 AND tenant_id = $2',
      [id, actor.tenantId]
    );

    if (!employeeResult.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const startDate = employeeResult.rows[0].startDate;
    if (!isValidEmploymentRange(startDate, requestedEndDate)) {
      return res.status(400).json({
        message: 'Последният работен ден не може да е преди началната дата на служителя.',
      });
    }

    const updated = await pool.query(
      `UPDATE employees
       SET end_date = $2
       WHERE id = $1 AND tenant_id = $3
       RETURNING id, end_date::text AS "endDate"`,
      [id, requestedEndDate, actor.tenantId]
    );

    return res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

app.patch('/api/employees/:id/release', requireAuth, requireTenantContext, releaseEmployee);

app.delete('/api/employees/:id', requireAuth, requireTenantContext, async (req, res) => {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const deleted = await pool.query('DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, actor.tenantId]);
    if (!deleted.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    return res.json({ ok: true, deletedEmployeeId: deleted.rows[0].id });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Служителят има свързани записи в графици и не може да бъде изтрит.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules', requireAuth, requireTenantContext, async (req, res) => {
  const monthKey = cleanStr(req.body?.month_key || req.body?.month || req.body?.monthKey);
  const department = cleanStr(req.body?.department);

  if (!isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Месецът трябва да е във формат YYYY-MM.' });
  }

  if (!department || department === 'Общ') {
    return res.status(400).json({ message: 'График може да се създава само за конкретен отдел.' });
  }

  const defaultName = `График ${department} – ${monthKey}`;
  const name = cleanStr(req.body?.name) || defaultName;

  try {
    const actor = await resolveActorTenant(req);
    const departmentResult = await pool.query('SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1', [actor.tenantId, department]);
    if (!departmentResult.rowCount) {
      return res.status(400).json({ message: 'Отделът не съществува.' });
    }

    const existing = await pool.query(
      `SELECT id FROM schedules WHERE tenant_id = $1 AND month_key = $2 AND department = $3 LIMIT 1`,
      [actor.tenantId, monthKey, department]
    );

    if (existing.rowCount) {
      return res.status(409).json({ message: `Вече има създаден график за ${department} (${monthKey}).` });
    }

    const created = await pool.query(
      `INSERT INTO schedules (tenant_id, name, month_key, department, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, month_key, department, status, created_at`,
      [actor.tenantId, name, monthKey, department, 'draft']
    );

    res.status(201).json({
      ok: true,
      schedule_id: created.rows[0].id,
      schedule: created.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: `Вече има създаден график за ${department} (${monthKey}).` });
    }
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules', requireAuth, requireTenantContext, async (req, res) => {
  const month = cleanStr(req.query.month_key || req.query.month);
  const departmentId = cleanStr(req.query.department_id);

  if (month && !isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month_key трябва да е във формат YYYY-MM.' });
  }

  if (departmentId && departmentId !== 'all' && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'department_id трябва да е uuid или all.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const params = [actor.tenantId];
    const where = ['tenant_id = $1'];
    if (month) {
      params.push(month);
      where.push(`month_key = $${params.length}`);
    }
    if (departmentId && departmentId !== 'all') {
      params.push(departmentId);
      where.push(`department = (SELECT name FROM departments WHERE id = $${params.length} AND tenant_id = $1)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const schedulesResult = await pool.query(
      `SELECT id, name, month_key, department, status, created_at
       FROM schedules
       ${whereSql}
       ORDER BY created_at DESC`,
      params
    );

    res.json({ schedules: schedulesResult.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules/:id', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, name, month_key, department, status, created_at
       FROM schedules WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );

    if (scheduleResult.rowCount === 0) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];

    const bounds = getMonthBounds(schedule.month_key);
    const employeesResult = await pool.query(
      `SELECT ${EMPLOYEE_SELECT_FIELDS}
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.tenant_id = $1
         AND ($2::text IS NULL OR COALESCE(d.name, e.department) = $2)
         AND e.start_date <= $4::date
         AND (e.end_date IS NULL OR e.end_date >= $3::date)
       ORDER BY e.name`,
      [req.tenantId, schedule.department, bounds.monthStart, bounds.monthEnd]
    );

    const entriesResult = await pool.query(
      `SELECT se.employee_id AS "employeeId", se.day, se.shift_code AS "shiftCode"
       FROM schedule_entries se
       JOIN schedules s ON s.id = se.schedule_id
       WHERE se.schedule_id = $1 AND s.tenant_id = $2
       ORDER BY se.day, se.employee_id`,
      [scheduleId, req.tenantId]
    );

    res.json({ schedule, employees: employeesResult.rows, entries: entriesResult.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules/:id/entry', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  const employeeId = cleanStr(req.body?.employee_id || req.body?.employeeId);
  const day = Number(req.body?.day);
  const shiftCode = cleanStr(req.body?.shift_code || req.body?.shiftCode);
  const monthKey = cleanStr(req.body?.month_key || req.body?.monthKey);

  if (!isValidUuid(scheduleId) || !isValidUuid(employeeId)) {
    return res.status(400).json({ message: 'Невалиден scheduleId или employeeId.' });
  }

  if (!Number.isInteger(day) || day < 1 || day > 31 || !shiftCode || (monthKey && !isValidMonthKey(monthKey))) {
    return res.status(400).json({ message: 'Невалидни данни за запис в график.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, department, status, month_key FROM schedules WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );

    if (scheduleResult.rowCount === 0) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];
    if (schedule.status === 'locked') {
      return res.status(409).json({ message: 'Графикът е заключен.' });
    }

    const employeeResult = await pool.query(
      `SELECT e.id, COALESCE(d.name, e.department) AS department,
              e.start_date::text AS "startDate", e.end_date::text AS "endDate"
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [employeeId, req.tenantId]
    );

    if (employeeResult.rowCount === 0) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const employee = employeeResult.rows[0];
    if (schedule.department && employee.department !== schedule.department) {
      return res.status(400).json({
        message: `Служителят не е от отдел ${schedule.department}.`,
      });
    }

    const effectiveMonth = monthKey || cleanStr(schedule.month_key);
    if (!effectiveMonth || !isValidMonthKey(effectiveMonth)) {
      return res.status(400).json({ message: 'Липсва валиден monthKey (YYYY-MM) за записа.' });
    }

    const entryDate = normalizeDateOnly(`${effectiveMonth}-${String(day).padStart(2, '0')}`);
    if (!entryDate || !isValidEmploymentRange(employee.startDate, employee.endDate || entryDate)) {
      return res.status(400).json({ message: 'Невалиден период на заетост за служителя.' });
    }
    if (entryDate < employee.startDate || (employee.endDate && entryDate > employee.endDate)) {
      return res.status(409).json({ message: 'Денят е извън периода на заетост на служителя.' });
    }

    const hasScheduleEntriesMonthKey = await tableHasColumn('schedule_entries', 'month_key');

    if (hasScheduleEntriesMonthKey) {
      await pool.query(
        `INSERT INTO schedule_entries (schedule_id, employee_id, day, shift_code, month_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (schedule_id, employee_id, day)
         DO UPDATE SET shift_code = EXCLUDED.shift_code,
                       month_key = EXCLUDED.month_key`,
        [scheduleId, employeeId, day, shiftCode, effectiveMonth]
      );
    } else {
      await pool.query(
        `INSERT INTO schedule_entries (schedule_id, employee_id, day, shift_code)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (schedule_id, employee_id, day)
         DO UPDATE SET shift_code = EXCLUDED.shift_code`,
        [scheduleId, employeeId, day, shiftCode]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/shift-template', requireAuth, requireTenantContext, async (req, res) => {
  const code = cleanStr(req.body?.code);
  const name = cleanStr(req.body?.name);
  const start = cleanStr(req.body?.start);
  const end = cleanStr(req.body?.end);
  const hours = Number(req.body?.hours);

  if (!code || !name || !start || !end || !(hours > 0)) {
    return res.status(400).json({ message: 'Невалидни данни за смяна.' });
  }

  try {
    await pool.query(
      `INSERT INTO shift_templates (code, name, start_time, end_time, hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code)
       DO UPDATE SET
         name = EXCLUDED.name,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         hours = EXCLUDED.hours`,
      [code, name, start, end, hours]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/shift-template/:code', requireAuth, requireTenantContext, async (req, res) => {
  try {
    await pool.query('DELETE FROM shift_templates WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/calc/summary', requireAuth, requireTenantContext, async (req, res, next) => {
  try {
    const monthKey = cleanStr(req.body?.monthKey);
    if (!isValidMonthKey(monthKey)) {
      return res.status(400).json({ message: 'Невалиден monthKey. Очаква се YYYY-MM.' });
    }

    const requiredTables = ['employees', 'schedules', 'schedule_entries', 'shift_templates'];
    for (const tableName of requiredTables) {
      if (!(await tableExists(tableName))) {
        return res.status(501).json({ message: `Липсва required table: ${tableName}` });
      }
    }

    const actor = await resolveActorTenant(req);
    const hasEmployeesTenantColumn = await tableHasColumn('employees', 'tenant_id');
    if (!hasEmployeesTenantColumn) {
      return res.status(501).json({ message: 'Липсва employees.tenant_id за tenant-safe филтриране.' });
    }

    const employeeQuery = await pool.query(
      `SELECT id,
              department_id,
              start_date::text AS start_date,
              end_date::text AS end_date
       FROM employees
       WHERE tenant_id = $1
       ORDER BY id`,
      [actor.tenantId]
    );

    const employees = employeeQuery.rows;
    const employeeIds = employees.map((employee) => employee.id);

    const shiftTemplatesQuery = await pool.query(
      `SELECT code,
              name,
              start_time,
              end_time,
              hours
       FROM shift_templates
       ORDER BY code`
    );

    const schedulesQuery = await pool.query(
      `SELECT id, name, month_key, department, status
       FROM schedules
       WHERE tenant_id = $1 AND month_key = $2
       ORDER BY created_at, id`,
      [actor.tenantId, monthKey]
    );

    const bodyScheduleIdsRaw = Array.isArray(req.body?.selectedScheduleIds)
      ? req.body.selectedScheduleIds.map((value) => cleanStr(value)).filter(Boolean)
      : [];

    const validScheduleIds = schedulesQuery.rows.map((schedule) => String(schedule.id));
    const validScheduleIdSet = new Set(validScheduleIds);

    if (bodyScheduleIdsRaw.some((scheduleId) => !isValidUuid(scheduleId))) {
      return res.status(400).json({ message: 'selectedScheduleIds трябва да съдържа валидни UUID.' });
    }

    const selectedFromBody = bodyScheduleIdsRaw.filter((scheduleId) => validScheduleIdSet.has(scheduleId));
    if (bodyScheduleIdsRaw.length && selectedFromBody.length !== bodyScheduleIdsRaw.length) {
      return res.status(400).json({ message: 'Невалидни schedule id за този monthKey.' });
    }

    let selectedScheduleIds = selectedFromBody;
    if (!selectedScheduleIds.length) {
      const locked = schedulesQuery.rows.filter((schedule) => cleanStr(schedule.status).toLowerCase() === 'locked');
      selectedScheduleIds = (locked.length ? locked : schedulesQuery.rows).map((schedule) => String(schedule.id));
    }

    if (!selectedScheduleIds.length || !employeeIds.length) {
      return res.json({
        ok: true,
        monthKey,
        summaryByEmployee: {},
        meta: {
          selectedScheduleIds,
          rates: {
            weekendRate: Number(req.body?.weekendRate) || DEFAULT_WEEKEND_RATE,
            holidayRate: Number(req.body?.holidayRate) || DEFAULT_HOLIDAY_RATE,
          },
        },
      });
    }

    const entriesQuery = await pool.query(
      `SELECT schedule_id, employee_id, day, shift_code
       FROM schedule_entries
       WHERE schedule_id = ANY($1::uuid[])
         AND employee_id = ANY($2::uuid[])
       ORDER BY employee_id, day`,
      [selectedScheduleIds, employeeIds]
    );

    const weekendRate = Number(req.body?.weekendRate) || DEFAULT_WEEKEND_RATE;
    const holidayRate = Number(req.body?.holidayRate) || DEFAULT_HOLIDAY_RATE;

    const summaryMap = computeMonthlySummary({
      monthKey,
      employees,
      schedules: schedulesQuery.rows,
      scheduleEntries: entriesQuery.rows,
      shiftTemplates: shiftTemplatesQuery.rows,
      selectedScheduleIds,
      weekendRate,
      holidayRate,
    });

    const summaryByEmployee = {};
    for (const [employeeId, summary] of summaryMap.entries()) {
      summaryByEmployee[employeeId] = summary;
    }

    return res.json({
      ok: true,
      monthKey,
      summaryByEmployee,
      meta: {
        selectedScheduleIds,
        rates: { weekendRate, holidayRate },
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = cleanStr(req.body?.email).toLowerCase();
  const password = cleanStr(req.body?.password);
  const requestedTenantId = cleanStr(req.body?.tenantId || req.body?.activeTenantId);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    if (!JWT_SECRET) {
      throw createHttpError(500, 'JWT secret is not configured.');
    }

    const userResult = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, is_super_admin, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (!userResult.rowCount) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const membershipsResult = await pool.query(
      `SELECT tenant_id AS "tenantId", role
       FROM tenant_users
       WHERE user_id = $1
       ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC`,
      [user.id]
    );

    const availableTenants = membershipsResult.rows.map((row) => ({
      tenantId: row.tenantId,
      role: cleanStr(row.role).toLowerCase(),
    }));

    let activeTenantId = null;

    if (user.is_super_admin !== true) {
      if (!availableTenants.length) {
        return res.status(403).json({ message: 'Потребителят няма достъп до организация.' });
      }

      if (requestedTenantId) {
        if (!isValidUuid(requestedTenantId)) {
          return res.status(400).json({ message: 'Невалиден tenantId.' });
        }
        const hasRequestedTenant = availableTenants.some((row) => row.tenantId === requestedTenantId);
        if (!hasRequestedTenant) {
          return res.status(403).json({ message: 'Нямате достъп до избрания tenant.' });
        }
        activeTenantId = requestedTenantId;
      } else if (availableTenants.length === 1) {
        activeTenantId = availableTenants[0].tenantId;
      } else {
        return res.status(409).json({
          message: 'Изберете организация за вход.',
          requiresTenantSelection: true,
          tenants: availableTenants,
        });
      }
    } else if (requestedTenantId) {
      if (!isValidUuid(requestedTenantId)) {
        return res.status(400).json({ message: 'Невалиден tenantId.' });
      }
      activeTenantId = requestedTenantId;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_super_admin: user.is_super_admin === true,
        tenant_id: activeTenantId,
        active_tenant_id: activeTenantId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_super_admin: user.is_super_admin === true,
        tenantId: activeTenantId,
      },
      activeTenantId,
      tenants: availableTenants,
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/platform/register', async (req, res, next) => {
  const companyName = cleanStr(req.body?.companyName);
  const companyEik = cleanStr(req.body?.companyEik);
  const ownerFullName = cleanStr(req.body?.ownerFullName);
  const ownerEmail = cleanStr(req.body?.ownerEmail).toLowerCase();
  const ownerPhone = cleanStr(req.body?.ownerPhone);
  const password = cleanStr(req.body?.password);

  if (!companyName || !companyEik || !/^\d{9,13}$/.test(companyEik) || !ownerFullName || !ownerEmail || !ownerPhone || !password || password.length < 8) {
    return res.status(400).json({ message: 'Попълнете коректно фирма, ЕИК (9-13 цифри), собственик, имейл, телефон и парола (мин. 8 символа).' });
  }

  const { firstName, lastName } = splitFullName(ownerFullName);

  try {
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, eik, owner_phone, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, name, eik, owner_phone AS "ownerPhone", status, created_at AS "createdAt", approved_at AS "approvedAt"`,
      [companyName, companyEik, ownerPhone]
    );

    const tenant = tenantResult.rows[0];

    const passwordHash = await bcrypt.hash(password, 12);

    const ownerUserResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive"`,
      [ownerEmail, passwordHash, firstName, lastName]
    );

    const ownerUser = ownerUserResult.rows[0];

    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'`,
      [tenant.id, ownerUser.id]
    );

    await insertAuditLog('tenant_registered', 'tenant', {
      tenantId: tenant.id,
      actorUserId: ownerUser.id,
      entityId: tenant.id,
      after: { tenant, ownerUser, role: 'owner' },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({ ok: true, tenant, ownerUser });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/platform/users', requireAuth, async (req, res, next) => {

  const employeeId = cleanStr(req.body?.employeeId);
  const email = cleanStr(req.body?.email).toLowerCase();
  const password = cleanStr(req.body?.password);
  const role = cleanStr(req.body?.role).toLowerCase();

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Невалидни данни за потребител.' });
  }
  if (!['manager', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Позволени роли за добавяне: manager и user.' });
  }
  if (!isValidUuid(employeeId)) {
    return res.status(400).json({ message: 'Изберете валиден служител.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const tenantId = actor.tenantId;
    if (!['owner', 'admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ message: 'Само owner/admin може да добавя потребители.' });
    }

    const employeeCheck = await pool.query(
      `SELECT id, name
       FROM employees
       WHERE id = $1 AND tenant_id = $2`,
      [employeeId, tenantId]
    );
    if (!employeeCheck.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const { firstName, lastName } = splitFullName(employeeCheck.rows[0].name);

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive", created_at AS "createdAt"`,
      [email, passwordHash, firstName, lastName]
    );

    const user = userResult.rows[0];

    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, user.id, role]
    );

    await insertAuditLog('tenant_user_upserted', 'tenant_user', {
      tenantId,
      actorUserId: null,
      entityId: user.id,
      after: { userId: user.id, role, tenantId },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({ ok: true, user: { ...user, tenantId, role } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/platform/super-admin/overview', requireSuperAdmin, async (req, res, next) => {

  try {
    const tableExists = async (tableName) => {
      const check = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
      return Boolean(check.rows[0]?.exists);
    };

    const tableHasColumn = async (tableName, columnName) => {
      const check = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
         LIMIT 1`,
        [tableName, columnName]
      );
      return Boolean(check.rowCount);
    };

    const countAllRows = async (tableName) => {
      if (!(await tableExists(tableName))) {
        return 0;
      }
      const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
      return countResult.rows[0]?.count || 0;
    };

    const countRowsByTenant = async (tableName) => {
      const hasTable = await tableExists(tableName);
      if (!hasTable || !(await tableHasColumn(tableName, 'tenant_id'))) {
        return new Map();
      }

      const rows = await pool.query(
        `SELECT tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM ${tableName}
         WHERE tenant_id IS NOT NULL
         GROUP BY tenant_id`
      );

      return new Map(rows.rows.map((row) => [String(row.tenantId), row.count]));
    };

    const countEmployeesByTenant = async () => {
      const hasEmployees = await tableExists('employees');
      const hasDepartments = await tableExists('departments');
      if (!hasEmployees || !hasDepartments) {
        return new Map();
      }

      const [hasDepartmentIdOnEmployees, hasTenantIdOnDepartments] = await Promise.all([
        tableHasColumn('employees', 'department_id'),
        tableHasColumn('departments', 'tenant_id'),
      ]);

      if (!hasDepartmentIdOnEmployees || !hasTenantIdOnDepartments) {
        return new Map();
      }

      const rows = await pool.query(
        `SELECT d.tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM employees e
         JOIN departments d ON d.id = e.department_id
         WHERE d.tenant_id IS NOT NULL
         GROUP BY d.tenant_id`
      );

      return new Map(rows.rows.map((row) => [String(row.tenantId), row.count]));
    };

    const [
      hasTenants,
      hasTenantUsers,
      hasUsers,
      hasAuditLog,
      hasRequestLog,
      hasTenantsEik,
      hasTenantsOwnerPhone,
      hasTenantsApprovedAt,
      hasUsersFirstName,
      hasUsersLastName,
      hasAuditBeforeJson,
      hasAuditAfterJson,
      hasAuditIp,
      hasAuditUserAgent,
    ] = await Promise.all([
      tableExists('tenants'),
      tableExists('tenant_users'),
      tableExists('users'),
      tableExists('audit_log'),
      tableExists('request_log'),
      tableHasColumn('tenants', 'eik'),
      tableHasColumn('tenants', 'owner_phone'),
      tableHasColumn('tenants', 'approved_at'),
      tableHasColumn('users', 'first_name'),
      tableHasColumn('users', 'last_name'),
      tableHasColumn('audit_log', 'before_json'),
      tableHasColumn('audit_log', 'after_json'),
      tableHasColumn('audit_log', 'ip'),
      tableHasColumn('audit_log', 'user_agent'),
    ]);

    const tenantsSelect = [
      't.id',
      't.name',
      hasTenantsEik ? 't.eik' : "''::text AS eik",
      hasTenantsOwnerPhone ? 't.owner_phone AS "ownerPhone"' : "''::text AS \"ownerPhone\"",
      't.status',
      't.created_at AS "createdAt"',
      hasTenantsApprovedAt ? 't.approved_at AS "approvedAt"' : 'NULL::timestamptz AS "approvedAt"',
    ];

    const ownerNameExpr = hasUsersFirstName || hasUsersLastName
      ? "NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '')"
      : 'u.email';

    const tenantsResult = hasTenants
      ? await pool.query(
        `SELECT
           ${tenantsSelect.join(',\n           ')},
           owner.owner_full_name AS "ownerFullName",
           owner.owner_email AS "ownerEmail"
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT
             ${ownerNameExpr} AS owner_full_name,
             u.email AS owner_email
           FROM tenant_users tu
           JOIN users u ON u.id = tu.user_id
           WHERE tu.tenant_id = t.id
             AND tu.role = 'owner'
           ORDER BY tu.created_at ASC
           LIMIT 1
         ) owner ON ${hasTenantUsers && hasUsers ? 'TRUE' : 'FALSE'}
         ORDER BY t.created_at DESC`
      )
      : { rows: [] };

    const usersByRoleResult = hasTenantUsers
      ? await pool.query(
        `SELECT tu.role, COUNT(*)::int AS count
         FROM tenant_users tu
         GROUP BY tu.role
         ORDER BY tu.role`
      )
      : { rows: [] };

    const [employeesCount, schedulesCount, scheduleEntriesCount, tenantsCount, usersCount, databaseSizeBytes] = await Promise.all([
      countAllRows('employees'),
      countAllRows('schedules'),
      countAllRows('schedule_entries'),
      countAllRows('tenants'),
      countAllRows('users'),
      pool.query('SELECT pg_database_size(current_database())::bigint AS "databaseSizeBytes"').then((r) => r.rows[0]?.databaseSizeBytes || 0),
    ]);

    const usage = {
      databaseSizeBytes,
      employeesCount,
      schedulesCount,
      scheduleEntriesCount,
      tenantsCount,
      usersCount,
    };

    const [employeesByTenant, departmentsByTenant, schedulesByTenant, scheduleEntriesByTenant, auditByTenant, requestsByTenant] = await Promise.all([
      countEmployeesByTenant(),
      countRowsByTenant('departments'),
      countRowsByTenant('schedules'),
      countRowsByTenant('schedule_entries'),
      countRowsByTenant('audit_log'),
      countRowsByTenant('request_log'),
    ]);

    const usersByTenant = new Map();
    tenantsResult.rows.forEach((tenant) => {
      usersByTenant.set(String(tenant.id), 0);
    });

    if (hasTenantUsers) {
      const tenantUserCounts = await pool.query(
        `SELECT tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM tenant_users
         GROUP BY tenant_id`
      );
      tenantUserCounts.rows.forEach((row) => {
        usersByTenant.set(String(row.tenantId), row.count);
      });
    }

    const latestLogs = hasAuditLog
      ? await pool.query(
        `SELECT
           id,
           tenant_id AS "tenantId",
           actor_user_id AS "actorUserId",
           action,
           entity,
           entity_id AS "entityId",
           ${hasAuditBeforeJson ? 'before_json AS "beforeJson"' : 'NULL::jsonb AS "beforeJson"'},
           ${hasAuditAfterJson ? 'after_json AS "afterJson"' : 'NULL::jsonb AS "afterJson"'},
           ${hasAuditIp ? 'ip' : "NULL::text AS ip"},
           ${hasAuditUserAgent ? 'user_agent AS "userAgent"' : 'NULL::text AS "userAgent"'},
           created_at AS "createdAt"
         FROM audit_log
         ORDER BY created_at DESC
         LIMIT 200`
      )
      : { rows: [] };

    const tenantUsage = tenantsResult.rows.map((tenant) => {
      const tenantId = String(tenant.id);
      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        usersCount: usersByTenant.get(tenantId) ?? 0,
        employeesCount: employeesByTenant.get(tenantId) ?? 0,
        departmentsCount: departmentsByTenant.get(tenantId) ?? 0,
        schedulesCount: schedulesByTenant.get(tenantId) ?? 0,
        scheduleEntriesCount: scheduleEntriesByTenant.get(tenantId) ?? 0,
        auditEventsCount: auditByTenant.get(tenantId) ?? 0,
        requestsCount: requestsByTenant.get(tenantId) ?? 0,
      };
    });

    return res.json({
      ok: true,
      tenants: tenantsResult.rows,
      usersByRole: usersByRoleResult.rows,
      usage,
      tenantUsage,
      logs: latestLogs.rows,
    });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/platform/super-admin/registrations/:id/status', requireSuperAdmin, async (req, res, next) => {

  const id = cleanStr(req.params.id);
  const status = cleanStr(req.body?.status).toLowerCase();

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден tenant id.' });
  }
  if (!['pending', 'approved', 'disabled'].includes(status)) {
    return res.status(400).json({ message: 'Невалиден статус.' });
  }

  try {
    const updated = await pool.query(
      `UPDATE tenants
       SET status = $2,
           approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END
       WHERE id = $1
       RETURNING id, name, status, created_at AS "createdAt", approved_at AS "approvedAt"`,
      [id, status]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Организацията не е намерена.' });
    }

    await insertAuditLog('tenant_status_changed', 'tenant', {
      tenantId: id,
      entityId: id,
      after: { status },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ ok: true, tenant: updated.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/platform/super-admin/tables/:tableName', requireSuperAdmin, async (req, res, next) => {

  const tableName = cleanStr(req.params.tableName).toLowerCase();
  const allowedTables = new Set(['tenants', 'users', 'tenant_users', 'audit_log', 'request_log', 'employees', 'departments', 'schedules', 'schedule_entries', 'shift_templates']);
  if (!allowedTables.has(tableName)) {
    return res.status(400).json({ message: 'Таблицата не е позволена за директен достъп.' });
  }

  try {
    const result = await pool.query(`SELECT row_to_json(t) AS row FROM (SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 200) t`);
    return res.json({ ok: true, tableName, rows: result.rows.map((item) => item.row) });
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(path.join(__dirname)));

app.use((error, req, res, next) => {
  const status = Number(error?.status) || 500;
  const message = status >= 500 ? 'Internal server error' : error.message || 'Request failed';

  if (status >= 500) {
    console.error('Unhandled error:', error);
  }

  if (res.headersSent) {
    return next(error);
  }

  return res.status(status).json({ message });
});

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Schedule backend ready on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Database init error:', error);
    process.exit(1);
  });
