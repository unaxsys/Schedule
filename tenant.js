(function setupTenantModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});

  mod.tenant = {
    getSelectedTenantId() {
      return globalScope.__scheduleState?.selectedTenantId || '';
    },
  };
})(window);
