const test = require('node:test');
const assert = require('node:assert/strict');

const { computeShiftSnapshot } = require('./lib/shift-engine');

test('08:00-17:00 break excluded computes 8 hours work', () => {
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-02-16',
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
    breakIncluded: false,
    plannedMinutes: 480,
  });

  assert.equal(snapshot.duration_minutes, 540);
  assert.equal(snapshot.work_minutes, 480);
  assert.equal(snapshot.break_minutes_applied, 60);
  assert.equal(snapshot.overtime_minutes, 0);
});

test('19:00-07:00 included splits night minutes correctly', () => {
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-02-16',
    startTime: '19:00',
    endTime: '07:00',
    breakMinutes: 0,
    breakIncluded: true,
    plannedMinutes: 480,
  });

  assert.equal(snapshot.work_minutes, 720);
  assert.equal(snapshot.night_minutes, 480);
  assert.equal(snapshot.cross_midnight, true);
  assert.equal(snapshot.overtime_minutes, 240);
});

test('weekend and holiday split across midnight', () => {
  const holidays = new Set(['2026-02-15']);
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-02-14', // Saturday
    startTime: '22:00',
    endTime: '06:00',
    breakMinutes: 0,
    breakIncluded: true,
    plannedMinutes: 480,
    holidayResolver: (dateISO) => ({ isHoliday: holidays.has(dateISO) }),
  });

  assert.equal(snapshot.work_minutes, 480);
  assert.equal(snapshot.weekend_minutes, 480);
  assert.equal(snapshot.holiday_minutes, 360);
});
