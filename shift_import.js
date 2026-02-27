const HEADER_ALIASES = {
  name: ['name', 'име'],
  code: ['code', 'код'],
  start_time: ['start_time', 'начало'],
  end_time: ['end_time', 'край'],
  break_minutes: ['break_minutes', 'почивка_минути'],
  break_included: ['break_included', 'почивка_включена'],
};

const DEFAULT_BREAK_MINUTES = 0;
const MAX_DURATION_MINUTES = 12 * 60;

function cleanStr(v) {
  return String(v ?? '').trim();
}

function parseBoolean(value) {
  const normalized = cleanStr(value).toLowerCase();
  if (['true', '1', 'yes', 'y', 'да'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'не', ''].includes(normalized)) {
    return false;
  }
  return null;
}

function parseMinutes(timeValue) {
  const source = cleanStr(timeValue);
  const match = /^(\d{2}):(\d{2})$/.exec(source);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return (hour * 60) + minute;
}

function durationBetween(start, end) {
  const startMinutes = parseMinutes(start);
  const endMinutes = parseMinutes(end);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }
  let diff = endMinutes - startMinutes;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  return diff;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  out.push(current.trim());
  return out;
}

function parseCsvText(text) {
  const lines = cleanStr(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let index = 1; index < lines.length; index += 1) {
    const cells = parseCsvLine(lines[index]);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[cleanStr(header)] = cleanStr(cells[headerIndex] ?? '');
    });
    rows.push(row);
  }

  return rows;
}

function resolveField(row, fieldName) {
  const aliases = HEADER_ALIASES[fieldName] || [fieldName];
  const normalizedMap = new Map(
    Object.keys(row || {}).map((key) => [cleanStr(key).toLowerCase(), row[key]])
  );

  for (const alias of aliases) {
    const value = normalizedMap.get(cleanStr(alias).toLowerCase());
    if (value !== undefined) {
      return value;
    }
  }
  return '';
}

function normalizeImportRow(row) {
  const errors = [];
  const name = cleanStr(resolveField(row, 'name'));
  const code = cleanStr(resolveField(row, 'code'));
  const startTime = cleanStr(resolveField(row, 'start_time'));
  const endTime = cleanStr(resolveField(row, 'end_time'));

  const breakMinutesRaw = cleanStr(resolveField(row, 'break_minutes'));
  const breakMinutes = breakMinutesRaw ? Number(breakMinutesRaw) : DEFAULT_BREAK_MINUTES;
  const breakIncludedParsed = parseBoolean(resolveField(row, 'break_included'));
  const breakIncluded = breakIncludedParsed === null ? false : breakIncludedParsed;

  if (!name) {
    errors.push('Липсва име на смяна (name/име).');
  }

  if (parseMinutes(startTime) === null) {
    errors.push('Невалиден start_time/начало (очаква се HH:MM).');
  }

  if (parseMinutes(endTime) === null) {
    errors.push('Невалиден end_time/край (очаква се HH:MM).');
  }

  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    errors.push('break_minutes/почивка_минути трябва да е число >= 0.');
  }

  if (breakIncludedParsed === null && cleanStr(resolveField(row, 'break_included'))) {
    errors.push('break_included/почивка_включена трябва да е true/false, Да/Не, 1/0.');
  }

  const durationMinutes = durationBetween(startTime, endTime);
  if (durationMinutes === null) {
    errors.push('Не може да се изчисли продължителност.');
  } else {
    if (durationMinutes <= 0) {
      errors.push('Продължителността трябва да е > 0 минути.');
    }
    if (durationMinutes > MAX_DURATION_MINUTES) {
      errors.push('Продължителността трябва да е <= 12 часа.');
    }
  }

  const workedMinutes = durationMinutes === null ? null : (breakIncluded ? durationMinutes : durationMinutes - breakMinutes);
  if (workedMinutes !== null && workedMinutes < 0) {
    errors.push('worked_minutes не може да е отрицателно.');
  }

  return {
    errors,
    normalizedRow: {
      name,
      code: code || null,
      start_time: startTime,
      end_time: endTime,
      break_minutes: Number.isFinite(breakMinutes) ? breakMinutes : DEFAULT_BREAK_MINUTES,
      break_included: breakIncluded,
      duration_minutes: durationMinutes,
      worked_minutes: workedMinutes,
      hours: durationMinutes === null ? null : Number((durationMinutes / 60).toFixed(2)),
    },
  };
}

function buildDuplicateKey(row) {
  if (row.code) {
    return `code:${cleanStr(row.code).toUpperCase()}`;
  }
  return `composite:${cleanStr(row.name).toLowerCase()}|${cleanStr(row.start_time)}|${cleanStr(row.end_time)}`;
}

function buildImportPreview({ rows, existingShifts = [] }) {
  const existingByKey = new Map();
  existingShifts.forEach((shift) => {
    existingByKey.set(buildDuplicateKey(shift), shift);
  });

  const invalid_rows = [];
  const duplicates = [];
  const to_create = [];
  const seenImportKeys = new Set();

  (rows || []).forEach((row, index) => {
    const rowIndex = index + 1;
    const normalized = normalizeImportRow(row || {});
    if (normalized.errors.length) {
      invalid_rows.push({ rowIndex, errors: normalized.errors, row });
      return;
    }

    const duplicateKey = buildDuplicateKey(normalized.normalizedRow);
    if (seenImportKeys.has(duplicateKey)) {
      duplicates.push({ rowIndex, reason: 'duplicate_in_file', row, rowKey: duplicateKey });
      return;
    }
    seenImportKeys.add(duplicateKey);

    const existing = existingByKey.get(duplicateKey);
    if (existing) {
      duplicates.push({ rowIndex, reason: 'duplicate_in_department', existingShiftId: existing.id, row, rowKey: duplicateKey });
      return;
    }

    to_create.push({ rowIndex, normalizedRow: { ...normalized.normalizedRow, duplicate_key: duplicateKey } });
  });

  return {
    total_rows: (rows || []).length,
    valid_rows: to_create.length,
    invalid_rows,
    duplicates,
    to_create,
  };
}

module.exports = {
  HEADER_ALIASES,
  MAX_DURATION_MINUTES,
  parseCsvText,
  normalizeImportRow,
  buildDuplicateKey,
  buildImportPreview,
};
