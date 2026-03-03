const test = require('node:test');
const assert = require('node:assert/strict');

const { createHolidayService, getBgHolidaySeedRows } = require('./holidayService');

function createMockPool({ tenant = [], official = [], legacyOfficialColumns = false } = {}) {
  return {
    async query(sql, values) {
      const text = String(sql);
      if (text.includes("to_regclass('public.tenant_holidays')")) {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (text.includes("to_regclass('public.public_holidays_bg')")) {
        return { rows: [{ exists: false }], rowCount: 1 };
      }
      if (text.includes("to_regclass('public.holidays')")) {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (text.includes('FROM tenant_holidays')) {
        if (text.includes('BETWEEN')) {
          const rows = tenant.filter((item) => item.tenant_id === values[0] && item.date >= values[1] && item.date <= values[2]);
          return { rows, rowCount: rows.length };
        }
        const row = tenant.find((item) => item.tenant_id === values[0] && item.date === values[1]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (legacyOfficialColumns && text.includes('FROM holidays') && text.includes('is_official')) {
        const error = new Error('column "is_official" does not exist');
        error.code = '42703';
        throw error;
      }
      if (legacyOfficialColumns && text.includes('INSERT INTO holidays') && text.includes('is_official')) {
        const error = new Error('column "is_official" does not exist');
        error.code = '42703';
        throw error;
      }
      if (text.includes('FROM holidays')) {
        if (text.includes('BETWEEN')) {
          const rows = official.filter((item) => item.date >= values[0] && item.date <= values[1]);
          return { rows, rowCount: rows.length };
        }
        const row = official.find((item) => item.date === values[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (text.includes('INSERT INTO holidays')) {
        const date = values[0];
        const name = values[1];
        const existingIdx = official.findIndex((item) => item.date === date);
        const row = { date, name, source: values[2] || 'platform', is_official: true };
        if (existingIdx >= 0) {
          official[existingIdx] = { ...official[existingIdx], ...row };
        } else {
          official.push(row);
        }
        return { rows: [row], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${text}`);
    }
  };
}

test('isHoliday official day', async () => {
  const pool = createMockPool({ official: [{ date: '2026-03-03', name: 'Official' }] });
  const service = createHolidayService(pool);
  const result = await service.isHoliday('t1', '2026-03-03');
  assert.equal(result.isHoliday, true);
  assert.equal(result.type, 'official');
});

test('isHoliday company day off', async () => {
  const pool = createMockPool({ tenant: [{ tenant_id: 't1', date: '2026-03-04', name: 'Company', is_company_day_off: true, is_working_day_override: false }] });
  const service = createHolidayService(pool);
  const result = await service.isHoliday('t1', '2026-03-04');
  assert.equal(result.isHoliday, true);
  assert.equal(result.type, 'company');
});

test('working override cancels official', async () => {
  const pool = createMockPool({
    tenant: [{ tenant_id: 't1', date: '2026-03-03', name: 'Работен ден', is_company_day_off: false, is_working_day_override: true }],
    official: [{ date: '2026-03-03', name: 'Official' }],
  });
  const service = createHolidayService(pool);
  const result = await service.isHoliday('t1', '2026-03-03');
  assert.equal(result.isHoliday, false);
  assert.equal(result.type, 'override_working');
});

test('seed includes observed day when official holiday falls on weekend', () => {
  const rows = getBgHolidaySeedRows(2026);
  const observed = rows.find((row) => row.date === '2026-09-07');

  assert.ok(observed);
  assert.equal(observed.name, 'Съединението (компенсация по КТ)');
  assert.equal(observed.source, 'BG official (observed)');
});

test('seed does not add compensatory day for easter weekend dates', () => {
  const rows = getBgHolidaySeedRows(2026);
  const easterObserved = rows.find((row) => row.name.includes('Великден') && row.source === 'BG official (observed)');

  assert.equal(easterObserved, undefined);
});

test('seed observed days avoid duplicates and weekends', () => {
  const rows = getBgHolidaySeedRows(2022);
  const christmasObserved = rows.find((row) => row.date === '2022-12-27');
  const newYearObserved = rows.find((row) => row.date === '2022-01-03');

  assert.ok(newYearObserved);
  assert.ok(christmasObserved);
  assert.equal(rows.filter((row) => row.date === '2022-12-27').length, 1);
});


test('isHoliday falls back to Bulgarian official calendar when table has no row', async () => {
  const pool = createMockPool({ official: [] });
  const service = createHolidayService(pool);
  const result = await service.isHoliday('t1', '2026-03-03');

  assert.equal(result.isHoliday, true);
  assert.equal(result.type, 'official');
  assert.equal(result.name, 'Освобождение на България');
});

test('listCombined includes fallback official holidays for the selected range', async () => {
  const pool = createMockPool({ official: [] });
  const service = createHolidayService(pool);
  const rows = await service.listCombined('t1', '2026-03-01', '2026-03-31');

  const march3 = rows.find((row) => row.date === '2026-03-03');
  assert.ok(march3);
  assert.equal(march3.isHoliday, true);
  assert.equal(march3.type, 'official');
});


test('listPublicHolidays supports legacy holidays table without extra columns', async () => {
  const pool = createMockPool({ official: [{ date: '2026-03-03', name: 'Official' }], legacyOfficialColumns: true });
  const service = createHolidayService(pool);

  const rows = await service.listPublicHolidays('2026-03-01', '2026-03-31');
  const item = rows.find((row) => row.date === '2026-03-03');

  assert.ok(item);
  assert.equal(item.name, 'Official');
  assert.equal(item.isOfficial, true);
});

test('upsertPublicHoliday supports legacy holidays table without extra columns', async () => {
  const pool = createMockPool({ official: [], legacyOfficialColumns: true });
  const service = createHolidayService(pool);

  const row = await service.upsertPublicHoliday({ date: '2026-02-01', name: 'Тест', source: 'platform' });

  assert.equal(row.date, '2026-02-01');
  assert.equal(row.name, 'Тест');
  assert.equal(row.isOfficial, true);
});
