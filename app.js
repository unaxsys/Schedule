const DEFAULT_RATES = {
  weekend: 1.75,
  holiday: 2
};

const NIGHT_HOURS_COEFFICIENT = 1.14286;
const MAX_NIGHT_SHIFT_HOURS = 12;

const TELK_EXTRA_VACATION_DAYS = 6;
const YOUNG_WORKER_EXTRA_VACATION_DAYS = 6;

const SYSTEM_SHIFTS = [
  { code: 'P', label: 'П', name: 'Почивка', type: 'rest', start: '', end: '', hours: 0, locked: true },
  { code: 'O', label: 'О', name: 'Отпуск', type: 'vacation', start: '', end: '', hours: 0, locked: true },
  { code: 'B', label: 'Б', name: 'Болничен', type: 'sick', start: '', end: '', hours: 0, locked: true }
];

const DEFAULT_WORK_SHIFT = { code: 'R', label: 'Р', name: 'Редовна', type: 'work', start: '09:00', end: '17:00', hours: 8, locked: true };

const SUMMARY_COLUMNS = [
  { key: 'workedDays', label: 'Отр. дни' },
  { key: 'workedHours', label: 'Часове' },
  { key: 'normHours', label: 'Норма' },
  { key: 'deviation', label: 'Отклонение' },
  { key: 'sirvNormHours', label: 'СИРВ норма' },
  { key: 'sirvWorkedHours', label: 'СИРВ отраб.' },
  { key: 'overtimeHours', label: 'Извънреден' },
  { key: 'holidayWorkedHours', label: 'Труд празник (ч)' },
  { key: 'weekendWorkedHours', label: 'Труд почивен (ч)' },
  { key: 'nightWorkedHours', label: 'Нощен труд (ч)' },
  { key: 'nightConvertedHours', label: 'Нощен коеф. (ч)' },
  { key: 'payableHours', label: 'Платими часове' },
  { key: 'vacationDays', label: 'Отпуск' },
  { key: 'remainingVacation', label: 'Ост. отпуск' },
  { key: 'sickDays', label: 'Болничен' }
];

const state = {
  month: todayMonth(),
  employees: [],
  scheduleEmployees: [],
  schedule: {},
  scheduleEntriesById: {},
  schedules: [],
  selectedScheduleIds: [],
  activeScheduleId: null,
  departments: [],
  expandedDepartmentId: null,
  selectedDepartmentId: 'all',
  hasManualScheduleSelection: false,
  backendAvailable: false,
  apiBaseUrl: '',
  userRole: loadUserRole(),
  rates: loadRates(),
  shiftTemplates: loadShiftTemplates(),
  lockedMonths: loadLockedMonths(),
  sirvPeriodMonths: loadSirvPeriodMonths(),
  summaryColumnsVisibility: loadSummaryColumnsVisibility(),
  superAdminOverview: null,
  authToken: loadAuthToken(),
  currentUser: loadCurrentUser(),
  platformUserEmployees: []
};

const DEPARTMENT_VIEW_ALL = 'all';
const DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS = 'all_by_departments';

const monthPicker = document.getElementById('monthPicker');
const generateBtn = document.getElementById('generateBtn');
const employeeForm = document.getElementById('employeeForm');
const firstNameInput = document.getElementById('firstNameInput');
const middleNameInput = document.getElementById('middleNameInput');
const lastNameInput = document.getElementById('lastNameInput');
const departmentInput = document.getElementById('departmentInput');
const positionInput = document.getElementById('positionInput');
const egnInput = document.getElementById('egnInput');
const startDateInput = document.getElementById('startDateInput');
const endDateInput = document.getElementById('endDateInput');
const vacationAllowanceInput = document.getElementById('vacationAllowanceInput');
const telkInput = document.getElementById('telkInput');
const youngWorkerInput = document.getElementById('youngWorkerInput');
const employeeList = document.getElementById('employeeList');
const scheduleTable = document.getElementById('scheduleTable');
const storageStatus = document.getElementById('storageStatus');
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiUrlBtn = document.getElementById('saveApiUrlBtn');
const userRoleSelect = document.getElementById('userRoleSelect');
const superAdminPortalLink = document.getElementById('superAdminPortalLink');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const monthInfo = document.getElementById('monthInfo');
const scheduleFilterDepartmentSelect = document.getElementById('scheduleFilterDepartmentSelect');
const scheduleDepartmentSelect = document.getElementById('scheduleDepartmentSelect');
const scheduleNameInput = document.getElementById('scheduleNameInput');
const createScheduleBtn = document.getElementById('createScheduleBtn');
const scheduleList = document.getElementById('scheduleList');
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
const summarySettingsList = document.getElementById('summarySettingsList');
const settingsSubtabButtons = document.querySelectorAll('.settings-subtab-btn');
const settingsSubtabPanels = document.querySelectorAll('.settings-subtab-panel');
const departmentForm = document.getElementById('departmentForm');
const departmentNameInput = document.getElementById('departmentNameInput');
const departmentList = document.getElementById('departmentList');
const employeeEditModal = document.getElementById('employeeEditModal');
const employeeEditForm = document.getElementById('employeeEditForm');
const editFirstNameInput = document.getElementById('editFirstNameInput');
const editMiddleNameInput = document.getElementById('editMiddleNameInput');
const editLastNameInput = document.getElementById('editLastNameInput');
const editDepartmentInput = document.getElementById('editDepartmentInput');
const editPositionInput = document.getElementById('editPositionInput');
const editEgnInput = document.getElementById('editEgnInput');
const editStartDateInput = document.getElementById('editStartDateInput');
const editEndDateInput = document.getElementById('editEndDateInput');
const editVacationAllowanceInput = document.getElementById('editVacationAllowanceInput');
const editTelkInput = document.getElementById('editTelkInput');
const editYoungWorkerInput = document.getElementById('editYoungWorkerInput');
const cancelEmployeeEditBtn = document.getElementById('cancelEmployeeEditBtn');
const registrationForm = document.getElementById('registrationForm');
const companyNameInput = document.getElementById('companyNameInput');
const ownerFullNameInput = document.getElementById('ownerFullNameInput');
const ownerEmailInput = document.getElementById('ownerEmailInput');
const ownerPhoneInput = document.getElementById('ownerPhoneInput');
const ownerPasswordInput = document.getElementById('ownerPasswordInput');
const ownerPasswordConfirmInput = document.getElementById('ownerPasswordConfirmInput');
const companyEikInput = document.getElementById('companyEikInput');
const showSignInBtn = document.getElementById('showSignInBtn');
const showSignUpBtn = document.getElementById('showSignUpBtn');
const signInForm = document.getElementById('signInForm');
const loginEmailInput = document.getElementById('loginEmailInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const authSignedInInfo = document.getElementById('authSignedInInfo');
const preAuthScreen = document.getElementById('preAuthScreen');
const appShell = document.getElementById('appShell');
const logoutBtn = document.getElementById('logoutBtn');
const createPlatformUserForm = document.getElementById('createPlatformUserForm');
const platformUserEmployeeInput = document.getElementById('platformUserEmployeeInput');
const platformUserEmailInput = document.getElementById('platformUserEmailInput');
const platformUserPasswordInput = document.getElementById('platformUserPasswordInput');
const generatePlatformPasswordBtn = document.getElementById('generatePlatformPasswordBtn');
const platformUserRoleInput = document.getElementById('platformUserRoleInput');
const refreshSuperAdminBtn = document.getElementById('refreshSuperAdminBtn');
const superAdminUsage = document.getElementById('superAdminUsage');
const superAdminRegistrations = document.getElementById('superAdminRegistrations');
const superAdminLogs = document.getElementById('superAdminLogs');
const reviewRegistrationForm = document.getElementById('reviewRegistrationForm');
const reviewRegistrationIdInput = document.getElementById('reviewRegistrationIdInput');
const reviewStatusInput = document.getElementById('reviewStatusInput');
const reviewNotesInput = document.getElementById('reviewNotesInput');
const inspectTableForm = document.getElementById('inspectTableForm');
const inspectTableNameInput = document.getElementById('inspectTableNameInput');
const inspectTableOutput = document.getElementById('inspectTableOutput');

init();

async function init() {
  monthPicker.value = state.month;

  const loadedSchedule = loadScheduleState();
  state.month = loadedSchedule.month || todayMonth();
  state.schedule = loadedSchedule.schedule || {};
  state.employees = loadEmployees().map(normalizeEmployeeVacationData);
  state.apiBaseUrl = detectApiBaseUrl();

  weekendRateInput.value = String(state.rates.weekend);
  holidayRateInput.value = String(state.rates.holiday);
  sirvPeriodInput.value = String(state.sirvPeriodMonths);
  apiUrlInput.value = state.apiBaseUrl;
  if (userRoleSelect) {
    userRoleSelect.value = state.userRole;
  }
  updateSuperAdminPortalVisibility();

  attachApiControls();
  attachRoleControls();
  attachTabs();
  attachRatesForm();
  attachVacationForm();
  attachShiftForm();
  attachLockAndExport();
  attachSettingsControls();
  attachSettingsSubtabs();
  attachDepartmentControls();
  attachDepartmentManagementControls();
  attachEmployeeEditModalControls();
  attachRegistrationControls();
  attachSuperAdminControls();
  updateAuthUi();
  updateAuthGate();

  const synced = await loadFromBackend();
  if (!synced) {
    setStatus(`Локален режим (localStorage). API: ${state.apiBaseUrl}`, false);
  }

  monthPicker.value = state.month;
  await refreshMonthlyView();
  renderAll();
}


function normalizeUserRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['user', 'manager', 'admin', 'super_admin'].includes(normalized) ? normalized : 'user';
}

