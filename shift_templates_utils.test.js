const test = require('node:test');
const assert = require('node:assert/strict');

const { validateShiftTemplatePayload, calculateDurationMinutes } = require('./shift_templates_utils');

test('validateShiftTemplatePayload accepts valid shift and computes worked minutes', () => {
  const result = validateShiftTemplatePayload({
    name: 'Дневна',
    code: 'D1',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    break_included: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.durationMinutes, 540);
  assert.equal(result.value.workedMinutes, 480);
});

test('validateShiftTemplatePayload rejects invalid HH:MM and duration > 12h', () => {
  const invalidTime = validateShiftTemplatePayload({ name: 'X', start_time: '8:00', end_time: '17:00' });
  assert.equal(invalidTime.ok, false);

  const tooLong = validateShiftTemplatePayload({ name: 'X', start_time: '06:00', end_time: '23:00' });
  assert.equal(tooLong.ok, false);
});

test('calculateDurationMinutes supports overnight shifts', () => {
  assert.equal(calculateDurationMinutes('22:00', '06:00'), 480);
});


test('validateShiftTemplatePayload subtracts break from attendance to get worked minutes', () => {
  const result = validateShiftTemplatePayload({
    name: 'Ранна',
    code: 'R1',
    start_time: '07:00',
    end_time: '16:00',
    break_minutes: 60,
    break_paid: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.breakIncluded, true);
  assert.equal(result.value.workedMinutes, 480);
});
