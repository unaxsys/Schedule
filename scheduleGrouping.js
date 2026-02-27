(function scheduleGroupingModule(global) {
  function normalizeDepartmentName(value) {
    return String(value || '').trim() || 'Без отдел';
  }

  function groupEmployeesByDepartment({ employees, departments } = {}) {
    const departmentNameById = new Map((departments || []).map((department) => [department.id, department.name]));
    const groupedMap = {};

    (employees || []).forEach((employee) => {
      const deptId = String(employee?.departmentId || 'no_department');
      const deptName = normalizeDepartmentName(employee?.department || departmentNameById.get(employee?.departmentId));

      if (!groupedMap[deptId]) {
        groupedMap[deptId] = {
          deptId,
          deptName,
          employees: [],
        };
      }

      groupedMap[deptId].employees.push(employee);
    });

    const order = Object.keys(groupedMap).sort((a, b) => {
      const nameA = groupedMap[a]?.deptName || '';
      const nameB = groupedMap[b]?.deptName || '';
      return nameA.localeCompare(nameB, 'bg');
    });

    return { order, map: groupedMap };
  }

  global.ScheduleGrouping = {
    groupEmployeesByDepartment,
  };
})(window);
