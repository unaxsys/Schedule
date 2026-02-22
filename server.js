require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 4000);

// ✅ Prefer DATABASE_URL, fallback to PG* vars
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
app.use(express.static(path.join(__dirname)));

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      position TEXT NOT NULL,
      vacation_allowance INTEGER NOT NULL DEFAULT 20,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

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

  await pool.query('ALTER TABLE schedule_entries ALTER COLUMN shift_code TYPE VARCHAR(16)');
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('DB health error:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const employeesResult = await pool.query(
      'SELECT id, name, department, position, vacation_allowance AS "vacationAllowance" FROM employees ORDER BY created_at, name'
    );

    const scheduleResult = await pool.query(
      'SELECT employee_id, month_key, day, shift_code FROM schedule_entries'
    );

    const shiftsResult = await pool.query(
      'SELECT code, name, start_time AS start, end_time AS "end", hours FROM shift_templates ORDER BY created_at, code'
    );

    const schedule = {};
    for (const row of scheduleResult.rows) {
      schedule[`${row.employee_id}|${row.month_key}|${row.day}`] = row.shift_code;
    }

    res.json({ employees: employeesResult.rows, schedule, shiftTemplates: shiftsResult.rows });
  } catch (error) {
    console.error('STATE error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
  const rawId = req.body?.id;
  const name = String(req.body?.name ?? '').trim();
  const department = String(req.body?.department ?? '').trim();
  const position = String(req.body?.position ?? '').trim();
  const vacationAllowance = Number(req.body?.vacationAllowance ?? 20);

  if (!name || !department || !position) {
    return res.status(400).json({ message: 'Невалидни данни за служител.' });
  }

  const isValidUuid =
    typeof rawId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);

  const id = isValidUuid ? rawId : require('uuid').v4();

  try {
    const result = await pool.query(
      `INSERT INTO employees (id, name, department, position, vacation_allowance)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name,
                     department = EXCLUDED.department,
                     position = EXCLUDED.position,
                     vacation_allowance = EXCLUDED.vacation_allowance
       RETURNING id, name, department, position, vacation_allowance AS "vacationAllowance"`,
      [id, name, department, position, Number.isFinite(vacationAllowance) ? vacationAllowance : 20]
    );

    return res.status(201).json({ ok: true, employee: result.rows[0] });
  } catch (error) {
    console.error('EMPLOYEES POST error:', error);
    return res.status(500).json({ message: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('EMPLOYEES DELETE error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedule-entry', async (req, res) => {
  const { employeeId, month, day, shiftCode } = req.body;

  if (!employeeId || !month || !day || !shiftCode) {
    res.status(400).json({ message: 'Невалидни данни за графика.' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO schedule_entries (employee_id, month_key, day, shift_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, month_key, day)
       DO UPDATE SET shift_code = EXCLUDED.shift_code`,
      [employeeId, month, Number(day), shiftCode]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('SCHEDULE ENTRY error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/shift-template', async (req, res) => {
  const { code, name, start, end, hours } = req.body;
  if (!code || !name || !start || !end || Number(hours) <= 0) {
    res.status(400).json({ message: 'Невалидни данни за смяна.' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO shift_templates (code, name, start_time, end_time, hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code)
       DO UPDATE SET name = EXCLUDED.name,
                     start_time = EXCLUDED.start_time,
                     end_time = EXCLUDED.end_time,
                     hours = EXCLUDED.hours`,
      [code, name, start, end, Number(hours)]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('SHIFT TEMPLATE error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/shift-template/:code', async (req, res) => {
  try {
    await pool.query('DELETE FROM shift_templates WHERE code = $1', [req.params.code]);
    res.json({ ok: true });
  } catch (error) {
    console.error('SHIFT TEMPLATE DELETE error:', error);
    res.status(500).json({ message: error.message });
  }
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
