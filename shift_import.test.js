const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCsvText,
  normalizeImportRow,
  buildDuplicateKey,
  buildImportPreview,
} = require('./shift_import');

test('parseCsvText parses header + rows', () => {
  const rows = parseCsvText('name,start_time,end_time\nДневна,08:00,17:00');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Дневна');
  assert.equal(rows[0].start_time, '08:00');
});

test('normalizeImportRow validates HH:MM and duration <= 12h', () => {
  const invalidTime = normalizeImportRow({ name: 'X', start_time: '25:00', end_time: '06:00' });
  assert.ok(invalidTime.errors.some((err) => err.includes('HH:MM')));

  const tooLong = normalizeImportRow({ name: 'X', start_time: '08:00', end_time: '23:00' });
  assert.ok(tooLong.errors.some((err) => err.includes('<= 12 часа')));

  const overnightValid = normalizeImportRow({ name: 'Нощна', start_time: '19:00', end_time: '07:00', break_minutes: 60, break_included: true });
  assert.equal(overnightValid.errors.length, 0);
  assert.equal(overnightValid.normalizedRow.duration_minutes, 720);
});

test('normalizeImportRow enforces worked_minutes >= 0 when break excluded', () => {
  const row = normalizeImportRow({
    name: 'Къса',
    start_time: '08:00',
    end_time: '09:00',
    break_minutes: 90,
    break_included: false,
  });
  assert.ok(row.errors.some((err) => err.includes('worked_minutes')));
});

test('buildDuplicateKey prioritizes code over composite key', () => {
  const byCode = buildDuplicateKey({ code: 'D1', name: 'X', start_time: '08:00', end_time: '17:00' });
  assert.equal(byCode, 'code:D1');

  const byComposite = buildDuplicateKey({ code: null, name: 'Дневна', start_time: '08:00', end_time: '17:00' });
  assert.equal(byComposite, 'composite:дневна|08:00|17:00');
});

test('buildImportPreview detects existing duplicate and keeps only to_create rows', () => {
  const rows = [
    { name: 'Дневна', code: 'D1', start_time: '08:00', end_time: '17:00' },
    { name: 'Нощна', code: 'N1', start_time: '19:00', end_time: '07:00' },
  ];
  const existingShifts = [
    { id: 'existing-1', name: 'Дневна', code: 'D1', start_time: '08:00', end_time: '17:00' },
  ];

  const preview = buildImportPreview({ rows, existingShifts });
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.duplicates[0].existingShiftId, 'existing-1');
  assert.equal(preview.to_create.length, 1);
  assert.equal(preview.to_create[0].normalizedRow.code, 'N1');
});

test('buildImportPreview marks duplicate rows inside file', () => {
  const rows = [
    { name: 'Дневна', start_time: '08:00', end_time: '17:00' },
    { name: 'Дневна', start_time: '08:00', end_time: '17:00' },
  ];

  const preview = buildImportPreview({ rows, existingShifts: [] });
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.duplicates[0].reason, 'duplicate_in_file');
  assert.equal(preview.to_create.length, 1);
});