function getRoleLabel(role) {
  if (role === 'admin') {
    return 'Администратор';
  }
  if (role === 'manager') {
    return 'Мениджър';
  }
  if (role === 'super_admin') {
    return 'Супер администратор';
  }
  return 'Потребител';
}

function canDeleteEmployees() {
  return state.userRole === 'admin';
}


function updateSuperAdminPortalVisibility() {
  if (!superAdminPortalLink) {
    return;
  }

  const isSuperAdmin = state.userRole === 'super_admin';
  superAdminPortalLink.classList.toggle('hidden', !isSuperAdmin);
}

function attachRoleControls() {
  if (!userRoleSelect) {
    return;
  }

  userRoleSelect.value = state.userRole;
  userRoleSelect.addEventListener('change', () => {
    state.userRole = normalizeUserRole(userRoleSelect.value);
    saveUserRole();
    updateSuperAdminPortalVisibility();
    renderEmployees();
    setStatus(`Активна роля: ${getRoleLabel(state.userRole)}.`, true);
  });
}


async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await apiFetch(path, {
    ...options,
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return payload;
}

function attachRegistrationControls() {
  const setAuthMode = (mode) => {
    if (signInForm) {
      signInForm.classList.toggle('hidden', mode !== 'signin');
    }
    if (registrationForm) {
      registrationForm.classList.toggle('hidden', mode !== 'signup');
    }
  };

  if (showSignInBtn) {
    showSignInBtn.addEventListener('click', () => setAuthMode('signin'));
  }

  if (showSignUpBtn) {
    showSignUpBtn.addEventListener('click', () => setAuthMode('signup'));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAuthSession();
      updateAuthUi();
      updateAuthGate();
      setAuthMode('signin');
      setStatus('Излязохте от профила.', true);
    });
  }

  setAuthMode('signin');

  if (signInForm) {
    signInForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const payload = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: loginEmailInput.value,
            password: loginPasswordInput.value,
          }),
        });

        state.authToken = payload.token;
        state.currentUser = payload.user;
        persistAuthSession();

        signInForm.reset();
        updateAuthUi();
        updateAuthGate();
        setStatus(`Успешен вход: ${payload.user.email}`, true);
      } catch (error) {
        clearAuthSession();
        updateAuthUi();
        updateAuthGate();
        setStatus(`Грешка при вход: ${error.message}`, false);
      }
    });
  }

  if (registrationForm) {
    registrationForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (ownerPasswordInput.value !== ownerPasswordConfirmInput.value) {
        setStatus('Паролите не съвпадат.', false);
        return;
      }

      try {
        const payload = await apiRequest('/api/platform/register', {
          method: 'POST',
          body: JSON.stringify({
            companyName: companyNameInput.value,
            companyEik: companyEikInput.value,
            ownerFullName: ownerFullNameInput.value,
            ownerEmail: ownerEmailInput.value,
            ownerPhone: ownerPhoneInput.value,
            password: ownerPasswordInput.value,
          }),
        });

        registrationForm.reset();
        setStatus(`Регистрацията е подадена успешно. Tenant ID: ${payload.tenant.id}`, true);
      } catch (error) {
        setStatus(`Грешка при регистрация: ${error.message}`, false);
      }
    });
  }

  if (createPlatformUserForm) {
    if (generatePlatformPasswordBtn) {
      generatePlatformPasswordBtn.addEventListener('click', () => {
        platformUserPasswordInput.value = generateSecurePassword();
      });
    }

    createPlatformUserForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await apiRequest('/api/platform/users', {
          method: 'POST',
          body: JSON.stringify({
            employeeId: platformUserEmployeeInput.value,
            email: platformUserEmailInput.value,
            password: platformUserPasswordInput.value,
            role: platformUserRoleInput.value,
          }),
        });
        createPlatformUserForm.reset();
        setStatus('Потребителят е добавен успешно.', true);
      } catch (error) {
        setStatus(`Грешка при добавяне на потребител: ${error.message}`, false);
      }
    });
  }
}

function generateSecurePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let output = '';
  for (let i = 0; i < 14; i += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function updateAuthUi() {
  if (!authSignedInInfo) {
    return;
  }

  if (state.currentUser && state.authToken) {
    authSignedInInfo.textContent = `Вписан потребител: ${state.currentUser.email}`;
    authSignedInInfo.classList.remove('hidden');
  } else {
    authSignedInInfo.textContent = '';
    authSignedInInfo.classList.add('hidden');
  }
}

function updateAuthGate() {
  const isAuthenticated = Boolean(state.currentUser && state.authToken);

  if (preAuthScreen) {
    preAuthScreen.classList.toggle('hidden', isAuthenticated);
  }
  if (appShell) {
    appShell.classList.toggle('hidden', !isAuthenticated);
  }
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAuthenticated);
  }
}

function loadAuthToken() {
  return cleanStoredValue(localStorage.getItem('authToken'));
}

function loadCurrentUser() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function persistAuthSession() {
  if (state.authToken) {
    localStorage.setItem('authToken', state.authToken);
  }
  if (state.currentUser) {
    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
  }
}

function clearAuthSession() {
  state.authToken = '';
  state.currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
}

function cleanStoredValue(value) {
  return String(value || '').trim();
}

function renderSuperAdminPanel() {
  const overview = state.superAdminOverview;
  if (!overview) {
    return;
  }

  if (superAdminUsage) {
    superAdminUsage.textContent = JSON.stringify(overview.usage || {}, null, 2);
  }

  if (superAdminRegistrations) {
    superAdminRegistrations.innerHTML = '';
    (overview.registrations || []).forEach((registration) => {
      const item = document.createElement('div');
      item.className = 'employee-item employee-item--top';
      item.innerHTML = `
        <div>
          <strong>${registration.companyName}</strong><br />
          <small>ID: ${registration.id}</small><br />
          <small>Owner: ${registration.ownerFullName} (${registration.ownerEmail})</small><br />
          <small>Статус: ${registration.status}</small>
        </div>
      `;
      superAdminRegistrations.appendChild(item);
    });
  }

  if (superAdminLogs) {
    superAdminLogs.textContent = JSON.stringify(overview.logs || [], null, 2);
  }
}

