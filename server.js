require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 4000);

/* ============================= */
/*           DATABASE            */
/* ============================= */

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

/* ============================= */
/*         MIDDLEWARES           */
/* ============================= */

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

/* ============================= */
/*        HELPER FUNCTIONS       */
/* ============================= */

function isValidUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function cleanStr(v) {
  return String(v ?? '').trim();
}

function validateEmployeeInput(body) {
  const name = cleanStr(body?.name);
  const department = cleanStr(body?.department);
  const position = cleanStr(body?.position);
  const vacationAllowance = Number(body?.vacationAllowance ?? 20);

  if (!name || name.length < 2) {
    return { error: 'Името е задължително (мин. 2 символа).' };
  }

  if (!department || department.length < 2) {
    return { error: 'Отделът е задължителен.' };
  }

  if (!position || position.length < 2) {
    return { error: 'Длъжността е задължителна.' };
  }

  if (!Number.isFinite(vacationAllowance) || vacationAllowance < 0) {
    return { error: 'Невалиден брой дни отпуск.' };
  }

  return {
    value: {
      name,
      department,
      position,
      vacationAllowance,
    },
  };
}

/* ============================= */
/*         INIT DATABASE         */
/* ============================= */

function validateEmployeeInput(data = {}) {
  const normalizeString = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

  const name = normalizeString(data.name);
  if (name.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'name',
        message: 'Името е задължително и трябва да съдържа поне 2 символа.'
      }
    };
  }

  const department = normalizeString(data.department);
  if (department.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'department',
        message: 'Отделът е задължителен и трябва да съдържа поне 2 символа.'
      }
    };
  }

  const position = normalizeString(data.position);
  if (position.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'position',
        message: 'Позицията е задължителна и трябва да съдържа поне 2 символа.'
      }
    };
  }

  const rawVacationAllowance = data.vacationAllowance;
  if (rawVacationAllowance === undefined || rawVacationAllowance === null || String(rawVacationAllowance).trim() === '') {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.'
      }
    };
  }

  const vacationAllowance = Number(rawVacationAllowance);
  if (!Number.isFinite(vacationAllowance) || vacationAllowance < 0) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.'
      }
    };
  }

  return {
    valid: true,
    value: {
      name,
      department,
      position,
      vacationAllowance
    }
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

  await pool.query('ALTER TABLE employees ALTER COLUMN id SET DEFAULT gen_random_uuid()');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month_key CHAR(7) NOT NULL,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
      PRIMARY KEY (employee_id, month_key, day)
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

/* ============================= */
/*            ROUTES             */
/* ============================= */

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
    const employees = await pool.query(
      `SELECT id, name, department, position,
       vacation_allowance AS "vacationAllowance"
       FROM employees ORDER BY created_at, name`
    );

    const scheduleEntries = await pool.query(
      `SELECT employee_id, month_key, day, shift_code FROM schedule_entries`
    );

    const shiftTemplates = await pool.query(
      `SELECT code, name,
       start_time AS start,
       end_time AS "end",
       hours
       FROM shift_templates ORDER BY created_at, code`
    );

    const schedule = {};
    for (const row of scheduleEntries.rows) {
      schedule[`${row.employee_id}|${row.month_key}|${row.day}`] = row.shift_code;
    }

    res.json({
      employees: employees.rows,
      schedule,
      shiftTemplates: shiftTemplates.rows,
    });
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

    res.status(201).json({
      ok: true,
      employee: result.rows[0],
    });
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

/* ============================= */
/*         SCHEDULE ENTRY        */
/* ============================= */

app.post('/api/schedule-entry', async (req, res) => {
  const employeeId = req.body?.employeeId;
  const month = cleanStr(req.body?.month);
  const day = Number(req.body?.day);
  const shiftCode = cleanStr(req.body?.shiftCode);

  if (!isValidUuid(employeeId) || !month || !day || !shiftCode) {
    return res.status(400).json({ message: 'Невалидни данни за графика.' });
  }

  try {
    await pool.query(
      `INSERT INTO schedule_entries (employee_id, month_key, day, shift_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, month_key, day)
       DO UPDATE SET shift_code = EXCLUDED.shift_code`,
      [employeeId, month, day, shiftCode]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ============================= */
/*       SHIFT TEMPLATES         */
/* ============================= */

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

/* ============================= */
/*        STATIC FRONTEND        */
/* ============================= */

app.use(express.static(path.join(__dirname)));

/* ============================= */
/*            START              */
/* ============================= */

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
