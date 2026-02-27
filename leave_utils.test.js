const test = require('node:test');
const assert = require('node:assert/strict');

const {
  enumerateDates,
  computeAdjustedNormMinutes,
  mapLeavesByEmployeeDay,
  getLeaveShortLabel,
} = require('./leave_utils');

test('enumerateDates returns inclusive range', () => {
  assert.deepEqual(enumerateDates('2026-03-01', '2026-03-03'), ['2026-03-01', '2026-03-02', '2026-03-03']);
});

test('leave affects norm -> adjusted norm correct', () => {
  const adjusted = computeAdjustedNormMinutes(4800, [
    { affects_norm: true, date_from: '2026-03-03', date_to: '2026-03-04', minutes_per_day: null },
    { affects_norm: true, date_from: '2026-03-10', date_to: '2026-03-10', minutes_per_day: 240 },
  ], 480);
  assert.equal(adjusted, 3600);
});

test('totals leave days map works', () => {
  const map = mapLeavesByEmployeeDay([
    { employee_id: 'emp-1', date_from: '2026-03-01', date_to: '2026-03-02', leave_type: { code: 'SICK' } },
  ]);
  assert.ok(map['emp-1|2026-03-01']);
  assert.ok(map['emp-1|2026-03-02']);
});

test('rendering sick short label shown as Б', () => {
  assert.equal(getLeaveShortLabel({ code: 'SICK', name: 'Болничен' }), 'Б');
});
