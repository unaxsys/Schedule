function parseHHMM(value) {
  const raw = String(value || '').trim();
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(raw);
  if (!match) {
    return null;
  }
  const [hours, minutes] = raw.split(':').map(Number);
  return (hours * 60) + minutes;
}

function calculateDurationMinutes(startTime, endTime) {
  const startMinutes = parseHHMM(startTime);
  const endMinutes = parseHHMM(endTime);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }
  const raw = endMinutes >= startMinutes
    ? (endMinutes - startMinutes)
    : ((24 * 60 - startMinutes) + endMinutes);
  return raw;
}

function validateShiftTemplatePayload(payload) {
  const name = String(payload?.name || '').trim();
  const code = payload?.code === undefined ? '' : String(payload?.code || '').trim().toUpperCase();
  const startTime = String(payload?.start_time ?? payload?.start ?? '').trim();
  const endTime = String(payload?.end_time ?? payload?.end ?? '').trim();
  const breakMinutes = Math.max(0, Number(payload?.break_minutes ?? payload?.breakMinutes ?? 0));
  const breakIncluded = Boolean(payload?.break_included ?? payload?.breakIncluded ?? false);
  const durationMinutes = calculateDurationMinutes(startTime, endTime);

  if (!name) {
    return { ok: false, message: 'Името на смяната е задължително.' };
  }
  if (parseHHMM(startTime) === null || parseHHMM(endTime) === null) {
    return { ok: false, message: 'Начало и край трябва да са във формат HH:MM.' };
  }
  if (durationMinutes === null || durationMinutes <= 0 || durationMinutes > (12 * 60)) {
    return { ok: false, message: 'Продължителността на смяната трябва да е между 1 и 720 минути.' };
  }
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    return { ok: false, message: 'break_minutes трябва да е число >= 0.' };
  }
  if (breakMinutes >= durationMinutes) {
    return { ok: false, message: 'Почивката трябва да е по-кратка от смяната.' };
  }

  const workedMinutes = breakIncluded ? durationMinutes : (durationMinutes - breakMinutes);
  return {
    ok: true,
    value: {
      code,
      name,
      startTime,
      endTime,
      breakMinutes,
      breakIncluded,
      durationMinutes,
      workedMinutes,
      hours: Number((workedMinutes / 60).toFixed(2)),
    },
  };
}

module.exports = {
  parseHHMM,
  calculateDurationMinutes,
  validateShiftTemplatePayload,
};