function attachSuperAdminControls() {
  if (refreshSuperAdminBtn) {
    refreshSuperAdminBtn.addEventListener('click', async () => {
      try {
        const overview = await apiRequest('/api/platform/super-admin/overview', { method: 'GET' });
        state.superAdminOverview = overview;
        renderSuperAdminPanel();
        setStatus('Супер админ панелът е обновен.', true);
      } catch (error) {
        setStatus(`Неуспешно обновяване на супер админ панел: ${error.message}`, false);
      }
    });
  }

  if (reviewRegistrationForm) {
    reviewRegistrationForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        await apiRequest(`/api/platform/super-admin/registrations/${encodeURIComponent(reviewRegistrationIdInput.value)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: reviewStatusInput.value,
            notes: reviewNotesInput.value,
          }),
        });
        setStatus('Статусът на регистрацията е обновен.', true);
      } catch (error) {
        setStatus(`Грешка при промяна на статус: ${error.message}`, false);
      }
    });
  }

  if (inspectTableForm) {
    inspectTableForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        const response = await apiRequest(`/api/platform/super-admin/tables/${encodeURIComponent(inspectTableNameInput.value)}`, {
          method: 'GET',
        });
        inspectTableOutput.textContent = JSON.stringify(response.rows || [], null, 2);
      } catch (error) {
        inspectTableOutput.textContent = `Грешка: ${error.message}`;
      }
    });
  }
}

function attachSettingsControls() {
  if (!summarySettingsList) {
    return;
  }

  summarySettingsList.innerHTML = '';
  SUMMARY_COLUMNS.forEach((column) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'settings-checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.summaryColumnsVisibility[column.key] !== false;
    input.addEventListener('change', () => {
      state.summaryColumnsVisibility[column.key] = input.checked;
      saveSummaryColumnsVisibility();
      renderSchedule();
    });

    const text = document.createElement('span');
    text.textContent = column.label;

    wrapper.appendChild(input);
    wrapper.appendChild(text);
    summarySettingsList.appendChild(wrapper);
  });
}

function attachDepartmentControls() {
  if (scheduleFilterDepartmentSelect) {
    scheduleFilterDepartmentSelect.addEventListener('change', async () => {
      state.selectedDepartmentId = scheduleFilterDepartmentSelect.value || DEPARTMENT_VIEW_ALL;
      await refreshMonthlyView();
      renderAll();
    });
  }

  if (scheduleDepartmentSelect) {
    scheduleDepartmentSelect.addEventListener('change', () => {
      updateScheduleNameSuggestion();
      updateCreateScheduleButtonState();
    });
  }

  if (scheduleNameInput) {
    scheduleNameInput.dataset.autofill = 'true';
    scheduleNameInput.addEventListener('input', () => {
      if (!scheduleNameInput) {
        return;
      }

      scheduleNameInput.dataset.autofill = scheduleNameInput.value.trim() ? 'false' : 'true';
    });
  }

  if (createScheduleBtn) {
    createScheduleBtn.addEventListener('click', async () => {
      await createScheduleForCurrentMonth();
    });
  }
}

function renderDepartmentOptions() {
  if (scheduleDepartmentSelect) {
    const previousValue = scheduleDepartmentSelect.value;
    scheduleDepartmentSelect.innerHTML = '';

    state.departments.forEach((department) => {
      const option = document.createElement('option');
      option.value = department.name;
      option.textContent = department.name;
      scheduleDepartmentSelect.appendChild(option);
    });

    const hasSelectedDepartment = state.departments.some((department) => department.name === previousValue);
    scheduleDepartmentSelect.value = hasSelectedDepartment
      ? previousValue
      : (state.departments[0]?.name || '');
  }

  if (scheduleFilterDepartmentSelect) {
    scheduleFilterDepartmentSelect.innerHTML = '';
    const commonFilterOption = document.createElement('option');
    commonFilterOption.value = DEPARTMENT_VIEW_ALL;
    commonFilterOption.textContent = 'Общ';
    scheduleFilterDepartmentSelect.appendChild(commonFilterOption);

    const groupedCommonFilterOption = document.createElement('option');
    groupedCommonFilterOption.value = DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS;
    groupedCommonFilterOption.textContent = 'Общ по отдели';
    scheduleFilterDepartmentSelect.appendChild(groupedCommonFilterOption);

    state.departments.forEach((department) => {
      const option = document.createElement('option');
      option.value = department.id;
      option.textContent = department.name;
      scheduleFilterDepartmentSelect.appendChild(option);
    });

    scheduleFilterDepartmentSelect.value = state.selectedDepartmentId;
  }

  renderDepartmentList();
  renderEmployeeDepartmentOptions();
  updateScheduleNameSuggestion();
}

function renderEmployeeDepartmentOptions() {
  if (!departmentInput) {
    return;
  }

  const currentValue = departmentInput.value;
  departmentInput.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Без отдел';
  departmentInput.appendChild(emptyOption);

  state.departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    departmentInput.appendChild(option);
  });

  const hasCurrent = state.departments.some((department) => department.id === currentValue);
  departmentInput.value = hasCurrent ? currentValue : '';
}

function updateScheduleNameSuggestion() {
  if (!scheduleNameInput || !scheduleDepartmentSelect) {
    return;
  }

  const department = scheduleDepartmentSelect.value || '';
  const month = state.month || monthPicker.value || todayMonth();
  const suggestion = department
    ? `График ${department} – ${month}`
    : `График – ${month}`;
  const shouldAutofill = scheduleNameInput.dataset.autofill !== 'false';

  if (shouldAutofill || !scheduleNameInput.value.trim()) {
    scheduleNameInput.value = suggestion;
    scheduleNameInput.dataset.autofill = 'true';
  }
}

function renderScheduleList() {
  if (!scheduleList) {
    return;
  }

  scheduleList.innerHTML = '';
  if (!state.schedules.length) {
    scheduleList.textContent = 'Няма графици за избрания месец.';
    return;
  }

  state.schedules.forEach((schedule) => {
    const label = document.createElement('label');
    label.className = 'settings-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = schedule.id;
    checkbox.checked = state.selectedScheduleIds.includes(schedule.id);
    checkbox.addEventListener('change', () => {
      state.hasManualScheduleSelection = true;
      if (checkbox.checked) {
        if (!state.selectedScheduleIds.includes(schedule.id)) {
          state.selectedScheduleIds.push(schedule.id);
        }
        state.activeScheduleId = schedule.id;
      } else {
        state.selectedScheduleIds = state.selectedScheduleIds.filter((id) => id !== schedule.id);
      }

      if (!state.selectedScheduleIds.length && state.schedules.length) {
        state.selectedScheduleIds = [DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)
          ? state.schedules.map((item) => item.id)
          : [state.schedules[0].id];
      }

      if (!state.selectedScheduleIds.includes(state.activeScheduleId)) {
        state.activeScheduleId = state.selectedScheduleIds[0] || null;
      }

      renderScheduleList();
      void refreshMonthlyView().then(() => renderAll());
    });

    const text = document.createElement('span');
    const departmentLabel = schedule.department || 'Общ';
    text.textContent = `${departmentLabel} – ${schedule.name}`;

    label.appendChild(checkbox);
    label.appendChild(text);
    scheduleList.appendChild(label);
  });

  updateCreateScheduleButtonState();
}

function findScheduleByMonthAndDepartment(month, department) {
  const normalizedDepartment = (department || '').trim();
  if (!normalizedDepartment) {
    return null;
  }

  return state.schedules.find((schedule) => {
    const scheduleDepartment = (schedule.department || '').trim();
    return schedule.month_key === month && scheduleDepartment === normalizedDepartment;
  });
}

function updateCreateScheduleButtonState() {
  if (!createScheduleBtn) {
    return;
  }

  const month = state.month || monthPicker.value || todayMonth();
  const department = (scheduleDepartmentSelect?.value || '').trim();
  const existing = findScheduleByMonthAndDepartment(month, department);

  createScheduleBtn.disabled = !department;
  createScheduleBtn.title = !department
    ? 'Добавете отдел, за да създадете график.'
    : (existing ? 'За този месец и отдел вече има създаден график.' : '');
}

async function createScheduleForCurrentMonth() {
  if (!state.backendAvailable) {
    setStatus('Създаване на график изисква връзка с бекенд.', false);
    return;
  }

  const month = state.month || monthPicker.value || todayMonth();
  const department = (scheduleDepartmentSelect?.value || '').trim();
  if (!department) {
    setStatus('Изберете отдел за създаване на график.', false);
    updateCreateScheduleButtonState();
    return;
  }

  const name = (scheduleNameInput?.value || '').trim() || `График ${department} – ${month}`;
  const existing = findScheduleByMonthAndDepartment(month, department);
  if (existing) {
    setStatus('За този месец и отдел вече има създаден график.', false);
    updateCreateScheduleButtonState();
    return;
  }

  const response = await apiFetch('/api/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month_key: month, department, name })
  });

  if (!response.ok) {
    let message = 'Неуспешно създаване на график.';
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore non-JSON responses
    }
    setStatus(message, false);
    updateCreateScheduleButtonState();
    return;
  }

  const payload = await response.json();
  const created = payload.schedule;
  if (created?.id) {
    state.activeScheduleId = created.id;
    state.selectedScheduleIds = [created.id, ...state.selectedScheduleIds.filter((id) => id !== created.id)];
  }

  if (scheduleNameInput) {
    scheduleNameInput.value = '';
    scheduleNameInput.dataset.autofill = 'true';
  }

  await refreshMonthlyView();
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


function attachSettingsSubtabs() {
  if (!settingsSubtabButtons.length || !settingsSubtabPanels.length) {
    return;
  }

  settingsSubtabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.settingsTab;
      settingsSubtabButtons.forEach((other) => other.classList.toggle('active', other === btn));
      settingsSubtabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === target));

      if (target === 'usersSettingsPanel') {
        loadPlatformUserEmployees().catch(() => {
          renderPlatformUserEmployeeOptions();
        });
      }
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
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    state.lockedMonths[active.id] = true;
    saveLockedMonths();
    renderSchedule();
  });

  unlockScheduleBtn.addEventListener('click', () => {
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    delete state.lockedMonths[active.id];
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

generateBtn.addEventListener('click', async () => {
  state.month = monthPicker.value || todayMonth();
  saveScheduleLocal();
  await refreshMonthlyView();
  renderAll();
});

monthPicker.addEventListener('change', async () => {
  state.month = monthPicker.value || todayMonth();
  saveScheduleLocal();
  await refreshMonthlyView();
  renderAll();
});

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const firstName = (firstNameInput?.value || '').trim();
  const middleName = (middleNameInput?.value || '').trim();
  const lastName = (lastNameInput?.value || '').trim();

  const baseVacationAllowance = Number(vacationAllowanceInput.value);
  const hasTelk = Boolean(telkInput?.checked);
  const hasYoungWorkerBenefit = Boolean(youngWorkerInput?.checked);

  const employee = {
    id: createEmployeeId(),
    name: `${firstName} ${middleName} ${lastName}`.trim(),
    department: null,
    departmentId: departmentInput.value || null,
    position: positionInput.value.trim(),
    egn: (egnInput?.value || '').trim(),
    startDate: (startDateInput?.value || '').trim(),
    endDate: (endDateInput?.value || '').trim() || null,
    vacationAllowance: calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit),
    telk: hasTelk,
    youngWorkerBenefit: hasYoungWorkerBenefit,
    baseVacationAllowance
  };

  if (!firstName || !middleName || !lastName || !employee.position || !/^\d{10}$/.test(employee.egn) || !Number.isFinite(baseVacationAllowance) || baseVacationAllowance < 0 || !isValidEmploymentDates(employee.startDate, employee.endDate)) {
    return;
  }

  state.employees.push(employee);
  persistEmployeesLocal();

  let persistedEmployee = null;
  try {
    persistedEmployee = await saveEmployeeBackend(employee);
  } catch (error) {
    state.employees = state.employees.filter((entry) => entry.id !== employee.id);
    persistEmployeesLocal();
    renderAll();
    setStatus(error.message || 'Неуспешно създаване на служител.', false);
    return;
  }

  if (persistedEmployee && persistedEmployee.id !== employee.id) {
    state.employees = state.employees.map((entry) => (entry.id === employee.id ? normalizeEmployeeVacationData(persistedEmployee) : entry));
    persistEmployeesLocal();
  }

  employeeForm.reset();
  renderEmployeeDepartmentOptions();
  if (departmentInput) {
    departmentInput.value = '';
  }
  vacationAllowanceInput.value = 20;
  if (telkInput) {
    telkInput.checked = false;
  }
  if (youngWorkerInput) {
    youngWorkerInput.checked = false;
  }
  if (startDateInput) {
    startDateInput.value = '';
  }
  if (endDateInput) {
    endDateInput.value = '';
  }
  renderAll();
});

async function attachEmployeeToDepartment(employeeId, departmentId) {
  if (!state.backendAvailable) {
    return;
  }

  const response = await apiFetch(`/api/employees/${employeeId}/department`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ department_id: departmentId || null })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || 'Неуспешно обновяване на отдела на служителя.');
  }
}

function attachDepartmentManagementControls() {
  if (!departmentForm) {
    return;
  }

  departmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = (departmentNameInput?.value || '').trim();
    if (!name || !state.backendAvailable) {
      return;
    }

    const response = await apiFetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus(payload.message || 'Неуспешно създаване на отдел.', false);
      return;
    }

    departmentForm.reset();
    await loadDepartmentsFromBackend();
  });
}

function renderDepartmentList() {
  if (!departmentList) {
    return;
  }

  departmentList.innerHTML = '';
  if (!state.departments.length) {
    departmentList.textContent = 'Няма отдели.';
    return;
  }

  state.departments.forEach((department) => {
    const row = document.createElement('div');
    row.className = 'employee-item department-item';

    const rowContent = document.createElement('div');
    rowContent.className = 'department-row-content';

    const members = getDepartmentMembers(department.id);
    const isExpanded = state.expandedDepartmentId === department.id;

    const text = document.createElement('div');
    text.className = 'department-header';
    text.innerHTML = `
      <div class="department-header-main">
        <b>${department.name}</b>
        <span class="department-toggle">${isExpanded ? 'Скрий' : 'Покажи'} списъка</span>
      </div>
      <small>${members.length} служител(и)</small>
    `;
    text.addEventListener('click', () => {
      state.expandedDepartmentId = isExpanded ? null : department.id;
      renderDepartmentList();
    });

    const membersList = document.createElement('div');
    membersList.className = `department-members${isExpanded ? ' expanded' : ''}`;
    if (members.length) {
      members.forEach((member, index) => {
        const memberRow = document.createElement('div');
        memberRow.className = 'department-member-item';
        const initials = String(member.name || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() || '')
          .join('');

        memberRow.innerHTML = `
          <span class="department-member-index">${index + 1}</span>
          <span class="department-member-avatar">${initials || '•'}</span>
          <span class="department-member-details">
            <strong>${member.name}</strong>
            <small>${member.position || 'Без длъжност'}</small>
          </span>
        `;
        membersList.appendChild(memberRow);
      });
    } else {
      const emptyText = document.createElement('div');
      emptyText.className = 'department-member-item';
      emptyText.textContent = 'Няма служители в този отдел.';
      membersList.appendChild(emptyText);
    }

    rowContent.append(text, membersList);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Редактирай';
    editBtn.className = 'btn-edit';
    editBtn.addEventListener('click', async () => {
      const nextName = window.prompt('Ново име на отдел:', department.name);
      if (!nextName || !nextName.trim()) {
        return;
      }

      const response = await apiFetch(`/api/departments/${department.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName.trim() })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setStatus(payload.message || 'Неуспешна редакция на отдел.', false);
        return;
      }

      await loadDepartmentsFromBackend();
      await refreshMonthlyView();
      renderAll();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Изтрий';
    deleteBtn.className = 'btn-delete';
    deleteBtn.addEventListener('click', async () => {
      const response = await apiFetch(`/api/departments/${department.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setStatus(payload.message || 'Неуспешно изтриване на отдел.', false);
        return;
      }

      if (state.selectedDepartmentId === department.id) {
        state.selectedDepartmentId = DEPARTMENT_VIEW_ALL;
      }
      await loadDepartmentsFromBackend();
      await refreshMonthlyView();
      renderAll();
    });

    actions.append(editBtn, deleteBtn);
    row.append(rowContent, actions);
    departmentList.appendChild(row);
  });
}

function getDepartmentMembers(departmentId) {
  const seen = new Set();
  return state.employees.filter((employee) => {
    const sameDepartment = String(employee.departmentId || '') === String(departmentId || '');
    if (!sameDepartment || seen.has(employee.id)) {
      return false;
    }
    seen.add(employee.id);
    return true;
  });
}

function splitEmployeeNameParts(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    middleName: parts[1] || '',
    lastName: parts.slice(2).join(' ') || ''
  };
}

async function updateEmployeeBackend(employeeId, payload) {
  if (!state.backendAvailable) {
    return null;
  }

  const response = await apiFetch(`/api/employees/${employeeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => ({}));
    throw new Error(errPayload.message || 'Неуспешна редакция на служител.');
  }

  const data = await response.json();
  return data.employee || null;
}

function createEmployeeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getExtraVacationDays(hasTelk, hasYoungWorkerBenefit) {
  return (hasTelk ? TELK_EXTRA_VACATION_DAYS : 0) + (hasYoungWorkerBenefit ? YOUNG_WORKER_EXTRA_VACATION_DAYS : 0);
}

function calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit) {
  const normalizedBase = Number(baseVacationAllowance);
  if (!Number.isFinite(normalizedBase)) {
    return 0;
  }
  return normalizedBase + getExtraVacationDays(hasTelk, hasYoungWorkerBenefit);
}

function resolveBaseVacationAllowance(employee) {
  const explicitBase = Number(employee?.baseVacationAllowance);
  if (Number.isFinite(explicitBase) && explicitBase >= 0) {
    return explicitBase;
  }

  const total = Number(employee?.vacationAllowance);
  if (!Number.isFinite(total)) {
    return 20;
  }

  return Math.max(0, total - getExtraVacationDays(Boolean(employee?.telk), Boolean(employee?.youngWorkerBenefit)));
}

function renderAll() {
  renderEmployees();
  renderSchedule();
  renderVacationLedger();
  renderVacationEmployeeOptions();
  renderPlatformUserEmployeeOptions();
  renderShiftList();
  renderLegend();
  updateCreateScheduleButtonState();
}

async function loadPlatformUserEmployees() {
  if (!platformUserEmployeeInput) {
    return;
  }

  if (!state.backendAvailable) {
    state.platformUserEmployees = state.employees.slice();
    renderPlatformUserEmployeeOptions();
    return;
  }

  try {
    const response = await apiFetch('/api/employees');
    if (!response.ok) {
      throw new Error('Employees unavailable');
    }

    const payload = await response.json();
    const employees = Array.isArray(payload.employees) ? payload.employees : [];
    state.platformUserEmployees = employees.map(normalizeEmployeeVacationData);
  } catch (_error) {
    state.platformUserEmployees = state.employees.slice();
  }

  renderPlatformUserEmployeeOptions();
}

function renderPlatformUserEmployeeOptions() {
  if (!platformUserEmployeeInput) {
    return;
  }

  const currentValue = platformUserEmployeeInput.value;
  platformUserEmployeeInput.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Изберете служител';
  platformUserEmployeeInput.appendChild(placeholder);

  const sourceEmployees = state.platformUserEmployees.length ? state.platformUserEmployees : state.employees;
  sourceEmployees.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = `${employee.name} (${employee.department || 'Без отдел'})`;
    platformUserEmployeeInput.appendChild(option);
  });

  if (currentValue) {
    platformUserEmployeeInput.value = currentValue;
  }
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
      removeBtn.className = 'btn-delete';
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

