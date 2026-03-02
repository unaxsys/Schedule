const NIGHT_HOURS_COEFFICIENT = 1.43;
const MIN_NIGHT_MINUTES_FOR_ELIGIBILITY = 3 * 60;
const DEFAULT_WEEKEND_RATE = 1.75;
const DEFAULT_HOLIDAY_RATE = 2;
const REST_BETWEEN_SHIFTS_MINUTES = 12 * 60;
const WEEKLY_REST_MINUTES = 36 * 60;
const MAX_SHIFT_HOURS = 12;
const MAX_SIRV_WEEKLY_HOURS = 56;
const MAX_CONSECUTIVE_WORK_DAYS = 5;
const DEFAULT_WORKDAY_MINUTES = 8 * 60;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseTimeToMinutes(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    return NaN;
  }

  const [hours, minutes] = text.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return NaN;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return NaN;
  }

  return hours * 60 + minutes;
}

function calcShiftDurationHours(startHHMM, endHHMM, hoursFieldOptional) {
  const explicitHours = Number(hoursFieldOptional);
  if (Number.isFinite(explicitHours) && explicitHours > 0) {
    return round2(explicitHours);
  }

  const startMinutes = parseTimeToMinutes(startHHMM);
  const endMinutesRaw = parseTimeToMinutes(endHHMM);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutesRaw)) {
    return 0;
  }

  let endMinutes = endMinutesRaw;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return round2((endMinutes - startMinutes) / 60);
}

function calcNightMinutes(startHHMM, endHHMM, { isYoungWorker = false, minNightMinutes = MIN_NIGHT_MINUTES_FOR_ELIGIBILITY } = {}) {
  const startMinutes = parseTimeToMinutes(startHHMM);
  const endMinutesRaw = parseTimeToMinutes(endHHMM);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutesRaw)) {
    return 0;
  }

  let endMinutes = endMinutesRaw;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const windows = isYoungWorker
    ? [
      [20 * 60, 24 * 60],
      [24 * 60, 30 * 60],
    ]
    : [
      [22 * 60, 24 * 60],
      [24 * 60, 30 * 60],
    ];

  let nightMinutes = 0;
  for (const [windowStart, windowEnd] of windows) {
    const overlapStart = Math.max(startMinutes, windowStart);
    const overlapEnd = Math.min(endMinutes, windowEnd);
    if (overlapEnd > overlapStart) {
      nightMinutes += overlapEnd - overlapStart;
    }
  }

  if (nightMinutes < minNightMinutes) {
    return 0;
  }

  return nightMinutes;
}

function calcNightHours(startHHMM, endHHMM, options = {}) {
  return round2(calcNightMinutes(startHHMM, endHHMM, options) / 60);
}

function orthodoxEasterDate(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  const julianDate = new Date(Date.UTC(year, month - 1, day));
  julianDate.setUTCDate(julianDate.getUTCDate() + 13);
  return julianDate;
}

function buildHolidaySetForYear(year) {
  const fixedHolidays = [
    `${year}-01-01`,
    `${year}-03-03`,
    `${year}-05-01`,
    `${year}-05-06`,
    `${year}-05-24`,
    `${year}-09-06`,
    `${year}-09-22`,
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];

  const easter = orthodoxEasterDate(year);
  const easterOffsets = [-2, -1, 0, 1];
  for (const offset of easterOffsets) {
    const date = new Date(easter);
    date.setUTCDate(easter.getUTCDate() + offset);
    fixedHolidays.push(date.toISOString().slice(0, 10));
  }

  return new Set(fixedHolidays);
}

function calcDayType(dateISO) {
  const text = String(dateISO || '').trim();
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return { isWeekend: false, isHoliday: false };
  }

  const year = date.getUTCFullYear();
  const weekday = date.getUTCDay();
  const holidays = buildHolidaySetForYear(year);

  return {
    isWeekend: weekday === 0 || weekday === 6,
    isHoliday: holidays.has(text),
  };
}

