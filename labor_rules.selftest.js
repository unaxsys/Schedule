const {
  parseTimeToMinutes,
  calcShiftDurationHours,
  calcNightHours,
  calcDayType,
  computeMonthlySummary,
} = require('./labor_rules');

console.assert(parseTimeToMinutes('09:30') === 570, 'parseTimeToMinutes failed');
console.assert(calcShiftDurationHours('22:00', '06:00') === 8, 'overnight duration failed');
console.assert(calcNightHours('21:00', '07:00') === 8, 'night hours failed');

const holiday = calcDayType('2026-03-03');
console.assert(holiday.isHoliday === true, 'holiday detection failed');

const summary = computeMonthlySummary({
  monthKey: '2026-03',
  employees: [{ id: 'e1', start_date: '2026-01-01', end_date: null }],
  schedules: [{ id: 's1' }],
  selectedScheduleIds: ['s1'],
  shiftTemplates: [{ code: 'D', start: '09:00', end: '17:00', hours: 8 }],
  scheduleEntries: [
    { schedule_id: 's1', employee_id: 'e1', day: 2, shift_code: 'D' },
    { schedule_id: 's1', employee_id: 'e1', day: 3, shift_code: 'O' },
  ],
});

const e1 = summary.get('e1');
console.assert(e1 && e1.workedHours === 8, 'workedHours failed');
console.assert(e1 && e1.vacationDays === 1, 'vacationDays failed');
console.assert(e1 && Array.isArray(e1.violations), 'violations array missing');

console.log('labor_rules.selftest: OK');
