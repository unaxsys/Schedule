function cleanStr(v) {
  return String(v ?? '').trim();
}

function parseMonthKey(monthKey) {
  const text = cleanStr(monthKey);
  if (!/^\d{4}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month] = text.split('-').map(Number);
  if (!year || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function getDaysOfMonth(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    return [];
  }

  const { year, month } = parsed;
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: totalDays }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
  });
}

function applyOverwriteMode(existingEntry, overwriteMode = 'empty_only') {
  const mode = cleanStr(overwriteMode) || 'empty_only';
  if (!existingEntry) {
    return true;
  }
  if (mode === 'overwrite_all') {
    return true;
  }

  const hasShift = Boolean(cleanStr(existingEntry.shift_id || '')) || Boolean(cleanStr(existingEntry.shift_code || ''));
  if (mode === 'empty_only') {
    return !hasShift;
  }

  if (mode === 'overwrite_auto_only') {
    return existingEntry.is_manual === false;
  }

  return !hasShift;
}

function buildPattern(templateType, shiftIds = {}, options = {}) {
  const includeWeekends = options.include_weekends === true;
  const cycleByTemplate = {
    SIRV_12H_2_2: [shiftIds.day12ShiftId || null, shiftIds.night12ShiftId || null, null, null],
    SIRV_12H_2_4: [shiftIds.day12ShiftId || null, shiftIds.night12ShiftId || null, null, null, null, null],
    '3_SHIFT_8H': [shiftIds.morning8ShiftId || null, shiftIds.evening8ShiftId || null, shiftIds.night8ShiftId || null],
  };

  if (templateType === '8H_STANDARD_WEEKDAYS') {
    const defaultShift = shiftIds.morning8ShiftId || shiftIds.evening8ShiftId || shiftIds.day12ShiftId || null;
    return ({ dateISO }) => {
      const day = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
      const isWeekend = day === 0 || day === 6;
      if (isWeekend && !includeWeekends) {
        return null;
      }
      return defaultShift;
    };
  }

  const cycle = cycleByTemplate[templateType];
  if (!cycle) {
    return null;
  }

  return ({ dayIndex, employeeOffset = 0 }) => {
    const size = cycle.length;
    const normalized = ((Number(dayIndex) || 0) + (Number(employeeOffset) || 0)) % size;
    const cycleIndex = normalized < 0 ? normalized + size : normalized;
    return cycle[cycleIndex] || null;
  };
}

function parseTimeToMinutes(timeValue) {
  const text = cleanStr(timeValue);
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function computeShiftBounds(shift, dateISO) {
  if (!shift || !dateISO) {
    return null;
  }
  const startMinutes = parseTimeToMinutes(shift.start_time || shift.start);
  const endMinutes = parseTimeToMinutes(shift.end_time || shift.end);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const start = new Date(`${dateISO}T00:00:00Z`);
  start.setUTCMinutes(startMinutes);

  const end = new Date(`${dateISO}T00:00:00Z`);
  end.setUTCMinutes(endMinutes);
  if (endMinutes <= startMinutes) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return { start, end, durationHours };
}

function validateRest(prevShift, nextShift, restMinHours = 12, enforce24hAfter12h = false) {
  if (!prevShift || !nextShift) {
    return { ok: true, reason: null };
  }

  const prev = computeShiftBounds(prevShift.shift, prevShift.dateISO);
  const next = computeShiftBounds(nextShift.shift, nextShift.dateISO);
  if (!prev || !next) {
    return { ok: true, reason: null };
  }

  const restHours = (next.start.getTime() - prev.end.getTime()) / (1000 * 60 * 60);
  if (restHours < Number(restMinHours || 0)) {
    return { ok: false, reason: `Минималната почивка ${restMinHours}ч е нарушена (${restHours.toFixed(1)}ч).` };
  }

  if (enforce24hAfter12h && prev.durationHours >= 12 && restHours < 24) {
    return { ok: false, reason: `След 12ч смяна е нужна 24ч почивка (${restHours.toFixed(1)}ч).` };
  }

  return { ok: true, reason: null };
}

module.exports = {
  getDaysOfMonth,
  buildPattern,
  validateRest,
  applyOverwriteMode,
};
