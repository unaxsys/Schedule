(function setupApiModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});

  async function apiRequest(path, options = {}) {
    if (typeof globalScope.__scheduleApiRequest === 'function') {
      return globalScope.__scheduleApiRequest(path, options);
    }
    throw new Error('Schedule API bridge is not initialized.');
  }

  mod.api = { apiRequest };
})(window);
