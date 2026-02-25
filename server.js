require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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

function getRequestUserRole(req) {
  const role = cleanStr(req.get('x-user-role')).toLowerCase();
  return ['user', 'manager', 'admin', 'super_admin'].includes(role) ? role : 'user';
}

function ensureAdmin(req, res) {
  if (!['admin', 'super_admin'].includes(getRequestUserRole(req))) {
    res.status(403).json({ message: 'Само администратор може да изтрива служители.' });
    return false;
  }
  return true;
}

function ensureSuperAdmin(req, res) {
  if (getRequestUserRole(req) !== 'super_admin') {
    res.status(403).json({ message: 'Само супер администратор има достъп.' });
    return false;
  }
  return true;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
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
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
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

  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS egn CHAR(10) NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE NULL`);
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_egn_unique ON employees(egn) WHERE egn IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      month_key TEXT NOT NULL CHECK (month_key ~ '^\\d{4}-\\d{2}$'),
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
      PRIMARY KEY (schedule_id, employee_id, day)
    )
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
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit)`);

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
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
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

  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log(created_at DESC)');

  await pool.query(
    `INSERT INTO departments (name)
     VALUES ('Производство'), ('Администрация'), ('Продажби')
     ON CONFLICT (name) DO NOTHING`
  );

  await pool.query(`
    UPDATE employees e
    SET department_id = d.id
    FROM departments d
    WHERE e.department_id IS NULL
      AND NULLIF(TRIM(e.department), '') IS NOT NULL
      AND d.name = TRIM(e.department)
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

app.get('/api/state', async (_req, res) => {
  try {
    const [employees, schedules, scheduleEntries, shiftTemplates, departments] = await Promise.all([
      pool.query(
        `SELECT ${EMPLOYEE_SELECT_FIELDS}
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         ORDER BY e.name ASC`
      ),
      pool.query(
        `SELECT id, name, month_key AS month, department, status,
         created_at AS "createdAt"
         FROM schedules ORDER BY created_at, id`
      ),
      pool.query(`SELECT schedule_id, employee_id, day, shift_code FROM schedule_entries`),
      pool.query(
        `SELECT code, name,
         start_time AS start,
         end_time AS "end",
         hours
         FROM shift_templates ORDER BY created_at, code`
      ),
      pool.query(`SELECT id, name, created_at AS "createdAt" FROM departments ORDER BY name ASC`),
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

app.get('/api/departments', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, created_at AS "createdAt"
       FROM departments
       ORDER BY name ASC`
    );

    res.json({ departments: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/departments', async (req, res) => {
  const name = normalizeDepartmentName(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'Името на отдела е задължително.' });
  }

  try {
    const created = await pool.query(
      `INSERT INTO departments (name)
       VALUES ($1)
       RETURNING id, name, created_at AS "createdAt"`,
      [name]
    );
    res.status(201).json({ ok: true, department: created.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/departments/:id', async (req, res) => {
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
       SET name = $2
       WHERE id = $1
       RETURNING id, name, created_at AS "createdAt"`,
      [id, name]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    await pool.query('UPDATE employees SET department = $2 WHERE department_id = $1', [id, name]);

    res.json({ ok: true, department: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден department id.' });
  }

  try {
    const employeesCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM employees
       WHERE department_id = $1`,
      [id]
    );

    if ((employeesCount.rows[0]?.total || 0) > 0) {
      return res.status(409).json({
        message: 'Отделът не може да бъде изтрит, защото има прикачени служители.',
      });
    }

    const deleted = await pool.query('DELETE FROM departments WHERE id = $1', [id]);
    if (!deleted.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/employees', async (req, res) => {
  const departmentId = cleanStr(req.query.department_id);
  const monthKey = cleanStr(req.query.month_key || req.query.month);

  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }
  if (monthKey && !isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Невалиден month_key. Използвайте YYYY-MM.' });
  }

  try {
    const params = [];
    const where = [];

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

app.post('/api/employees', async (req, res) => {
  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, department, departmentId, position, egn, startDate, endDate, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit } = validation.value;

  try {
    let resolvedDepartmentId = null;
    let departmentName = department;

    if (departmentId) {
      if (!isValidUuid(departmentId)) {
        return res.status(400).json({ message: 'Невалиден department_id.' });
      }
      const depById = await pool.query('SELECT id, name FROM departments WHERE id = $1', [departmentId]);
      if (!depById.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      resolvedDepartmentId = depById.rows[0].id;
      departmentName = depById.rows[0].name;
    } else if (department) {
      const depByName = await pool.query('SELECT id, name FROM departments WHERE name = $1', [department]);
      if (depByName.rowCount) {
        resolvedDepartmentId = depByName.rows[0].id;
        departmentName = depByName.rows[0].name;
      }
    }

    const result = await pool.query(
      `INSERT INTO employees (name, department, department_id, position, egn, vacation_allowance, base_vacation_allowance, telk, young_worker_benefit, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, department_id AS "departmentId", department, position, egn,
                 base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [name, departmentName, resolvedDepartmentId, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, startDate, endDate]
    );

    res.status(201).json({ ok: true, employee: result.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('idx_employees_egn_unique')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    console.error('EMPLOYEE POST ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});


app.put('/api/employees/:id', async (req, res) => {
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
           end_date = $10
       WHERE id = $1
       RETURNING id, name, department_id AS "departmentId", COALESCE(department, 'Без отдел') AS department,
                 position, egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, name, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, startDate, endDate]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('idx_employees_egn_unique')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/employees/:id/department', async (req, res) => {
  const id = cleanStr(req.params.id);
  const departmentId = req.body?.department_id === null ? null : cleanStr(req.body?.department_id);

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }
  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }

  try {
    let departmentName = null;
    if (departmentId) {
      const dep = await pool.query('SELECT id, name FROM departments WHERE id = $1', [departmentId]);
      if (!dep.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      departmentName = dep.rows[0].name;
    }

    const updated = await pool.query(
      `UPDATE employees
       SET department_id = $2,
           department = $3
       WHERE id = $1
       RETURNING id, name, department_id AS "departmentId", COALESCE($3, 'Без отдел') AS department, position,
                 egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, departmentId, departmentName]
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
    const employeeResult = await pool.query(
      'SELECT id, start_date::text AS "startDate" FROM employees WHERE id = $1',
      [id]
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
       WHERE id = $1
       RETURNING id, end_date::text AS "endDate"`,
      [id, requestedEndDate]
    );

    return res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

app.patch('/api/employees/:id/release', releaseEmployee);

app.delete('/api/employees/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  try {
    const deleted = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
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

app.post('/api/schedules', async (req, res) => {
  const monthKey = cleanStr(req.body?.month_key || req.body?.month || req.body?.monthKey);
  const rawDepartment = cleanStr(req.body?.department);
  const department = !rawDepartment || rawDepartment === 'Общ' ? null : rawDepartment;
  const departmentLabel = department || 'Общ';
  const defaultName = `График ${departmentLabel} – ${monthKey}`;
  const name = cleanStr(req.body?.name) || defaultName;

  if (!isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Месецът трябва да е във формат YYYY-MM.' });
  }

  try {
    const created = await pool.query(
      `INSERT INTO schedules (name, month_key, department, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, month_key, department, status, created_at`,
      [name, monthKey, department, 'draft']
    );

    res.status(201).json({
      ok: true,
      schedule_id: created.rows[0].id,
      schedule: created.rows[0],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules', async (req, res) => {
  const month = cleanStr(req.query.month_key || req.query.month);
  const departmentId = cleanStr(req.query.department_id);

  if (month && !isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month_key трябва да е във формат YYYY-MM.' });
  }

  if (departmentId && departmentId !== 'all' && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'department_id трябва да е uuid или all.' });
  }

  try {
    const params = [];
    const where = [];
    if (month) {
      params.push(month);
      where.push(`month_key = $${params.length}`);
    }
    if (departmentId && departmentId !== 'all') {
      params.push(departmentId);
      where.push(`department = (SELECT name FROM departments WHERE id = $${params.length})`);
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

app.get('/api/schedules/:id', async (req, res) => {
  const scheduleId = req.params.id;
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, name, month_key, department, status, created_at
       FROM schedules WHERE id = $1`,
      [scheduleId]
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
       WHERE ($1::text IS NULL OR COALESCE(d.name, e.department) = $1)
         AND e.start_date <= $3::date
         AND (e.end_date IS NULL OR e.end_date >= $2::date)
       ORDER BY e.name`,
      [schedule.department, bounds.monthStart, bounds.monthEnd]
    );

    const entriesResult = await pool.query(
      `SELECT employee_id AS "employeeId", day, shift_code AS "shiftCode"
       FROM schedule_entries
       WHERE schedule_id = $1
       ORDER BY day, employee_id`,
      [scheduleId]
    );

    res.json({ schedule, employees: employeesResult.rows, entries: entriesResult.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules/:id/entry', async (req, res) => {
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
      `SELECT id, department, status, month_key FROM schedules WHERE id = $1`,
      [scheduleId]
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
       WHERE e.id = $1`,
      [employeeId]
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

    const effectiveMonth = monthKey || schedule.month_key;
    const entryDate = normalizeDateOnly(`${effectiveMonth}-${String(day).padStart(2, '0')}`);
    if (!entryDate || !isValidEmploymentRange(employee.startDate, employee.endDate || entryDate)) {
      return res.status(400).json({ message: 'Невалиден период на заетост за служителя.' });
    }
    if (entryDate < employee.startDate || (employee.endDate && entryDate > employee.endDate)) {
      return res.status(409).json({ message: 'Денят е извън периода на заетост на служителя.' });
    }

    await pool.query(
      `INSERT INTO schedule_entries (schedule_id, employee_id, day, shift_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (schedule_id, employee_id, day)
       DO UPDATE SET shift_code = EXCLUDED.shift_code`,
      [scheduleId, employeeId, day, shiftCode]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/shift-template', async (req, res) => {
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

app.delete('/api/shift-template/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM shift_templates WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/platform/register', async (req, res) => {
  const companyName = cleanStr(req.body?.companyName);
  const ownerFullName = cleanStr(req.body?.ownerFullName);
  const ownerEmail = cleanStr(req.body?.ownerEmail).toLowerCase();
  const password = cleanStr(req.body?.password);

  if (!companyName || !ownerFullName || !ownerEmail || !password || password.length < 8) {
    return res.status(400).json({ message: 'Попълнете коректно фирма, собственик, имейл и парола (мин. 8 символа).' });
  }

  const { firstName, lastName } = splitFullName(ownerFullName);

  try {
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, status)
       VALUES ($1, 'pending')
       RETURNING id, name, status, created_at AS "createdAt", approved_at AS "approvedAt"`,
      [companyName]
    );

    const tenant = tenantResult.rows[0];

    const ownerUserResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive"`,
      [ownerEmail, hashPassword(password), firstName, lastName]
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
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/platform/users', async (req, res) => {
  const requestRole = getRequestUserRole(req);
  if (!['admin', 'super_admin'].includes(requestRole)) {
    return res.status(403).json({ message: 'Само администратор може да добавя потребители.' });
  }

  const tenantId = cleanStr(req.body?.tenantId || req.body?.registrationId);
  const fullName = cleanStr(req.body?.fullName);
  const email = cleanStr(req.body?.email).toLowerCase();
  const password = cleanStr(req.body?.password);
  const role = cleanStr(req.body?.role).toLowerCase();

  if (!isValidUuid(tenantId) || !fullName || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Невалидни данни за потребител.' });
  }
  if (!['manager', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Позволени роли за добавяне: manager и user.' });
  }

  try {
    const tenantCheck = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [tenantId]);
    if (!tenantCheck.rowCount) {
      return res.status(404).json({ message: 'Организацията не е намерена.' });
    }

    const { firstName, lastName } = splitFullName(fullName);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive", created_at AS "createdAt"`,
      [email, hashPassword(password), firstName, lastName]
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
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/platform/super-admin/overview', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) {
    return;
  }

  try {
    const [tenantsResult, usersByRole, dbStats, latestLogs] = await Promise.all([
      pool.query(
        `SELECT id, name, status, created_at AS "createdAt", approved_at AS "approvedAt"
         FROM tenants
         ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT tu.role, COUNT(*)::int AS count
         FROM tenant_users tu
         GROUP BY tu.role
         ORDER BY tu.role`
      ),
      pool.query(
        `SELECT
           pg_database_size(current_database())::bigint AS "databaseSizeBytes",
           (SELECT COUNT(*)::int FROM employees) AS "employeesCount",
           (SELECT COUNT(*)::int FROM schedules) AS "schedulesCount",
           (SELECT COUNT(*)::int FROM schedule_entries) AS "scheduleEntriesCount",
           (SELECT COUNT(*)::int FROM tenants) AS "tenantsCount",
           (SELECT COUNT(*)::int FROM users) AS "usersCount"`
      ),
      pool.query(
        `SELECT id, tenant_id AS "tenantId", actor_user_id AS "actorUserId", action, entity, entity_id AS "entityId", before_json AS "beforeJson", after_json AS "afterJson", ip, user_agent AS "userAgent", created_at AS "createdAt"
         FROM audit_log
         ORDER BY created_at DESC
         LIMIT 200`
      ),
    ]);

    return res.json({
      ok: true,
      tenants: tenantsResult.rows,
      usersByRole: usersByRole.rows,
      usage: dbStats.rows[0],
      logs: latestLogs.rows,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.patch('/api/platform/super-admin/registrations/:id/status', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) {
    return;
  }

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
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/platform/super-admin/tables/:tableName', async (req, res) => {
  if (!ensureSuperAdmin(req, res)) {
    return;
  }

  const tableName = cleanStr(req.params.tableName).toLowerCase();
  const allowedTables = new Set(['tenants', 'users', 'tenant_users', 'audit_log', 'request_log', 'employees', 'departments', 'schedules', 'schedule_entries', 'shift_templates']);
  if (!allowedTables.has(tableName)) {
    return res.status(400).json({ message: 'Таблицата не е позволена за директен достъп.' });
  }

  try {
    const result = await pool.query(`SELECT row_to_json(t) AS row FROM (SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 200) t`);
    return res.json({ ok: true, tableName, rows: result.rows.map((item) => item.row) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.use(express.static(path.join(__dirname)));

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
