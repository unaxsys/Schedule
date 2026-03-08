(function setupShiftsModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});
  mod.shifts = {
    clearDepartmentShiftCache() {
      if (typeof globalScope.__clearDepartmentShiftCache === 'function') {
        globalScope.__clearDepartmentShiftCache();
      }
    },
  };
})(window);
