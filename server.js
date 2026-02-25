require('dotenv').config();

const path = require('path');
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
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(cleanStr(value));
}

function validateEmployeeInput(data = {}) {
  const normalizeString = (value) =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim();

  const name = normalizeString(data.name);
  if (name.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'name',
        message: 'Името е задължително и трябва да съдържа поне 2 символа.',
      },
    };
  }

  const department = normalizeString(data.department);
  if (department.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'department',
        message: 'Отделът е задължителен и трябва да съдържа поне 2 символа.',
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

  const rawVacationAllowance = data.vacationAllowance;
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

  const vacationAllowance = Number(rawVacationAllowance);
  if (!Number.isFinite(vacationAllowance) || vacationAllowance < 0) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.',
      },
    };
  }

  return {
    valid: true,
    value: {
      name,
      department,
      position,
      vacationAllowance,
    },
  };
}

async function initDatabase() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      position TEXT NOT NULL,
      vacation_allowance INTEGER NOT NULL DEFAULT 20,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

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
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
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
    const [employees, schedules, scheduleEntries, shiftTemplates] = await Promise.all([
      pool.query(
        `SELECT id, name, department, position,
         vacation_allowance AS "vacationAllowance"
         FROM employees ORDER BY created_at, name`
      ),
      pool.query(
        `SELECT id, name, month_key AS month, department, status,
         created_at AS "createdAt"
         FROM schedules ORDER BY created_at, id`
      ),
      pool.query(
        `SELECT schedule_id, employee_id, day, shift_code FROM schedule_entries`
      ),
      pool.query(
        `SELECT code, name,
         start_time AS start,
         end_time AS "end",
         hours
         FROM shift_templates ORDER BY created_at, code`
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
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/departments', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT department
       FROM employees
       WHERE NULLIF(TRIM(department), '') IS NOT NULL
       ORDER BY department`
    );

    res.json({ departments: result.rows.map((row) => row.department) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, department, position, vacationAllowance } = validation.value;

  try {
    const result = await pool.query(
      `INSERT INTO employees (name, department, position, vacation_allowance)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, department, position, vacation_allowance AS "vacationAllowance"`,
      [name, department, position, vacationAllowance]
    );

    res.status(201).json({ ok: true, employee: result.rows[0] });
  } catch (error) {
    console.error('EMPLOYEE POST ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  try {
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  const month = cleanStr(req.body?.month_key || req.body?.month || req.body?.monthKey);
  const department = cleanStr(req.body?.department);
  const name = cleanStr(req.body?.name) || `${department} график ${month}`;

  if (!isValidMonthKey(month)) {
    return res.status(400).json({ message: 'Месецът трябва да е във формат YYYY-MM.' });
  }

  if (!department) {
    return res.status(400).json({ message: 'department е задължително поле.' });
  }

  try {
    const existing = await pool.query(
      `SELECT id, name, month_key AS month, department, status, created_at AS "createdAt"
       FROM schedules
       WHERE month_key = $1 AND department = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [month, department]
    );

    if (existing.rowCount > 0) {
      return res.json({
        ok: true,
        schedule_id: existing.rows[0].id,
        schedule: existing.rows[0],
      });
    }

    const created = await pool.query(
      `INSERT INTO schedules (name, month_key, department, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, month_key AS month, department, status, created_at AS "createdAt"`,
      [name, month, department, 'draft']
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
  const month = cleanStr(req.query.month);
  if (month && !isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month трябва да е във формат YYYY-MM.' });
  }

  try {
    const params = [];
    const where = [];
    if (month) {
      params.push(month);
      where.push(`month_key = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const schedulesResult = await pool.query(
      `SELECT id, department, name, status
       FROM schedules
       ${whereSql}
       ORDER BY month_key, COALESCE(department, ''), created_at`,
      params
    );

    res.json({ schedules: schedulesResult.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedule-view', async (req, res) => {
  const month = cleanStr(req.query.month);
  const departments = cleanStr(req.query.departments)
    .split(',')
    .map((department) => cleanStr(department))
    .filter(Boolean);

  if (!isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month трябва да е във формат YYYY-MM.' });
  }

  if (!departments.length) {
    return res.status(400).json({ message: 'departments е задължителен списък.' });
  }

  try {
    const employeesResult = await pool.query(
      `SELECT id, name, department, position, vacation_allowance AS "vacationAllowance"
       FROM employees
       WHERE department = ANY($1::text[])
       ORDER BY department, name`,
      [departments]
    );

    const schedulesResult = await pool.query(
      `SELECT id, department, name, status
       FROM schedules
       WHERE month_key = $1
         AND department = ANY($2::text[])
       ORDER BY department, created_at DESC`,
      [month, departments]
    );

    const scheduleIds = schedulesResult.rows.map((row) => row.id);
    const entriesResult = scheduleIds.length
      ? await pool.query(
          `SELECT schedule_id, employee_id, day, shift_code
           FROM schedule_entries
           WHERE schedule_id = ANY($1::uuid[])
           ORDER BY schedule_id, employee_id, day`,
          [scheduleIds]
        )
      : { rows: [] };

    res.json({
      month,
      departments,
      employees: employeesResult.rows,
      schedules: schedulesResult.rows,
      entries: entriesResult.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules/merged', async (req, res) => {
  const month = cleanStr(req.query.month);
  if (!isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month трябва да е във формат YYYY-MM.' });
  }

  try {
    const schedulesResult = await pool.query(
      `SELECT id, name, month_key AS month, department, status, created_at AS "createdAt"
       FROM schedules
       WHERE month_key = $1
       ORDER BY COALESCE(department, ''), created_at, id`,
      [month]
    );

    const entriesResult = await pool.query(
      `WITH ranked_entries AS (
         SELECT
           se.schedule_id,
           se.employee_id,
           se.day,
           se.shift_code,
           ROW_NUMBER() OVER (
             PARTITION BY se.employee_id, se.day
             ORDER BY s.created_at DESC, se.schedule_id DESC
           ) AS rn
         FROM schedule_entries se
         JOIN schedules s ON s.id = se.schedule_id
         WHERE s.month_key = $1
       )
       SELECT
         re.schedule_id AS "scheduleId",
         re.employee_id AS "employeeId",
         e.name AS "employeeName",
         e.department,
         re.day,
         re.shift_code AS "shiftCode"
       FROM ranked_entries re
       JOIN employees e ON e.id = re.employee_id
       WHERE re.rn = 1
       ORDER BY e.department, e.name, re.day`,
      [month]
    );

    res.json({
      month,
      schedules: schedulesResult.rows,
      entries: entriesResult.rows,
    });
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
      `SELECT id, name, month_key AS month, department, status, created_at AS "createdAt"
       FROM schedules WHERE id = $1`,
      [scheduleId]
    );

    if (scheduleResult.rowCount === 0) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];

    const employeesResult = await pool.query(
      `SELECT id, name, department, position, vacation_allowance AS "vacationAllowance"
       FROM employees
       WHERE ($1::text IS NULL OR department = $1)
       ORDER BY name`,
      [schedule.department]
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

  if (!isValidUuid(scheduleId) || !isValidUuid(employeeId)) {
    return res.status(400).json({ message: 'Невалиден scheduleId или employeeId.' });
  }

  if (!Number.isInteger(day) || day < 1 || day > 31 || !shiftCode) {
    return res.status(400).json({ message: 'Невалидни данни за запис в график.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, department, status FROM schedules WHERE id = $1`,
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
      `SELECT id, department FROM employees WHERE id = $1`,
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
