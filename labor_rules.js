const NIGHT_HOURS_COEFFICIENT = 1.14286;
const DEFAULT_WEEKEND_RATE = 1.75;
const DEFAULT_HOLIDAY_RATE = 2;
const REST_BETWEEN_SHIFTS_MINUTES = 12 * 60;
const MAX_SHIFT_HOURS = 12;

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

function calcNightHours(startHHMM, endHHMM) {
  const startMinutes = parseTimeToMinutes(startHHMM);
  const endMinutesRaw = parseTimeToMinutes(endHHMM);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutesRaw)) {
    return 0;
  }

  let endMinutes = endMinutesRaw;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const windows = [
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

  return round2(nightMinutes / 60);
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
  };
}

function monthDayCount(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) {
    return 0;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
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

    const perDayWorkedHours = new Map();
    const intervalShifts = [];

    for (let day = 1; day <= totalDays; day += 1) {
      const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const inEmployment = (!startDate || dateISO >= startDate) && (!endDate || dateISO <= endDate);
      if (!inEmployment) {
        continue;
      }
      const { isWeekend, isHoliday } = calcDayType(dateISO);
      if (!isWeekend && !isHoliday) {
        summary.normHours += 8;
      }
    }

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
        continue;
      }
      if (shiftCode === 'B') {
        summary.sickDays += 1;
        continue;
      }
      if (shiftCode === 'P') {
        continue;
      }

      const shift = shiftByCode.get(shiftCode);
      if (!shift) {
        continue;
      }

      const start = shift.start_time || shift.start || '';
      const end = shift.end_time || shift.end || '';
      const shiftHours = calcShiftDurationHours(start, end, shift.hours);
      const nightHours = calcNightHours(start, end);
      const { isWeekend, isHoliday } = calcDayType(dateISO);

      summary.workedDays += 1;
      summary.workedHours += shiftHours;
      summary.nightWorkedHours += nightHours;

      if (isHoliday) {
        summary.holidayWorkedHours += shiftHours;
      } else if (isWeekend) {
        summary.weekendWorkedHours += shiftHours;
      }

      perDayWorkedHours.set(dateISO, round2((perDayWorkedHours.get(dateISO) || 0) + shiftHours));

      const startMinutes = parseTimeToMinutes(start);
      const endMinutesRaw = parseTimeToMinutes(end);
      if (Number.isFinite(startMinutes) && Number.isFinite(endMinutesRaw)) {
        const startAbs = (day - 1) * 24 * 60 + startMinutes;
        const endAbs = (day - 1) * 24 * 60 + endMinutesRaw + (endMinutesRaw <= startMinutes ? 24 * 60 : 0);
        intervalShifts.push({ dateISO, shiftCode, shiftHours, startAbs, endAbs });
      }

      if (shiftHours > MAX_SHIFT_HOURS) {
        summary.violations.push({
          type: 'MAX_SHIFT_HOURS',
          date: dateISO,
          shiftCode,
          hours: shiftHours,
          limit: MAX_SHIFT_HOURS,
        });
      }
    }

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
        });
      }
    }

    for (const [dateISO, workedHours] of perDayWorkedHours.entries()) {
      const { isWeekend, isHoliday } = calcDayType(dateISO);
      if (!isWeekend && !isHoliday) {
        const overtimeInDay = Math.max(0, workedHours - 8);
        if (overtimeInDay > 12) {
          summary.violations.push({
            type: 'OVERTIME_DAY_WORKDAY_LIMIT',
            date: dateISO,
            overtimeHours: round2(overtimeInDay),
            limit: 12,
          });
        }
      }
    }

    summary.workedHours = round2(summary.workedHours);
    summary.normHours = round2(summary.normHours);
    summary.deviation = round2(summary.workedHours - summary.normHours);
    summary.nightWorkedHours = round2(summary.nightWorkedHours);
    summary.nightConvertedHours = round2(summary.nightWorkedHours * NIGHT_HOURS_COEFFICIENT);
    summary.holidayWorkedHours = round2(summary.holidayWorkedHours);
    summary.weekendWorkedHours = round2(summary.weekendWorkedHours);

    const overtimeMonthHours = Math.max(0, summary.workedHours - summary.normHours);
    if (overtimeMonthHours > 100) {
      summary.violations.push({
        type: 'OVERTIME_MONTH_LIMIT',
        overtimeHours: round2(overtimeMonthHours),
        limit: 100,
      });
    }

    const restDayOvertime = summary.holidayWorkedHours + summary.weekendWorkedHours;
    if (restDayOvertime > 48) {
      summary.violations.push({
        type: 'OVERTIME_RESTDAY_LIMIT',
        overtimeHours: round2(restDayOvertime),
        limit: 48,
      });
    }

    summary.payableHours = round2(
      summary.workedHours +
        summary.holidayWorkedHours * (Number(holidayRate) - 1) +
        summary.weekendWorkedHours * (Number(weekendRate) - 1) +
        (summary.nightConvertedHours - summary.nightWorkedHours)
    );

    result.set(employeeId, summary);
  }

  return result;
}

/*
Правила/лимити:
- Минимална междусменна почивка: 12ч (DAILY_REST_VIOLATION)
- Максимална продължителност на смяна: 12ч (MAX_SHIFT_HOURS)
- Технически аларми за извънреден труд: >100ч/месец, >12ч/ден в работен ден, >48ч в почивни дни
*/
module.exports = {
  NIGHT_HOURS_COEFFICIENT,
  DEFAULT_WEEKEND_RATE,
  DEFAULT_HOLIDAY_RATE,
  parseTimeToMinutes,
  calcShiftDurationHours,
  calcNightHours,
  calcDayType,
  computeMonthlySummary,
};
