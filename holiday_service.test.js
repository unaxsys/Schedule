const test = require('node:test');
const assert = require('node:assert/strict');

const { createHolidayService, getBgHolidaySeedRows } = require('./holidayService');

function createMockPool({ tenant = [], official = [] } = {}) {
  return {
    async query(sql, values) {
      const text = String(sql);
      if (text.includes("to_regclass('public.tenant_holidays')")) {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (text.includes("to_regclass('public.holidays')")) {
        return { rows: [{ exists: true }], rowCount: 1 };
      }
      if (text.includes('FROM tenant_holidays')) {
        const row = tenant.find((item) => item.tenant_id === values[0] && item.date === values[1]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('FROM holidays')) {
        const row = official.find((item) => item.date === values[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
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
  assert.equal(observed.name, 'Съединението (компенсация)');
  assert.equal(observed.source, 'BG official (observed)');
});

test('seed observed days avoid duplicates and weekends', () => {
  const rows = getBgHolidaySeedRows(2022);
  const christmasObserved = rows.find((row) => row.date === '2022-12-27');
  const newYearObserved = rows.find((row) => row.date === '2022-01-03');

  assert.ok(newYearObserved);
  assert.ok(christmasObserved);
  assert.equal(rows.filter((row) => row.date === '2022-12-27').length, 1);
});