function attachEmployeeEditModalControls() {
  if (!employeeEditForm || !employeeEditModal) {
    return;
  }

  employeeEditForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const employeeId = employeeEditForm.dataset.employeeId;
    if (!employeeId) {
      closeEmployeeEditModal();
      return;
    }

    const firstName = editFirstNameInput.value.trim();
    const middleName = editMiddleNameInput.value.trim();
    const lastName = editLastNameInput.value.trim();
    const position = editPositionInput.value.trim();
    const egn = editEgnInput.value.trim();
    const baseVacationAllowance = Number(editVacationAllowanceInput.value);
    const hasTelk = Boolean(editTelkInput?.checked);
    const hasYoungWorkerBenefit = Boolean(editYoungWorkerInput?.checked);
    const vacationAllowance = calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit);
    const startDate = (editStartDateInput?.value || '').trim();
    const endDate = (editEndDateInput?.value || '').trim() || null;
    const departmentId = editDepartmentInput.value || null;
    const selectedDepartment = departmentId ? state.departments.find((dep) => dep.id === departmentId) : null;

    if (!firstName || !middleName || !lastName || !position || !/^\d{10}$/.test(egn) || !Number.isFinite(baseVacationAllowance) || baseVacationAllowance < 0 || !isValidEmploymentDates(startDate, endDate)) {
      setStatus('Невалидни данни за редакция на служител.', false);
      return;
    }

    try {
      const updatedEmployee = await updateEmployeeBackend(employeeId, {
        name: `${firstName} ${middleName} ${lastName}`.trim(),
        position,
        egn,
        vacationAllowance,
        telk: hasTelk,
        youngWorkerBenefit: hasYoungWorkerBenefit,
        baseVacationAllowance,
        startDate,
        endDate
      });

      if (updatedEmployee) {
        state.employees = state.employees.map((entry) => (entry.id === employeeId
          ? {
            ...entry,
            ...updatedEmployee,
            departmentId,
            department: selectedDepartment ? selectedDepartment.name : 'Без отдел',
            startDate,
            endDate,
            telk: hasTelk,
            youngWorkerBenefit: hasYoungWorkerBenefit,
            baseVacationAllowance
          }
          : entry));

        await attachEmployeeToDepartment(employeeId, departmentId);
        persistEmployeesLocal();
        closeEmployeeEditModal();
        await refreshMonthlyView();
        renderAll();
      }
    } catch (error) {
      setStatus(error.message, false);
    }
  });

  cancelEmployeeEditBtn?.addEventListener('click', () => {
    closeEmployeeEditModal();
  });

  employeeEditModal.addEventListener('click', (event) => {
    if (event.target === employeeEditModal) {
      closeEmployeeEditModal();
    }
  });
}

