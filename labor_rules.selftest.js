const {
  parseTimeToMinutes,
  calcShiftDurationHours,
  calcNightHours,
  calcDayType,
  calcNormMinutes,
  calcWorkedMinutes,
  distributeOvertime,
  computeMonthlySummary,
  computeSirvPeriodSummary,
  summarizeViolationStatus,
} = require('./labor_rules');

console.assert(parseTimeToMinutes('09:30') === 570, 'parseTimeToMinutes failed');
console.assert(calcShiftDurationHours('22:00', '06:00') === 8, 'overnight duration failed');
console.assert(calcNightHours('21:00', '07:00') === 8, 'night hours failed');

const holiday = calcDayType('2026-03-03');
console.assert(holiday.isHoliday === true, 'holiday detection failed');

const normMinutes = calcNormMinutes([
  { isWeekend: false, isHoliday: false },
  { isWeekend: false, isHoliday: false },
  { isWeekend: true, isHoliday: false },
]);
console.assert(normMinutes === 960, 'calcNormMinutes failed');

const workedMinutes = calcWorkedMinutes([{ workMinutes: 480 }, { workMinutes: 240 }]);
console.assert(workedMinutes === 720, 'calcWorkedMinutes failed');

const split = distributeOvertime(300, 120, 120, 300);
console.assert(split.overtimeHolidayMinutes === 120 && split.overtimeRestdayMinutes === 120 && split.overtimeWeekdayMinutes === 60, 'distributeOvertime failed');

const summary = computeMonthlySummary({
  monthKey: '2026-03',
  employees: [{ id: 'e1', start_date: '2026-01-01', end_date: null, is_sirv: true, workday_minutes: 480 }],
  schedules: [{ id: 's1' }],
  selectedScheduleIds: ['s1'],
  shiftTemplates: [{ code: 'D', start: '09:00', end: '17:00', hours: 8 }],
  scheduleEntries: [
    { schedule_id: 's1', employee_id: 'e1', day: 2, shift_code: 'D' },
    { schedule_id: 's1', employee_id: 'e1', day: 7, shift_code: 'D' },
  ],
});

const e1 = summary.get('e1');
console.assert(e1 && e1.workedMinutes === 960, 'workedMinutes failed');
console.assert(e1 && e1.weekendWorkedHours === 8, 'weekendWorkedHours failed');
console.assert(e1 && e1.overtimeMinutes >= 0, 'overtimeMinutes missing');

// 28-day test case: 20 workdays x 8h = 160h, overtime 0; weekend hours are normal under SIRV.
const entries = [];
for (let day = 1; day <= 28; day += 1) {
  if (day <= 20) {
    entries.push({ schedule_id: 's2', employee_id: 'e2', day, shift_code: 'D' });
  }
}
const summary28 = computeMonthlySummary({
  monthKey: '2026-04',
  employees: [{ id: 'e2', start_date: '2026-01-01', end_date: null, is_sirv: true, workday_minutes: 480 }],
  schedules: [{ id: 's2' }],
  selectedScheduleIds: ['s2'],
  shiftTemplates: [{ code: 'D', start: '09:00', end: '17:00', hours: 8 }],
  scheduleEntries: entries,
});
const e2 = summary28.get('e2');
console.assert(e2 && e2.workedHours === 160, '28-day workedHours should be 160h');
console.assert(e2 && e2.normHours === 160, '28-day normHours should be 160h');
console.assert(e2 && e2.overtimeMinutes === 0, '28-day overtime should be 0');



const restViolationSummary = computeMonthlySummary({
  monthKey: '2026-05',
  employees: [{ id: 'e3', start_date: '2026-01-01', end_date: null, is_sirv: true, workday_minutes: 480 }],
  schedules: [{ id: 's3' }],
  selectedScheduleIds: ['s3'],
  shiftTemplates: [
    { code: 'N', start: '20:00', end: '08:00', hours: 12 },
    { code: 'E', start: '16:00', end: '00:00', hours: 8 },
  ],
  scheduleEntries: [
    { schedule_id: 's3', employee_id: 'e3', day: 5, shift_code: 'N' },
    { schedule_id: 's3', employee_id: 'e3', day: 6, shift_code: 'E' },
  ],
});
const e3 = restViolationSummary.get('e3');
console.assert(e3 && e3.violations.some((v) => v.type === 'DAILY_REST_VIOLATION'), 'daily rest violation expected');
console.assert(summarizeViolationStatus(e3.violations) === 'error', 'violation status should be error');

const sirvPeriod = computeSirvPeriodSummary({
  employee: { workday_minutes: 480 },
  periodDays: [
    { isWeekend: false, isHoliday: false },
    { isWeekend: false, isHoliday: false },
    { isWeekend: false, isHoliday: false },
  ],
  scheduleEntries: [
    { shift_code: 'D', work_minutes: 480, night_minutes: 0 },
    { shift_code: 'O', planned_minutes: 480 },
    { shift_code: 'D', work_minutes: 480, night_minutes: 420 },
  ],
});
console.assert(sirvPeriod.baseNormMinutes === 1440, 'base norm should be 1440');
console.assert(sirvPeriod.adjustedNormMinutes === 960, 'adjusted norm should deduct absence');
console.assert(sirvPeriod.overtimeMinutes > 0, 'converted overtime should be positive');

console.log('labor_rules.selftest: OK');
