(function setupSafeDomModule(globalScope) {
  const mod = globalScope.ScheduleModules || (globalScope.ScheduleModules = {});

  function appendTextCell(row, text) {
    const td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    row.appendChild(td);
    return td;
  }

  mod.render = mod.render || {};
  mod.render.safeDom = { appendTextCell };
})(window);