function openEmployeeEditModal(employee) {
  if (!employeeEditForm || !employeeEditModal) {
    return;
  }

  const names = splitEmployeeNameParts(employee.name);
  employeeEditForm.dataset.employeeId = employee.id;
  editFirstNameInput.value = names.firstName || '';
  editMiddleNameInput.value = names.middleName || '';
  editLastNameInput.value = names.lastName || '';
  editPositionInput.value = employee.position || '';
  editEgnInput.value = employee.egn || '';
  editStartDateInput.value = employee.startDate || '';
  editEndDateInput.value = employee.endDate || '';
  editVacationAllowanceInput.value = String(resolveBaseVacationAllowance(employee));
  if (editTelkInput) {
    editTelkInput.checked = Boolean(employee.telk);
  }
  if (editYoungWorkerInput) {
    editYoungWorkerInput.checked = Boolean(employee.youngWorkerBenefit);
  }

  editDepartmentInput.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Без отдел';
  editDepartmentInput.appendChild(emptyOption);

  state.departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    editDepartmentInput.appendChild(option);
  });

  editDepartmentInput.value = employee.departmentId || '';
  employeeEditModal.classList.remove('hidden');
}

function closeEmployeeEditModal() {
  if (!employeeEditModal || !employeeEditForm) {
    return;
  }

  employeeEditForm.reset();
  delete employeeEditForm.dataset.employeeId;
  employeeEditModal.classList.add('hidden');
}

