const DEFAULT_RATES = {
  weekend: 1.75,
  holiday: 2
};

const NIGHT_HOURS_COEFFICIENT = 1.14286;
const MAX_NIGHT_SHIFT_HOURS = 12;

const SYSTEM_SHIFTS = [
  { code: 'P', label: 'П', name: 'Почивка', type: 'rest', start: '', end: '', hours: 0, locked: true },
  { code: 'O', label: 'О', name: 'Отпуск', type: 'vacation', start: '', end: '', hours: 0, locked: true },
  { code: 'B', label: 'Б', name: 'Болничен', type: 'sick', start: '', end: '', hours: 0, locked: true }
];

const DEFAULT_WORK_SHIFT = { code: 'R', label: 'Р', name: 'Редовна', type: 'work', start: '09:00', end: '17:00', hours: 8, locked: true };

const state = {
  month: todayMonth(),
  employees: [],
  schedule: {},
  backendAvailable: false,
  apiBaseUrl: '',
  rates: loadRates(),
  shiftTemplates: loadShiftTemplates(),
  lockedMonths: loadLockedMonths(),
  sirvPeriodMonths: loadSirvPeriodMonths()
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
const sirvPeriodInput = document.getElementById('sirvPeriodInput');
const shiftForm = document.getElementById('shiftForm');
const shiftCodeInput = document.getElementById('shiftCodeInput');
const shiftNameInput = document.getElementById('shiftNameInput');
const shiftStartInput = document.getElementById('shiftStartInput');
const shiftEndInput = document.getElementById('shiftEndInput');
const shiftList = document.getElementById('shiftList');
const shiftLegend = document.getElementById('shiftLegend');
const lockScheduleBtn = document.getElementById('lockScheduleBtn');
const unlockScheduleBtn = document.getElementById('unlockScheduleBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const lockStatus = document.getElementById('lockStatus');

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
  sirvPeriodInput.value = String(state.sirvPeriodMonths);
  apiUrlInput.value = state.apiBaseUrl;

  attachApiControls();
  attachTabs();
  attachRatesForm();
  attachVacationForm();
  attachShiftForm();
  attachLockAndExport();

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
    state.sirvPeriodMonths = normalizeSirvPeriod(sirvPeriodInput.value);
    sirvPeriodInput.value = String(state.sirvPeriodMonths);
    saveSirvPeriodMonths();
    renderSchedule();
  });
}

function attachShiftForm() {
  shiftForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const code = shiftCodeInput.value.trim().toUpperCase();
    const name = shiftNameInput.value.trim();
    const start = shiftStartInput.value;
    const end = shiftEndInput.value;

    if (!code || !name || !start || !end) {
      return;
    }

    if (state.shiftTemplates.some((shift) => shift.code === code)) {
      setStatus(`Смяна с код ${code} вече съществува.`, false);
      return;
    }

    const hours = calcShiftHours(start, end);
    if (hours <= 0) {
      setStatus('Невалиден интервал за смяна.', false);
      return;
    }

    const nightHours = calcNightHours(start, end);
    if (nightHours > 0 && hours > MAX_NIGHT_SHIFT_HOURS) {
      setStatus('Нощна смяна при СИРВ може да е максимум 12 часа.', false);
      return;
    }

    state.shiftTemplates.push({
      code,
      label: code,
      name,
      type: 'work',
      start,
      end,
      hours,
      locked: false
    });

    saveShiftTemplates();
    void saveShiftTemplateBackend({ code, name, start, end, hours });
    shiftForm.reset();
    renderAll();
  });
}

