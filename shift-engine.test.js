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
  assert.equal(snapshot.overtime_minutes, 0);
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

test('split shift on holiday sums all interval minutes', () => {
  const holidays = new Set(['2026-05-01']);
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-05-01',
    intervals: [
      { start: '08:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ],
    breakMinutes: 0,
    breakIncluded: false,
    holidayResolver: (dateISO) => ({ isHoliday: holidays.has(dateISO) }),
  });

  assert.equal(snapshot.work_minutes, 480);
  assert.equal(snapshot.holiday_minutes, 480);
});

test('split shift on non-holiday has zero holiday minutes', () => {
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-05-02',
    intervals: [
      { start: '08:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ],
    breakMinutes: 0,
    breakIncluded: false,
    holidayResolver: () => ({ isHoliday: false }),
  });

  assert.equal(snapshot.work_minutes, 480);
  assert.equal(snapshot.holiday_minutes, 0);
});

test('split shift across midnight calculates holiday by date per segment', () => {
  const holidays = new Set(['2026-05-02']);
  const snapshot = computeShiftSnapshot({
    dateISO: '2026-05-01',
    intervals: [
      { start: '20:00', end: '22:00' },
      { start: '23:00', end: '04:00' },
    ],
    breakMinutes: 0,
    breakIncluded: false,
    holidayResolver: (dateISO) => ({ isHoliday: holidays.has(dateISO) }),
  });

  assert.equal(snapshot.work_minutes, 420);
  assert.equal(snapshot.holiday_minutes, 240);
});