function renderEmployees() {
  employeeList.innerHTML = '';
  if (!state.employees.length) {
    employeeList.textContent = 'Няма въведени служители.';
    return;
  }

  if (!canDeleteEmployees()) {
    const roleNotice = document.createElement('small');
    roleNotice.className = 'role-permission-note';
    roleNotice.textContent = `Изтриването на служител е достъпно само за Администратор. Активна роля: ${getRoleLabel(state.userRole)}.`;
    employeeList.appendChild(roleNotice);
  }

  state.employees.forEach((employee) => {
    const item = document.createElement('div');
    item.className = 'employee-item employee-item--top';

    const details = document.createElement('div');
    const employmentRange = formatEmploymentRange(employee);
    details.innerHTML = `<b>${employee.name}</b><br>ЕГН: ${employee.egn || '-'}<br>${employee.department} • ${employee.position}<br>Период: ${employmentRange}<br>Полагаем отпуск: ${employee.vacationAllowance} дни${employee.telk ? ' (ТЕЛК)' : ''}${employee.youngWorkerBenefit ? ' (16-18 с разрешение)' : ''}`;

    const employeeDepartmentSelect = document.createElement('select');
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Без отдел';
    employeeDepartmentSelect.appendChild(emptyOption);
    state.departments.forEach((dep) => {
      const option = document.createElement('option');
      option.value = dep.id;
      option.textContent = dep.name;
      employeeDepartmentSelect.appendChild(option);
    });
    employeeDepartmentSelect.value = employee.departmentId || '';
    employeeDepartmentSelect.addEventListener('change', async () => {
      try {
        await attachEmployeeToDepartment(employee.id, employeeDepartmentSelect.value || null);
        await refreshMonthlyView();
        renderAll();
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Редакция';
    editBtn.className = 'btn-edit';
    editBtn.addEventListener('click', () => {
      openEmployeeEditModal(employee);
    });

    const releaseBtn = document.createElement('button');
    releaseBtn.type = 'button';
    releaseBtn.textContent = 'Освободи';
    releaseBtn.className = 'btn-delete';
    releaseBtn.addEventListener('click', async () => {
      const monthEnd = getMonthEndDate(state.month || todayMonth());
      const releaseDate = promptLastWorkingDate(employee, monthEnd);
      if (!releaseDate) {
        return;
      }

      try {
        await releaseEmployeeBackend(employee.id, releaseDate);
        await refreshMonthlyView();
        renderAll();
      } catch (error) {
        setStatus(error.message, false);
      }
    });

    actions.append(employeeDepartmentSelect, editBtn, releaseBtn);

    if (canDeleteEmployees()) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Изтрий';
      deleteBtn.className = 'btn-delete';
      deleteBtn.addEventListener('click', async () => {
        const confirmed = window.confirm(`Сигурни ли сте, че искате да изтриете служителя ${employee.name}?`);
        if (!confirmed) {
          return;
        }

        try {
          await deleteEmployeeBackend(employee.id);
          await refreshMonthlyView();
          renderAll();
        } catch (error) {
          setStatus(error.message, false);
        }
      });
      actions.append(deleteBtn);
    }

    item.append(details, actions);
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

    const employee = state.employees.find((entry) => entry.id === employeeId);
    const scheduleId = employee ? getEmployeeScheduleId(employee) : null;

    const promises = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDate();
      const key = scheduleKey(employeeId, state.month, day);
      state.schedule[key] = 'O';
      if (scheduleId) {
        state.scheduleEntriesById[`${scheduleId}|${employeeId}|${day}`] = 'O';
      }
      if (employee) {
        promises.push(saveScheduleEntryBackend(employee, day, 'O'));
      }
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

function getActiveSchedule() {
  if (!state.schedules.length) {
    return null;
  }

  return state.schedules.find((schedule) => schedule.id === state.activeScheduleId)
    || state.schedules.find((schedule) => state.selectedScheduleIds.includes(schedule.id))
    || state.schedules[0];
}

function getEmployeesForSelectedSchedules() {
  if (!state.selectedScheduleIds.length) {
    return [];
  }

  const selectedSet = new Set(state.selectedScheduleIds);
  const monthKey = state.month || todayMonth();
  return state.scheduleEmployees.filter((employee) => {
    const scheduleId = employee.scheduleId;
    return selectedSet.has(scheduleId) && isEmployeeVisibleInMonth(employee, monthKey);
  });
}


function getEmployeeScheduleId(employee) {
  return employee?.scheduleId || null;
}

function getShiftCodeForCell(employee, month, day) {
  const scheduleId = getEmployeeScheduleId(employee);
  if (scheduleId) {
    return state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] || 'P';
  }

  return state.schedule[scheduleKey(employee.id, month, day)] || 'P';
}

function renderSchedule() {
  const month = state.month || todayMonth();
  const [year, monthIndex] = month.split('-').map(Number);
  const totalDays = new Date(year, monthIndex, 0).getDate();
  const monthStats = getMonthStats(year, monthIndex, totalDays);
  const monthLocked = isMonthLocked(month);
  const activeSchedule = getActiveSchedule();

  lockStatus.textContent = `Статус: ${monthLocked ? 'Заключен' : 'Отключен'}${activeSchedule ? ` · Активен: ${activeSchedule.name}` : ''}`;

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

  const visibleSummaryColumns = getVisibleSummaryColumns();
  visibleSummaryColumns.forEach((column) => {
    const cell = document.createElement('th');
    cell.className = 'summary-col';
    cell.textContent = column.label;
    header.appendChild(cell);
  });

  scheduleTable.innerHTML = '';
  scheduleTable.appendChild(header);

  const totals = {
    workedDays: 0,
    workedHours: 0,
    normHours: 0,
    deviation: 0,
    sirvNormHours: 0,
    sirvWorkedHours: 0,
    overtimeHours: 0,
    holidayWorkedHours: 0,
    weekendWorkedHours: 0,
    nightWorkedHours: 0,
    nightConvertedHours: 0,
    payableHours: 0,
    vacationDays: 0,
    remainingVacation: 0,
    sickDays: 0
  };

  const employeesToRender = getEmployeesForSelectedSchedules();
  const shouldGroupByDepartment = state.selectedDepartmentId === DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS;
  const groupedEmployees = shouldGroupByDepartment
    ? employeesToRender.reduce((acc, employee) => {
      const department = (employee.department || '').trim() || 'Без отдел';
      if (!acc[department]) {
        acc[department] = [];
      }
      acc[department].push(employee);
      return acc;
    }, {})
    : { Всички: employeesToRender };

  const departmentOrder = Object.keys(groupedEmployees).sort((a, b) => a.localeCompare(b, 'bg'));

  departmentOrder.forEach((department) => {
    if (shouldGroupByDepartment) {
      const sectionRow = document.createElement('tr');
      const sectionCell = document.createElement('td');
      sectionCell.colSpan = 1 + totalDays + visibleSummaryColumns.length;
      sectionCell.innerHTML = `<b>Отдел: ${department}</b>`;
      sectionRow.appendChild(sectionCell);
      scheduleTable.appendChild(sectionRow);
    }

    (groupedEmployees[department] || []).forEach((employee) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.className = 'sticky';
      nameCell.innerHTML = `<b>${employee.name}</b><br><small>${employee.department} • ${employee.position}</small>`;
      row.appendChild(nameCell);

      const summary = {
        monthNormHours: 0,
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
        const inEmployment = isEmployeeActiveOnDay(employee, year, monthIndex, day);
        const currentShift = getShiftCodeForCell(employee, month, day);
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
        if (!inEmployment) {
          cell.classList.add('day-outside-employment');
          select.classList.add('shift-select--inactive');
        }
        select.disabled = monthLocked || !inEmployment;

        state.shiftTemplates.forEach((shift) => {
          const option = document.createElement('option');
          option.value = shift.code;
          option.textContent = shift.label;
          option.selected = shift.code === currentShift;
          select.appendChild(option);
        });

        select.addEventListener('change', () => {
          if (monthLocked) {
            return;
          }

          const toShift = select.value;
          const scheduleId = getEmployeeScheduleId(employee);
          if (scheduleId) {
            state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] = toShift;
          }

          state.schedule[scheduleKey(employee.id, month, day)] = toShift;
          saveScheduleLocal();
          renderSchedule();
          renderVacationLedger();
          void saveScheduleEntryBackend(employee, day, toShift);
        });

        cell.appendChild(select);
        row.appendChild(cell);
        collectSummary(summary, currentShift, holiday, weekend, inEmployment);
        if (inEmployment && !holiday && !weekend) {
          summary.monthNormHours += 8;
        }
      }

      const employeeTotals = calculateEmployeeTotals({ employee, summary, year, month, monthNormHours: summary.monthNormHours });
      accumulateTotals(totals, employeeTotals);
      appendSummaryColumns(row, employeeTotals, visibleSummaryColumns);
      scheduleTable.appendChild(row);
    });
  });

  if (employeesToRender.length) {
    const totalsRow = document.createElement('tr');
    const totalsLabel = document.createElement('td');
    totalsLabel.className = 'sticky';
    totalsLabel.innerHTML = '<b>Общо</b>';
    totalsRow.appendChild(totalsLabel);

    for (let day = 1; day <= totalDays; day += 1) {
      const filler = document.createElement('td');
      filler.className = 'summary-col';
      filler.textContent = '—';
      totalsRow.appendChild(filler);
    }

    appendSummaryColumns(totalsRow, totals, visibleSummaryColumns, true);
    scheduleTable.appendChild(totalsRow);
  }
}

function appendSummaryCell(row, value, className) {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = String(value);
  row.appendChild(cell);
}

function appendSummaryColumns(row, data, visibleColumns, isTotals = false) {
  visibleColumns.forEach((column) => {
    const value = formatSummaryColumnValue(column.key, data, isTotals);
    const className = getSummaryColumnClassName(column.key, data);
    appendSummaryCell(row, value, className);
  });
}

function formatSummaryColumnValue(columnKey, data, isTotals) {
  const value = data[columnKey];
  if (typeof value !== 'number') {
    return value ?? '0';
  }

  if (['workedDays', 'vacationDays', 'remainingVacation', 'sickDays'].includes(columnKey)) {
    return isTotals ? Math.round(value) : String(value);
  }

  return value.toFixed(2);
}

function getSummaryColumnClassName(columnKey, data) {
  if (columnKey === 'deviation') {
    return `summary-col ${data.deviation < 0 ? 'negative' : 'positive'}`;
  }
  if (columnKey === 'overtimeHours') {
    return `summary-col ${data.overtimeHours > 0 ? 'negative' : 'positive'}`;
  }
  return 'summary-col';
}

function getVisibleSummaryColumns() {
  return SUMMARY_COLUMNS.filter((column) => state.summaryColumnsVisibility[column.key] !== false);
}

function calculateEmployeeTotals({ employee, summary, year, month, monthNormHours }) {
  const remainingVacation = employee.vacationAllowance - getVacationUsedForYear(employee.id, year);
  const normalizedHolidayHours = summary.holidayWorkedHours * state.rates.holiday;
  const normalizedWeekendHours = summary.weekendWorkedHours * state.rates.weekend;
  const payableHours =
    summary.workedHours - summary.holidayWorkedHours - summary.weekendWorkedHours + normalizedHolidayHours + normalizedWeekendHours + summary.nightConvertedHours;
  const deviation = summary.workedHours + summary.nightConvertedHours - monthNormHours;
  const sirvTotals = getSirvTotalsForEmployee(employee, month, state.sirvPeriodMonths);

  return {
    workedDays: summary.workedDays,
    workedHours: summary.workedHours,
    normHours: monthNormHours,
    deviation,
    sirvNormHours: sirvTotals.normHours,
    sirvWorkedHours: sirvTotals.convertedWorkedHours,
    overtimeHours: sirvTotals.overtimeHours,
    holidayWorkedHours: summary.holidayWorkedHours,
    weekendWorkedHours: summary.weekendWorkedHours,
    nightWorkedHours: summary.nightWorkedHours,
    nightConvertedHours: summary.nightConvertedHours,
    payableHours,
    vacationDays: summary.vacationDays,
    remainingVacation,
    sickDays: summary.sickDays
  };
}

function accumulateTotals(totals, employeeTotals) {
  totals.workedDays += employeeTotals.workedDays;
  totals.workedHours += employeeTotals.workedHours;
  totals.normHours += employeeTotals.normHours;
  totals.deviation += employeeTotals.deviation;
  totals.sirvNormHours += employeeTotals.sirvNormHours;
  totals.sirvWorkedHours += employeeTotals.sirvWorkedHours;
  totals.overtimeHours += employeeTotals.overtimeHours;
  totals.holidayWorkedHours += employeeTotals.holidayWorkedHours;
  totals.weekendWorkedHours += employeeTotals.weekendWorkedHours;
  totals.nightWorkedHours += employeeTotals.nightWorkedHours;
  totals.nightConvertedHours += employeeTotals.nightConvertedHours;
  totals.payableHours += employeeTotals.payableHours;
  totals.vacationDays += employeeTotals.vacationDays;
  totals.remainingVacation += employeeTotals.remainingVacation;
  totals.sickDays += employeeTotals.sickDays;
}

function getStoredShiftHours(shift) {
  const configuredHours = Number(shift.hours);
  if (Number.isFinite(configuredHours) && configuredHours > 0) {
    return configuredHours;
  }
  return calcShiftHours(String(shift.start || ''), String(shift.end || ''));
}

function getWorkShiftHours(shift) {
  if (!shift || shift.type !== 'work') {
    return 0;
  }
  return getStoredShiftHours(shift);
}

function collectSummary(summary, shiftCode, holiday, weekend, inEmployment = true) {
  if (!inEmployment) {
    return;
  }

  const shift = getShiftByCode(shiftCode) || getShiftByCode('P');

  if (shift.type === 'work') {
    const shiftHours = getWorkShiftHours(shift);
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

function saveSummaryColumnsVisibility() {
  localStorage.setItem('summaryColumnsVisibility', JSON.stringify(state.summaryColumnsVisibility));
}

function loadSummaryColumnsVisibility() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem('summaryColumnsVisibility') || '{}') || {};
  } catch {
    stored = {};
  }

  const visibility = {};
  SUMMARY_COLUMNS.forEach((column) => {
    visibility[column.key] = stored[column.key] !== false;
  });
  return visibility;
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

function getSirvTotalsForEmployee(employee, endMonth, periodMonths) {
  const employeeId = employee?.id;
  const months = getPeriodMonths(endMonth, periodMonths);
  const totals = {
    normHours: 0,
    convertedWorkedHours: 0,
    overtimeHours: 0
  };

  months.forEach((monthKey) => {
    const [year, monthIndex] = monthKey.split('-').map(Number);
    const totalDays = new Date(year, monthIndex, 0).getDate();
    for (let day = 1; day <= totalDays; day += 1) {
      if (!isEmployeeActiveOnDate(employee, year, monthIndex, day)) {
        continue;
      }

      const date = new Date(year, monthIndex - 1, day);
      if (!isOfficialHoliday(date) && !isWeekend(date)) {
        totals.normHours += 8;
      }

      const shiftCode = state.schedule[scheduleKey(employeeId, monthKey, day)] || 'P';
      const shift = getShiftByCode(shiftCode) || getShiftByCode('P');
      if (shift.type !== 'work') {
        continue;
      }
      const workedHours = getWorkShiftHours(shift);
      const nightHours = calcNightHours(shift.start, shift.end);
      totals.convertedWorkedHours += workedHours + nightHours * (NIGHT_HOURS_COEFFICIENT - 1);
    }
  });

  totals.overtimeHours = Math.max(0, totals.convertedWorkedHours - totals.normHours);
  return totals;
}


function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return '';
  }
  return text;
}

