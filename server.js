require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'schedule_db',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || ''
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
    const employeesResult = await pool.query('SELECT id, name, department, position, vacation_allowance AS "vacationAllowance" FROM employees ORDER BY created_at, name');
    const scheduleResult = await pool.query('SELECT employee_id, month_key, day, shift_code FROM schedule_entries');

    const schedule = {};
    for (const row of scheduleResult.rows) {
      schedule[`${row.employee_id}|${row.month_key}|${row.day}`] = row.shift_code;
    }

    res.json({ employees: employeesResult.rows, schedule });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
  const { id, name, department, position, vacationAllowance } = req.body;
  if (!id || !name || !department || !position) {
    res.status(400).json({ message: 'Невалидни данни за служител.' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO employees (id, name, department, position, vacation_allowance)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name,
                     department = EXCLUDED.department,
                     position = EXCLUDED.position,
                     vacation_allowance = EXCLUDED.vacation_allowance`,
      [id, name, department, position, Number(vacationAllowance || 20)]
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
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
    res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Schedule backend ready on http://localhost:${port}`);
});
