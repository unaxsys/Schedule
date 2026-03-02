const { calcDayType, DEFAULT_WORKDAY_MINUTES } = require('./labor_rules');

const MINUTES_PER_DAY = 24 * 60;
const MIN_NIGHT_MINUTES_FOR_ELIGIBILITY = 3 * 60;

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
  dailyNormMinutes = DEFAULT_WORKDAY_MINUTES,
  sirvEnabled = false,
  isYoungWorker = false,
  minNightMinutes = MIN_NIGHT_MINUTES_FOR_ELIGIBILITY,
}) {
  const segments = shiftSegmentsByDay({ dateISO, startTime: shift.start_time || shift.start, endTime: shift.end_time || shift.end });
  const durationMinutes = segments.reduce((acc, segment) => acc + segment.duration, 0);
  const breakMinutes = Math.max(0, Number(shift.break_minutes || 0));
  const breakIncluded = Boolean(shift.break_included);
  const breakMinutesApplied = breakIncluded ? 0 : Math.min(durationMinutes, breakMinutes);
  const workedMinutes = Math.max(0, durationMinutes - breakMinutesApplied);

  let nightMinutes = 0;
  let weekendMinutes = 0;
  let holidayMinutes = 0;

  for (const segment of segments) {
    const nightWindowStart = isYoungWorker ? 20 * 60 : 22 * 60;
    nightMinutes += overlapMinutes(segment.startMinute, segment.endMinute, nightWindowStart, 24 * 60);
    nightMinutes += overlapMinutes(segment.startMinute, segment.endMinute, 0, 6 * 60);

    const dayType = calcDayType(segment.dateISO);
    const isWeekend = dayType.isWeekend;
    const isHolidayDay = resolveHolidayFlag(isHoliday(segment.dateISO));
    if (segment.duration > 0 && workedMinutes > 0) {
      const proportionalWorked = Math.floor((workedMinutes * segment.duration) / durationMinutes);
      if (isWeekend) {
        weekendMinutes += proportionalWorked;
      }
      if (isHolidayDay) {
        holidayMinutes += proportionalWorked;
      }
    }
  }

  // distribute minute remainders deterministically to the last segment
  const distributed = segments.reduce((acc, segment) => acc + Math.floor((workedMinutes * segment.duration) / (durationMinutes || 1)), 0);
  const remainder = Math.max(0, workedMinutes - distributed);
  if (remainder > 0 && segments.length) {
    const lastSegment = segments[segments.length - 1];
    const dayType = calcDayType(lastSegment.dateISO);
    const isHolidayDay = resolveHolidayFlag(isHoliday(lastSegment.dateISO));
    if (dayType.isWeekend) {
      weekendMinutes += remainder;
    }
    if (isHolidayDay) {
      holidayMinutes += remainder;
    }
  }

  if (nightMinutes < minNightMinutes) {
    nightMinutes = 0;
  }

  return {
    duration_minutes: durationMinutes,
    break_minutes_applied: breakMinutesApplied,
    work_minutes_total: workedMinutes,
    night_minutes: nightMinutes,
    weekend_minutes: Math.min(weekendMinutes, workedMinutes),
    holiday_minutes: Math.min(holidayMinutes, workedMinutes),
    overtime_minutes: sirvEnabled ? 0 : Math.max(0, workedMinutes - dailyNormMinutes),
  };
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
  validateScheduleEntry,
  holidayResolverFactory,
  countBusinessDays,
  dateAdd,
  finalizeSirvOvertimeAllocations,
};