function isValidEmploymentDates(startDate, endDate) {
  const normalizedStart = normalizeDateOnly(startDate);
  if (!normalizedStart) {
    return false;
  }

  const normalizedEnd = normalizeDateOnly(endDate);
  if (!normalizedEnd) {
    return endDate === null || endDate === undefined || String(endDate).trim() === '';
  }

  return normalizedEnd >= normalizedStart;
}

function formatDateForDisplay(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return '—';
  }

  const [year, month, day] = normalized.split('-');
  return `${day}.${month}.${year}`;
}

function formatEmploymentRange(employee) {
  const start = formatDateForDisplay(employee.startDate);
  const end = employee.endDate ? formatDateForDisplay(employee.endDate) : 'без край';
  return `${start} → ${end}`;
}

function getMonthStartDate(monthKey) {
  return `${monthKey}-01`;
}

function getMonthEndDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
}

function isEmployeeVisibleInMonth(employee, monthKey) {
  const startDate = normalizeDateOnly(employee?.startDate);
  const endDate = normalizeDateOnly(employee?.endDate);
  if (!startDate && !endDate) {
    return true;
  }

  const monthStart = getMonthStartDate(monthKey);
  const monthEnd = getMonthEndDate(monthKey);
  if (startDate && startDate > monthEnd) {
    return false;
  }
  if (endDate && endDate < monthStart) {
    return false;
  }
  return true;
}

function isEmployeeActiveOnDate(employee, year, monthIndex, day) {
  const date = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isDateWithinEmployment(employee, date);
}

function isEmployeeActiveOnDay(employee, year, monthIndex, day) {
  return isEmployeeActiveOnDate(employee, year, monthIndex, day);
}

function isDateWithinEmployment(employee, date) {
  const startDate = normalizeDateOnly(employee?.startDate);
  const endDate = normalizeDateOnly(employee?.endDate);
  if (!startDate) {
    return true;
  }
  if (date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
}

function promptLastWorkingDate(employee, defaultDate) {
  const currentEndDate = normalizeDateOnly(employee.endDate);
  const suggestedDate = currentEndDate || defaultDate;
  const result = window.prompt('Въведете последен работен ден (YYYY-MM-DD):', suggestedDate);
  if (result === null) {
    return null;
  }

  const normalized = normalizeDateOnly(result);
  if (!normalized || !isValidEmploymentDates(employee.startDate, normalized)) {
    setStatus('Невалидна дата за последен работен ден.', false);
    return null;
  }

  return normalized;
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
  const headers = new Headers(options.headers || {});
  headers.set('X-User-Role', state.userRole);
  if (state.authToken) {
    headers.set('Authorization', `Bearer ${state.authToken}`);
  }

  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    ...options,
    headers
  });
  return response;
}

async function loadDepartmentsFromBackend() {
  const response = await apiFetch('/api/departments');
  if (!response.ok) {
    throw new Error('Departments unavailable');
  }

  const payload = await response.json();
  state.departments = Array.isArray(payload.departments) ? payload.departments : [];
  renderDepartmentOptions();
}

