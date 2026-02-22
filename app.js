const SHIFT_CODES = {
  R: { label: 'Р', hours: 8, type: 'work' },
  P: { label: 'П', hours: 0, type: 'rest' },
  O: { label: 'О', hours: 0, type: 'vacation' },
  B: { label: 'Б', hours: 0, type: 'sick' }
};

const DEFAULT_RATES = {
  weekend: 1.75,
  holiday: 2
};

const state = {
  month: todayMonth(),
  employees: [],
  schedule: {},
  backendAvailable: false,
  apiBaseUrl: '',
  rates: loadRates()
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
const storageStatus = document.getElementById('storageStatus');
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiUrlBtn = document.getElementById('saveApiUrlBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const monthInfo = document.getElementById('monthInfo');
const vacationForm = document.getElementById('vacationForm');
const vacationEmployeeSelect = document.getElementById('vacationEmployeeSelect');
const vacationStartInput = document.getElementById('vacationStartInput');
const vacationEndInput = document.getElementById('vacationEndInput');
const vacationLedger = document.getElementById('vacationLedger');
const ratesForm = document.getElementById('ratesForm');
const weekendRateInput = document.getElementById('weekendRateInput');
const holidayRateInput = document.getElementById('holidayRateInput');

init();

async function init() {
  monthPicker.value = state.month;

  const loadedSchedule = loadScheduleState();
  state.month = loadedSchedule.month || todayMonth();
  state.schedule = loadedSchedule.schedule || {};
  state.employees = loadEmployees();
  state.apiBaseUrl = detectApiBaseUrl();

  weekendRateInput.value = String(state.rates.weekend);
  holidayRateInput.value = String(state.rates.holiday);
  apiUrlInput.value = state.apiBaseUrl;

  attachApiControls();
  attachTabs();
  attachRatesForm();
  attachVacationForm();

  const synced = await loadFromBackend();
  if (!synced) {
    setStatus(`Локален режим (localStorage). API: ${state.apiBaseUrl}`, false);
  }

  monthPicker.value = state.month;
  renderAll();
}

function attachTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach((other) => other.classList.toggle('active', other === btn));
      tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === target));
    });
  });
}

function attachApiControls() {
  saveApiUrlBtn.addEventListener('click', async () => {
    const nextUrl = normalizeApiBaseUrl(apiUrlInput.value.trim());
    state.apiBaseUrl = nextUrl;
    localStorage.setItem('apiBaseUrl', nextUrl);
    setStatus(`Проверка на API: ${nextUrl}`, false);

    const synced = await loadFromBackend();
    if (!synced) {
      setStatus(`Няма връзка с API (${nextUrl}). Работи в локален режим.`, false);
      renderAll();
    }
  });
}

function attachRatesForm() {
  ratesForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.rates.weekend = Number(weekendRateInput.value) || DEFAULT_RATES.weekend;
    state.rates.holiday = Number(holidayRateInput.value) || DEFAULT_RATES.holiday;
    localStorage.setItem('laborRates', JSON.stringify(state.rates));
    renderSchedule();
  });
}

function attachVacationForm() {
  vacationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const employeeId = vacationEmployeeSelect.value;
    const start = new Date(vacationStartInput.value);
    const end = new Date(vacationEndInput.value);

    if (!employeeId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return;
    }

    const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
    if (startMonth !== state.month || endMonth !== state.month) {
      setStatus('Диапазонът за отпуск трябва да е в избрания месец.', false);
      return;
    }

    const promises = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      const key = scheduleKey(employeeId, state.month, day);
      state.schedule[key] = 'O';
      promises.push(saveScheduleEntryBackend(employeeId, state.month, day, 'O'));
    }

    saveScheduleLocal();
    await Promise.all(promises);
    renderAll();
  });
}

generateBtn.addEventListener('click', () => {
  state.month = monthPicker.value || todayMonth();
  saveScheduleLocal();
  renderAll();
});

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const employee = {
    id: createEmployeeId(),
    name: nameInput.value.trim(),
    department: departmentInput.value.trim(),
    position: positionInput.value.trim(),
    vacationAllowance: Number(vacationAllowanceInput.value)
  };

  if (!employee.name || !employee.department || !employee.position) {
    return;
  }

  state.employees.push(employee);
  persistEmployeesLocal();
  await saveEmployeeBackend(employee);

  employeeForm.reset();
  vacationAllowanceInput.value = 20;
  renderAll();
});

function createEmployeeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderAll() {
  renderEmployees();
  renderSchedule();
  renderVacationLedger();
  renderVacationEmployeeOptions();
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
    removeBtn.addEventListener('click', async () => {
      state.employees = state.employees.filter((e) => e.id !== employee.id);
      persistEmployeesLocal();
      await deleteEmployeeBackend(employee.id);
      renderAll();
    });

    item.append(details, removeBtn);
    employeeList.appendChild(item);
  });
}

function renderVacationEmployeeOptions() {
  vacationEmployeeSelect.innerHTML = '';
  if (!state.employees.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Няма служители';
    vacationEmployeeSelect.appendChild(option);
    return;
  }

  state.employees.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = `${employee.name} (${employee.department})`;
    vacationEmployeeSelect.appendChild(option);
  });
}

function renderVacationLedger() {
  if (!state.employees.length) {
    vacationLedger.textContent = 'Добавете служители, за да следите отпуските.';
    return;
  }

  const year = Number((state.month || todayMonth()).split('-')[0]);
  const table = document.createElement('table');
  table.innerHTML =
    '<tr><th>Служител</th><th>Полагаем</th><th>Използван за годината</th><th>Остатък</th></tr>';

  state.employees.forEach((employee) => {
    const used = getVacationUsedForYear(employee.id, year);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${employee.name}</td><td>${employee.vacationAllowance}</td><td>${used}</td><td>${employee.vacationAllowance - used}</td>`;
    table.appendChild(tr);
  });

  vacationLedger.innerHTML = '';
  vacationLedger.appendChild(table);
}

function renderSchedule() {
  const month = state.month || todayMonth();
  const [year, monthIndex] = month.split('-').map(Number);
  const totalDays = new Date(year, monthIndex, 0).getDate();
  const monthStats = getMonthStats(year, monthIndex, totalDays);

  monthInfo.innerHTML = `
    <b>Работни дни по календар:</b> ${monthStats.workingDays} ·
    <b>Почивни дни:</b> ${monthStats.weekendDays} ·
    <b>Официални празници:</b> ${monthStats.holidayDays} ·
    <b>Норма:</b> ${monthStats.normHours} ч.
  `;

  const header = document.createElement('tr');
  header.innerHTML = '<th class="sticky">Служител / Отдел / Длъжност</th>';

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex - 1, day);
    const holiday = isOfficialHoliday(date);
    const weekend = isWeekend(date);
    const th = document.createElement('th');
    th.textContent = String(day);
    if (holiday) {
      th.className = 'day-holiday';
    } else if (weekend) {
      th.className = 'day-weekend';
    }
    header.appendChild(th);
  }

  header.innerHTML +=
    '<th class="summary-col">Отр. дни</th><th class="summary-col">Часове</th><th class="summary-col">Норма</th><th class="summary-col">Отклонение</th><th class="summary-col">Труд празник (ч)</th><th class="summary-col">Труд почивен (ч)</th><th class="summary-col">Платими часове</th><th class="summary-col">Отпуск</th><th class="summary-col">Ост. отпуск</th><th class="summary-col">Болничен</th>';

  scheduleTable.innerHTML = '';
  scheduleTable.appendChild(header);

  state.employees.forEach((employee) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'sticky';
    nameCell.innerHTML = `<b>${employee.name}</b><br><small>${employee.department} • ${employee.position}</small>`;
    row.appendChild(nameCell);

    const summary = {
      workedDays: 0,
      workedHours: 0,
      holidayWorkedHours: 0,
      weekendWorkedHours: 0,
      vacationDays: 0,
      sickDays: 0
    };

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
        if (code === currentShift) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener('change', async () => {
        state.schedule[key] = select.value;
        saveScheduleLocal();
        await saveScheduleEntryBackend(employee.id, month, day, select.value);
        renderSchedule();
        renderVacationLedger();
      });

      cell.appendChild(select);
      row.appendChild(cell);

      collectSummary(summary, currentShift, holiday, weekend);
    }

    const remainingVacation = employee.vacationAllowance - getVacationUsedForYear(employee.id, year);
    const normalizedHolidayHours = summary.holidayWorkedHours * state.rates.holiday;
    const normalizedWeekendHours = summary.weekendWorkedHours * state.rates.weekend;
    const payableHours =
      summary.workedHours - summary.holidayWorkedHours - summary.weekendWorkedHours + normalizedHolidayHours + normalizedWeekendHours;
    const deviation = summary.workedHours - monthStats.normHours;

    row.innerHTML += `<td class="summary-col">${summary.workedDays}</td><td class="summary-col">${summary.workedHours}</td><td class="summary-col">${monthStats.normHours}</td><td class="summary-col ${deviation < 0 ? 'negative' : 'positive'}">${deviation}</td><td class="summary-col">${summary.holidayWorkedHours}</td><td class="summary-col">${summary.weekendWorkedHours}</td><td class="summary-col">${payableHours.toFixed(2)}</td><td class="summary-col">${summary.vacationDays}</td><td class="summary-col">${remainingVacation}</td><td class="summary-col">${summary.sickDays}</td>`;
    scheduleTable.appendChild(row);
  });
}

function collectSummary(summary, shiftCode, holiday, weekend) {
  const shift = SHIFT_CODES[shiftCode] || SHIFT_CODES.P;

  if (shift.type === 'work') {
    summary.workedDays += 1;
    summary.workedHours += shift.hours;
    if (holiday) {
      summary.holidayWorkedHours += shift.hours;
    } else if (weekend) {
      summary.weekendWorkedHours += shift.hours;
    }
  }

  if (shift.type === 'vacation') {
    summary.vacationDays += 1;
  }
  if (shift.type === 'sick') {
    summary.sickDays += 1;
  }
}

function getMonthStats(year, monthIndex, totalDays) {
  let weekendDays = 0;
  let holidayDays = 0;
  let workingDays = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex - 1, day);
    const holiday = isOfficialHoliday(date);
    const weekend = isWeekend(date);

    if (holiday) {
      holidayDays += 1;
    }
    if (weekend) {
      weekendDays += 1;
    }
    if (!holiday && !weekend) {
      workingDays += 1;
    }
  }

  return {
    weekendDays,
    holidayDays,
    workingDays,
    normHours: workingDays * 8
  };
}

function detectApiBaseUrl() {
  const saved = localStorage.getItem('apiBaseUrl');
  if (saved) {
    return normalizeApiBaseUrl(saved);
  }

  if (window.__API_BASE_URL__) {
    return normalizeApiBaseUrl(window.__API_BASE_URL__);
  }

  const sameOrigin = window.location.origin;
  const sameHost3000 = `${window.location.protocol}//${window.location.hostname}:3000`;

  return normalizeApiBaseUrl(window.location.port === '3000' ? sameOrigin : sameHost3000);
}

function normalizeApiBaseUrl(url) {
  if (!url) {
    return window.location.origin;
  }
  return url.replace(/\/$/, '');
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${state.apiBaseUrl}${path}`, options);
  return response;
}

async function loadFromBackend() {
  try {
    const healthResponse = await apiFetch('/api/health');
    if (!healthResponse.ok) {
      throw new Error('Health check failed');
    }

    const response = await apiFetch('/api/state');
    if (!response.ok) {
      throw new Error('Backend state unavailable');
    }

    const payload = await response.json();
    state.employees = payload.employees || [];
    state.schedule = payload.schedule || {};
    state.backendAvailable = true;
    setStatus(`Свързан с PostgreSQL бекенд (${state.apiBaseUrl}).`, true);
    persistEmployeesLocal();
    saveScheduleLocal();
    return true;
  } catch {
    state.backendAvailable = false;
    return false;
  }
}

async function saveEmployeeBackend(employee) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const response = await apiFetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee)
    });

    if (!response.ok) {
      throw new Error('Save employee failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
  }
}

async function deleteEmployeeBackend(employeeId) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const response = await apiFetch(`/api/employees/${employeeId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Delete employee failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
  }
}

async function saveScheduleEntryBackend(employeeId, month, day, shiftCode) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const response = await apiFetch('/api/schedule-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, month, day, shiftCode })
    });

    if (!response.ok) {
      throw new Error('Save schedule entry failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
  }
}

function setStatus(message, good) {
  storageStatus.textContent = message;
  storageStatus.className = good ? 'status-ok' : 'status-warn';
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

function persistEmployeesLocal() {
  localStorage.setItem('employees', JSON.stringify(state.employees));
}

function saveScheduleLocal() {
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

function loadRates() {
  try {
    const parsed = JSON.parse(localStorage.getItem('laborRates') || '{}');
    return {
      weekend: Number(parsed.weekend) || DEFAULT_RATES.weekend,
      holiday: Number(parsed.holiday) || DEFAULT_RATES.holiday
    };
  } catch {
    return { ...DEFAULT_RATES };
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

  const fixed = new Set(['1-1', '3-3', '5-1', '5-6', '5-24', '9-6', '9-22', '12-24', '12-25', '12-26']);
  if (fixed.has(key)) {
    return true;
  }

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
