const { calcDayType, DEFAULT_WORKDAY_MINUTES } = require('./labor_rules');
const { computeShiftSnapshot } = require('./lib/shift-engine');

const MINUTES_PER_DAY = 24 * 60;

function parseTimeToMinutes(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    return NaN;
  }
  const [h, m] = text.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return NaN;
  }
  return h * 60 + m;
}

function normalizeDate(dateISO) {
  return String(dateISO || '').slice(0, 10);
}

function dateAdd(dateISO, days) {
  const dt = new Date(`${normalizeDate(dateISO)}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function shiftSegmentsByDay({ dateISO, startTime, endTime }) {
  const start = parseTimeToMinutes(startTime);
  const endRaw = parseTimeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(endRaw)) {
    return [];
  }
  let end = endRaw;
  if (end <= start) {
    end += MINUTES_PER_DAY;
  }

  const segments = [];
  const firstDayMinutes = Math.min(end, MINUTES_PER_DAY) - start;
  if (firstDayMinutes > 0) {
    segments.push({ dateISO: normalizeDate(dateISO), startMinute: start, endMinute: Math.min(end, MINUTES_PER_DAY), duration: firstDayMinutes });
  }
  if (end > MINUTES_PER_DAY) {
    const secondDayDuration = end - MINUTES_PER_DAY;
    segments.push({ dateISO: dateAdd(dateISO, 1), startMinute: 0, endMinute: secondDayDuration, duration: secondDayDuration });
  }
  return segments;
}

function overlapMinutes(rangeStart, rangeEnd, winStart, winEnd) {
  const s = Math.max(rangeStart, winStart);
  const e = Math.min(rangeEnd, winEnd);
  return Math.max(0, e - s);
}

function holidayResolverFactory(holidaySet = new Set()) {
  return (dateISO) => ({ isHoliday: holidaySet.has(normalizeDate(dateISO)), type: holidaySet.has(normalizeDate(dateISO)) ? 'official' : 'none' });
}

function resolveHolidayFlag(result) {
  if (typeof result === 'boolean') {
    return result;
  }
  if (result && typeof result === 'object') {
    return Boolean(result.isHoliday);
  }
  return false;
}

function computeEntryMetrics({
  dateISO,
  shift = {},
  isHoliday = () => false,
  calculationSettings = {},
}) {
  const settings = normalizeCalculationRuntimeSettings(calculationSettings);
  const snapshot = computeShiftSnapshot({
    dateISO,
    shiftCode: shift.code,
    isRealWorkingShift: true,
    startTime: shift.start_time || shift.start,
    endTime: shift.end_time || shift.end,
    intervals: shift.intervals,
    breakMinutes: shift.break_minutes,
    breakIncluded: settings.includeBreakInWorkedHours ? true : shift.break_included,
    holidayResolver: isHoliday,
  });

  const adjustedSnapshot = applyCalculationSettingsToSnapshot(snapshot, settings);

  return {
    duration_minutes: adjustedSnapshot.duration_minutes,
    break_minutes_applied: adjustedSnapshot.break_minutes_applied,
    work_minutes_total: adjustedSnapshot.work_minutes_total,
    night_minutes: adjustedSnapshot.night_minutes,
    weekend_minutes: adjustedSnapshot.weekend_minutes,
    holiday_minutes: adjustedSnapshot.holiday_minutes,
    overtime_minutes: 0,
  };
}

function normalizeCalculationRuntimeSettings(settings = {}) {
  return {
    workedDayRequiresPositiveMinutes: settings.workedDayRequiresPositiveMinutes !== false,
    specialHoursOnlyIfWorkMinutesPositive: settings.specialHoursOnlyIfWorkMinutesPositive !== false,
    includeBreakInWorkedHours: Boolean(settings.includeBreakInWorkedHours),
    includePremiumsInPayable: settings.includePremiumsInPayable !== false,
    comparisonMode: String(settings.comparisonMode || 'monthly-norm'),
    payableHoursMode: String(settings.payableHoursMode || 'worked-plus-premiums'),
    overtimeMode: String(settings.overtimeMode || 'worked-vs-norm'),
    holidayPremiumCoefficient: Number(settings.holidayPremiumCoefficient || 2) || 2,
    weekendPremiumCoefficient: Number(settings.weekendPremiumCoefficient || 1.75) || 1.75,
    nightPremiumCoefficient: Number(settings.nightPremiumCoefficient || 0.25) || 0.25,
  };
}

function applyCalculationSettingsToSnapshot(snapshot = {}, settings = {}) {
  const normalized = normalizeCalculationRuntimeSettings(settings);
  const base = {
    ...snapshot,
    work_minutes: Math.max(0, Number(snapshot.work_minutes || 0)),
    work_minutes_total: Math.max(0, Number(snapshot.work_minutes_total || snapshot.work_minutes || 0)),
    holiday_minutes: Math.max(0, Number(snapshot.holiday_minutes || 0)),
    weekend_minutes: Math.max(0, Number(snapshot.weekend_minutes || 0)),
    night_minutes: Math.max(0, Number(snapshot.night_minutes || 0)),
  };

  if (normalized.specialHoursOnlyIfWorkMinutesPositive && base.work_minutes_total <= 0) {
    base.holiday_minutes = 0;
    base.weekend_minutes = 0;
    base.night_minutes = 0;
  }

  return base;
}

function calculatePayrollTotals({
  workedMinutes = 0,
  holidayMinutes = 0,
  weekendMinutes = 0,
  nightMinutes = 0,
  normMinutes = 0,
  mode = 'normal',
  calculationSettings = {},
}) {
  const settings = normalizeCalculationRuntimeSettings(calculationSettings);
  const worked = Math.max(0, Number(workedMinutes) || 0);
  const holiday = Math.max(0, Number(holidayMinutes) || 0);
  const weekend = Math.max(0, Number(weekendMinutes) || 0);
  const night = Math.max(0, Number(nightMinutes) || 0);
  const norm = Math.max(0, Number(normMinutes) || 0);

  const holidayPremiumMinutes = holiday * Math.max(1, settings.holidayPremiumCoefficient - 1);
  const weekendPremiumMinutes = weekend * Math.max(1, settings.weekendPremiumCoefficient - 1);
  const nightPremiumMinutes = night * Math.max(0, settings.nightPremiumCoefficient);

  const payableMinutes = worked;
  const overtimeMinutes = computeOvertimeMinutes({ mode, workedMinutes: worked, normMinutes: norm });

  return {
    workedMinutes: worked,
    payableMinutes,
    overtimeMinutes,
    holidayPremiumMinutes,
    weekendPremiumMinutes,
    nightPremiumMinutes,
    comparisonMode: settings.comparisonMode,
  };
}

function computeOvertimeMinutes({ mode = 'normal', workedMinutes = 0, normMinutes = 0 }) {
  const normalizedMode = String(mode || 'normal').toLowerCase();
  const worked = Math.max(0, Number(workedMinutes) || 0);
  const norm = Math.max(0, Number(normMinutes) || 0);
  if (!['normal', 'sirv'].includes(normalizedMode)) {
    return 0;
  }
  return Math.max(0, worked - norm);
}

function validateScheduleEntry({ prevShiftEndAt = null, shift = {} }) {
  const errors = [];
  const warnings = [];
  const start = parseTimeToMinutes(shift.start_time || shift.start);
  const endRaw = parseTimeToMinutes(shift.end_time || shift.end);
  if (!Number.isFinite(start) || !Number.isFinite(endRaw)) {
    return { errors: ['invalid_shift_time'], warnings };
  }
  let end = endRaw;
  if (end <= start) {
    end += MINUTES_PER_DAY;
  }
  const duration = end - start;
  if (duration > 12 * 60) {
    errors.push('max_shift_duration_exceeded');
  }
  if (duration >= 12 * 60) {
    warnings.push('check_rest_after_12h_shift');
  }
  if (Number.isFinite(prevShiftEndAt)) {
    const rest = start >= prevShiftEndAt
      ? start - prevShiftEndAt
      : (start + MINUTES_PER_DAY) - prevShiftEndAt;
    if (rest < 12 * 60) {
      errors.push('insufficient_interdaily_rest');
    }
  }
  return { errors, warnings };
}

function countBusinessDays(startISO, endISO, isHoliday = () => false) {
  let current = normalizeDate(startISO);
  const end = normalizeDate(endISO);
  let count = 0;
  while (current <= end) {
    const day = calcDayType(current);
    const holidayResult = isHoliday(current);
    const isHolidayDay = resolveHolidayFlag(holidayResult);
    if (!day.isWeekend && !isHolidayDay) {
      count += 1;
    }
    current = dateAdd(current, 1);
  }
  return count;
}

function finalizeSirvOvertimeAllocations(entries, periodNormMinutes, dailyNormMinutes = 480) {
  const source = Array.isArray(entries) ? entries : [];
  const byEmployee = new Map();

  for (const entry of source) {
    const employeeId = String(entry.employee_id || entry.employeeId || '');
    const dateISO = normalizeDate(entry.dateISO || entry.date || `${entry.month_key}-${String(entry.day || '').padStart(2, '0')}`);
    const workedMinutes = Math.max(0, Number(entry.work_minutes_total ?? entry.workMinutesTotal ?? 0) || 0);
    if (!employeeId || !dateISO) {
      continue;
    }
    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, []);
    }
    byEmployee.get(employeeId).push({ ...entry, employeeId, dateISO, workedMinutes });
  }

  const updates = [];
  const warnings = [];
  const perEmployeeTotals = {};

  for (const [employeeId, employeeEntries] of byEmployee.entries()) {
    const workedTotal = employeeEntries.reduce((acc, entry) => acc + entry.workedMinutes, 0);
    let remaining = Math.max(0, workedTotal - Math.max(0, Number(periodNormMinutes) || 0));
    perEmployeeTotals[employeeId] = { workedMinutes: workedTotal, overtimeMinutes: remaining };

    const byDate = new Map();
    for (const entry of employeeEntries) {
      if (!byDate.has(entry.dateISO)) {
        byDate.set(entry.dateISO, []);
      }
      byDate.get(entry.dateISO).push(entry);
    }

    const sortedDatesDesc = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));
    const dateOvertime = new Map(sortedDatesDesc.map((dateISO) => {
      const dayWorked = byDate.get(dateISO).reduce((acc, entry) => acc + entry.workedMinutes, 0);
      return [dateISO, 0 + Math.max(0, dayWorked - dailyNormMinutes)];
    }));

    const dateAllocated = new Map(sortedDatesDesc.map((dateISO) => [dateISO, 0]));
    for (const dateISO of sortedDatesDesc) {
      if (remaining <= 0) {
        break;
      }
      const alloc = Math.min(remaining, dateOvertime.get(dateISO) || 0);
      dateAllocated.set(dateISO, alloc);
      remaining -= alloc;
    }

    if (remaining > 0) {
      warnings.push(`Employee ${employeeId}: fallback overtime allocation applied (${remaining}m).`);
      for (const dateISO of sortedDatesDesc) {
        if (remaining <= 0) {
          break;
        }
        const dayWorked = byDate.get(dateISO).reduce((acc, entry) => acc + entry.workedMinutes, 0);
        const already = dateAllocated.get(dateISO) || 0;
        const capacity = Math.max(0, dayWorked - already);
        const extra = Math.min(remaining, capacity);
        dateAllocated.set(dateISO, already + extra);
        remaining -= extra;
      }
    }

    for (const dateISO of sortedDatesDesc) {
      const rows = [...(byDate.get(dateISO) || [])].sort((a, b) => {
        const keyA = `${a.schedule_id || ''}|${a.day || 0}`;
        const keyB = `${b.schedule_id || ''}|${b.day || 0}`;
        return keyA.localeCompare(keyB);
      });
      const dayOvertime = dateAllocated.get(dateISO) || 0;
      const dayWorked = rows.reduce((acc, row) => acc + row.workedMinutes, 0);
      let assigned = 0;

      rows.forEach((row, index) => {
        let overtime = 0;
        if (dayOvertime > 0 && dayWorked > 0) {
          overtime = index === rows.length - 1
            ? Math.max(0, dayOvertime - assigned)
            : Math.floor((dayOvertime * row.workedMinutes) / dayWorked);
        }
        assigned += overtime;
        updates.push({
          schedule_id: row.schedule_id,
          employee_id: row.employee_id || row.employeeId,
          day: row.day,
          overtime_minutes: overtime,
        });
      });
    }
  }

  return { updates, warnings, perEmployeeTotals };
}

module.exports = {
  parseTimeToMinutes,
  shiftSegmentsByDay,
  computeEntryMetrics,
  applyCalculationSettingsToSnapshot,
  normalizeCalculationRuntimeSettings,
  calculatePayrollTotals,
  computeOvertimeMinutes,
  validateScheduleEntry,
  holidayResolverFactory,
  countBusinessDays,
  dateAdd,
  finalizeSirvOvertimeAllocations,
};
