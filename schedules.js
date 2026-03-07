(function setupSchedulesModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});
  mod.schedules = {
    getActiveSchedule() {
      return globalScope.__scheduleState?.activeSchedule || null;
    },
  };
})(window);