function attachLockAndExport() {
  lockScheduleBtn.addEventListener('click', () => {
    state.lockedMonths[state.month] = true;
    saveLockedMonths();
    renderSchedule();
  });

  unlockScheduleBtn.addEventListener('click', () => {
    delete state.lockedMonths[state.month];
    saveLockedMonths();
    renderSchedule();
  });

  exportExcelBtn.addEventListener('click', () => {
    exportScheduleToExcel();
  });

  exportPdfBtn.addEventListener('click', () => {
    exportScheduleToPdf();
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
  const persistedEmployee = await saveEmployeeBackend(employee);
  if (persistedEmployee && persistedEmployee.id !== employee.id) {
    state.employees = state.employees.map((entry) => (entry.id === employee.id ? persistedEmployee : entry));
    persistEmployeesLocal();
  }

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
  renderShiftList();
  renderLegend();
}

function renderLegend() {
  shiftLegend.innerHTML = '';
  state.shiftTemplates.forEach((shift) => {
    const span = document.createElement('span');
    if (shift.type === 'work') {
      span.innerHTML = `<b>${shift.code}</b> - ${shift.name} (${shift.start}-${shift.end}, ${shift.hours}ч)`;
    } else {
      span.innerHTML = `<b>${shift.code}</b> - ${shift.name}`;
    }
    shiftLegend.appendChild(span);
  });
}

function renderShiftList() {
  shiftList.innerHTML = '';
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>Код</th><th>Име</th><th>Начало</th><th>Край</th><th>Часове</th><th>Тип</th><th>Действие</th></tr>';

  state.shiftTemplates.forEach((shift) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${shift.code}</td><td>${shift.name}</td><td>${shift.start || '-'}</td><td>${shift.end || '-'}</td><td>${shift.hours}</td><td>${shift.type}</td>`;

    const actionCell = document.createElement('td');
    if (shift.locked) {
      actionCell.textContent = 'Системна';
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Изтрий';
      removeBtn.addEventListener('click', async () => {
        state.shiftTemplates = state.shiftTemplates.filter((entry) => entry.code !== shift.code);
        saveShiftTemplates();
        await deleteShiftTemplateBackend(shift.code);
        replaceDeletedShiftCodes(shift.code);
        renderAll();
      });
      actionCell.appendChild(removeBtn);
    }
    row.appendChild(actionCell);
    table.appendChild(row);
  });

  shiftList.appendChild(table);
}

function replaceDeletedShiftCodes(deletedCode) {
  Object.keys(state.schedule).forEach((key) => {
    if (state.schedule[key] === deletedCode) {
      state.schedule[key] = 'P';
    }
  });
  saveScheduleLocal();
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

function attachVacationForm() {
  vacationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isMonthLocked(state.month)) {
      setStatus('Графикът за този месец е заключен. Отключете, за да редактирате.', false);
      return;
    }

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
  const monthLocked = isMonthLocked(month);

  lockStatus.textContent = `Статус: ${monthLocked ? 'Заключен' : 'Отключен'}`;

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
    '<th class="summary-col">Отр. дни</th><th class="summary-col">Часове</th><th class="summary-col">Норма</th><th class="summary-col">Отклонение</th><th class="summary-col">СИРВ норма</th><th class="summary-col">СИРВ отраб.</th><th class="summary-col">Извънреден</th><th class="summary-col">Труд празник (ч)</th><th class="summary-col">Труд почивен (ч)</th><th class="summary-col">Нощен труд (ч)</th><th class="summary-col">Нощен коеф. (ч)</th><th class="summary-col">Платими часове</th><th class="summary-col">Отпуск</th><th class="summary-col">Ост. отпуск</th><th class="summary-col">Болничен</th>';

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
      nightWorkedHours: 0,
      nightConvertedHours: 0,
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
      select.disabled = monthLocked;

      state.shiftTemplates.forEach((shift) => {
        const option = document.createElement('option');
        option.value = shift.code;
        option.textContent = shift.label;
        if (shift.code === currentShift) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener('change', async () => {
        if (monthLocked) {
          return;
        }
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
      summary.workedHours - summary.holidayWorkedHours - summary.weekendWorkedHours + normalizedHolidayHours + normalizedWeekendHours + summary.nightConvertedHours;
    const deviation = summary.workedHours + summary.nightConvertedHours - monthStats.normHours;
    const sirvTotals = getSirvTotalsForEmployee(employee.id, month, state.sirvPeriodMonths);

    row.innerHTML += `<td class="summary-col">${summary.workedDays}</td><td class="summary-col">${summary.workedHours.toFixed(2)}</td><td class="summary-col">${monthStats.normHours}</td><td class="summary-col ${deviation < 0 ? 'negative' : 'positive'}">${deviation.toFixed(2)}</td><td class="summary-col">${sirvTotals.normHours.toFixed(2)}</td><td class="summary-col">${sirvTotals.convertedWorkedHours.toFixed(2)}</td><td class="summary-col ${sirvTotals.overtimeHours > 0 ? 'negative' : 'positive'}">${sirvTotals.overtimeHours.toFixed(2)}</td><td class="summary-col">${summary.holidayWorkedHours.toFixed(2)}</td><td class="summary-col">${summary.weekendWorkedHours.toFixed(2)}</td><td class="summary-col">${summary.nightWorkedHours.toFixed(2)}</td><td class="summary-col">${summary.nightConvertedHours.toFixed(2)}</td><td class="summary-col">${payableHours.toFixed(2)}</td><td class="summary-col">${summary.vacationDays}</td><td class="summary-col">${remainingVacation}</td><td class="summary-col">${summary.sickDays}</td>`;
    scheduleTable.appendChild(row);
  });
}

function collectSummary(summary, shiftCode, holiday, weekend) {
  const shift = getShiftByCode(shiftCode) || getShiftByCode('P');

  if (shift.type === 'work') {
    const shiftHours = Number(shift.hours) || 0;
    const nightHours = calcNightHours(shift.start, shift.end);

    summary.workedDays += 1;
    summary.workedHours += shiftHours;
    summary.nightWorkedHours += nightHours;
    summary.nightConvertedHours += nightHours * (NIGHT_HOURS_COEFFICIENT - 1);

    if (holiday) {
      summary.holidayWorkedHours += shiftHours;
    } else if (weekend) {
      summary.weekendWorkedHours += shiftHours;
    }
  }

  if (shift.type === 'vacation') {
    summary.vacationDays += 1;
  }
  if (shift.type === 'sick') {
    summary.sickDays += 1;
  }
}

function getShiftByCode(code) {
  return state.shiftTemplates.find((shift) => shift.code === code);
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


function normalizeSirvPeriod(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 1;
  }
  return Math.min(6, Math.max(1, Math.trunc(parsed)));
}

function saveSirvPeriodMonths() {
  localStorage.setItem('sirvPeriodMonths', String(state.sirvPeriodMonths));
}

function loadSirvPeriodMonths() {
  return normalizeSirvPeriod(localStorage.getItem('sirvPeriodMonths') || '1');
}

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodMonths(endMonth, periodMonths) {
  const months = [];
  for (let offset = periodMonths - 1; offset >= 0; offset -= 1) {
    months.push(addMonths(endMonth, -offset));
  }
  return months;
}

function getSirvTotalsForEmployee(employeeId, endMonth, periodMonths) {
  const months = getPeriodMonths(endMonth, periodMonths);
  const totals = {
    normHours: 0,
    convertedWorkedHours: 0,
    overtimeHours: 0
  };

  months.forEach((monthKey) => {
    const [year, monthIndex] = monthKey.split('-').map(Number);
    const totalDays = new Date(year, monthIndex, 0).getDate();
    const monthStats = getMonthStats(year, monthIndex, totalDays);
    totals.normHours += monthStats.normHours;

    for (let day = 1; day <= totalDays; day += 1) {
      const shiftCode = state.schedule[scheduleKey(employeeId, monthKey, day)] || 'P';
      const shift = getShiftByCode(shiftCode) || getShiftByCode('P');
      if (shift.type !== 'work') {
        continue;
      }
      const workedHours = Number(shift.hours) || 0;
      const nightHours = calcNightHours(shift.start, shift.end);
      totals.convertedWorkedHours += workedHours + nightHours * (NIGHT_HOURS_COEFFICIENT - 1);
    }
  });

  totals.overtimeHours = Math.max(0, totals.convertedWorkedHours - totals.normHours);
  return totals;
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
  const sameHost4000 = `${window.location.protocol}//${window.location.hostname}:4000`;

  return normalizeApiBaseUrl(window.location.port === '4000' ? sameOrigin : sameHost4000);
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
    const backendShiftTemplates = Array.isArray(payload.shiftTemplates) ? payload.shiftTemplates : [];
    if (backendShiftTemplates.length) {
      state.shiftTemplates = mergeShiftTemplates(backendShiftTemplates);
      saveShiftTemplates();
    }
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
    return null;
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

    const payload = await response.json();
    return payload.employee || employee;
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
    return null;
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


async function saveShiftTemplateBackend(shift) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const response = await apiFetch('/api/shift-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shift)
    });

    if (!response.ok) {
      throw new Error('Save shift template failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
  }
}

async function deleteShiftTemplateBackend(code) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const response = await apiFetch(`/api/shift-template/${encodeURIComponent(code)}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Delete shift template failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
  }
}

function exportScheduleToExcel() {
  const tableHtml = scheduleTable.outerHTML;
  const html = `
    <html>
      <head><meta charset="UTF-8"></head>
      <body>
        <h3>График за ${state.month}</h3>
        ${tableHtml}
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `grafik-${state.month}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportScheduleToPdf() {
  const popup = window.open('', '_blank');
  if (!popup) {
    return;
  }

  popup.document.write(`
    <html>
      <head>
        <title>График ${state.month}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 12px; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #999; padding: 4px; text-align: center; }
          th:first-child, td:first-child { text-align: left; }
        </style>
      </head>
      <body>
        <h3>График за ${state.month}</h3>
        ${scheduleTable.outerHTML}
      </body>
    </html>
  `);

  popup.document.close();
  popup.focus();
  popup.print();
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

function saveShiftTemplates() {
  localStorage.setItem('shiftTemplates', JSON.stringify(state.shiftTemplates));
}

function mergeShiftTemplates(backendShiftTemplates) {
  const merged = [...SYSTEM_SHIFTS, DEFAULT_WORK_SHIFT];

  backendShiftTemplates.forEach((shift) => {
    const code = String(shift.code || '').trim().toUpperCase();
    if (!code || merged.some((existing) => existing.code === code)) {
      return;
    }

    merged.push({
      code,
      label: code,
      name: String(shift.name || code),
      type: 'work',
      start: String(shift.start || ''),
      end: String(shift.end || ''),
      hours: Number(shift.hours) || calcShiftHours(String(shift.start || ''), String(shift.end || '')),
      locked: false
    });
  });

  return merged;
}

function loadShiftTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem('shiftTemplates') || '[]');
    return mergeShiftTemplates(parsed);
  } catch {
    return [...SYSTEM_SHIFTS, DEFAULT_WORK_SHIFT];
  }
}

function saveLockedMonths() {
  localStorage.setItem('lockedMonths', JSON.stringify(state.lockedMonths));
}

function loadLockedMonths() {
  try {
    return JSON.parse(localStorage.getItem('lockedMonths') || '{}');
  } catch {
    return {};
  }
}

function isMonthLocked(month) {
  return Boolean(state.lockedMonths[month]);
}

function calcNightHours(start, end) {
  if (!start || !end) {
    return 0;
  }

  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return 0;
  }

  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const windows = [
    [22 * 60, 24 * 60],
    [24 * 60, 30 * 60]
  ];

  let nightMinutes = 0;
  windows.forEach(([windowStart, windowEnd]) => {
    const overlapStart = Math.max(startMinutes, windowStart);
    const overlapEnd = Math.min(endMinutes, windowEnd);
    if (overlapEnd > overlapStart) {
      nightMinutes += overlapEnd - overlapStart;
    }
  });

  return Number((nightMinutes / 60).toFixed(2));
}

function calcShiftHours(start, end) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return Number(((endMinutes - startMinutes) / 60).toFixed(2));
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
