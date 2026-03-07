(function setupAuthModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});

  mod.auth = {
    getState() {
      return globalScope.__scheduleState || null;
    },
    getToken() {
      return globalScope.__scheduleState?.authToken || '';
    },
    getCurrentUser() {
      return globalScope.__scheduleState?.currentUser || null;
    },
  };
})(window);