function emptySummary() {
  return {
    workedDays: 0,
    workedHours: 0,
    normHours: 0,
    deviation: 0,
    holidayWorkedHours: 0,
    weekendWorkedHours: 0,
    nightWorkedHours: 0,
    nightConvertedHours: 0,
    payableHours: 0,
    vacationDays: 0,
    sickDays: 0,
    violations: [],
    workedMinutes: 0,
    normMinutes: 0,
    overtimeMinutes: 0,
    normalMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
    overtimeWeekdayMinutes: 0,
    overtimeRestdayMinutes: 0,
    overtimeHolidayMinutes: 0,
  };
}

function monthDayCount(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) {
    return 0;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function calcNormMinutes(period = [], workdayMinutes = DEFAULT_WORKDAY_MINUTES) {
  const normalizedWorkday = Number.isFinite(Number(workdayMinutes)) && Number(workdayMinutes) > 0
    ? Math.trunc(Number(workdayMinutes))
    : DEFAULT_WORKDAY_MINUTES;
  let calendarWorkdays = 0;
  for (const day of period) {
    if (day && !day.isWeekend && !day.isHoliday) {
      calendarWorkdays += 1;
    }
  }
  return calendarWorkdays * normalizedWorkday;
}

function calcWorkedMinutes(schedule = []) {
  return schedule.reduce((acc, entry) => acc + Math.max(0, Number(entry?.workMinutes || 0)), 0);
}

function distributeOvertime(overtimeMinutes, minutesOnHolidays, minutesOnRestDays, minutesOnWeekdays) {
  let remaining = Math.max(0, Math.trunc(Number(overtimeMinutes) || 0));

  const overtimeHolidayMinutes = Math.min(remaining, Math.max(0, Math.trunc(Number(minutesOnHolidays) || 0)));
  remaining -= overtimeHolidayMinutes;

  const overtimeRestdayMinutes = Math.min(remaining, Math.max(0, Math.trunc(Number(minutesOnRestDays) || 0)));
  remaining -= overtimeRestdayMinutes;

  const overtimeWeekdayMinutes = Math.min(remaining, Math.max(0, Math.trunc(Number(minutesOnWeekdays) || 0)));

  return {
    overtimeHolidayMinutes,
    overtimeRestdayMinutes,
    overtimeWeekdayMinutes,
  };
}

function computeMonthlySummary({
  monthKey,
  employees = [],
  schedules = [],
  scheduleEntries = [],
  shiftTemplates = [],
  selectedScheduleIds = [],
  weekendRate = DEFAULT_WEEKEND_RATE,
  holidayRate = DEFAULT_HOLIDAY_RATE,
}) {
  const result = new Map();
  const shiftByCode = new Map(shiftTemplates.map((shift) => [String(shift.code), shift]));
  const selectedSet = selectedScheduleIds?.length ? new Set(selectedScheduleIds.map(String)) : new Set();
  const allowedScheduleIds = selectedSet.size
    ? selectedSet
    : new Set(schedules.map((schedule) => String(schedule.id)));

  const totalDays = monthDayCount(monthKey);
  const [year, month] = String(monthKey || '').split('-').map(Number);

  for (const employee of employees) {
    const summary = emptySummary();
    const employeeId = String(employee.id);
    const startDate = employee.start_date || employee.startDate || null;
    const endDate = employee.end_date || employee.endDate || null;
    const isSirv = Boolean(employee.is_sirv ?? employee.isSirv);
    const workdayMinutes = Math.max(1, Number(employee.workday_minutes ?? employee.workdayMinutes ?? DEFAULT_WORKDAY_MINUTES));

    const periodDays = [];
    const perDayWorkedMinutes = new Map();
    const intervalShifts = [];
    const workedDaySet = new Set();
    let minutesOnHolidays = 0;
    let minutesOnRestDays = 0;
    let minutesOnWeekdays = 0;

    for (let day = 1; day <= totalDays; day += 1) {
      const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const inEmployment = (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      if (!inEmployment) {
        continue;
      }
      const { isWeekend, isHoliday } = calcDayType(dateISO);
      periodDays.push({ dateISO, isWeekend, isHoliday });
    }
    summary.normMinutes = calcNormMinutes(periodDays, workdayMinutes);

    const rawSchedule = [];

    for (const entry of scheduleEntries) {
      if (String(entry.employee_id || entry.employeeId) !== employeeId) {
        continue;
      }

      const scheduleId = String(entry.schedule_id || entry.scheduleId);
      if (!allowedScheduleIds.has(scheduleId)) {
        continue;
      }

      const day = Number(entry.day);
      if (!Number.isInteger(day) || day < 1 || day > totalDays) {
        continue;
      }

      const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const inEmployment = (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      if (!inEmployment) {
        continue;
      }

      const shiftCode = String(entry.shift_code || entry.shiftCode || '').trim();
      if (!shiftCode) {
        continue;
      }

      if (shiftCode === 'O') {
        summary.vacationDays += 1;
      }
      if (shiftCode === 'B') {
        summary.sickDays += 1;
      }

      let shiftMinutes = 0;
      let nightMinutes = 0;
      let holidayMinutes = 0;
      let weekendMinutes = 0;

      const hasSnapshot = Number.isFinite(Number(entry.work_minutes ?? entry.workMinutes));
      if (hasSnapshot) {
        shiftMinutes = Math.max(0, Number(entry.work_minutes ?? entry.workMinutes ?? 0));
        nightMinutes = Math.max(0, Number(entry.night_minutes ?? entry.nightMinutes ?? 0));

        const holidaySnapshot = entry.holiday_minutes ?? entry.holidayMinutes;
        const weekendSnapshot = entry.weekend_minutes ?? entry.weekendMinutes;
        if (holidaySnapshot === null || holidaySnapshot === undefined || weekendSnapshot === null || weekendSnapshot === undefined) {
          const dayType = calcDayType(dateISO);
          holidayMinutes = dayType.isHoliday ? shiftMinutes : 0;
          weekendMinutes = dayType.isWeekend ? shiftMinutes : 0;
        } else {
          holidayMinutes = Math.max(0, Number(holidaySnapshot || 0));
          weekendMinutes = Math.max(0, Number(weekendSnapshot || 0));
        }
      } else {
        if (shiftCode === 'P' || shiftCode === 'O' || shiftCode === 'B') {
          continue;
        }

        const shift = shiftByCode.get(shiftCode);
        if (!shift) {
          continue;
        }

        const start = shift.start_time || shift.start || '';
        const end = shift.end_time || shift.end || '';
        const shiftHours = calcShiftDurationHours(start, end, shift.hours);
        shiftMinutes = Math.round(shiftHours * 60);
        nightMinutes = calcNightMinutes(start, end, {
          isYoungWorker: Boolean(employee.young_worker ?? employee.youngWorker),
        });

        const dayType = calcDayType(dateISO);
        holidayMinutes = dayType.isHoliday ? shiftMinutes : 0;
        weekendMinutes = dayType.isWeekend ? shiftMinutes : 0;

        const startMinutes = parseTimeToMinutes(start);
        const endMinutesRaw = parseTimeToMinutes(end);
        if (Number.isFinite(startMinutes) && Number.isFinite(endMinutesRaw)) {
          const startAbs = (day - 1) * 24 * 60 + startMinutes;
          const endAbs = (day - 1) * 24 * 60 + endMinutesRaw + (endMinutesRaw <= startMinutes ? 24 * 60 : 0);
          intervalShifts.push({ dateISO, shiftCode, shiftMinutes, startAbs, endAbs });
        }
      }

      if (shiftMinutes <= 0) {
        continue;
      }

      rawSchedule.push({ workMinutes: shiftMinutes });
      summary.workedDays += 1;
      summary.workedMinutes += shiftMinutes;
      summary.nightMinutes += nightMinutes;
      summary.holidayMinutes += holidayMinutes;
      summary.holidayWorkedHours += holidayMinutes / 60;
      summary.weekendWorkedHours += weekendMinutes / 60;
      summary.nightWorkedHours += nightMinutes / 60;
      perDayWorkedMinutes.set(dateISO, (perDayWorkedMinutes.get(dateISO) || 0) + shiftMinutes);
      workedDaySet.add(dateISO);

      const dayType = calcDayType(dateISO);
      if (dayType.isHoliday) {
        minutesOnHolidays += shiftMinutes;
      } else if (dayType.isWeekend) {
        minutesOnRestDays += shiftMinutes;
      } else {
        minutesOnWeekdays += shiftMinutes;
      }

      if ((shiftMinutes / 60) > MAX_SHIFT_HOURS) {
        summary.violations.push({
          type: 'MAX_SHIFT_HOURS',
          date: dateISO,
          shiftCode,
          hours: round2(shiftMinutes / 60),
          limit: MAX_SHIFT_HOURS,
          severity: 'error',
        });
      }
    }

    summary.workedMinutes = calcWorkedMinutes(rawSchedule);

    intervalShifts.sort((a, b) => a.startAbs - b.startAbs);
    for (let i = 1; i < intervalShifts.length; i += 1) {
      const prev = intervalShifts[i - 1];
      const next = intervalShifts[i];
      const restMinutes = next.startAbs - prev.endAbs;
      if (restMinutes < REST_BETWEEN_SHIFTS_MINUTES) {
        summary.violations.push({
          type: 'DAILY_REST_VIOLATION',
          fromDate: prev.dateISO,
          toDate: next.dateISO,
          restHours: round2(restMinutes / 60),
          minRestHours: 12,
          severity: 'error',
        });
      }
    }

    for (let i = 1; i < intervalShifts.length; i += 1) {
      const prev = intervalShifts[i - 1];
      const next = intervalShifts[i];
      const restMinutes = next.startAbs - prev.endAbs;
      if (restMinutes < WEEKLY_REST_MINUTES) {
        summary.violations.push({
          type: 'WEEKLY_REST_VIOLATION',
          fromDate: prev.dateISO,
          toDate: next.dateISO,
          restHours: round2(restMinutes / 60),
          minRestHours: 36,
          severity: 'error',
        });
      }
    }

    if (isSirv) {
      const weeklyMinutes = new Map();
      for (const [dateISO, minutes] of perDayWorkedMinutes.entries()) {
        const date = new Date(`${dateISO}T00:00:00Z`);
        const day = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 1 - day);
        const weekStart = date.toISOString().slice(0, 10);
        weeklyMinutes.set(weekStart, (weeklyMinutes.get(weekStart) || 0) + minutes);
      }

      for (const [weekStart, minutes] of weeklyMinutes.entries()) {
        if (minutes > MAX_SIRV_WEEKLY_HOURS * 60) {
          summary.violations.push({
            type: 'SIRV_WEEKLY_HOURS_VIOLATION',
            weekStart,
            hours: round2(minutes / 60),
            limit: MAX_SIRV_WEEKLY_HOURS,
            severity: 'error',
          });
        }
      }
    }

    const workedDaysSorted = Array.from(workedDaySet).sort();
    let consecutive = 0;
    let previous = null;
    for (const dateISO of workedDaysSorted) {
      if (!previous) {
        consecutive = 1;
      } else {
        const diff = (new Date(`${dateISO}T00:00:00Z`).getTime() - new Date(`${previous}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000);
        consecutive = diff === 1 ? consecutive + 1 : 1;
      }
      if (consecutive > MAX_CONSECUTIVE_WORK_DAYS) {
        summary.violations.push({
          type: 'MAX_CONSECUTIVE_DAYS_WARNING',
          date: dateISO,
          consecutiveDays: consecutive,
          limit: MAX_CONSECUTIVE_WORK_DAYS,
          severity: 'warning',
        });
      }
      previous = dateISO;
    }

    summary.overtimeMinutes = Math.max(0, summary.workedMinutes - summary.normMinutes);
    const distributed = distributeOvertime(summary.overtimeMinutes, minutesOnHolidays, minutesOnRestDays, minutesOnWeekdays);
    summary.overtimeHolidayMinutes = distributed.overtimeHolidayMinutes;
    summary.overtimeRestdayMinutes = distributed.overtimeRestdayMinutes;
    summary.overtimeWeekdayMinutes = distributed.overtimeWeekdayMinutes;
    summary.normalMinutes = Math.max(0, summary.workedMinutes - summary.overtimeMinutes);

    summary.workedHours = round2(summary.workedMinutes / 60);
    summary.normHours = round2(summary.normMinutes / 60);
    summary.deviation = round2(summary.workedHours - summary.normHours);
    summary.nightWorkedHours = round2(summary.nightWorkedHours);
    summary.nightConvertedHours = round2(summary.nightWorkedHours * NIGHT_HOURS_COEFFICIENT);
    summary.holidayWorkedHours = round2(summary.holidayWorkedHours);
    summary.weekendWorkedHours = round2(summary.weekendWorkedHours);

    const weekendPremiumMinutes = isSirv ? summary.overtimeRestdayMinutes : minutesOnRestDays;
    const payableBase = summary.workedHours;
    const holidayPremiumHours = (summary.holidayMinutes / 60) * (Number(holidayRate) - 1);
    const weekendPremiumHours = (weekendPremiumMinutes / 60) * (Number(weekendRate) - 1);
    const nightPremiumHours = summary.nightConvertedHours - summary.nightWorkedHours;
    summary.payableHours = round2(payableBase + holidayPremiumHours + weekendPremiumHours + nightPremiumHours);

    result.set(employeeId, summary);
  }

  return result;
}


function summarizeViolationStatus(violations = []) {
  const normalized = Array.isArray(violations) ? violations : [];
  if (normalized.some((v) => (v?.severity || 'error') === 'error')) {
    return 'error';
  }
  if (normalized.some((v) => (v?.severity || 'warning') === 'warning')) {
    return 'warning';
  }
  return 'ok';
}

function computeSirvPeriodSummary({
  employee = {},
  periodDays = [],
  scheduleEntries = [],
  nightHoursCoefficient = NIGHT_HOURS_COEFFICIENT,
}) {
  const workdayMinutes = Math.max(1, Number(employee.workday_minutes ?? employee.workdayMinutes ?? DEFAULT_WORKDAY_MINUTES));
  const baseNormMinutes = calcNormMinutes(periodDays, workdayMinutes);

  let workedMinutes = 0;
  let nightMinutes = 0;
  let deductedAbsenceMinutes = 0;

  for (const entry of scheduleEntries) {
    const shiftCode = String(entry.shift_code || entry.shiftCode || '').trim().toUpperCase();
    const entryWorkMinutes = Math.max(0, Number(entry.work_minutes ?? entry.workMinutes ?? 0));
    const entryNightMinutes = Math.max(0, Number(entry.night_minutes ?? entry.nightMinutes ?? 0));

    if (shiftCode === 'O' || shiftCode === 'B') {
      const plannedMinutes = Math.max(0, Number(entry.planned_minutes ?? entry.plannedMinutes ?? 0));
      deductedAbsenceMinutes += plannedMinutes || entryWorkMinutes || workdayMinutes;
      continue;
    }

    workedMinutes += entryWorkMinutes;
    nightMinutes += entryNightMinutes;
  }

  const adjustedNormMinutes = Math.max(0, baseNormMinutes - deductedAbsenceMinutes);
  const convertedWorkedMinutes = Math.round(workedMinutes + nightMinutes * (Number(nightHoursCoefficient) - 1));
  const overtimeMinutes = Math.max(0, convertedWorkedMinutes - adjustedNormMinutes);

  return {
    baseNormMinutes,
    adjustedNormMinutes,
    deductedAbsenceMinutes,
    workedMinutes,
    nightMinutes,
    convertedWorkedMinutes,
    overtimeMinutes,
  };
}

module.exports = {
  NIGHT_HOURS_COEFFICIENT,
  DEFAULT_WEEKEND_RATE,
  DEFAULT_HOLIDAY_RATE,
  parseTimeToMinutes,
  calcShiftDurationHours,
  calcNightHours,
  calcNightMinutes,
  calcDayType,
  calcNormMinutes,
  calcWorkedMinutes,
  distributeOvertime,
  computeMonthlySummary,
  summarizeViolationStatus,
  computeSirvPeriodSummary,
  MAX_SIRV_WEEKLY_HOURS,
};
