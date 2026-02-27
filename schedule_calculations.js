const { calcDayType, DEFAULT_WORKDAY_MINUTES } = require('./labor_rules');

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

function computeEntryMetrics({ dateISO, shift = {}, isHoliday = () => false, dailyNormMinutes = DEFAULT_WORKDAY_MINUTES, sirvEnabled = false }) {
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
    nightMinutes += overlapMinutes(segment.startMinute, segment.endMinute, 22 * 60, 24 * 60);
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
    const rest = start - prevShiftEndAt;
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

module.exports = {
  parseTimeToMinutes,
  shiftSegmentsByDay,
  computeEntryMetrics,
  validateScheduleEntry,
  holidayResolverFactory,
  countBusinessDays,
  dateAdd,
};
