const MINUTES_PER_DAY = 24 * 60;

function parseTimeToMinutes(time) {
  const value = String(time || '').trim();
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return NaN;
  }
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return NaN;
  }
  return (hours * 60) + minutes;
}

function normalizeShiftInterval(startMinutes, endMinutes) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return null;
  }
  let normalizedEnd = endMinutes;
  if (normalizedEnd <= startMinutes) {
    normalizedEnd += MINUTES_PER_DAY;
  }
  return [startMinutes, normalizedEnd];
}

function calcWorkMinutes(durationMinutes, breakMinutes = 0, breakIncluded = false) {
  const duration = Math.max(0, Number(durationMinutes) || 0);
  const pause = Math.max(0, Number(breakMinutes) || 0);
  if (breakIncluded) {
    return duration;
  }
  return Math.max(0, duration - pause);
}

function overlapMinutes(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second)) {
    return 0;
  }
  const [aStart, aEnd] = first;
  const [bStart, bEnd] = second;
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function calcNightMinutes(shiftInterval) {
  if (!Array.isArray(shiftInterval)) {
    return 0;
  }
  const [start, end] = shiftInterval;
  const baseDay = Math.floor(start / MINUTES_PER_DAY);
  let total = 0;

  for (let dayOffset = -1; dayOffset <= 2; dayOffset += 1) {
    const dayStart = (baseDay + dayOffset) * MINUTES_PER_DAY;
    total += overlapMinutes([start, end], [dayStart + (22 * 60), dayStart + MINUTES_PER_DAY]);
    total += overlapMinutes([start, end], [dayStart, dayStart + (6 * 60)]);
  }

  return total;
}

function addDays(dateISO, days) {
  const dt = new Date(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function calcDaySplit(shiftInterval, baseDateISO) {
  if (!Array.isArray(shiftInterval)) {
    return [];
  }
  const [start, end] = shiftInterval;
  const startDay = Math.floor(start / MINUTES_PER_DAY);
  const endDay = Math.floor((end - 1) / MINUTES_PER_DAY);
  const segments = [];

  for (let day = startDay; day <= endDay; day += 1) {
    const dayStart = day * MINUTES_PER_DAY;
    const dayEnd = dayStart + MINUTES_PER_DAY;
    const segmentStart = Math.max(start, dayStart);
    const segmentEnd = Math.min(end, dayEnd);
    const durationMinutes = Math.max(0, segmentEnd - segmentStart);
    if (!durationMinutes) {
      continue;
    }
    segments.push({
      dayOffset: day - startDay,
      dateISO: addDays(baseDateISO, day - startDay),
      interval: [segmentStart, segmentEnd],
      durationMinutes,
    });
  }

  return segments;
}

function isWeekendDate(dateISO) {
  const day = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function normalizeHolidayResult(result) {
  if (typeof result === 'boolean') {
    return result;
  }
  return Boolean(result?.isHoliday);
}

function computeShiftSnapshot({
  dateISO,
  startTime,
  endTime,
  breakMinutes = 0,
  breakIncluded = false,
  plannedMinutes = 480,
  holidayResolver = () => ({ isHoliday: false }),
}) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return {
      duration_minutes: 0,
      work_minutes: 0,
      work_minutes_total: 0,
      night_minutes: 0,
      weekend_minutes: 0,
      holiday_minutes: 0,
      overtime_minutes: 0,
      break_minutes: Math.max(0, Number(breakMinutes) || 0),
      break_included: Boolean(breakIncluded),
      break_minutes_applied: 0,
      cross_midnight: false,
    };
  }

  const normalizedInterval = normalizeShiftInterval(startMinutes, endMinutes);
  const [shiftStart, shiftEnd] = normalizedInterval;
  const durationMinutes = shiftEnd - shiftStart;
  const workedMinutes = calcWorkMinutes(durationMinutes, breakMinutes, breakIncluded);
  const breakApplied = Boolean(breakIncluded) ? 0 : Math.min(durationMinutes, Math.max(0, Number(breakMinutes) || 0));

  const dayParts = calcDaySplit([shiftStart, shiftEnd], dateISO);
  const weightedParts = dayParts.map((segment) => ({
    ...segment,
    workedShare: durationMinutes ? Math.floor((workedMinutes * segment.durationMinutes) / durationMinutes) : 0,
  }));

  const distributed = weightedParts.reduce((acc, segment) => acc + segment.workedShare, 0);
  if (weightedParts.length && distributed < workedMinutes) {
    weightedParts[weightedParts.length - 1].workedShare += (workedMinutes - distributed);
  }

  let weekendMinutes = 0;
  let holidayMinutes = 0;
  weightedParts.forEach((segment) => {
    if (isWeekendDate(segment.dateISO)) {
      weekendMinutes += segment.workedShare;
    }
    if (normalizeHolidayResult(holidayResolver(segment.dateISO))) {
      holidayMinutes += segment.workedShare;
    }
  });

  const nightMinutes = calcNightMinutes([shiftStart, shiftEnd]);
  return {
    duration_minutes: durationMinutes,
    work_minutes: workedMinutes,
    work_minutes_total: workedMinutes,
    night_minutes: Math.min(nightMinutes, workedMinutes),
    weekend_minutes: Math.min(weekendMinutes, workedMinutes),
    holiday_minutes: Math.min(holidayMinutes, workedMinutes),
    overtime_minutes: Math.max(0, workedMinutes - Math.max(0, Number(plannedMinutes) || 0)),
    break_minutes: Math.max(0, Number(breakMinutes) || 0),
    break_included: Boolean(breakIncluded),
    break_minutes_applied: breakApplied,
    cross_midnight: shiftEnd > MINUTES_PER_DAY,
  };
}

module.exports = {
  MINUTES_PER_DAY,
  parseTimeToMinutes,
  normalizeShiftInterval,
  calcWorkMinutes,
  overlapMinutes,
  calcNightMinutes,
  calcDaySplit,
  computeShiftSnapshot,
};
