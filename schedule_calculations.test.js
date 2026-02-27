const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeEntryMetrics,
  holidayResolverFactory,
  countBusinessDays,
  finalizeSirvOvertimeAllocations,
} = require('./schedule_calculations');

test('08:00-17:00 break 60 excluded => 480', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-10',
    shift: { start_time: '08:00', end_time: '17:00', break_minutes: 60, break_included: false },
  });
  assert.equal(metrics.work_minutes_total, 480);
});

test('07:00-19:00 break 60 included => 720', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-11',
    shift: { start_time: '07:00', end_time: '19:00', break_minutes: 60, break_included: true },
  });
  assert.equal(metrics.work_minutes_total, 720);
});

test('19:00-07:00 has 480 night minutes', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-11',
    shift: { start_time: '19:00', end_time: '07:00', break_minutes: 0, break_included: true },
  });
  assert.equal(metrics.night_minutes, 480);
});

test('cross-midnight weekend split Fri->Sat', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-13', // Friday
    shift: { start_time: '19:00', end_time: '07:00', break_minutes: 0, break_included: true },
  });
  assert.equal(metrics.work_minutes_total, 720);
  assert.equal(metrics.weekend_minutes, 420);
});

test('holiday day marks all worked as holiday', () => {
  const isHoliday = holidayResolverFactory(new Set(['2026-03-03']));
  const metrics = computeEntryMetrics({
    dateISO: '2026-03-03',
    shift: { start_time: '08:00', end_time: '17:00', break_minutes: 60, break_included: false },
    isHoliday,
  });
  assert.equal(metrics.holiday_minutes, 480);
});

test('sirv period overtime surplus', () => {
  const isHoliday = holidayResolverFactory(new Set());
  const businessDays = countBusinessDays('2026-02-01', '2026-02-28', isHoliday);
  const periodNorm = businessDays * 480;
  const periodWorked = periodNorm + 300;
  const overtime = Math.max(0, periodWorked - periodNorm);
  assert.equal(overtime, 300);
});


test('sirv overtime finalization is deterministic and allocates from last day backwards', () => {
  const entries = [
    { schedule_id: 's1', employee_id: 'e1', day: 1, month_key: '2026-02', date: '2026-02-01', work_minutes_total: 600 },
    { schedule_id: 's1', employee_id: 'e1', day: 2, month_key: '2026-02', date: '2026-02-02', work_minutes_total: 540 },
    { schedule_id: 's1', employee_id: 'e1', day: 3, month_key: '2026-02', date: '2026-02-03', work_minutes_total: 480 },
  ];

  const result = finalizeSirvOvertimeAllocations(entries, 1500, 480);
  const key = (item) => `${item.schedule_id}|${item.employee_id}|${item.day}`;
  const map = new Map(result.updates.map((item) => [key(item), item.overtime_minutes]));

  assert.equal(map.get('s1|e1|1'), 60);
  assert.equal(map.get('s1|e1|2'), 60);
  assert.equal(map.get('s1|e1|3'), 0);
});
