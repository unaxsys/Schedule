function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function enumerateDates(dateFrom, dateTo) {
  const start = normalizeDateOnly(dateFrom);
  const end = normalizeDateOnly(dateTo);
  if (!start || !end || start > end) return [];
  const result = [];
  let current = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  while (current <= endDate) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function computeLeaveMinutesForRange(leave, baseDayMinutes = 480) {
  const days = enumerateDates(leave?.date_from, leave?.date_to).length;
  if (!days) return 0;
  const perDay = Number(leave?.minutes_per_day);
  const effectivePerDay = Number.isFinite(perDay) && perDay > 0 ? Math.trunc(perDay) : baseDayMinutes;
  return days * effectivePerDay;
}

function computeAdjustedNormMinutes(normBaseMinutes, leaves, baseDayMinutes = 480) {
  const deduction = (leaves || []).reduce((acc, leave) => {
    if (!leave || leave.affects_norm !== true) return acc;
    return acc + computeLeaveMinutesForRange(leave, baseDayMinutes);
  }, 0);
  return Math.max(0, Number(normBaseMinutes || 0) - deduction);
}

function mapLeavesByEmployeeDay(leaves) {
  const map = {};
  for (const leave of leaves || []) {
    const employeeId = String(leave?.employee_id || '');
    if (!employeeId) continue;
    for (const day of enumerateDates(leave.date_from, leave.date_to)) {
      map[`${employeeId}|${day}`] = leave;
    }
  }
  return map;
}

function getLeaveShortLabel(leaveType) {
  const code = String(leaveType?.code || '').toUpperCase();
  if (code === 'SICK') return 'Б';
  if (code === 'PAID_LEAVE') return 'О';
  if (code === 'UNPAID') return 'НП';
  if (code === 'MATERNITY') return 'М';
  return String(leaveType?.name || code || 'L').slice(0, 2).toUpperCase();
}

module.exports = {
  normalizeDateOnly,
  enumerateDates,
  computeLeaveMinutesForRange,
  computeAdjustedNormMinutes,
  mapLeavesByEmployeeDay,
  getLeaveShortLabel,
};
