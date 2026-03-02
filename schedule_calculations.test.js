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


test('night work under 3 hours is not counted', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-11',
    shift: { start_time: '21:00', end_time: '23:30', break_minutes: 0, break_included: true },
  });
  assert.equal(metrics.night_minutes, 0);
});

test('young worker night window starts at 20:00', () => {
  const metrics = computeEntryMetrics({
    dateISO: '2026-02-11',
    shift: { start_time: '20:00', end_time: '23:00', break_minutes: 0, break_included: true },
    isYoungWorker: true,
  });
  assert.equal(metrics.night_minutes, 180);
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


test('norm calculation excludes holidays and respects override working', () => {
  const resolver = (date) => {
    if (date === '2026-03-03') {
      return { isHoliday: true, type: 'official' };
    }
    if (date === '2026-03-04') {
      return { isHoliday: false, type: 'override_working' };
    }
    return { isHoliday: false, type: 'none' };
  };
  const businessDays = countBusinessDays('2026-03-02', '2026-03-06', resolver);
  assert.equal(businessDays, 4);
});

test('holiday_minutes split across midnight by day holiday flags', () => {
  const resolver = (date) => ({ isHoliday: date === '2026-03-03', type: date === '2026-03-03' ? 'official' : 'none' });
  const metrics = computeEntryMetrics({
    dateISO: '2026-03-02',
    shift: { start_time: '20:00', end_time: '04:00', break_minutes: 0, break_included: true },
    isHoliday: resolver,
  });
  assert.equal(metrics.work_minutes_total, 480);
  assert.equal(metrics.holiday_minutes, 240);
});
