(function scheduleTotalsModule(global) {
  function safeNum(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function minutesToHoursDecimal(minutes) {
    return (safeNum(minutes, 0) / 60).toFixed(2);
  }

  function normalizeEntrySnapshot(snapshot) {
    const workMinutesTotal = safeNum(snapshot?.workMinutesTotal ?? snapshot?.workMinutes);
    const restMinutesTotal = Math.max(0, safeNum(snapshot?.breakMinutesApplied));
    return {
      workMinutesTotal,
      attendanceMinutesTotal: workMinutesTotal + restMinutesTotal,
      restMinutesTotal,
      nightMinutes: safeNum(snapshot?.nightMinutes),
      weekendMinutes: safeNum(snapshot?.weekendMinutes),
      holidayMinutes: safeNum(snapshot?.holidayMinutes),
      overtimeMinutes: safeNum(snapshot?.overtimeMinutes),
    };
  }

  function zeroTotals() {
    return {
      workMinutesTotal: 0,
      attendanceMinutesTotal: 0,
      restMinutesTotal: 0,
      nightMinutes: 0,
      weekendMinutes: 0,
      holidayMinutes: 0,
      overtimeMinutes: 0,
    };
  }

  function sumEmployeeTotals(entriesByDay) {
    const totals = zeroTotals();

    (entriesByDay || []).forEach((entry) => {
      const normalized = normalizeEntrySnapshot(entry);
      totals.workMinutesTotal += normalized.workMinutesTotal;
      totals.attendanceMinutesTotal += normalized.attendanceMinutesTotal;
      totals.restMinutesTotal += normalized.restMinutesTotal;
      totals.nightMinutes += normalized.nightMinutes;
      totals.weekendMinutes += normalized.weekendMinutes;
      totals.holidayMinutes += normalized.holidayMinutes;
      totals.overtimeMinutes += normalized.overtimeMinutes;
    });

    return totals;
  }

  function sumGridTotals(visibleEmployees) {
    return (visibleEmployees || []).reduce(
      (acc, employee) => {
        acc.workMinutesTotal += safeNum(employee?.workMinutesTotal);
        acc.attendanceMinutesTotal += safeNum(employee?.attendanceMinutesTotal);
        acc.restMinutesTotal += safeNum(employee?.restMinutesTotal);
        acc.nightMinutes += safeNum(employee?.nightMinutes);
        acc.weekendMinutes += safeNum(employee?.weekendMinutes);
        acc.holidayMinutes += safeNum(employee?.holidayMinutes);
        acc.overtimeMinutes += safeNum(employee?.overtimeMinutes);
        return acc;
      },
      zeroTotals()
    );
  }

  global.ScheduleTotals = {
    safeNum,
    minutesToHoursDecimal,
    sumEmployeeTotals,
    sumGridTotals,
    zeroTotals,
  };
})(window);