async function loadSchedulesForMonth() {
  const monthKey = state.month || monthPicker.value || todayMonth();
  const previousScheduleIds = state.schedules.map((schedule) => schedule.id);
  const previousSelectedIds = state.selectedScheduleIds.slice();
  const wasSelectAll = previousScheduleIds.length > 0 && previousScheduleIds.every((id) => previousSelectedIds.includes(id));

  const query = new URLSearchParams({ month_key: monthKey });
  if (state.selectedDepartmentId && ![DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)) {
    query.set('department_id', state.selectedDepartmentId);
  }

  const response = await apiFetch(`/api/schedules?${query.toString()}`);
  if (!response.ok) {
    throw new Error('Schedules unavailable');
  }

  const payload = await response.json();
  state.schedules = Array.isArray(payload.schedules) ? payload.schedules : [];
  state.schedules.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const validIds = new Set(state.schedules.map((schedule) => schedule.id));
  let selectedScheduleIds = previousSelectedIds.filter((id) => validIds.has(id));

  if ([DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)
    && (wasSelectAll || !state.hasManualScheduleSelection)) {
    selectedScheduleIds = state.schedules.map((schedule) => schedule.id);
  }

  if (!selectedScheduleIds.length && state.schedules.length) {
    selectedScheduleIds = [DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)
      ? state.schedules.map((schedule) => schedule.id)
      : [state.schedules[0].id];
  }

  state.selectedScheduleIds = selectedScheduleIds;

  if (!state.activeScheduleId || !validIds.has(state.activeScheduleId) || !state.selectedScheduleIds.includes(state.activeScheduleId)) {
    state.activeScheduleId = state.selectedScheduleIds[0] || null;
  }

  renderScheduleList();
}


async function fetchScheduleDetails(scheduleId) {
  const response = await apiFetch(`/api/schedules/${scheduleId}`);
  if (!response.ok) {
    throw new Error('Schedule details unavailable');
  }

  return response.json();
}

async function refreshMonthlyView() {
  if (!state.backendAvailable) {
    return;
  }

  const month = state.month || monthPicker.value || todayMonth();
  state.month = month;
  await loadSchedulesForMonth();

  const monthParam = encodeURIComponent(month);
  const employeeQuery = state.selectedDepartmentId && ![DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)
    ? `/api/employees?department_id=${encodeURIComponent(state.selectedDepartmentId)}&month_key=${monthParam}`
    : `/api/employees?month_key=${monthParam}`;
  const employeeResponse = await apiFetch(employeeQuery);
  const employeePayload = employeeResponse.ok ? await employeeResponse.json() : { employees: [] };
  const allowedEmployees = Array.isArray(employeePayload.employees) ? employeePayload.employees : [];
  const allowedIds = new Set(allowedEmployees.map((employee) => employee.id));
  state.employees = allowedEmployees.map(normalizeEmployeeVacationData);

  if (!state.selectedScheduleIds.length) {
    state.scheduleEmployees = [];
    state.scheduleEntriesById = {};
    return;
  }

  const selectedIds = state.selectedScheduleIds.slice();
  const requests = selectedIds.map((id) => fetchScheduleDetails(id));
  const details = await Promise.all(requests);

  const employeeById = new Map();
  const mappedEntries = {};

  details.forEach((detail) => {
    const schedule = detail.schedule || {};
    const scheduleDepartment = (schedule.department || '').trim();

    (detail.employees || []).forEach((employee) => {
      if (!allowedIds.has(employee.id)) {
        return;
      }

      const employeeDepartment = String(employee.department || '').trim();
      const nextEmployee = {
        ...employee,
        scheduleId: schedule.id,
        scheduleDepartment
      };

      const current = employeeById.get(employee.id);
      if (!current) {
        employeeById.set(employee.id, nextEmployee);
        return;
      }

      const currentScore = current.scheduleDepartment && current.scheduleDepartment === employeeDepartment ? 2 : (current.scheduleDepartment ? 1 : 0);
      const nextScore = scheduleDepartment && scheduleDepartment === employeeDepartment ? 2 : (scheduleDepartment ? 1 : 0);
      if (nextScore > currentScore) {
        employeeById.set(employee.id, nextEmployee);
      }
    });

    (detail.entries || []).forEach((entry) => {
      if (!allowedIds.has(entry.employeeId)) {
        return;
      }
      mappedEntries[`${schedule.id}|${entry.employeeId}|${entry.day}`] = entry.shiftCode;
    });
  });

  const mergedEmployees = Array.from(employeeById.values());
  mergedEmployees.sort((a, b) => a.name.localeCompare(b.name, 'bg'));
  state.scheduleEmployees = mergedEmployees.map(normalizeEmployeeVacationData);
  state.scheduleEntriesById = mappedEntries;
}

async function loadFromBackend() {
  try {
    const healthResponse = await apiFetch('/api/health');
    if (!healthResponse.ok) {
      throw new Error('Health check failed');
    }

    state.backendAvailable = true;
    await loadDepartmentsFromBackend();
    await refreshMonthlyView();

    const response = await apiFetch('/api/state');
    if (response.ok) {
      const payload = await response.json();
      const backendShiftTemplates = Array.isArray(payload.shiftTemplates) ? payload.shiftTemplates : [];
      if (backendShiftTemplates.length) {
        state.shiftTemplates = mergeShiftTemplates(backendShiftTemplates);
        saveShiftTemplates();
      }
    }

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
      body: JSON.stringify({
        name: employee.name,
        department: employee.department,
        department_id: employee.departmentId || null,
        position: employee.position,
        egn: employee.egn,
        startDate: employee.startDate,
        endDate: employee.endDate,
        vacationAllowance: employee.vacationAllowance,
        telk: Boolean(employee.telk),
        youngWorkerBenefit: Boolean(employee.youngWorkerBenefit),
        baseVacationAllowance: resolveBaseVacationAllowance(employee)
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.message || 'Неуспешно създаване на служител.');
      error.isBusinessError = response.status < 500;
      throw error;
    }

    const payload = await response.json();
    return payload.employee || employee;
  } catch (error) {
    if (error?.isBusinessError) {
      throw error;
    }

    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    state.backendAvailable = false;
    return null;
  }
}

async function deleteEmployeeBackend(employeeId) {
  if (!state.backendAvailable) {
    throw new Error('Освобождаването е достъпно само с активен API бекенд.');
  }

  try {
    const response = await apiFetch(`/api/employees/${employeeId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      throw new Error(errPayload.message || 'Release employee failed');
    }
  } catch (error) {
    throw new Error(error.message || 'Неуспешно освобождаване на служител.');
  }
}

async function deleteEmployeeBackend(employeeId) {
  if (!state.backendAvailable) {
    throw new Error('Изтриването е достъпно само с активен API бекенд.');
  }

  if (!canDeleteEmployees()) {
    throw new Error('Само администратор може да изтрива служители.');
  }

  try {
    const response = await apiFetch(`/api/employees/${employeeId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      throw new Error(errPayload.message || 'Delete employee failed');
    }
  } catch (error) {
    throw new Error(error.message || 'Неуспешно изтриване на служител.');
  }
}

async function saveScheduleEntryBackend(employee, day, shiftCode) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const scheduleId = getEmployeeScheduleId(employee);
    if (!scheduleId) {
      throw new Error('Липсва график за отдела.');
    }

    const response = await apiFetch(`/api/schedules/${scheduleId}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employee.id, day, shift_code: shiftCode, month_key: state.month })
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
  const active = getActiveSchedule();
  const tableHtml = scheduleTable.outerHTML;
  const html = `
    <html>
      <head><meta charset="UTF-8"></head>
      <body>
        <h3>${state.selectedScheduleIds.length > 1 ? 'Обединен график' : `График ${active?.name || ''}`} за ${state.month}</h3>
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
  const active = getActiveSchedule();
  const popup = window.open('', '_blank');
  if (!popup) {
    return;
  }

  popup.document.write(`
    <html>
      <head>
        <title>${state.selectedScheduleIds.length > 1 ? 'Обединен график' : `График ${active?.name || ''}`} ${state.month}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 12px; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th, td { border: 1px solid #999; padding: 4px; text-align: center; }
          th:first-child, td:first-child { text-align: left; }
        </style>
      </head>
      <body>
        <h3>${state.selectedScheduleIds.length > 1 ? 'Обединен график' : `График ${active?.name || ''}`} за ${state.month}</h3>
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


function normalizeEmployeeVacationData(employee) {
  const normalized = employee ? { ...employee } : {};
  normalized.telk = Boolean(normalized.telk);
  normalized.youngWorkerBenefit = Boolean(normalized.youngWorkerBenefit);
  normalized.baseVacationAllowance = resolveBaseVacationAllowance(normalized);
  normalized.vacationAllowance = calculateVacationAllowance(normalized.baseVacationAllowance, normalized.telk, normalized.youngWorkerBenefit);
  return normalized;
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


function saveUserRole() {
  localStorage.setItem('userRole', state.userRole);
}

function loadUserRole() {
  try {
    return normalizeUserRole(localStorage.getItem('userRole'));
  } catch {
    return 'user';
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
      hours: getStoredShiftHours(shift),
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

function isMonthLocked(_month) {
  const active = getActiveSchedule();
  if (!active) {
    return false;
  }
  return Boolean(state.lockedMonths[active.id]);
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
