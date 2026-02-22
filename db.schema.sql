CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  vacation_allowance INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_entries (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month_key CHAR(7) NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
  shift_code VARCHAR(2) NOT NULL,
  PRIMARY KEY (employee_id, month_key, day)
);
