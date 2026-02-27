(function scheduleTotalsModule(global) {
  function safeNum(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function minutesToHoursDecimal(minutes) {
    return (safeNum(minutes, 0) / 60).toFixed(2);
  }

  function normalizeEntrySnapshot(snapshot) {
    return {
      workMinutesTotal: safeNum(snapshot?.workMinutesTotal ?? snapshot?.workMinutes),
      nightMinutes: safeNum(snapshot?.nightMinutes),
      weekendMinutes: safeNum(snapshot?.weekendMinutes),
      holidayMinutes: safeNum(snapshot?.holidayMinutes),
      overtimeMinutes: safeNum(snapshot?.overtimeMinutes),
    };
  }

  function zeroTotals() {
    return {
      workMinutesTotal: 0,
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
