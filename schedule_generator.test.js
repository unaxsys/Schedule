const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDaysOfMonth,
  buildPattern,
  validateRest,
  applyOverwriteMode,
} = require('./schedule_generator');

test('12h 2/2 pattern correctness', () => {
  const pattern = buildPattern('SIRV_12H_2_2', { day12ShiftId: 'D12', night12ShiftId: 'N12' });
  const values = Array.from({ length: 8 }, (_, dayIndex) => pattern({ dayIndex }));
  assert.deepEqual(values, ['D12', 'N12', null, null, 'D12', 'N12', null, null]);
});

test('cross-month start_pattern_day indexing', () => {
  const pattern = buildPattern('SIRV_12H_2_2', { day12ShiftId: 'D12', night12ShiftId: 'N12' });
  const days = getDaysOfMonth('2026-02');
  const startPatternDay = 31;

  const byDay = new Map();
  days.forEach((dateISO) => {
    const day = Number(dateISO.slice(-2));
    const dayIndex = day - startPatternDay;
    byDay.set(day, pattern({ dayIndex }));
  });

  assert.equal(byDay.get(1), null);
  assert.equal(byDay.get(2), null);
  assert.equal(byDay.get(3), 'D12');
  assert.equal(byDay.get(4), 'N12');
});

test('overwrite_mode behavior', () => {
  const manualEntry = { shift_id: 's1', shift_code: 'A', is_manual: true };
  const autoEntry = { shift_id: 's1', shift_code: 'A', is_manual: false };
  const emptyEntry = { shift_id: null, shift_code: '', is_manual: false };

  assert.equal(applyOverwriteMode(emptyEntry, 'empty_only'), true);
  assert.equal(applyOverwriteMode(manualEntry, 'empty_only'), false);
  assert.equal(applyOverwriteMode(autoEntry, 'overwrite_auto_only'), true);
  assert.equal(applyOverwriteMode(manualEntry, 'overwrite_auto_only'), false);
  assert.equal(applyOverwriteMode(manualEntry, 'overwrite_all'), true);
});

test('rest validation prevents illegal sequences', () => {
  const illegal = validateRest(
    {
      dateISO: '2026-02-10',
      shift: { start_time: '19:00', end_time: '07:00' },
    },
    {
      dateISO: '2026-02-11',
      shift: { start_time: '14:00', end_time: '22:00' },
    },
    12,
    false
  );
  assert.equal(illegal.ok, false);

  const enforce24 = validateRest(
    {
      dateISO: '2026-02-10',
      shift: { start_time: '07:00', end_time: '19:00' },
    },
    {
      dateISO: '2026-02-11',
      shift: { start_time: '14:00', end_time: '22:00' },
    },
    12,
    true
  );
  assert.equal(enforce24.ok, false);
});
