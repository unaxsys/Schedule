const SHIFT_CODES = {
  R: { label: 'Р', hours: 8, type: 'work' },
  P: { label: 'П', hours: 0, type: 'rest' },
  O: { label: 'О', hours: 0, type: 'vacation' },
  B: { label: 'Б', hours: 0, type: 'sick' }
};

const loadedSchedule = loadScheduleState();
const state = {
  month: loadedSchedule.month || todayMonth(),
  employees: loadEmployees(),
  schedule: loadedSchedule.schedule || {}
};

const monthPicker = document.getElementById('monthPicker');
const generateBtn = document.getElementById('generateBtn');
const employeeForm = document.getElementById('employeeForm');
const nameInput = document.getElementById('nameInput');
const departmentInput = document.getElementById('departmentInput');
const positionInput = document.getElementById('positionInput');
const vacationAllowanceInput = document.getElementById('vacationAllowanceInput');
const employeeList = document.getElementById('employeeList');
const scheduleTable = document.getElementById('scheduleTable');

monthPicker.value = state.month;
renderAll();

generateBtn.addEventListener('click', () => {
  state.month = monthPicker.value || todayMonth();
  saveSchedule();
  renderAll();
});

employeeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const employee = {
    id: crypto.randomUUID(),
    name: nameInput.value.trim(),
    department: departmentInput.value.trim(),
    position: positionInput.value.trim(),
    vacationAllowance: Number(vacationAllowanceInput.value)
  };

  if (!employee.name || !employee.department || !employee.position) {
    return;
  }

  state.employees.push(employee);
  persistEmployees();
  employeeForm.reset();
  vacationAllowanceInput.value = 20;
  renderAll();
});

function renderAll() {
  renderEmployees();
  renderSchedule();
}

function renderEmployees() {
  employeeList.innerHTML = '';
  if (!state.employees.length) {
    employeeList.textContent = 'Няма въведени служители.';
    return;
  }

  state.employees.forEach((employee) => {
    const item = document.createElement('div');
    item.className = 'employee-item';

    const details = document.createElement('div');
    details.innerHTML = `<b>${employee.name}</b><br>${employee.department} • ${employee.position}<br>Полагаем отпуск: ${employee.vacationAllowance} дни`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Изтрий';
    removeBtn.addEventListener('click', () => {
      state.employees = state.employees.filter((e) => e.id !== employee.id);
      persistEmployees();
      renderAll();
    });

    item.append(details, removeBtn);
    employeeList.appendChild(item);
  });
}

function renderSchedule() {
  const month = state.month || todayMonth();
  const [year, monthIndex] = month.split('-').map(Number);
  const totalDays = new Date(year, monthIndex, 0).getDate();

  const header = document.createElement('tr');
  header.innerHTML = '<th class="sticky">Служител / Отдел / Длъжност</th>';

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex - 1, day);
    const holiday = isOfficialHoliday(date);
    const weekend = isWeekend(date);
    const th = document.createElement('th');
    th.textContent = String(day);
    if (holiday) {
      th.classList.add('day-holiday');
      th.title = 'Официален празник';
    } else if (weekend) {
      th.classList.add('day-weekend');
      th.title = 'Уикенд';
    }
    header.appendChild(th);
  }

  header.innerHTML += '<th class="summary-col">Раб. дни</th><th class="summary-col">Часове</th><th class="summary-col">Празн. дни</th><th class="summary-col">Отпуск</th><th class="summary-col">Остатък отпуск</th><th class="summary-col">Болничен</th>';

  scheduleTable.innerHTML = '';
  scheduleTable.appendChild(header);

  state.employees.forEach((employee) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'sticky';
    nameCell.innerHTML = `<b>${employee.name}</b><br><small>${employee.department} • ${employee.position}</small>`;
    row.appendChild(nameCell);

    let workedDays = 0;
    let workedHours = 0;
    let holidayWorkedDays = 0;
    let vacationDays = 0;
    let sickDays = 0;

    for (let day = 1; day <= totalDays; day += 1) {
      const key = scheduleKey(employee.id, month, day);
      const currentShift = state.schedule[key] || 'P';

      const date = new Date(year, monthIndex - 1, day);
      const holiday = isOfficialHoliday(date);
      const weekend = isWeekend(date);

      const cell = document.createElement('td');
      if (holiday) {
        cell.classList.add('day-holiday');
      } else if (weekend) {
        cell.classList.add('day-weekend');
      }

      const select = document.createElement('select');
      select.className = 'shift-select';

      Object.keys(SHIFT_CODES).forEach((code) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = SHIFT_CODES[code].label;
        if (code === currentShift) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener('change', () => {
        state.schedule[key] = select.value;
        saveSchedule();
        renderSchedule();
      });

      cell.appendChild(select);
      row.appendChild(cell);

      const shift = SHIFT_CODES[currentShift] || SHIFT_CODES.P;
      if (shift.type === 'work') {
        workedDays += 1;
        workedHours += shift.hours;
        if (holiday || weekend) {
          holidayWorkedDays += 1;
        }
      }
      if (shift.type === 'vacation') vacationDays += 1;
      if (shift.type === 'sick') sickDays += 1;
    }

    const remainingVacation = employee.vacationAllowance - getVacationUsedForYear(employee.id, year);

    row.innerHTML += `<td class="summary-col">${workedDays}</td><td class="summary-col">${workedHours}</td><td class="summary-col">${holidayWorkedDays}</td><td class="summary-col">${vacationDays}</td><td class="summary-col">${remainingVacation}</td><td class="summary-col">${sickDays}</td>`;
    scheduleTable.appendChild(row);
  });
}

function getVacationUsedForYear(employeeId, year) {
  let used = 0;
  Object.entries(state.schedule).forEach(([key, code]) => {
    if (!key.startsWith(`${employeeId}|${year}-`) || code !== 'O') {
      return;
    }
    used += 1;
  });
  return used;
}

function scheduleKey(employeeId, month, day) {
  return `${employeeId}|${month}|${day}`;
}

function persistEmployees() {
  localStorage.setItem('employees', JSON.stringify(state.employees));
}

function saveSchedule() {
  localStorage.setItem('scheduleState', JSON.stringify({ month: state.month, schedule: state.schedule }));
}

function loadEmployees() {
  try {
    return JSON.parse(localStorage.getItem('employees') || '[]');
  } catch {
    return [];
  }
}

function loadScheduleState() {
  try {
    return JSON.parse(localStorage.getItem('scheduleState') || '{}');
  } catch {
    return { month: todayMonth(), schedule: {} };
  }
}

function todayMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isOfficialHoliday(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const key = `${month}-${day}`;

  const fixed = new Set([
    '1-1',
    '3-3',
    '5-1',
    '5-6',
    '5-24',
    '9-6',
    '9-22',
    '12-24',
    '12-25',
    '12-26'
  ]);

  if (fixed.has(key)) return true;

  const easter = orthodoxEaster(year);
  const easterDates = [-2, -1, 0, 1].map((offset) => {
    const d = new Date(easter);
    d.setDate(easter.getDate() + offset);
    return `${d.getMonth() + 1}-${d.getDate()}`;
  });

  return easterDates.includes(key);
}

function orthodoxEaster(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  const julianDate = new Date(year, month - 1, day);
  julianDate.setDate(julianDate.getDate() + 13);
  return julianDate;
}
