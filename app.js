const DEFAULT_RATES = {
  weekend: 1.75,
  holiday: 2
};

const NIGHT_HOURS_COEFFICIENT = 1.14286;
const MAX_NIGHT_SHIFT_HOURS = 12;
const STANDARD_BREAK_HOURS = 1;
const BREAK_DEDUCTION_THRESHOLD_HOURS = 9;

const TELK_EXTRA_VACATION_DAYS = 6;
const YOUNG_WORKER_EXTRA_VACATION_DAYS = 6;
const DEFAULT_BASE_VACATION_ALLOWANCE = 20;

const SYSTEM_SHIFTS = [
  { code: 'P', label: 'П', name: 'Почивка', type: 'rest', start: '', end: '', hours: 0, locked: true },
  { code: 'O', label: 'О', name: 'Отпуск', type: 'vacation', start: '', end: '', hours: 0, locked: true },
  { code: 'B', label: 'Б', name: 'Болничен', type: 'sick', start: '', end: '', hours: 0, locked: true }
];

const DEFAULT_WORK_SHIFT = { code: 'R', label: 'Р', name: 'Редовна', type: 'work', start: '08:00', end: '17:00', hours: 8, locked: true };

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
  sirvSchedule: {},
  scheduleEntriesById: {},
  scheduleEntrySnapshotsById: {},
  scheduleEntryValidationsById: {},
  scheduleShiftTemplatesById: {},
  schedules: [],
  selectedScheduleIds: [],
  activeScheduleId: null,
  departments: [],
  expandedDepartmentId: null,
  selectedDepartmentId: 'all',
  selectedDepartmentIds: [],
  scheduleViewMode: 'combined',
  generatorDepartmentId: '',
  generatorTemplateType: 'SIRV_12H_2_2',
  generatorSelectedEmployeeIds: [],
  hasManualScheduleSelection: false,
  backendAvailable: true,
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
  selectedTenantId: loadSelectedTenantId(),
  platformUserEmployees: [],
  platformUsers: [],
  availableTenants: [],
  pendingLoginToken: '',
  requiresTenantSelection: false,
  expandedVacationDossierEmployeeId: null,
  vacationLedgerDepartmentFilter: 'all',
  vacationLedgerSearchQuery: '',
  vacationCorrectionContext: null,
  isHandlingUnauthorized: false,
  backendConnectionOnline: null,
  backendReconnectInFlight: false,
  pendingConnectionLogs: loadPendingConnectionLogs(),
  lastConnectionErrorSignature: '',
  leaveTypes: [],
  leaves: [],
  leavesByEmployeeDay: {}
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
const vacationAllowanceHint = document.getElementById('vacationAllowanceHint');
const telkInput = document.getElementById('telkInput');
const youngWorkerInput = document.getElementById('youngWorkerInput');
const employeeIsSirvInput = document.getElementById('employeeIsSirvInput');
const employeeSirvPeriodField = document.getElementById('employeeSirvPeriodField');
const employeeSirvPeriodInput = document.getElementById('employeeSirvPeriodInput');
const employeeList = document.getElementById('employeeList');
const scheduleTable = document.getElementById('scheduleTable');
const storageStatus = document.getElementById('storageStatus');
const backendConnectionDot = document.getElementById('backendConnectionDot');
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiUrlBtn = document.getElementById('saveApiUrlBtn');
const userRoleSelect = document.getElementById('userRoleSelect');
const superAdminPortalLink = document.getElementById('superAdminPortalLink');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const monthInfo = document.getElementById('monthInfo');
const scheduleOverviewPanel = document.getElementById('scheduleOverviewPanel');
const scheduleFilterDepartmentSelect = document.getElementById('scheduleFilterDepartmentSelect');
const scheduleDepartmentSelect = document.getElementById('scheduleDepartmentSelect');
const generateDepartmentSelect = document.getElementById('generateDepartmentSelect');
const generateTemplateSelect = document.getElementById('generateTemplateSelect');
const generateEmployeesSelect = document.getElementById('generateEmployeesSelect');
const generateScheduleByTemplateBtn = document.getElementById('generateScheduleByTemplateBtn');
const generateWarnings = document.getElementById('generateWarnings');
const generateRotateEmployees = document.getElementById('generateRotateEmployees');
const generateIncludeWeekends = document.getElementById('generateIncludeWeekends');
const generateEnforce24h = document.getElementById('generateEnforce24h');
const generateRestHoursInput = document.getElementById('generateRestHoursInput');
const scheduleDepartmentMultiSelect = document.getElementById('scheduleDepartmentMultiSelect');
const scheduleDepartmentChips = document.getElementById('scheduleDepartmentChips');
const scheduleSelectAllDepartmentsBtn = document.getElementById('scheduleSelectAllDepartmentsBtn');
const scheduleClearDepartmentsBtn = document.getElementById('scheduleClearDepartmentsBtn');
const scheduleViewModeSelect = document.getElementById('scheduleViewModeSelect');
const scheduleNameInput = document.getElementById('scheduleNameInput');
const createScheduleBtn = document.getElementById('createScheduleBtn');
const scheduleList = document.getElementById('scheduleList');
const vacationForm = document.getElementById('vacationForm');
const vacationEmployeeSelect = document.getElementById('vacationEmployeeSelect');
const vacationStartInput = document.getElementById('vacationStartInput');
const vacationDaysInput = document.getElementById('vacationDaysInput');
const vacationLedger = document.getElementById('vacationLedger');
const vacationDepartmentFilterSelect = document.getElementById('vacationDepartmentFilterSelect');
const vacationSearchInput = document.getElementById('vacationSearchInput');
const vacationCorrectionModal = document.getElementById('vacationCorrectionModal');
const vacationCorrectionModalForm = document.getElementById('vacationCorrectionModalForm');
const vacationCorrectionModalStartInput = document.getElementById('vacationCorrectionModalStartInput');
const vacationCorrectionModalDaysInput = document.getElementById('vacationCorrectionModalDaysInput');
const vacationCorrectionModalInfo = document.getElementById('vacationCorrectionModalInfo');
const cancelVacationCorrectionModalBtn = document.getElementById('cancelVacationCorrectionModalBtn');
const ratesForm = document.getElementById('ratesForm');
const weekendRateInput = document.getElementById('weekendRateInput');
const holidayRateInput = document.getElementById('holidayRateInput');
const sirvPeriodInput = document.getElementById('sirvPeriodInput');
const shiftForm = document.getElementById('shiftForm');
const shiftCodeInput = document.getElementById('shiftCodeInput');
const shiftNameInput = document.getElementById('shiftNameInput');
const shiftDepartmentInput = document.getElementById('shiftDepartmentInput');
const shiftStartInput = document.getElementById('shiftStartInput');
const shiftEndInput = document.getElementById('shiftEndInput');
const shiftBreakMinutesInput = document.getElementById('shiftBreakMinutesInput');
const shiftBreakIncludedInput = document.getElementById('shiftBreakIncludedInput');
const shiftListDepartmentFilter = document.getElementById('shiftListDepartmentFilter');
const shiftList = document.getElementById('shiftList');
const shiftImportFileInput = document.getElementById('shiftImportFileInput');
const shiftImportPreviewBtn = document.getElementById('shiftImportPreviewBtn');
const shiftImportCommitBtn = document.getElementById('shiftImportCommitBtn');
const shiftImportDepartmentInput = document.getElementById('shiftImportDepartmentInput');
const shiftImportUpdateDuplicatesInput = document.getElementById('shiftImportUpdateDuplicatesInput');
const shiftImportPreview = document.getElementById('shiftImportPreview');
const shiftImportSummary = document.getElementById('shiftImportSummary');
const downloadShiftImportTemplateBtn = document.getElementById('downloadShiftImportTemplateBtn');
const shiftLegend = document.getElementById('shiftLegend');
const lockScheduleBtn = document.getElementById('lockScheduleBtn');
const unlockScheduleBtn = document.getElementById('unlockScheduleBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const lockStatus = document.getElementById('lockStatus');
const leaveEmployeeSelect = document.getElementById('leaveEmployeeSelect');
const leaveTypeSelect = document.getElementById('leaveTypeSelect');
const leaveFromInput = document.getElementById('leaveFromInput');
const leaveToInput = document.getElementById('leaveToInput');
const leaveMinutesInput = document.getElementById('leaveMinutesInput');
const addLeaveBtn = document.getElementById('addLeaveBtn');
const leaveList = document.getElementById('leaveList');
const summarySettingsList = document.getElementById('summarySettingsList');
const settingsSubtabButtons = document.querySelectorAll('.settings-subtab-btn');
const settingsSubtabPanels = document.querySelectorAll('.settings-subtab-panel');
const usersSettingsSubtabButton = document.querySelector('.settings-subtab-btn[data-settings-tab="usersSettingsPanel"]');
const usersSettingsPanel = document.getElementById('usersSettingsPanel');
const summarySettingsSubtabButton = document.querySelector('.settings-subtab-btn[data-settings-tab="summarySettingsPanel"]');
const summarySettingsPanel = document.getElementById('summarySettingsPanel');
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
const editEmployeeIsSirvInput = document.getElementById('editEmployeeIsSirvInput');
const editEmployeeSirvPeriodField = document.getElementById('editEmployeeSirvPeriodField');
const editEmployeeSirvPeriodInput = document.getElementById('editEmployeeSirvPeriodInput');
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
const chooseTenantScreen = document.getElementById('chooseTenantScreen');
const chooseTenantList = document.getElementById('chooseTenantList');
const authSignedInInfo = document.getElementById('authSignedInInfo');
const preAuthScreen = document.getElementById('preAuthScreen');
const appShell = document.getElementById('appShell');
const logoutBtn = document.getElementById('logoutBtn');
const tenantSwitcherLabel = document.getElementById('tenantSwitcherLabel');
const tenantSwitcherSelect = document.getElementById('tenantSwitcherSelect');
const createPlatformUserForm = document.getElementById('createPlatformUserForm');
const platformUserEmployeeInput = document.getElementById('platformUserEmployeeInput');
const platformUserEmailInput = document.getElementById('platformUserEmailInput');
const platformUserPasswordInput = document.getElementById('platformUserPasswordInput');
const generatePlatformPasswordBtn = document.getElementById('generatePlatformPasswordBtn');
const platformUserRoleInput = document.getElementById('platformUserRoleInput');
const refreshPlatformUsersBtn = document.getElementById('refreshPlatformUsersBtn');
const platformUsersList = document.getElementById('platformUsersList');
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
const holidaysYearInput = document.getElementById('holidaysYearInput');
const holidaysReloadBtn = document.getElementById('holidaysReloadBtn');
const holidaysTableBody = document.getElementById('holidaysTableBody');
const holidayForm = document.getElementById('holidayForm');

let statusToastTimer = null;
let lastShiftImportPreviewPayload = null;


const safeNum = window.ScheduleTotals?.safeNum || ((value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
});
const minutesToHoursDecimal = window.ScheduleTotals?.minutesToHoursDecimal || ((minutes) => (safeNum(minutes, 0) / 60).toFixed(2));
const sumEmployeeTotals = window.ScheduleTotals?.sumEmployeeTotals || ((entriesByDay) => ({
  workMinutesTotal: (entriesByDay || []).reduce((acc, entry) => acc + safeNum(entry?.workMinutesTotal ?? entry?.workMinutes), 0),
  nightMinutes: (entriesByDay || []).reduce((acc, entry) => acc + safeNum(entry?.nightMinutes), 0),
  weekendMinutes: (entriesByDay || []).reduce((acc, entry) => acc + safeNum(entry?.weekendMinutes), 0),
  holidayMinutes: (entriesByDay || []).reduce((acc, entry) => acc + safeNum(entry?.holidayMinutes), 0),
  overtimeMinutes: (entriesByDay || []).reduce((acc, entry) => acc + safeNum(entry?.overtimeMinutes), 0),
}));
const sumGridTotals = window.ScheduleTotals?.sumGridTotals || ((visibleEmployees) => (visibleEmployees || []).reduce((acc, employee) => ({
  workMinutesTotal: acc.workMinutesTotal + safeNum(employee?.workMinutesTotal),
  nightMinutes: acc.nightMinutes + safeNum(employee?.nightMinutes),
  weekendMinutes: acc.weekendMinutes + safeNum(employee?.weekendMinutes),
  holidayMinutes: acc.holidayMinutes + safeNum(employee?.holidayMinutes),
  overtimeMinutes: acc.overtimeMinutes + safeNum(employee?.overtimeMinutes),
}), { workMinutesTotal: 0, nightMinutes: 0, weekendMinutes: 0, holidayMinutes: 0, overtimeMinutes: 0 }));

function truncateMessages(messages, maxItems = 2) {
  const source = Array.isArray(messages) ? messages.filter(Boolean) : [];
  if (source.length <= maxItems) {
    return source;
  }
  return [...source.slice(0, maxItems), `+${source.length - maxItems} още…`];
}

function renderScheduleOverviewTotals(totals) {
  if (!scheduleOverviewPanel) {
    return;
  }
  const items = [
    ['Общо часове', totals.workMinutesTotal],
    ['Нощни', totals.nightMinutes],
    ['Уикенд', totals.weekendMinutes],
    ['Празнични', totals.holidayMinutes],
    [isMonthLocked(state.month) ? 'Финални извънредни (СИРВ)' : 'Извънредни', totals.overtimeMinutes],
  ];
  scheduleOverviewPanel.innerHTML = `
    <div class="schedule-overview-title">Обобщение</div>
    <div class="schedule-overview-grid">
      ${items.map(([label, minutes]) => `<div class="schedule-overview-item"><span>${label}</span><strong>${minutesToHoursDecimal(minutes)} ч</strong></div>`).join('')}
    </div>
  `;
}

function appendSnapshotTotalsColumns(row, totals, isTotalsRow = false) {
  const columns = [
    totals.workMinutesTotal,
    totals.nightMinutes,
    totals.weekendMinutes,
    totals.holidayMinutes,
    totals.overtimeMinutes,
  ];
  columns.forEach((value, index) => {
    const cell = document.createElement('td');
    cell.className = 'summary-col schedule-snapshot-total';
    if (index === 4 && safeNum(value) > 0) {
      cell.classList.add('negative');
    }
    cell.textContent = `${minutesToHoursDecimal(value)} ч`;
    if (isTotalsRow) {
      cell.classList.add('schedule-snapshot-total--grand');
    }
    row.appendChild(cell);
  });
}

init();

async function init() {
  monthPicker.value = state.month;

  const loadedSchedule = loadScheduleState();
  state.month = loadedSchedule.month || todayMonth();
  loadScheduleReviewPreferences();
  state.schedule = loadedSchedule.schedule || {};
  state.employees = loadEmployees().map(normalizeEmployeeVacationData);
  state.apiBaseUrl = detectApiBaseUrl();

  weekendRateInput.value = String(state.rates.weekend);
  holidayRateInput.value = String(state.rates.holiday);
  sirvPeriodInput.value = String(state.sirvPeriodMonths);
  apiUrlInput.value = state.apiBaseUrl;
  updateBackendConnectionIndicator(false, "Проверка за връзка със сървъра...");
  if (userRoleSelect) {
    userRoleSelect.value = state.userRole;
  }
  updateSuperAdminPortalVisibility();
  updateUsersSettingsTabVisibility();

  attachApiControls();
  attachRoleControls();
  attachTabs();
  attachRatesForm();
  attachVacationForm();
  attachVacationFilters();
  attachVacationCorrectionModalControls();
  attachVacationDateValidationControls();
  attachLeavesControls();
  attachShiftForm();
  attachShiftImportControls();
  attachLockAndExport();
  attachSettingsControls();
  attachSettingsSubtabs();
  attachHolidaySettings();
  attachDepartmentControls();
  attachDepartmentManagementControls();
  attachEmployeeEditModalControls();
  attachRegistrationControls();
  attachTenantSwitcherControls();
  attachSuperAdminControls();
  syncRoleFromAuthenticatedUser();
  updateAuthUi();
  updateAuthGate();
  await loadMyTenants();

  const canLoadTenantData = Boolean(state.currentUser && state.authToken);
  let synced = false;
  if (canLoadTenantData) {
    synced = await loadFromBackend();
    if (!synced) {
      setStatus(`Локален режим (localStorage). API: ${state.apiBaseUrl}`, false);
    }
  }

  monthPicker.value = state.month;
  await refreshMonthlyView();
  renderAll();
}


function normalizeUserRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['user', 'manager', 'admin', 'owner', 'super_admin'].includes(normalized) ? normalized : 'user';
}

function getRoleLabel(role) {
  if (role === 'admin') {
    return 'Администратор';
  }
  if (role === 'owner') {
    return 'Собственик';
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
  return state.userRole === 'admin' || state.userRole === 'owner';
}

function canManageVacationCorrections() {
  return state.userRole === 'manager' || state.userRole === 'admin' || state.userRole === 'owner';
}


function updateSuperAdminPortalVisibility() {
  if (!superAdminPortalLink) {
    return;
  }

  const isSuperAdmin = state.userRole === 'super_admin';
  superAdminPortalLink.classList.toggle('hidden', !isSuperAdmin);
}

function updateUsersSettingsTabVisibility() {
  if (!usersSettingsSubtabButton || !usersSettingsPanel) {
    return;
  }

  const canViewUsersTab = state.userRole !== 'user';
  usersSettingsSubtabButton.classList.toggle('hidden', !canViewUsersTab);
  usersSettingsPanel.classList.toggle('hidden', !canViewUsersTab);

  if (!canViewUsersTab && usersSettingsSubtabButton.classList.contains('active')) {
    usersSettingsSubtabButton.classList.remove('active');
    usersSettingsPanel.classList.remove('active');
    if (summarySettingsSubtabButton) {
      summarySettingsSubtabButton.classList.add('active');
    }
    if (summarySettingsPanel) {
      summarySettingsPanel.classList.add('active');
    }
  }
}

function attachRoleControls() {
  if (!userRoleSelect) {
    return;
  }

  userRoleSelect.value = state.userRole;
  userRoleSelect.addEventListener('change', () => {
    const selectedRole = normalizeUserRole(userRoleSelect.value);
    if (selectedRole === 'super_admin' && state.currentUser?.is_super_admin !== true) {
      state.userRole = 'user';
      userRoleSelect.value = state.userRole;
      saveUserRole();
      updateSuperAdminPortalVisibility();
      updateUsersSettingsTabVisibility();
      renderEmployees();
      setStatus('Само платформеният собственик може да използва роля Супер администратор.', false);
      return;
    }

    state.userRole = selectedRole;
    saveUserRole();
    updateSuperAdminPortalVisibility();
    updateUsersSettingsTabVisibility();
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
    if (chooseTenantScreen) {
      chooseTenantScreen.classList.toggle('hidden', true);
    }
    if (mode !== 'choose_tenant') {
      state.pendingLoginToken = '';
      state.availableTenants = [];
      state.requiresTenantSelection = false;
    }
    updateAuthGate();
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
      state.selectedTenantId = '';
      persistSelectedTenantId();
      resetTenantScopedState({ clearLocalStorage: true });
      updateAuthUi();
      updateAuthGate();
      renderAll();
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

        if (payload.mode === 'choose_tenant') {
          state.authToken = '';
          state.currentUser = payload.user || null;
          state.pendingLoginToken = payload.loginToken || '';
          state.availableTenants = Array.isArray(payload.tenants) ? payload.tenants : [];
          state.requiresTenantSelection = true;
          localStorage.removeItem('authToken');
          localStorage.removeItem('currentUser');

          if (chooseTenantScreen) {
            chooseTenantScreen.classList.remove('hidden');
          }
          if (signInForm) {
            signInForm.classList.add('hidden');
          }
          renderChooseTenantScreen();
          updateAuthGate();
          setStatus('Изберете фирма за продължение.', true);
          return;
        }

        state.authToken = payload.token;
        state.currentUser = payload.user;
        state.requiresTenantSelection = false;
        syncRoleFromAuthenticatedUser();
        persistAuthSession();
        resetTenantScopedState({ clearLocalStorage: false });

        signInForm.reset();
        await loadMyTenants();
        updateAuthUi();
        updateAuthGate();

        await loadFromBackend();
        renderAll();

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
        const tenantId = resolveTenantIdForPlatformUserCreate();
        if (state.currentUser?.is_super_admin === true && !isValidUuid(tenantId)) {
          throw new Error('Липсва tenantId (избери организация).');
        }

        await apiRequest('/api/platform/users', {
          method: 'POST',
          body: JSON.stringify({
            tenantId,
            employeeId: platformUserEmployeeInput.value,
            email: platformUserEmailInput.value,
            password: platformUserPasswordInput.value,
            role: platformUserRoleInput.value,
          }),
        });
        createPlatformUserForm.reset();
        await loadPlatformUsers();
        setStatus('Потребителят е добавен успешно.', true);
      } catch (error) {
        setStatus(`Грешка при добавяне на потребител: ${error.message}`, false);
      }
    });
  }
  if (refreshPlatformUsersBtn) {
    refreshPlatformUsersBtn.addEventListener('click', async () => {
      try {
        await loadPlatformUsers();
        setStatus('Списъкът с потребители е обновен.', true);
      } catch (error) {
        setStatus(`Грешка при зареждане на потребители: ${error.message}`, false);
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

function renderChooseTenantScreen() {
  if (!chooseTenantList) {
    return;
  }

  chooseTenantList.innerHTML = '';
  state.availableTenants.forEach((tenant) => {
    const item = document.createElement('div');
    item.className = 'tenant-choice-item';
    item.innerHTML = `
      <div>
        <strong>${tenant.name || 'Без име'}</strong><br />
        <small>Роля: ${tenant.role || 'user'}</small>
      </div>
      <button type="button" data-tenant-id="${tenant.id}">Избери</button>
    `;
    const button = item.querySelector('button');
    button?.addEventListener('click', async () => {
      await completeTenantSelection(tenant.id);
    });
    chooseTenantList.appendChild(item);
  });
}

function updateTenantSwitcherUi() {
  if (!tenantSwitcherSelect || !tenantSwitcherLabel) {
    return;
  }

  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  const canSwitch = isAuthenticated && Array.isArray(state.availableTenants) && state.availableTenants.length > 1;

  tenantSwitcherSelect.classList.toggle('hidden', !canSwitch);
  tenantSwitcherLabel.classList.toggle('hidden', !canSwitch);

  if (!canSwitch) {
    tenantSwitcherSelect.innerHTML = '';
    return;
  }

  tenantSwitcherSelect.innerHTML = '';
  state.availableTenants.forEach((tenant) => {
    const option = document.createElement('option');
    option.value = tenant.id;
    option.textContent = tenant.name;
    tenantSwitcherSelect.appendChild(option);
  });

  if (isValidUuid(state.currentUser?.tenantId)) {
    tenantSwitcherSelect.value = state.currentUser.tenantId;
  }
}

async function loadMyTenants() {
  if (!state.authToken) {
    state.availableTenants = [];
    updateTenantSwitcherUi();
    return;
  }

  try {
    const payload = await apiRequest('/api/me/tenants', { method: 'GET' });
    state.availableTenants = Array.isArray(payload.tenants) ? payload.tenants : [];
  } catch (_error) {
    state.availableTenants = [];
  }

  updateTenantSwitcherUi();
}

async function completeTenantSelection(tenantId) {
  if (!isValidUuid(tenantId)) {
    setStatus('Невалиден избор на фирма.', false);
    return;
  }

  try {
    let payload = null;

    if (state.pendingLoginToken) {
      payload = await apiRequest('/api/auth/select-tenant', {
        method: 'POST',
        body: JSON.stringify({
          loginToken: state.pendingLoginToken,
          tenantId,
        }),
      });
    } else if (state.authToken) {
      payload = await apiRequest('/api/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      });
      payload = {
        mode: 'ok',
        token: payload.token,
        tenant: payload.tenant,
        user: {
          ...(state.currentUser || {}),
          tenantId: payload.tenant?.id || tenantId,
        },
      };
    } else {
      throw new Error('Липсва валидна сесия за избор на фирма.');
    }

    state.pendingLoginToken = '';
    state.requiresTenantSelection = false;
    state.authToken = payload.token;
    state.currentUser = payload.user;
    syncRoleFromAuthenticatedUser();
    persistAuthSession();
    resetTenantScopedState({ clearLocalStorage: false });

    await loadMyTenants();
    updateAuthUi();
    updateAuthGate();

    signInForm?.reset();
    await loadFromBackend();
    renderAll();
    setStatus(`Успешен избор на фирма: ${payload.tenant?.name || tenantId}`, true);
  } catch (error) {
    setStatus(`Грешка при избор на фирма: ${error.message}`, false);
  }
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
  const showChooseTenant = Boolean(state.requiresTenantSelection) && state.availableTenants.length > 1;

  if (preAuthScreen) {
    preAuthScreen.classList.toggle('hidden', isAuthenticated && !showChooseTenant);
  }
  if (appShell) {
    appShell.classList.toggle('hidden', !isAuthenticated || showChooseTenant);
  }
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAuthenticated || showChooseTenant);
  }

  if (chooseTenantScreen) {
    chooseTenantScreen.classList.toggle('hidden', !showChooseTenant);
    if (showChooseTenant) {
      renderChooseTenantScreen();
    }
  }

  updateTenantSwitcherUi();
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
  state.selectedTenantId = '';
  state.pendingLoginToken = '';
  state.availableTenants = [];
  state.requiresTenantSelection = false;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('selectedTenantId');
}

function resetTenantScopedState({ clearLocalStorage = false } = {}) {
  state.employees = [];
  state.scheduleEmployees = [];
  state.schedule = {};
  state.scheduleEntriesById = {};
  state.scheduleEntrySnapshotsById = {};
  state.scheduleEntryValidationsById = {};
  state.schedules = [];
  state.selectedScheduleIds = [];
  state.activeScheduleId = null;
  state.departments = [];
  state.shiftTemplates = [...SYSTEM_SHIFTS, DEFAULT_WORK_SHIFT];

  if (clearLocalStorage) {
    localStorage.removeItem('employees');
    localStorage.removeItem('scheduleState');
    localStorage.removeItem('shiftTemplates');
    localStorage.removeItem('scheduleReviewDepartments');
    localStorage.removeItem('scheduleReviewMode');
  }
}

function cleanStoredValue(value) {
  return String(value || '').trim();
}


function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanStoredValue(value));
}

function loadSelectedTenantId() {
  const fromStorage = cleanStoredValue(localStorage.getItem('selectedTenantId'));
  return isValidUuid(fromStorage) ? fromStorage : '';
}

function persistSelectedTenantId() {
  if (isValidUuid(state.selectedTenantId)) {
    localStorage.setItem('selectedTenantId', state.selectedTenantId);
  } else {
    localStorage.removeItem('selectedTenantId');
  }
}

function syncRoleFromAuthenticatedUser() {
  if (!state.currentUser) {
    return;
  }

  if (state.currentUser.is_super_admin === true) {
    state.userRole = 'super_admin';
  } else if (state.userRole === 'super_admin') {
    state.userRole = 'user';
  }

  if (isValidUuid(state.currentUser.tenantId) && !isValidUuid(state.selectedTenantId)) {
    state.selectedTenantId = state.currentUser.tenantId;
    persistSelectedTenantId();
  }

  saveUserRole();
  if (userRoleSelect) {
    userRoleSelect.value = state.userRole;
  }
  updateSuperAdminPortalVisibility();
  updateUsersSettingsTabVisibility();
}

function resolveTenantIdForPlatformUserCreate() {
  if (state.currentUser?.is_super_admin === true) {
    const fromForm = cleanStoredValue(reviewRegistrationIdInput?.value);
    if (isValidUuid(fromForm)) {
      state.selectedTenantId = fromForm;
      persistSelectedTenantId();
      return fromForm;
    }
    if (isValidUuid(state.selectedTenantId)) {
      return state.selectedTenantId;
    }
    return '';
  }

  if (isValidUuid(state.currentUser?.tenantId)) {
    return state.currentUser.tenantId;
  }

  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('bg-BG');
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

    if (!isValidUuid(state.selectedTenantId)) {
      const firstRegistration = (overview.registrations || [])[0];
      if (isValidUuid(firstRegistration?.id)) {
        state.selectedTenantId = firstRegistration.id;
        persistSelectedTenantId();
      }
    }

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
    const allLogs = Array.isArray(overview.logs) ? overview.logs : [];
    const selectedTenantId = isValidUuid(state.selectedTenantId) ? state.selectedTenantId : '';
    const logs = selectedTenantId ? allLogs.filter((log) => cleanStoredValue(log.tenantId) === selectedTenantId) : allLogs;

    if (!logs.length) {
      superAdminLogs.innerHTML = '<small>Няма налични логове за избраната фирма.</small>';
      return;
    }

    superAdminLogs.innerHTML = logs.map((log) => {
      const errorText = cleanStoredValue(log.afterJson?.readableMessage || log.afterJson?.error || log.afterJson?.message || 'Няма детайли за грешката.');
      return `
        <div class="super-admin-log-card">
          <strong>${escapeHtml(log.action || 'audit')}</strong>
          <small>Tenant: ${escapeHtml(log.tenantId || '—')} | ${escapeHtml(formatDateTime(log.createdAt) || '')}</small>
          <p><b>Грешка:</b> ${escapeHtml(errorText)}</p>
        </div>
      `;
    }).join('');
  }
}

function attachTenantSwitcherControls() {
  if (!tenantSwitcherSelect) {
    return;
  }

  tenantSwitcherSelect.addEventListener('change', async () => {
    const tenantId = cleanStoredValue(tenantSwitcherSelect.value);
    if (!isValidUuid(tenantId)) {
      return;
    }

    try {
      const payload = await apiRequest('/api/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      });

      state.authToken = payload.token;
      state.currentUser = {
        ...(state.currentUser || {}),
        tenantId: payload.tenant?.id || tenantId,
      };
      persistAuthSession();
      resetTenantScopedState({ clearLocalStorage: false });
      await loadMyTenants();
      await loadFromBackend();
      renderAll();
      setStatus(`Сменена фирма: ${payload.tenant?.name || tenantId}`, true);
    } catch (error) {
      setStatus(`Грешка при смяна на фирма: ${error.message}`, false);
      updateTenantSwitcherUi();
    }
  });
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

function loadScheduleReviewPreferences() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    const monthFromQuery = cleanStoredValue(params.get('month'));
    if (monthFromQuery) {
      state.month = monthFromQuery;
    }

    const deptsFromQuery = cleanStoredValue(params.get('depts'));
    if (deptsFromQuery) {
      state.selectedDepartmentIds = deptsFromQuery.split(',').map((item) => cleanStoredValue(item)).filter(Boolean);
    } else {
      const saved = localStorage.getItem('scheduleReviewDepartments');
      state.selectedDepartmentIds = saved ? JSON.parse(saved) : [];
    }

    const modeFromQuery = cleanStoredValue(params.get('view_mode'));
    const savedMode = cleanStoredValue(localStorage.getItem('scheduleReviewMode'));
    state.scheduleViewMode = ['combined', 'sections'].includes(modeFromQuery)
      ? modeFromQuery
      : (['combined', 'sections'].includes(savedMode) ? savedMode : 'combined');
  } catch (_error) {
    state.selectedDepartmentIds = [];
    state.scheduleViewMode = 'combined';
  }
}

function persistScheduleReviewPreferences() {
  const selected = Array.isArray(state.selectedDepartmentIds) ? state.selectedDepartmentIds.filter(Boolean) : [];
  localStorage.setItem('scheduleReviewDepartments', JSON.stringify(selected));
  localStorage.setItem('scheduleReviewMode', state.scheduleViewMode || 'combined');

  const params = new URLSearchParams(window.location.search || '');
  params.set('month', state.month || todayMonth());
  if (selected.length) {
    params.set('depts', selected.join(','));
  } else {
    params.delete('depts');
  }
  if (state.scheduleViewMode && state.scheduleViewMode !== 'combined') {
    params.set('view_mode', state.scheduleViewMode);
  } else {
    params.delete('view_mode');
  }

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function getEffectiveSingleDepartmentFilter() {
  const selectedIds = (state.selectedDepartmentIds || []).filter(Boolean);
  if (selectedIds.length === 1) {
    return selectedIds[0];
  }

  if (state.selectedDepartmentId && ![DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)) {
    return state.selectedDepartmentId;
  }

  return null;
}

function getSelectedDepartmentIdsSet() {
  return new Set((state.selectedDepartmentIds || []).map((item) => cleanStoredValue(item)).filter(Boolean));
}

function setSelectedDepartments(nextIds) {
  state.selectedDepartmentIds = Array.from(new Set((nextIds || []).map((item) => cleanStoredValue(item)).filter(Boolean)));
  persistScheduleReviewPreferences();
  renderDepartmentMultiSelect();
  renderSchedule();
}

function removeSelectedDepartment(departmentId) {
  setSelectedDepartments((state.selectedDepartmentIds || []).filter((item) => item !== departmentId));
}

function renderDepartmentMultiSelect() {
  if (!scheduleDepartmentMultiSelect || !scheduleDepartmentChips) {
    return;
  }

  const selectedSet = getSelectedDepartmentIdsSet();
  scheduleDepartmentMultiSelect.innerHTML = '';
  state.departments.forEach((department) => {
    const row = document.createElement('div');
    row.className = 'schedule-multi-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedSet.has(department.id);
    checkbox.addEventListener('change', () => {
      const current = getSelectedDepartmentIdsSet();
      if (checkbox.checked) {
        current.add(department.id);
      } else {
        current.delete(department.id);
      }
      setSelectedDepartments(Array.from(current));
    });

    const label = document.createElement('span');
    label.textContent = department.name;

    const singleBtn = document.createElement('button');
    singleBtn.type = 'button';
    singleBtn.className = 'schedule-single-dept-btn';
    singleBtn.textContent = 'Само този отдел';
    singleBtn.addEventListener('click', () => {
      setSelectedDepartments([department.id]);
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(singleBtn);
    scheduleDepartmentMultiSelect.appendChild(row);
  });

  scheduleDepartmentChips.innerHTML = '';
  const selectedDepartments = state.departments.filter((department) => selectedSet.has(department.id));
  if (!selectedDepartments.length) {
    const chip = document.createElement('span');
    chip.className = 'schedule-chip schedule-chip--all';
    chip.textContent = 'ОБЩ (всички отдели)';
    scheduleDepartmentChips.appendChild(chip);
  } else {
    selectedDepartments.forEach((department) => {
      const chip = document.createElement('span');
      chip.className = 'schedule-chip';
      chip.textContent = department.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => removeSelectedDepartment(department.id));
      chip.appendChild(removeBtn);
      scheduleDepartmentChips.appendChild(chip);
    });
  }

  if (scheduleViewModeSelect) {
    scheduleViewModeSelect.value = state.scheduleViewMode || 'combined';
  }
}

function attachDepartmentControls() {
  if (scheduleFilterDepartmentSelect) {
    scheduleFilterDepartmentSelect.addEventListener('change', async () => {
      state.selectedDepartmentId = scheduleFilterDepartmentSelect.value || DEPARTMENT_VIEW_ALL;
      if (![DEPARTMENT_VIEW_ALL, DEPARTMENT_VIEW_ALL_BY_DEPARTMENTS].includes(state.selectedDepartmentId)) {
        setSelectedDepartments([state.selectedDepartmentId]);
      }
      await refreshMonthlyView();
      renderAll();
    });
  }

  if (scheduleSelectAllDepartmentsBtn) {
    scheduleSelectAllDepartmentsBtn.addEventListener('click', () => {
      setSelectedDepartments(state.departments.map((department) => department.id));
    });
  }

  if (scheduleClearDepartmentsBtn) {
    scheduleClearDepartmentsBtn.addEventListener('click', () => {
      setSelectedDepartments([]);
    });
  }

  if (scheduleViewModeSelect) {
    scheduleViewModeSelect.addEventListener('change', () => {
      state.scheduleViewMode = ['combined', 'sections'].includes(scheduleViewModeSelect.value)
        ? scheduleViewModeSelect.value
        : 'combined';
      persistScheduleReviewPreferences();
      renderSchedule();
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

  if (generateDepartmentSelect) {
    generateDepartmentSelect.addEventListener('change', () => {
      state.generatorDepartmentId = generateDepartmentSelect.value || '';
      state.generatorSelectedEmployeeIds = [];
      renderGeneratorControls();
    });
  }

  if (generateTemplateSelect) {
    generateTemplateSelect.addEventListener('change', () => {
      state.generatorTemplateType = generateTemplateSelect.value || 'SIRV_12H_2_2';
    });
  }

  if (generateScheduleByTemplateBtn) {
    generateScheduleByTemplateBtn.addEventListener('click', async () => {
      await generateScheduleByTemplate();
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

  const validDepartmentIds = new Set(state.departments.map((department) => department.id));
  state.selectedDepartmentIds = (state.selectedDepartmentIds || []).filter((id) => validDepartmentIds.has(id));
  renderDepartmentMultiSelect();

  renderDepartmentList();
  renderEmployeeDepartmentOptions();
  renderGeneratorControls();
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

function renderGeneratorControls() {
  if (!generateDepartmentSelect) {
    return;
  }

  const prev = state.generatorDepartmentId;
  generateDepartmentSelect.innerHTML = '';
  state.departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    generateDepartmentSelect.appendChild(option);
  });

  const hasPrev = state.departments.some((department) => department.id === prev);
  state.generatorDepartmentId = hasPrev ? prev : (state.departments[0]?.id || '');
  generateDepartmentSelect.value = state.generatorDepartmentId;

  if (generateTemplateSelect) {
    generateTemplateSelect.value = state.generatorTemplateType || 'SIRV_12H_2_2';
  }

  const departmentEmployees = state.employees.filter((employee) => employee.departmentId === state.generatorDepartmentId);
  const selectedSet = new Set(state.generatorSelectedEmployeeIds || []);
  if (generateEmployeesSelect) {
    generateEmployeesSelect.innerHTML = '';
    departmentEmployees.forEach((employee) => {
      const row = document.createElement('label');
      row.className = 'settings-checkbox';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = employee.id;
      checkbox.checked = selectedSet.has(employee.id);
      checkbox.addEventListener('change', () => {
        const current = new Set(state.generatorSelectedEmployeeIds || []);
        if (checkbox.checked) current.add(employee.id);
        else current.delete(employee.id);
        state.generatorSelectedEmployeeIds = Array.from(current);
      });
      row.appendChild(checkbox);
      row.appendChild(document.createTextNode(employee.name));
      generateEmployeesSelect.appendChild(row);
    });
  }
}

function getSelectedOverwriteMode() {
  const selected = document.querySelector('input[name="generateOverwriteMode"]:checked');
  return selected ? selected.value : 'empty_only';
}

async function generateScheduleByTemplate() {
  const active = getActiveSchedule();
  if (!active?.id) {
    setStatus('Изберете активен график.', false);
    return;
  }

  const departmentId = cleanStoredValue(generateDepartmentSelect?.value);
  if (!departmentId) {
    setStatus('Изберете отдел за генерация.', false);
    return;
  }

  const templateType = cleanStoredValue(generateTemplateSelect?.value) || 'SIRV_12H_2_2';
  state.generatorTemplateType = templateType;

  const response = await apiFetch(`/api/schedules/${active.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department_id: departmentId,
      employee_ids: state.generatorSelectedEmployeeIds,
      template_type: templateType,
      options: {
        rotate_employees: Boolean(generateRotateEmployees?.checked),
        include_weekends: Boolean(generateIncludeWeekends?.checked),
        overwrite_mode: getSelectedOverwriteMode(),
        rest_min_hours: Number(generateRestHoursInput?.value || 12),
        enforce_24h_after_12h: Boolean(generateEnforce24h?.checked),
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || 'Неуспешна генерация на график.';
    setStatus(message, false);
    if (generateWarnings) {
      const missing = Array.isArray(payload.missingShifts) ? payload.missingShifts.join(', ') : '';
      generateWarnings.textContent = missing ? `Липсват смени за този отдел: ${missing}` : '';
    }
    return;
  }

  await refreshMonthlyView();
  renderAll();
  const generatedCount = Number(payload.generatedCount || 0);
  const skippedCount = Number(payload.skippedCount || 0);
  setStatus(`Генерацията завърши: генерирани ${generatedCount}, пропуснати ${skippedCount}.`, true);

  if (generateWarnings) {
    const warnings = Array.isArray(payload.warnings) ? payload.warnings.slice(0, 6) : [];
    generateWarnings.textContent = warnings.length
      ? warnings.map((item) => `${item.date}: ${item.msg}`).join(' | ')
      : '';
  }
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
        loadPlatformUsers().catch(() => {
          renderPlatformUsersList();
        });
      }
    });
  });
}

function attachHolidaySettings() {
  if (holidaysYearInput) {
    holidaysYearInput.value = String(new Date().getFullYear());
  }
  if (holidaysReloadBtn) {
    holidaysReloadBtn.addEventListener('click', async () => {
      await loadHolidaysAdminYear(holidaysYearInput?.value || new Date().getFullYear());
    });
  }
  if (holidayForm) {
    holidayForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(holidayForm);
      const isCompanyDayOff = formData.get('is_company_day_off') === 'on';
      const isWorkingDayOverride = formData.get('is_working_day_override') === 'on';
      if (isCompanyDayOff && isWorkingDayOverride) {
        setStatus('Не може едновременно фирмен празник и working override.', false);
        return;
      }
      await apiRequest('/api/holidays', {
        method: 'POST',
        body: JSON.stringify({
          date: formData.get('date'),
          name: formData.get('name'),
          is_company_day_off: isCompanyDayOff,
          is_working_day_override: isWorkingDayOverride,
          note: formData.get('note') || '',
        })
      });
      holidayForm.reset();
      state.holidaysByMonthCache = {};
      await loadHolidaysAdminYear(holidaysYearInput?.value || new Date().getFullYear());
      await loadHolidayRangeForMonth(state.month);
      renderSchedule();
    });
  }
  if (holidaysTableBody) {
    loadHolidaysAdminYear(holidaysYearInput?.value || new Date().getFullYear()).catch(() => {
      holidaysTableBody.innerHTML = '<tr><td colspan="4">Няма достъп до празници.</td></tr>';
    });
  }
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
  if (shiftListDepartmentFilter && !shiftListDepartmentFilter.dataset.bound) {
    shiftListDepartmentFilter.dataset.bound = '1';
    shiftListDepartmentFilter.addEventListener('change', () => renderShiftList());
  }
  shiftForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const code = shiftCodeInput.value.trim().toUpperCase();
    const name = shiftNameInput.value.trim();
    const departmentId = cleanStoredValue(shiftDepartmentInput?.value) || null;
    const start = shiftStartInput.value;
    const end = shiftEndInput.value;
    const breakMinutes = Math.max(0, Number(shiftBreakMinutesInput?.value || 0));
    const breakIncluded = Boolean(shiftBreakIncludedInput?.checked);

    if (!code || !name || !start || !end) {
      return;
    }

    if (state.shiftTemplates.some((shift) => shift.code === code && cleanStoredValue(shift.departmentId) === (departmentId || ''))) {
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
      departmentId,
      type: 'work',
      start,
      end,
      hours,
      locked: false,
      break_minutes: breakMinutes,
      break_included: breakIncluded
    });

    saveShiftTemplates();
    if (departmentId) {
      void saveDepartmentShiftBackend(departmentId, { code, name, start_time: start, end_time: end, break_minutes: breakMinutes, break_included: breakIncluded });
      void loadDepartmentShifts(departmentId, { force: true });
    } else {
      void saveShiftTemplateBackend({ code, name, start, end, hours, department_id: departmentId, break_minutes: breakMinutes, break_included: breakIncluded });
    }
    shiftForm.reset();
    if (shiftDepartmentInput) {
      shiftDepartmentInput.value = '';
    }
    if (shiftBreakMinutesInput) {
      shiftBreakMinutesInput.value = '0';
    }
    if (shiftBreakIncludedInput) {
      shiftBreakIncludedInput.checked = false;
    }
    renderAll();
  });
}

function renderShiftDepartmentOptions() {
  if (!shiftDepartmentInput) {
    return;
  }

  const previous = cleanStoredValue(shiftDepartmentInput.value);
  shiftDepartmentInput.innerHTML = '';

  const globalOption = document.createElement('option');
  globalOption.value = '';
  globalOption.textContent = 'Всички отдели (global)';
  shiftDepartmentInput.appendChild(globalOption);

  state.departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    shiftDepartmentInput.appendChild(option);
  });

  const hasPrevious = state.departments.some((department) => department.id === previous);
  shiftDepartmentInput.value = hasPrevious ? previous : '';

  if (shiftImportDepartmentInput) {
    const importPrev = cleanStoredValue(shiftImportDepartmentInput.value);
    shiftImportDepartmentInput.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Изберете отдел';
    shiftImportDepartmentInput.appendChild(placeholder);
    state.departments.forEach((department) => {
      const option = document.createElement('option');
      option.value = department.id;
      option.textContent = department.name;
      shiftImportDepartmentInput.appendChild(option);
    });
    const hasImportPrev = state.departments.some((department) => department.id === importPrev);
    shiftImportDepartmentInput.value = hasImportPrev ? importPrev : '';
  }
}

function renderShiftImportPreview(payload) {
  if (!shiftImportPreview || !shiftImportSummary) {
    return;
  }

  if (!payload) {
    shiftImportSummary.textContent = '';
    shiftImportPreview.innerHTML = '';
    return;
  }

  const invalidCount = Array.isArray(payload.invalid_rows) ? payload.invalid_rows.length : 0;
  const duplicatesCount = Array.isArray(payload.duplicates) ? payload.duplicates.length : 0;
  shiftImportSummary.textContent = `Общо: ${payload.total_rows || 0} • За създаване: ${payload.valid_rows || 0} • Невалидни: ${invalidCount} • Дубликати: ${duplicatesCount}`;

  const rows = [];
  (payload.to_create || []).forEach((item) => {
    rows.push({
      status: 'valid',
      rowIndex: item.rowIndex,
      message: 'OK',
      row: item.normalizedRow,
    });
  });
  (payload.invalid_rows || []).forEach((item) => {
    rows.push({
      status: 'invalid',
      rowIndex: item.rowIndex,
      message: (item.errors || []).join('; '),
      row: item.row,
    });
  });
  (payload.duplicates || []).forEach((item) => {
    rows.push({
      status: 'duplicate',
      rowIndex: item.rowIndex,
      message: `${item.reason}${item.existingShiftId ? ` (#${item.existingShiftId})` : ''}`,
      row: item.row,
    });
  });

  rows.sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>Row</th><th>Status</th><th>Детайл</th><th>Данни</th></tr>';
  rows.forEach((item) => {
    const tr = document.createElement('tr');
    const statusLabel = item.status === 'valid' ? 'Valid' : (item.status === 'invalid' ? 'Invalid' : 'Duplicate');
    tr.className = `shift-import-${item.status}`;
    tr.innerHTML = `<td>${item.rowIndex || '-'}</td><td>${statusLabel}</td><td>${item.message}</td><td><pre>${JSON.stringify(item.row || {}, null, 2)}</pre></td>`;
    table.appendChild(tr);
  });

  shiftImportPreview.innerHTML = '';
  shiftImportPreview.appendChild(table);
}

function downloadShiftImportTemplate() {
  const sample = [
    'name,code,start_time,end_time,break_minutes,break_included',
    'Дневна,,08:00,17:00,60,false',
    'Дневна 12,,07:00,19:00,60,true',
    'Нощна 12,,19:00,07:00,60,true',
  ].join('\n');
  const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shift-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvToRows(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [];
  }

  const parseLine = (line) => {
    const out = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

async function parseShiftImportFile(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCsvToRows(text);
  }

  if (name.endsWith('.xlsx')) {
    await ensureXlsxLibrary();
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      return [];
    }
    return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
  }

  throw new Error('Неподдържан файл. Използвайте CSV или XLSX.');
}

async function ensureXlsxLibrary() {
  if (window.XLSX) {
    return;
  }

  const sources = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];

  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Неуспешно зареждане на XLSX библиотека.'));
        document.head.appendChild(script);
      });
      if (window.XLSX) {
        return;
      }
    } catch {
      // try next CDN
    }
  }

  throw new Error('XLSX parser не е наличен. Използвайте CSV или осигурете достъп до CDN.');
}

function attachShiftImportControls() {
  if (!shiftImportPreviewBtn || !shiftImportCommitBtn || !downloadShiftImportTemplateBtn) {
    return;
  }

  downloadShiftImportTemplateBtn.addEventListener('click', downloadShiftImportTemplate);

  shiftImportPreviewBtn.addEventListener('click', async () => {
    const departmentId = cleanStoredValue(shiftImportDepartmentInput?.value);
    if (!departmentId) {
      setStatus('Изберете отдел за импорт.', false);
      return;
    }
    if (!shiftImportFileInput?.files?.length) {
      setStatus('Изберете CSV/XLSX файл.', false);
      return;
    }

    let rows = [];
    try {
      rows = await parseShiftImportFile(shiftImportFileInput.files[0]);
    } catch (error) {
      setStatus(error.message || 'Грешка при четене на файла.', false);
      return;
    }

    const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/shifts/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.message || 'Грешка при preview.', false);
      return;
    }

    lastShiftImportPreviewPayload = payload;
    renderShiftImportPreview(payload);
    setStatus('Preview е готов.', true);
  });

  shiftImportCommitBtn.addEventListener('click', async () => {
    const departmentId = cleanStoredValue(shiftImportDepartmentInput?.value);
    if (!departmentId) {
      setStatus('Изберете отдел за commit.', false);
      return;
    }
    const toCreate = (lastShiftImportPreviewPayload?.to_create || []).map((entry) => entry.normalizedRow);
    const mode = shiftImportUpdateDuplicatesInput?.checked ? 'updateDuplicates' : 'skipDuplicates';

    const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/shifts/import/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toCreate, mode }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.message || 'Грешка при commit.', false);
      return;
    }

    setStatus(`Импорт приключи: +${payload.createdCount || 0}, обновени ${payload.updatedCount || 0}, пропуснати ${payload.skippedCount || 0}.`, true);
    await loadFromBackend();
    renderAll();
  });
}

function attachLockAndExport() {
  lockScheduleBtn.addEventListener('click', async () => {
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    const response = await apiFetch(`/api/schedules/${active.id}/lock`, { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus(payload.message || 'Неуспешно заключване.', false);
      return;
    }
    await refreshMonthlyView();
    renderSchedule();
  });

  unlockScheduleBtn.addEventListener('click', async () => {
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    const response = await apiFetch(`/api/schedules/${active.id}/unlock`, { method: 'POST' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatus(payload.message || 'Неуспешно отключване.', false);
      return;
    }
    await refreshMonthlyView();
    renderSchedule();
  });

  exportExcelBtn.addEventListener('click', async () => {
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    await downloadScheduleFile(active.id, 'xlsx');
  });

  exportPdfBtn.addEventListener('click', async () => {
    const active = getActiveSchedule();
    if (!active) {
      return;
    }
    await downloadScheduleFile(active.id, 'pdf');
  });
}

generateBtn.addEventListener('click', async () => {
  state.month = monthPicker.value || todayMonth();
  persistScheduleReviewPreferences();
  saveScheduleLocal();
  await refreshMonthlyView();
  renderAll();
});

monthPicker.addEventListener('change', async () => {
  state.month = monthPicker.value || todayMonth();
  persistScheduleReviewPreferences();
  saveScheduleLocal();
  await refreshMonthlyView();
  renderAll();
});

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const firstName = (firstNameInput?.value || '').trim();
  const middleName = (middleNameInput?.value || '').trim();
  const lastName = (lastNameInput?.value || '').trim();

  const enteredVacationAllowance = Number(vacationAllowanceInput.value);
  const hasTelk = Boolean(telkInput?.checked);
  const hasYoungWorkerBenefit = Boolean(youngWorkerInput?.checked);
  const isSirv = Boolean(employeeIsSirvInput?.checked);
  const allowedSirvPeriods = new Set([1, 2, 3, 4]);
  const parsedSirvPeriod = Number(employeeSirvPeriodInput?.value || 1);
  const sirvPeriodMonths = allowedSirvPeriods.has(parsedSirvPeriod) ? parsedSirvPeriod : 1;

  const employee = {
    id: createEmployeeId(),
    name: `${firstName} ${middleName} ${lastName}`.trim(),
    department: null,
    departmentId: departmentInput.value || null,
    position: positionInput.value.trim(),
    egn: (egnInput?.value || '').trim(),
    startDate: (startDateInput?.value || '').trim(),
    endDate: (endDateInput?.value || '').trim() || null,
    vacationAllowance: enteredVacationAllowance,
    telk: hasTelk,
    youngWorkerBenefit: hasYoungWorkerBenefit,
    baseVacationAllowance: DEFAULT_BASE_VACATION_ALLOWANCE,
    isSirv,
    sirvPeriodMonths
  };

  if (!firstName || !middleName || !lastName || !employee.position || !/^\d{10}$/.test(employee.egn) || !Number.isFinite(enteredVacationAllowance) || enteredVacationAllowance < 0 || !isValidEmploymentDates(employee.startDate, employee.endDate)) {
    return;
  }

  const { targetYear, allowance: proportionalAllowance } = getVacationAllowancePreviewData(DEFAULT_BASE_VACATION_ALLOWANCE, hasTelk, hasYoungWorkerBenefit, employee.startDate);
  const enteredTotalAllowance = enteredVacationAllowance;
  if (enteredTotalAllowance !== proportionalAllowance) {
    const confirmed = window.confirm(`Въведеният отпуск (${enteredTotalAllowance} дни) е различен от полагаемия за ${targetYear} г. (${proportionalAllowance} дни). Искате ли да продължите?`);
    if (!confirmed) {
      return;
    }
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
  vacationAllowanceInput.value = DEFAULT_BASE_VACATION_ALLOWANCE;
  if (telkInput) {
    telkInput.checked = false;
  }
  if (youngWorkerInput) {
    youngWorkerInput.checked = false;
  }
  if (employeeIsSirvInput) {
    employeeIsSirvInput.checked = false;
  }
  if (employeeSirvPeriodInput) {
    employeeSirvPeriodInput.value = '1';
  }
  toggleEmployeeSirvPeriod();
  if (startDateInput) {
    startDateInput.value = '';
  }
  updateVacationAllowanceHint();
  if (endDateInput) {
    endDateInput.value = '';
  }
  renderAll();
});

startDateInput?.addEventListener('change', updateVacationAllowanceHint);
telkInput?.addEventListener('change', updateVacationAllowanceHint);
youngWorkerInput?.addEventListener('change', updateVacationAllowanceHint);
function toggleEmployeeSirvPeriod() {
  if (!employeeSirvPeriodField) {
    return;
  }
  const active = Boolean(employeeIsSirvInput?.checked);
  employeeSirvPeriodField.classList.toggle('hidden', !active);
}
employeeIsSirvInput?.addEventListener('change', toggleEmployeeSirvPeriod);
toggleEmployeeSirvPeriod();
updateVacationAllowanceHint();

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

function calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit, startDate, year = Number((state.month || todayMonth()).split('-')[0])) {
  const normalizedBase = Number(baseVacationAllowance);
  if (!Number.isFinite(normalizedBase)) {
    return 0;
  }

  return normalizedBase + getExtraVacationDays(hasTelk, hasYoungWorkerBenefit);
}

function calculateProportionalVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit, startDate, year = Number((state.month || todayMonth()).split('-')[0])) {
  const fullAllowance = calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit);
  const normalizedYear = Number.isFinite(Number(year)) ? Number(year) : new Date().getFullYear();
  const proportion = getEmploymentYearProportion(startDate, normalizedYear);
  return roundVacationDays(fullAllowance * proportion);
}

function roundVacationDays(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value);
}

function getEmploymentYearProportion(startDate, year) {
  const normalizedStart = normalizeDateOnly(startDate);
  if (!normalizedStart) {
    return 1;
  }

  const employmentStart = new Date(`${normalizedStart}T00:00:00`);
  if (Number.isNaN(employmentStart.getTime())) {
    return 1;
  }

  if (employmentStart.getFullYear() !== year) {
    return employmentStart.getFullYear() > year ? 0 : 1;
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const totalDaysInYear = Math.floor((yearEnd - yearStart) / (24 * 60 * 60 * 1000)) + 1;
  const activeDays = Math.floor((yearEnd - employmentStart) / (24 * 60 * 60 * 1000)) + 1;

  if (activeDays <= 0) {
    return 0;
  }

  return Math.min(activeDays / totalDaysInYear, 1);
}

function getVacationAllowanceForYear(employee, year) {
  return calculateProportionalVacationAllowance(
    resolveBaseVacationAllowance(employee),
    Boolean(employee?.telk),
    Boolean(employee?.youngWorkerBenefit),
    employee?.startDate,
    year
  );
}

function getVacationAllowancePreviewData(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit, startDate) {
  const startYear = Number((normalizeDateOnly(startDate) || '').slice(0, 4));
  const targetYear = Number.isFinite(startYear) ? startYear : new Date().getFullYear();
  const allowance = calculateProportionalVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit, startDate, targetYear);
  return { targetYear, allowance };
}

function updateVacationAllowanceHint() {
  if (!vacationAllowanceHint) {
    return;
  }

  const baseVacationAllowance = DEFAULT_BASE_VACATION_ALLOWANCE;
  const hasTelk = Boolean(telkInput?.checked);
  const hasYoungWorkerBenefit = Boolean(youngWorkerInput?.checked);
  const startDate = (startDateInput?.value || '').trim();
  const { targetYear, allowance } = getVacationAllowancePreviewData(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit, startDate);

  vacationAllowanceHint.textContent = `Полагаем за ${targetYear}: ${allowance} дни`;
}


function isWorkingDateInputValue(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return false;
  }

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return !isWeekend(date) && !isOfficialHoliday(date);
}

function updateVacationDateInputValidity(input, options = {}) {
  if (!input) {
    return true;
  }

  const value = (input.value || '').trim();
  if (!value) {
    input.setCustomValidity('');
    return false;
  }

  const isWorkingDay = isWorkingDateInputValue(value);
  if (!isWorkingDay) {
    input.setCustomValidity('Не може да се избира почивен или празничен ден за начало на отпуск.');
    if (options.showStatus) {
      setStatus('Не може да се пусне отпуск за почивен или празничен ден.', false);
    }
    return false;
  }

  input.setCustomValidity('');
  return true;
}


function getVacationDateKeysInRange(startDateKey, endDateKey) {
  const start = new Date(`${startDateKey}T00:00:00`);
  const end = new Date(`${endDateKey}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current) && !isOfficialHoliday(current)) {
      dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`);
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function hasVacationRecordedOnDate(employeeId, dateKey) {
  const normalized = normalizeDateOnly(dateKey);
  if (!normalized) {
    return false;
  }

  const [year, month, day] = normalized.split('-');
  const monthKey = `${year}-${month}`;
  const dayNumber = Number(day);
  if (!Number.isFinite(dayNumber)) {
    return false;
  }

  if (state.schedule[scheduleKey(employeeId, monthKey, dayNumber)] === 'O') {
    return true;
  }

  const scheduleById = new Map(state.schedules.map((schedule) => [String(schedule.id), schedule]));
  const activeSchedule = getActiveSchedule();

  return Object.entries(state.scheduleEntriesById).some(([entryKey, code]) => {
    if (code !== 'O') {
      return false;
    }

    const [scheduleId, entryEmployeeId, dayPart] = entryKey.split('|');
    if (entryEmployeeId !== employeeId || Number(dayPart) !== dayNumber) {
      return false;
    }

    const schedule = scheduleById.get(String(scheduleId));
    const entryMonthKey = schedule?.month_key
      || (activeSchedule && String(activeSchedule.id) === String(scheduleId) ? state.month : '');

    return entryMonthKey === monthKey;
  });
}

function hasVacationInDates(employeeId, dates, options = {}) {
  const ignoredSet = new Set(Array.isArray(options.ignoreDateKeys) ? options.ignoreDateKeys : []);
  return dates.some((date) => {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (ignoredSet.has(dateKey)) {
      return false;
    }
    return hasVacationRecordedOnDate(employeeId, dateKey);
  });
}

function getWorkingVacationDates(startDate, workingDays) {
  const dates = [];
  const current = new Date(startDate);
  let remaining = Number(workingDays);

  while (remaining > 0) {
    if (!isWeekend(current) && !isOfficialHoliday(current)) {
      dates.push(new Date(current));
      remaining -= 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function resolveBaseVacationAllowance(employee) {
  const explicitBase = Number(employee?.baseVacationAllowance);
  if (Number.isFinite(explicitBase) && explicitBase >= 0) {
    return explicitBase;
  }

  const total = Number(employee?.vacationAllowance);
  if (!Number.isFinite(total)) {
    return DEFAULT_BASE_VACATION_ALLOWANCE;
  }

  return Math.max(0, total - getExtraVacationDays(Boolean(employee?.telk), Boolean(employee?.youngWorkerBenefit)));
}

function renderAll() {
  renderShiftDepartmentOptions();
  renderEmployees();
  renderSchedule();
  renderVacationEmployeeOptions();
  renderLeavesPanel();
  renderVacationDepartmentFilterOptions();
  renderVacationLedger();
  renderPlatformUserEmployeeOptions();
  renderShiftList();
  renderLegend();
  renderGeneratorControls();
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

async function loadPlatformUsers() {
  if (!platformUsersList) {
    return;
  }

  if (!state.backendAvailable) {
    state.platformUsers = [];
    renderPlatformUsersList();
    return;
  }

  const tenantId = resolveTenantIdForPlatformUserCreate();
  if (state.currentUser?.is_super_admin === true && !isValidUuid(tenantId)) {
    state.platformUsers = [];
    renderPlatformUsersList();
    return;
  }

  const query = state.currentUser?.is_super_admin === true
    ? `?tenantId=${encodeURIComponent(tenantId)}`
    : '';

  const payload = await apiRequest(`/api/platform/users${query}`, { method: 'GET' });
  state.platformUsers = Array.isArray(payload.users) ? payload.users : [];
  renderPlatformUsersList();
}

function roleLabelForPlatform(role) {
  if (role === 'owner') {
    return 'Собственик';
  }
  if (role === 'admin') {
    return 'Администратор';
  }
  if (role === 'owner') {
    return 'Собственик';
  }
  if (role === 'manager') {
    return 'Мениджър';
  }
  return 'Потребител';
}

function renderPlatformUsersList() {
  if (!platformUsersList) {
    return;
  }

  platformUsersList.innerHTML = '';

  if (!state.platformUsers.length) {
    platformUsersList.innerHTML = '<div class="employee-item"><small>Няма добавени потребители за тази фирма.</small></div>';
    return;
  }

  state.platformUsers.forEach((user) => {
    const row = document.createElement('div');
    row.className = 'employee-item employee-item--top';

    const isActive = user.isActive !== false;

    const details = document.createElement('div');
    const nameStrong = document.createElement('strong');
    nameStrong.textContent = user.fullName || user.email || 'Потребител';
    const emailSmall = document.createElement('small');
    emailSmall.textContent = user.email || '—';
    const metaSmall = document.createElement('small');
    metaSmall.innerHTML = `Роля: <b>${roleLabelForPlatform(user.role)}</b> | Статус: <b>${isActive ? 'Активен' : 'Спрян'}</b>`;
    details.append(nameStrong, document.createElement('br'), emailSmall, document.createElement('br'), metaSmall);
    row.appendChild(details);

    const controls = document.createElement('div');
    controls.className = 'employee-actions';

    const roleSelect = document.createElement('select');
    roleSelect.innerHTML = '<option value="admin">Администратор</option><option value="manager">Мениджър</option><option value="user">Потребител</option>';
    roleSelect.value = ['admin', 'manager', 'user'].includes(user.role) ? user.role : 'user';

    const isOwner = user.role === 'owner';
    if (isOwner) {
      roleSelect.value = 'admin';
      roleSelect.disabled = true;
    }

    const saveRoleBtn = document.createElement('button');
    saveRoleBtn.type = 'button';
    saveRoleBtn.className = 'btn-edit';
    saveRoleBtn.textContent = 'Промени роля';
    if (isOwner) {
      saveRoleBtn.disabled = true;
      saveRoleBtn.title = 'Собственикът не може да бъде понижен.';
    }
    saveRoleBtn.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/platform/users/${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: roleSelect.value, isActive }),
        });
        await loadPlatformUsers();
        setStatus('Ролята е обновена успешно.', true);
      } catch (error) {
        setStatus(`Грешка при промяна на роля: ${error.message}`, false);
      }
    });

    const toggleAccessBtn = document.createElement('button');
    toggleAccessBtn.type = 'button';
    toggleAccessBtn.className = isActive ? 'btn-delete' : 'btn-add';
    toggleAccessBtn.textContent = isActive ? 'Спри достъп' : 'Активирай';
    if (isOwner) {
      toggleAccessBtn.disabled = true;
      toggleAccessBtn.title = 'Собственикът винаги има достъп.';
    }
    toggleAccessBtn.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/platform/users/${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: roleSelect.value, isActive: !isActive }),
        });
        await loadPlatformUsers();
        setStatus('Статусът на потребителя е обновен.', true);
      } catch (error) {
        setStatus(`Грешка при промяна на статус: ${error.message}`, false);
      }
    });

    controls.append(roleSelect, saveRoleBtn, toggleAccessBtn);
    row.appendChild(controls);
    platformUsersList.appendChild(row);
  });
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
  const activeSchedule = getActiveSchedule();
  const activeScheduleId = cleanStoredValue(activeSchedule?.id);
  const legendShifts = activeScheduleId && Array.isArray(state.scheduleShiftTemplatesById[activeScheduleId])
    ? state.scheduleShiftTemplatesById[activeScheduleId]
    : state.shiftTemplates;

  legendShifts.forEach((shift) => {
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
  table.innerHTML = '<tr><th>Код</th><th>Име</th><th>Отдел</th><th>Начало</th><th>Край</th><th>Часове</th><th>Тип</th><th>Действие</th></tr>';
  const departmentNameById = new Map((state.departments || []).map((department) => [department.id, department.name]));

  const shiftFilter = cleanStoredValue(shiftListDepartmentFilter?.value) || 'all';
  const visibleShifts = state.shiftTemplates.filter((shift) => {
    if (shiftFilter === 'all') return true;
    if (shiftFilter === 'global') return !cleanStoredValue(shift.departmentId);
    return cleanStoredValue(shift.departmentId) === shiftFilter;
  });

  visibleShifts.forEach((shift) => {
    const row = document.createElement('tr');
    const departmentLabel = shift.departmentId ? (departmentNameById.get(shift.departmentId) || 'Неизвестен отдел') : 'Global';
    row.innerHTML = `<td>${shift.code}</td><td>${shift.name}</td><td>${departmentLabel}</td><td>${shift.start || '-'}</td><td>${shift.end || '-'}</td><td>${shift.hours}</td><td>${shift.type}</td>`;

    const actionCell = document.createElement('td');
    if (shift.locked) {
      actionCell.textContent = 'Системна';
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Изтрий';
      removeBtn.className = 'btn-delete';
      removeBtn.addEventListener('click', async () => {
        state.shiftTemplates = state.shiftTemplates.filter((entry) => !(entry.code === shift.code && cleanStoredValue(entry.departmentId) === cleanStoredValue(shift.departmentId)));
        saveShiftTemplates();
        await deleteShiftTemplateBackend(shift.code, shift.departmentId || null);
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

function toggleEditEmployeeSirvPeriod() {
  if (!editEmployeeSirvPeriodField) {
    return;
  }
  const isSirvEnabled = Boolean(editEmployeeIsSirvInput?.checked);
  editEmployeeSirvPeriodField.classList.toggle('hidden', !isSirvEnabled);
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
    const isSirv = Boolean(editEmployeeIsSirvInput?.checked);
    const allowedSirvPeriods = new Set([1, 2, 3, 4]);
    const parsedSirvPeriod = Number(editEmployeeSirvPeriodInput?.value || 1);
    const sirvPeriodMonths = allowedSirvPeriods.has(parsedSirvPeriod) ? parsedSirvPeriod : 1;
    const startDate = (editStartDateInput?.value || '').trim();
    const vacationAllowance = calculateVacationAllowance(baseVacationAllowance, hasTelk, hasYoungWorkerBenefit);
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
        is_sirv: isSirv,
        sirv_period_months: sirvPeriodMonths,
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
            baseVacationAllowance,
            isSirv,
            sirvPeriodMonths
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

  editEmployeeIsSirvInput?.addEventListener('change', toggleEditEmployeeSirvPeriod);
  toggleEditEmployeeSirvPeriod();

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
  if (editEmployeeIsSirvInput) {
    editEmployeeIsSirvInput.checked = Boolean(employee.isSirv);
  }
  if (editEmployeeSirvPeriodInput) {
    editEmployeeSirvPeriodInput.value = String(Number(employee.sirvPeriodMonths || 1) || 1);
  }
  toggleEditEmployeeSirvPeriod();

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
  if (editEmployeeSirvPeriodInput) {
    editEmployeeSirvPeriodInput.value = '1';
  }
  toggleEditEmployeeSirvPeriod();
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
    const allowanceYear = Number((state.month || todayMonth()).split('-')[0]);
    const allowanceForYear = getVacationAllowanceForYear(employee, allowanceYear);
    details.innerHTML = `<b>${employee.name}</b><br>ЕГН: ${employee.egn || '-'}<br>${employee.department} • ${employee.position}<br>Период: ${employmentRange}<br>Полагаем отпуск (${allowanceYear}): ${allowanceForYear} дни${employee.telk ? ' (ТЕЛК)' : ''}${employee.youngWorkerBenefit ? ' (16-18 с разрешение)' : ''}`;

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


function getVacationLedgerFilteredEmployees() {
  const selectedDepartment = (state.vacationLedgerDepartmentFilter || 'all').trim();
  const searchQuery = (state.vacationLedgerSearchQuery || '').trim().toLowerCase();

  return state.employees.filter((employee) => {
    if (selectedDepartment !== 'all' && employee.departmentId !== selectedDepartment) {
      return false;
    }

    if (searchQuery && !String(employee.name || '').toLowerCase().includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function renderVacationDepartmentFilterOptions() {
  if (!vacationDepartmentFilterSelect) {
    return;
  }

  const previousValue = state.vacationLedgerDepartmentFilter || 'all';
  vacationDepartmentFilterSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Всички отдели';
  vacationDepartmentFilterSelect.appendChild(allOption);

  state.departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    vacationDepartmentFilterSelect.appendChild(option);
  });

  const hasCurrent = previousValue === 'all' || state.departments.some((department) => department.id === previousValue);
  state.vacationLedgerDepartmentFilter = hasCurrent ? previousValue : 'all';
  vacationDepartmentFilterSelect.value = state.vacationLedgerDepartmentFilter;
  if (vacationSearchInput) {
    vacationSearchInput.value = state.vacationLedgerSearchQuery || '';
  }
}

function attachVacationFilters() {
  if (vacationDepartmentFilterSelect) {
    vacationDepartmentFilterSelect.addEventListener('change', () => {
      state.vacationLedgerDepartmentFilter = vacationDepartmentFilterSelect.value || 'all';
      renderVacationEmployeeOptions();
      renderVacationLedger();
    });
  }

  if (vacationSearchInput) {
    vacationSearchInput.addEventListener('input', () => {
      state.vacationLedgerSearchQuery = (vacationSearchInput.value || '').trim();
      renderVacationEmployeeOptions();
      renderVacationLedger();
    });
  }
}

function renderVacationEmployeeOptions() {
  vacationEmployeeSelect.innerHTML = '';
  const employees = getVacationLedgerFilteredEmployees();
  if (!employees.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Няма служители';
    vacationEmployeeSelect.appendChild(option);
    return;
  }

  employees.forEach((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = `${employee.name} (${employee.department || 'Без отдел'})`;
    vacationEmployeeSelect.appendChild(option);
  });
}



function renderLeavesPanel() {
  if (!leaveEmployeeSelect || !leaveTypeSelect || !leaveList) {
    return;
  }

  const employees = getVacationLedgerFilteredEmployees();
  leaveEmployeeSelect.innerHTML = employees.map((employee) => `<option value="${employee.id}">${employee.name}</option>`).join('') || '<option value="">Няма служители</option>';
  leaveTypeSelect.innerHTML = (state.leaveTypes || []).map((type) => `<option value="${type.id}">${type.name}</option>`).join('') || '<option value="">Няма типове</option>';

  const canManage = canManageLeaves();
  [leaveEmployeeSelect, leaveTypeSelect, leaveFromInput, leaveToInput, leaveMinutesInput, addLeaveBtn].forEach((el) => {
    if (el) {
      el.disabled = !canManage;
    }
  });

  const month = state.month || todayMonth();
  const rows = (state.leaves || []).filter((leave) => String(leave.date_from || '').startsWith(month) || String(leave.date_to || '').startsWith(month));
  if (!rows.length) {
    leaveList.innerHTML = '<small>Няма отсъствия за избрания месец.</small>';
    return;
  }

  leaveList.innerHTML = rows.map((leave) => {
    const employee = state.employees.find((entry) => entry.id === leave.employee_id);
    const canDelete = canManage ? `<button type="button" class="btn-delete leave-delete-btn" data-leave-id="${leave.id}">Изтрий</button>` : '';
    return `<div class="schedule-list-item"><strong>${employee?.name || leave.employee_id}</strong> • ${leave.leave_type?.name || leave.leave_type_name || leave.leave_type_code || 'Отсъствие'} • ${leave.date_from} → ${leave.date_to} ${canDelete}</div>`;
  }).join('');

  leaveList.querySelectorAll('.leave-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const response = await apiFetch(`/api/leaves/${btn.dataset.leaveId}`, { method: 'DELETE' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || 'Неуспешно изтриване');
        }
        await refreshMonthlyView();
        renderAll();
      } catch (error) {
        setStatus(error.message, false);
      }
    });
  });
}

function attachLeavesControls() {
  if (!addLeaveBtn) {
    return;
  }

  addLeaveBtn.addEventListener('click', async () => {
    if (!canManageLeaves()) {
      setStatus('Нямате права за добавяне на отсъствия.', false);
      return;
    }
    const body = {
      employee_id: leaveEmployeeSelect.value,
      leave_type_id: Number(leaveTypeSelect.value),
      date_from: leaveFromInput.value,
      date_to: leaveToInput.value,
      minutes_per_day: leaveMinutesInput.value ? Number(leaveMinutesInput.value) : null,
    };

    try {
      const response = await apiFetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Неуспешно добавяне на отсъствие');
      }
      await refreshMonthlyView();
      renderAll();
      setStatus('Отсъствието е добавено.', true);
    } catch (error) {
      setStatus(error.message, false);
    }
  });
}

function attachVacationDateValidationControls() {
  vacationStartInput?.addEventListener('input', () => {
    updateVacationDateInputValidity(vacationStartInput, { showStatus: false });
  });

  vacationStartInput?.addEventListener('change', () => {
    updateVacationDateInputValidity(vacationStartInput, { showStatus: true });
  });

  vacationCorrectionModalStartInput?.addEventListener('input', () => {
    updateVacationDateInputValidity(vacationCorrectionModalStartInput, { showStatus: false });
  });

  vacationCorrectionModalStartInput?.addEventListener('change', () => {
    updateVacationDateInputValidity(vacationCorrectionModalStartInput, { showStatus: true });
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
    const isWorkingStartDate = updateVacationDateInputValidity(vacationStartInput, { showStatus: true });
    const start = new Date(`${vacationStartInput.value}T00:00:00`);
    const requestedWorkingDays = Number(vacationDaysInput.value);

    if (!employeeId || !isWorkingStartDate || Number.isNaN(start.getTime()) || !Number.isInteger(requestedWorkingDays) || requestedWorkingDays < 1) {
      return;
    }

    const employee = state.employees.find((entry) => entry.id === employeeId);
    if (!employee) {
      return;
    }

    const year = Number((state.month || todayMonth()).split('-')[0]);
    const totalAllowance = getVacationAllowanceForYear(employee, year);
    const used = getVacationUsedForYear(employee.id, year);
    const remainingAllowance = totalAllowance - used;

    if (requestedWorkingDays > remainingAllowance) {
      setStatus(`Недостатъчен наличен отпуск. Остават ${remainingAllowance} дни.`, false);
      return;
    }

    const vacationDates = getWorkingVacationDates(start, requestedWorkingDays);
    if (hasVacationInDates(employee.id, vacationDates)) {
      setStatus('За избрания период вече има пуснат отпуск.', false);
      return;
    }

    const employeeStartDate = normalizeDateOnly(employee.startDate);
    const hasDatesBeforeEmployment = vacationDates.some((date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return !isDateWithinEmployment(employee, dateKey);
    });

    if (hasDatesBeforeEmployment) {
      const startText = employeeStartDate ? formatDateForDisplay(employeeStartDate) : 'валидната дата на назначение';
      setStatus(`Не може да пуснете отпуск за период преди назначение. Служителят е назначен от ${startText}.`, false);
      return;
    }

    const vacationByMonth = groupDatesByMonth(vacationDates);
    const backendPromises = [];

    for (const [monthKey, dates] of vacationByMonth.entries()) {
      let scheduleId = null;
      if (state.backendAvailable) {
        const schedule = await ensureScheduleForMonthAndDepartment(monthKey, resolveEmployeeDepartmentName(employee));
        scheduleId = schedule?.id || null;
      }

      dates.forEach((date) => {
        const day = date.getDate();
        const key = scheduleKey(employeeId, monthKey, day);
        state.schedule[key] = 'O';
        if (scheduleId) {
          state.scheduleEntriesById[`${scheduleId}|${employeeId}|${day}`] = 'O';
          backendPromises.push(saveScheduleEntryBackend({ ...employee, scheduleId }, day, 'O', { monthKey, scheduleId }));
        }
      });
    }

    saveScheduleLocal();
    await Promise.all(backendPromises);
    await refreshMonthlyView();
    renderAll();
    setStatus('Отпускът е маркиран успешно.', true);
  });
}



function resolveEmployeeDepartmentName(employee) {
  const direct = (employee?.department || '').trim();
  if (direct && direct !== 'Без отдел') {
    return direct;
  }

  const departmentId = employee?.departmentId || null;
  if (!departmentId) {
    return '';
  }

  const byId = state.departments.find((department) => department.id === departmentId);
  return byId ? String(byId.name || '').trim() : '';
}

function groupDatesByMonth(dates) {
  const byMonth = new Map();
  dates.forEach((date) => {
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey).push(date);
  });
  return byMonth;
}

async function ensureScheduleForMonthAndDepartment(monthKey, departmentName) {
  const department = (departmentName || '').trim();
  if (!department || department === 'Без отдел') {
    return null;
  }

  const existing = findScheduleByMonthAndDepartment(monthKey, department);
  if (existing) {
    return existing;
  }

  if (!state.backendAvailable) {
    return null;
  }

  const name = `График ${department} – ${monthKey}`;
  const response = await apiFetch('/api/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month_key: monthKey, department, name })
  });

  if (!response.ok) {
    let message = `Неуспешно автоматично създаване на график за ${monthKey}.`;
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore non-JSON responses
    }
    setStatus(message, false);
    return null;
  }

  const payload = await response.json();
  const created = payload.schedule || null;
  if (created?.id) {
    state.schedules.push(created);
  }
  return created;
}

function renderVacationLedger() {
  if (!state.employees.length) {
    vacationLedger.textContent = 'Добавете служители, за да следите отпуските.';
    return;
  }

  const year = Number((state.month || todayMonth()).split('-')[0]);
  const previousYear = year - 1;
  const filteredEmployees = getVacationLedgerFilteredEmployees();
  const hasCarryoverColumn = filteredEmployees.some((employee) => {
    const previousAllowance = getVacationAllowanceForYear(employee, previousYear);
    const previousUsed = getVacationUsedForYear(employee.id, previousYear);
    return Math.max(0, previousAllowance - previousUsed) > 0;
  });

  const table = document.createElement('table');
  const allowanceHeader = hasCarryoverColumn ? `Полагаем ${year}` : 'Полагаем';
  const carryoverHeader = hasCarryoverColumn ? `<th>Дни за ${previousYear}</th>` : '';
  table.innerHTML =
    `<tr><th>Служител</th>${carryoverHeader}<th>${allowanceHeader}</th><th>Използван за годината</th><th>Остатък</th></tr>`;

  if (!filteredEmployees.length) {
    vacationLedger.textContent = 'Няма служители по зададения филтър.';
    return;
  }

  filteredEmployees.forEach((employee) => {
    const used = getVacationUsedForYear(employee.id, year);
    const allowance = getVacationAllowanceForYear(employee, year);
    const previousAllowance = getVacationAllowanceForYear(employee, previousYear);
    const previousUsed = getVacationUsedForYear(employee.id, previousYear);
    const carryoverDays = hasCarryoverColumn ? Math.max(0, previousAllowance - previousUsed) : 0;
    const totalAllowanceForYear = allowance + carryoverDays;
    const tr = document.createElement('tr');

    const isExpanded = state.expandedVacationDossierEmployeeId === employee.id;
    tr.innerHTML = `
      <td>
        <button type="button" class="vacation-dossier-toggle" data-employee-id="${employee.id}" aria-expanded="${isExpanded}">${employee.name}</button>
      </td>
      ${hasCarryoverColumn ? `<td>${carryoverDays}</td>` : ''}
      <td>${allowance}</td>
      <td>${used}</td>
      <td>${totalAllowanceForYear - used}</td>
    `;
    table.appendChild(tr);

    if (isExpanded) {
      const detailRow = document.createElement('tr');
      detailRow.className = 'vacation-dossier-row';
      const ranges = getVacationRangesForYear(employee.id, year);
      const rows = ranges.length
        ? ranges.map(([start, end], index) => {
          const formattedStart = formatDateForDisplay(start);
          const formattedEnd = formatDateForDisplay(end);
          const period = start === end ? formattedStart : `${formattedStart} - ${formattedEnd}`;
          return `<tr><td>${index + 1}</td><td>${period}</td><td>${canManageVacationCorrections() ? `<button type="button" class="btn-edit vacation-period-correct-btn" data-employee-id="${employee.id}" data-range-start="${start}" data-range-end="${end}">Корекция</button>` : ''}${state.userRole === 'admin' ? ` <button type="button" class="btn-delete vacation-period-delete-btn" data-employee-id="${employee.id}" data-range-start="${start}" data-range-end="${end}">Изтрий</button>` : ''}${!canManageVacationCorrections() && state.userRole !== 'admin' ? '<span>-</span>' : ''}</td></tr>`;
        }).join('')
        : '<tr><td colspan="3">Няма записани отпуски за годината.</td></tr>';

      detailRow.innerHTML = `
        <td colspan="${hasCarryoverColumn ? 5 : 4}">
          <div class="vacation-dossier-wrap">
            <div class="vacation-dossier-title">Период отпуск</div>
            <table class="vacation-dossier-table">
              <tr><th>#</th><th>Период</th><th>Действие</th></tr>
              ${rows}
            </table>
          </div>
        </td>
      `;
      table.appendChild(detailRow);
    }
  });

  vacationLedger.innerHTML = '';
  vacationLedger.appendChild(table);

  vacationLedger.querySelectorAll('.vacation-dossier-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const employeeId = button.dataset.employeeId || '';
      state.expandedVacationDossierEmployeeId = state.expandedVacationDossierEmployeeId === employeeId ? null : employeeId;
      renderVacationLedger();
    });
  });

  vacationLedger.querySelectorAll('.vacation-period-correct-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!canManageVacationCorrections()) {
        setStatus('Корекцията на отпуск е позволена само за Мениджър и Администратор.', false);
        return;
      }

      const employeeId = button.dataset.employeeId || '';
      const rangeStart = button.dataset.rangeStart || '';
      const rangeEnd = button.dataset.rangeEnd || '';
      const employee = state.employees.find((entry) => entry.id === employeeId);
      if (!employee || !rangeStart || !rangeEnd) {
        setStatus('Липсват данни за корекция на периода отпуск.', false);
        return;
      }

      openVacationCorrectionModal(employee, rangeStart, rangeEnd);
    });
  });

  vacationLedger.querySelectorAll('.vacation-period-delete-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (state.userRole !== 'admin') {
        setStatus('Изтриването на период отпуск е позволено само за Администратор.', false);
        return;
      }

      const employeeId = button.dataset.employeeId || '';
      const rangeStart = button.dataset.rangeStart || '';
      const rangeEnd = button.dataset.rangeEnd || '';
      const employee = state.employees.find((entry) => entry.id === employeeId);
      if (!employee || !rangeStart || !rangeEnd) {
        setStatus('Липсват данни за изтриване на периода отпуск.', false);
        return;
      }

      const confirmed = window.confirm(`Да изтрия ли период ${formatDateForDisplay(rangeStart)} - ${formatDateForDisplay(rangeEnd)} за ${employee.name}?`);
      if (!confirmed) {
        return;
      }

      await setVacationShiftForDateRange(employee, rangeStart, rangeEnd, 'P', { ensureSchedule: false });
      await refreshMonthlyView();
      renderAll();
      setStatus('Периодът отпуск е изтрит успешно.', true);
    });
  });
}

function openVacationCorrectionModal(employee, rangeStart, rangeEnd) {
  if (!vacationCorrectionModal || !vacationCorrectionModalForm || !vacationCorrectionModalStartInput || !vacationCorrectionModalDaysInput) {
    return;
  }

  const defaultDays = getWorkingDaysBetween(rangeStart, rangeEnd);
  state.vacationCorrectionContext = {
    employeeId: employee.id,
    rangeStart,
    rangeEnd
  };

  vacationCorrectionModalStartInput.value = rangeStart;
  vacationCorrectionModalDaysInput.value = String(defaultDays || 1);
  if (vacationCorrectionModalInfo) {
    vacationCorrectionModalInfo.textContent = `Служител: ${employee.name} | Стар период: ${formatDateForDisplay(rangeStart)} - ${formatDateForDisplay(rangeEnd)}`;
  }
  vacationCorrectionModal.classList.remove('hidden');
}

function closeVacationCorrectionModal() {
  if (!vacationCorrectionModal || !vacationCorrectionModalForm) {
    return;
  }

  vacationCorrectionModalForm.reset();
  state.vacationCorrectionContext = null;
  vacationCorrectionModal.classList.add('hidden');
}

function attachVacationCorrectionModalControls() {
  if (!vacationCorrectionModal || !vacationCorrectionModalForm) {
    return;
  }

  vacationCorrectionModalForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!canManageVacationCorrections()) {
      setStatus('Корекцията на отпуск е позволена само за Мениджър и Администратор.', false);
      return;
    }

    const context = state.vacationCorrectionContext;
    if (!context) {
      closeVacationCorrectionModal();
      return;
    }

    const employee = state.employees.find((entry) => entry.id === context.employeeId);
    if (!employee) {
      setStatus('Служителят за корекция не е намерен.', false);
      closeVacationCorrectionModal();
      return;
    }

    const inputStart = (vacationCorrectionModalStartInput?.value || '').trim();
    const isWorkingStartDate = updateVacationDateInputValidity(vacationCorrectionModalStartInput, { showStatus: true });
    const inputDays = Number(vacationCorrectionModalDaysInput?.value);
    if (!inputStart || !isWorkingStartDate || !Number.isInteger(inputDays) || inputDays < 1) {
      setStatus('Невалидни данни за корекция на отпуск.', false);
      return;
    }

    await correctVacationPeriod(employee, context.rangeStart, context.rangeEnd, inputStart, inputDays);
    closeVacationCorrectionModal();
  });

  cancelVacationCorrectionModalBtn?.addEventListener('click', () => {
    closeVacationCorrectionModal();
  });

  vacationCorrectionModal.addEventListener('click', (event) => {
    if (event.target === vacationCorrectionModal) {
      closeVacationCorrectionModal();
    }
  });
}

function getWorkingDaysBetween(startDateKey, endDateKey) {
  const start = new Date(`${startDateKey}T00:00:00`);
  const end = new Date(`${endDateKey}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return 0;
  }

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current) && !isOfficialHoliday(current)) {
      count += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

async function setVacationShiftForDateRange(employee, startDateKey, endDateKey, shiftCode, options = {}) {
  const start = new Date(`${startDateKey}T00:00:00`);
  const end = new Date(`${endDateKey}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return { updated: 0, skipped: 0 };
  }

  const backendPromises = [];
  let updated = 0;
  let skipped = 0;
  const current = new Date(start);

  while (current <= end) {
    if (!isWeekend(current) && !isOfficialHoliday(current)) {
      const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      if (isMonthLocked(monthKey)) {
        skipped += 1;
      } else {
        const day = current.getDate();
        const key = scheduleKey(employee.id, monthKey, day);
        state.schedule[key] = shiftCode;

        let scheduleId = null;
        if (options.ensureSchedule === true && shiftCode === 'O') {
          const schedule = await ensureScheduleForMonthAndDepartment(monthKey, resolveEmployeeDepartmentName(employee));
          scheduleId = schedule?.id || null;
        } else {
          const schedule = findScheduleByMonthAndDepartment(monthKey, resolveEmployeeDepartmentName(employee));
          scheduleId = schedule?.id || null;
        }

        if (scheduleId) {
          state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] = shiftCode;
          backendPromises.push(saveScheduleEntryBackend({ ...employee, scheduleId }, day, shiftCode, { monthKey, scheduleId }));
        }
        updated += 1;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  saveScheduleLocal();
  await Promise.all(backendPromises);
  return { updated, skipped };
}

async function setShiftForCell({ employee, day, month, shiftCode }) {
  const monthKey = month || state.month || todayMonth();
  const localKey = scheduleKey(employee.id, monthKey, day);
  state.schedule[localKey] = shiftCode;
  saveScheduleLocal();

  const scheduleId = getEmployeeScheduleId(employee);
  if (!scheduleId) {
    return;
  }

  state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] = shiftCode;
  await saveScheduleEntryBackend({ ...employee, scheduleId }, day, shiftCode, { monthKey, scheduleId });
}

async function correctVacationPeriod(employee, oldStartDateKey, oldEndDateKey, newStartDateKey, newWorkingDays) {
  if (!canManageVacationCorrections()) {
    setStatus('Корекцията на отпуск е позволена само за Мениджър и Администратор.', false);
    return;
  }

  const newStart = new Date(`${newStartDateKey}T00:00:00`);
  if (Number.isNaN(newStart.getTime()) || !Number.isInteger(newWorkingDays) || newWorkingDays < 1) {
    setStatus('Невалидни данни за корекция на отпуск.', false);
    return;
  }

  const newDates = getWorkingVacationDates(newStart, newWorkingDays);
  const ignoredDateKeys = getVacationDateKeysInRange(oldStartDateKey, oldEndDateKey);
  if (hasVacationInDates(employee.id, newDates, { ignoreDateKeys: ignoredDateKeys })) {
    setStatus('За новия период вече има пуснат отпуск.', false);
    return;
  }

  const employeeStartDate = normalizeDateOnly(employee.startDate);
  const hasDatesBeforeEmployment = newDates.some((date) => {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return !isDateWithinEmployment(employee, dateKey);
  });

  if (hasDatesBeforeEmployment) {
    const startText = employeeStartDate ? formatDateForDisplay(employeeStartDate) : 'валидната дата на назначение';
    setStatus(`Не може да пуснете отпуск за период преди назначение. Служителят е назначен от ${startText}.`, false);
    return;
  }

  const oldResult = await setVacationShiftForDateRange(employee, oldStartDateKey, oldEndDateKey, 'P', { ensureSchedule: false });
  const newRanges = groupDatesByMonth(newDates);

  let inserted = 0;
  let skipped = oldResult.skipped;
  for (const [, dates] of newRanges.entries()) {
    if (!dates.length) {
      continue;
    }
    const rangeStart = `${dates[0].getFullYear()}-${String(dates[0].getMonth() + 1).padStart(2, '0')}-${String(dates[0].getDate()).padStart(2, '0')}`;
    const last = dates[dates.length - 1];
    const rangeEnd = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    const result = await setVacationShiftForDateRange(employee, rangeStart, rangeEnd, 'O', { ensureSchedule: true });
    inserted += result.updated;
    skipped += result.skipped;
  }

  await refreshMonthlyView();
  renderAll();
  if (!inserted) {
    setStatus('Няма приложена корекция (възможно е месеците да са заключени).', false);
    return;
  }

  const skippedText = skipped > 0 ? ` Пропуснати дни (заключен месец): ${skipped}.` : '';
  setStatus(`Периодът е коригиран успешно.${skippedText}`, true);
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
  if (employee?.scheduleId) {
    return employee.scheduleId;
  }

  const employeeDepartmentId = employee?.departmentId || null;
  const employeeDepartment = String(employee?.department || '').trim();

  if (state.activeScheduleId) {
    const active = state.schedules.find((schedule) => schedule.id === state.activeScheduleId);
    if (active) {
      return active.id;
    }
  }

  const selectedSchedules = state.schedules.filter((schedule) => state.selectedScheduleIds.includes(schedule.id));
  if (!selectedSchedules.length) {
    return null;
  }

  if (selectedSchedules.length === 1) {
    return selectedSchedules[0].id;
  }

  const byDepartmentId = selectedSchedules.find((schedule) => {
    if (!employeeDepartmentId) {
      return false;
    }
    const department = state.departments.find((item) => item.id === employeeDepartmentId);
    return department && String(schedule.department || '').trim() === String(department.name || '').trim();
  });
  if (byDepartmentId) {
    return byDepartmentId.id;
  }

  const byDepartmentName = selectedSchedules.find((schedule) => String(schedule.department || '').trim() === employeeDepartment);
  return byDepartmentName?.id || selectedSchedules[0].id || null;
}

function getShiftCodeForCell(employee, month, day) {
  const localValue = state.schedule[scheduleKey(employee.id, month, day)] || 'P';
  const scheduleId = getEmployeeScheduleId(employee);
  if (scheduleId) {
    return state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] || localValue;
  }

  return localValue;
}

function renderEmployeeScheduleRow({ employee, year, monthIndex, month, totalDays, monthLocked, visibleSummaryColumns, totals, employeeSnapshotTotalsList }) {
  const row = document.createElement('tr');
  const nameCell = document.createElement('td');
  nameCell.className = 'sticky';
  nameCell.innerHTML = `<b>${employee.name}</b><br><small>${employee.department || 'Без отдел'} • ${employee.position || '—'}</small>`;
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
  const snapshotEntriesByDay = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const inEmployment = isEmployeeActiveOnDay(employee, year, monthIndex, day);
    const currentShift = getShiftCodeForCell(employee, month, day);
    const date = new Date(year, monthIndex - 1, day);
    const dateISO = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holidayMeta = getHolidayMeta(dateISO);
    const holiday = Boolean(holidayMeta?.isHoliday);
    const weekend = isWeekend(date);
    const cell = document.createElement('td');
    if (holiday) {
      cell.classList.add('day-holiday');
    } else if (weekend) {
      cell.classList.add('day-weekend');
    }

    const leave = getLeaveForCell(employee.id, month, day);

    const select = document.createElement('select');
    select.className = 'shift-select';
    if (!inEmployment) {
      cell.classList.add('day-outside-employment');
      select.classList.add('shift-select--inactive');
    }
    select.disabled = monthLocked || !inEmployment;
    if (leave) {
      select.title = 'Има отсъствие за деня. Смяната може да се редактира, но отсъствието остава активно.';
    }

    const scheduleId = getEmployeeScheduleId(employee);
    const employeeDepartmentId = cleanStoredValue(employee.departmentId || employee.department_id) || null;
    const scopedShiftTemplates = employeeDepartmentId && Array.isArray(state.departmentShiftsCache[employeeDepartmentId])
      ? state.departmentShiftsCache[employeeDepartmentId]
      : (scheduleId && Array.isArray(state.scheduleShiftTemplatesById[scheduleId])
        ? state.scheduleShiftTemplatesById[scheduleId]
        : state.shiftTemplates);

    if (employeeDepartmentId && !Array.isArray(state.departmentShiftsCache[employeeDepartmentId])) {
      void loadDepartmentShifts(employeeDepartmentId).then(() => renderSchedule());
    }

    scopedShiftTemplates.forEach((shift) => {
      const option = document.createElement('option');
      option.value = shift.code;
      option.textContent = shift.label || shift.code;
      option.dataset.shiftCode = shift.code;
      option.dataset.shiftId = shift.id || '';
      option.selected = shift.code === currentShift;
      select.appendChild(option);
    });

    select.addEventListener('change', async () => {
      await setShiftForCell({ employee, day, month, shiftCode: select.value });
      renderSchedule();
    });

    cell.appendChild(select);

    const entryValidation = scheduleId
      ? state.scheduleEntryValidationsById[`${scheduleId}|${employee.id}|${day}`]
      : null;
    const entrySnapshot = scheduleId
      ? state.scheduleEntrySnapshotsById[`${scheduleId}|${employee.id}|${day}`]
      : null;
    snapshotEntriesByDay.push(entrySnapshot || {});

    const warningMessages = Array.isArray(entryValidation?.warnings) ? entryValidation.warnings.filter(Boolean) : [];
    const errorMessages = Array.isArray(entryValidation?.errors) ? entryValidation.errors.filter(Boolean) : [];
    if (errorMessages.length || warningMessages.length) {
      const marker = document.createElement('span');
      marker.className = `cell-validation-marker ${errorMessages.length ? 'cell-validation-marker--error' : 'cell-validation-marker--warning'}`;
      marker.textContent = errorMessages.length ? '❌' : '⚠';
      const details = [];
      if (errorMessages.length) {
        details.push(`Грешки: ${truncateMessages(errorMessages).join(' | ')}`);
      }
      if (warningMessages.length) {
        details.push(`Предупреждения: ${truncateMessages(warningMessages).join(' | ')}`);
      }
      marker.title = details.join('\n');
      cell.appendChild(marker);
    }

    if (safeNum(entrySnapshot?.overtimeMinutes) > 0) {
      const overtimeBadge = document.createElement('span');
      overtimeBadge.className = 'cell-ot-badge';
      overtimeBadge.textContent = 'OT';
      overtimeBadge.title = `Извънредни: ${minutesToHoursDecimal(entrySnapshot?.overtimeMinutes)} ч`;
      cell.classList.add('day-overtime');
      cell.appendChild(overtimeBadge);
    }

    if (leave?.leave_type_code || leave?.leave_type?.code) {
      const leaveCode = String(leave.leave_type_code || leave.leave_type?.code || '').toUpperCase();
      const leaveName = leave.leave_type_name || leave.leave_type?.name || 'Отсъствие';
      const leaveBadge = document.createElement('span');
      leaveBadge.className = `cell-leave-badge ${leaveCode === 'SICK' ? 'cell-leave-badge--sick' : ''}`.trim();
      leaveBadge.textContent = getLeaveBadgeLabel({ code: leaveCode, name: leaveName });
      leaveBadge.title = leaveName;
      cell.appendChild(leaveBadge);
    }

    row.appendChild(cell);
    collectSummary(summary, currentShift, holiday, weekend, inEmployment, entrySnapshot);
    if (inEmployment && !holiday && !weekend) {
      summary.monthNormHours += 8;
    }
  }

  const employeeTotals = calculateEmployeeTotals({ employee, summary, year, month, monthNormHours: summary.monthNormHours });
  accumulateTotals(totals, employeeTotals);
  appendSummaryColumns(row, employeeTotals, visibleSummaryColumns);

  const employeeSnapshotTotals = sumEmployeeTotals(snapshotEntriesByDay);
  appendSnapshotTotalsColumns(row, employeeSnapshotTotals);
  employeeSnapshotTotalsList.push(employeeSnapshotTotals);
  return { row, employeeSnapshotTotals };
}

function monthBounds(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) {
    return null;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${String(month).padStart(2, '0')}-01`, to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
}

async function loadHolidayRangeForMonth(monthKey) {
  const bounds = monthBounds(monthKey);
  if (!bounds) {
    return;
  }
  if (state.holidaysByMonthCache[monthKey]) {
    return;
  }
  try {
    const query = new URLSearchParams({ from: bounds.from, to: bounds.to });
    const payload = await apiRequest(`/api/holidays/range?${query.toString()}`, { method: 'GET' });
    const mapped = new Map((payload.holidays || []).map((row) => [row.date, row]));
    state.holidaysByMonthCache[monthKey] = mapped;
  } catch (_error) {
    state.holidaysByMonthCache[monthKey] = new Map();
  }
}

function getHolidayMeta(dateISO) {
  const monthKey = String(dateISO || '').slice(0, 7);
  const map = state.holidaysByMonthCache[monthKey];
  if (!map) {
    return null;
  }
  return map.get(String(dateISO).slice(0, 10)) || null;
}

async function loadHolidaysAdminYear(year) {
  const y = Number(year || new Date().getFullYear());
  const payload = await apiRequest(`/api/holidays?year=${encodeURIComponent(String(y))}`, { method: 'GET' });
  state.holidaysAdminRows = Array.isArray(payload.holidays) ? payload.holidays : [];
  renderHolidaysAdminTable();
}

function renderHolidaysAdminTable() {
  if (!holidaysTableBody) return;
  holidaysTableBody.innerHTML = '';
  state.holidaysAdminRows.forEach((holiday) => {
    const row = document.createElement('tr');
    const lock = holiday.type === 'official' ? '🔒' : '';
    row.innerHTML = `<td>${holiday.date}</td><td>${holiday.name || '—'}</td><td>${holiday.type || 'none'} ${lock}</td><td></td>`;
    const actionCell = row.lastElementChild;
    if (holiday.type !== 'official') {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = 'Изтрий';
      delBtn.addEventListener('click', async () => {
        await apiRequest(`/api/holidays/${encodeURIComponent(holiday.date)}`, { method: 'DELETE' });
        state.holidaysByMonthCache = {};
        await loadHolidaysAdminYear(holidaysYearInput?.value || new Date().getFullYear());
        await loadHolidayRangeForMonth(state.month);
        renderSchedule();
      });
      actionCell.appendChild(delBtn);
    } else {
      actionCell.textContent = 'Read-only';
    }
    holidaysTableBody.appendChild(row);
  });
}

function renderSchedule() {
  const month = state.month || todayMonth();
  const [year, monthIndex] = month.split('-').map(Number);
  const totalDays = new Date(year, monthIndex, 0).getDate();
  const monthStats = getMonthStats(year, monthIndex, totalDays);
  const monthLocked = isMonthLocked(month);
  const activeSchedule = getActiveSchedule();

  lockStatus.textContent = `Статус: ${monthLocked ? 'Locked' : 'Draft'}${activeSchedule ? ` · Активен: ${activeSchedule.name}` : ''}`;
  lockStatus.classList.toggle('lock-status--locked', monthLocked);
  lockScheduleBtn.disabled = monthLocked || !canManageScheduleLock();
  unlockScheduleBtn.disabled = !monthLocked || !canUnlockSchedule();

  monthInfo.innerHTML = `
    <b>Работни дни по календар:</b> ${monthStats.workingDays} ·
    <b>Почивни дни:</b> ${monthStats.weekendDays} ·
    <b>Официални празници:</b> ${monthStats.holidayDays} ·
    <b>Норма:</b> ${monthStats.normHours} ч.
  `;

  const visibleSummaryColumns = getVisibleSummaryColumns();
  const selectedSet = getSelectedDepartmentIdsSet();
  const employeesToRender = getEmployeesForSelectedSchedules();
  const visibleEmployees = employeesToRender.filter((employee) => {
    if (!selectedSet.size) {
      return true;
    }
    return selectedSet.has(cleanStoredValue(employee.departmentId));
  });

  const grouped = window.ScheduleGrouping?.groupEmployeesByDepartment
    ? window.ScheduleGrouping.groupEmployeesByDepartment({ employees: visibleEmployees, departments: state.departments })
    : { order: ['all'], map: { all: { deptId: 'all', deptName: 'Всички отдели', employees: visibleEmployees } } };

  const header = document.createElement('tr');
  header.innerHTML = '<th class="sticky">Служител / Отдел / Длъжност</th>';
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex - 1, day);
    const dateISO = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holidayMeta = getHolidayMeta(dateISO);
    const holiday = Boolean(holidayMeta?.isHoliday);
    const weekend = isWeekend(date);
    const th = document.createElement('th');
    th.textContent = String(day);
    if (holiday) {
      th.className = 'day-holiday';
    } else if (weekend) {
      th.className = 'day-weekend';
    }
    if (holiday) {
      const badge = document.createElement('span');
      badge.className = 'holiday-day-badge';
      badge.textContent = ' Празник';
      badge.title = holidayMeta?.name || 'Празник';
      th.appendChild(badge);
    }
    header.appendChild(th);
  }
  visibleSummaryColumns.forEach((column) => {
    const cell = document.createElement('th');
    cell.className = 'summary-col';
    cell.textContent = column.label;
    header.appendChild(cell);
  });
  ['Общо', 'Нощни', 'Уикенд', 'Празнични', 'Извънредни'].forEach((label) => {
    const cell = document.createElement('th');
    cell.className = 'summary-col schedule-snapshot-total';
    cell.textContent = label;
    header.appendChild(cell);
  });

  scheduleTable.innerHTML = '';
  scheduleTable.appendChild(header);

  const totals = {
    workedDays: 0, workedHours: 0, normHours: 0, deviation: 0, sirvNormHours: 0, sirvWorkedHours: 0,
    overtimeHours: 0, holidayWorkedHours: 0, weekendWorkedHours: 0, nightWorkedHours: 0,
    nightConvertedHours: 0, payableHours: 0, vacationDays: 0, remainingVacation: 0, sickDays: 0
  };

  const departmentTotalsList = [];
  const mode = state.scheduleViewMode || 'combined';
  grouped.order.forEach((deptId) => {
    const group = grouped.map[deptId] || { deptName: 'Без отдел', employees: [] };
    const groupEmployees = Array.isArray(group.employees) ? group.employees : [];

    const sectionRow = document.createElement('tr');
    sectionRow.className = 'schedule-department-header-row';
    const sectionCell = document.createElement('td');
    sectionCell.colSpan = 1 + totalDays + visibleSummaryColumns.length + 5;
    sectionCell.innerHTML = `<b>${group.deptName}</b> <small>(${groupEmployees.length} служители)</small>`;
    sectionRow.appendChild(sectionCell);
    scheduleTable.appendChild(sectionRow);

    if (!groupEmployees.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 1 + totalDays + visibleSummaryColumns.length + 5;
      emptyCell.className = 'schedule-empty-department';
      emptyCell.textContent = 'Няма служители в този отдел';
      emptyRow.appendChild(emptyCell);
      scheduleTable.appendChild(emptyRow);
      return;
    }

    const employeeSnapshotTotalsList = [];
    groupEmployees.forEach((employee) => {
      const { row, employeeSnapshotTotals } = renderEmployeeScheduleRow({
        employee, year, monthIndex, month, totalDays, monthLocked, visibleSummaryColumns, totals, employeeSnapshotTotalsList,
      });
      row.dataset.deptId = group.deptId;
      scheduleTable.appendChild(row);
      departmentTotalsList.push({ deptId: group.deptId, ...employeeSnapshotTotals });
    });

    const deptTotals = window.ScheduleTotals?.sumGridTotals
      ? window.ScheduleTotals.sumGridTotals(employeeSnapshotTotalsList)
      : sumGridTotals(employeeSnapshotTotalsList);

    const deptRow = document.createElement('tr');
    const deptLabel = document.createElement('td');
    deptLabel.className = 'sticky';
    deptLabel.innerHTML = `<b>Общо ${group.deptName}</b>`;
    deptRow.appendChild(deptLabel);
    for (let day = 1; day <= totalDays; day += 1) {
      const filler = document.createElement('td');
      filler.className = 'summary-col';
      filler.textContent = mode === 'sections' ? '·' : '—';
      deptRow.appendChild(filler);
    }
    for (let idx = 0; idx < visibleSummaryColumns.length; idx += 1) {
      const filler = document.createElement('td');
      filler.className = 'summary-col';
      filler.textContent = '—';
      deptRow.appendChild(filler);
    }
    appendSnapshotTotalsColumns(deptRow, deptTotals, true);
    scheduleTable.appendChild(deptRow);
  });

  if (visibleEmployees.length) {
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
    const snapshotGrandTotals = sumGridTotals(departmentTotalsList);
    appendSnapshotTotalsColumns(totalsRow, snapshotGrandTotals, true);
    renderScheduleOverviewTotals(snapshotGrandTotals);
    scheduleTable.appendChild(totalsRow);
  } else {
    renderScheduleOverviewTotals({ workMinutesTotal: 0, nightMinutes: 0, weekendMinutes: 0, holidayMinutes: 0, overtimeMinutes: 0 });
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
  const remainingVacation = getVacationAllowanceForYear(employee, year) - getVacationUsedForYear(employee.id, year);
  const normalizedHolidayHours = summary.holidayWorkedHours * state.rates.holiday;
  const isSirvEmployee = Boolean(employee?.isSirv);
  const normalizedWeekendHours = isSirvEmployee
    ? summary.weekendWorkedHours
    : summary.weekendWorkedHours * state.rates.weekend;
  const payableHours =
    summary.workedHours - summary.holidayWorkedHours - summary.weekendWorkedHours + normalizedHolidayHours + normalizedWeekendHours + summary.nightConvertedHours;
  const deviation = summary.workedHours + summary.nightConvertedHours - monthNormHours;
  const employeeSirvPeriod = Number(employee?.sirvPeriodMonths || 1) || 1;
  const sirvTotals = getSirvTotalsForEmployee(employee, month, isSirvEmployee ? employeeSirvPeriod : 1);
  const overtimeHours = isSirvEmployee
    ? sirvTotals.overtimeHours
    : Math.max(0, summary.workedHours - monthNormHours);

  const reportedWeekendWorkedHours = isSirvEmployee ? 0 : summary.weekendWorkedHours;

  return {
    workedDays: summary.workedDays,
    workedHours: summary.workedHours,
    normHours: monthNormHours,
    deviation,
    sirvNormHours: sirvTotals.normHours,
    sirvWorkedHours: sirvTotals.convertedWorkedHours,
    overtimeHours,
    holidayWorkedHours: summary.holidayWorkedHours,
    weekendWorkedHours: reportedWeekendWorkedHours,
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

function collectSummary(summary, shiftCode, holiday, weekend, inEmployment = true, snapshot = null) {
  if (!inEmployment) {
    return;
  }

  const shift = getShiftByCode(shiftCode) || getShiftByCode('P');

  const snapshotWorkMinutes = Number(snapshot?.workMinutesTotal ?? snapshot?.workMinutes);
  const hasSnapshotMinutes = Number.isFinite(snapshotWorkMinutes);
  if (hasSnapshotMinutes) {
    const workHours = snapshotWorkMinutes / 60;
    const nightHours = Number(snapshot.nightMinutes || 0) / 60;
    const holidayHours = Number(snapshot.holidayMinutes || 0) / 60;
    const weekendHours = Number(snapshot.weekendMinutes || 0) / 60;

    if (workHours > 0) {
      summary.workedDays += 1;
      summary.workedHours += workHours;
    }
    summary.nightWorkedHours += nightHours;
    summary.nightConvertedHours += nightHours * (NIGHT_HOURS_COEFFICIENT - 1);
    summary.holidayWorkedHours += holidayHours;
    summary.weekendWorkedHours += weekendHours;

    if (shift.type === 'vacation') {
      summary.vacationDays += 1;
    }
    if (shift.type === 'sick') {
      summary.sickDays += 1;
    }
    return;
  }

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


function normalizeShiftCodeForApi(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return '';
  }
  const latinUpper = raw.toUpperCase();
  if (['R', 'P', 'O', 'B'].includes(latinUpper)) {
    return latinUpper;
  }
  const cyrillicMap = {
    'Р': 'R',
    'р': 'R',
    'П': 'P',
    'п': 'P',
    'О': 'O',
    'о': 'O',
    'Б': 'B',
    'б': 'B',
  };
  return cyrillicMap[raw] || latinUpper;
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
    const dateISO = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holidayMeta = getHolidayMeta(dateISO);
    const holiday = Boolean(holidayMeta?.isHoliday);
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
  return Math.min(4, Math.max(1, Math.trunc(parsed)));
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

      const key = scheduleKey(employeeId, monthKey, day);
      const rawShiftCode = state.sirvSchedule[key] || state.schedule[key] || 'P';
      const shiftCode = normalizeShiftCodeForApi(rawShiftCode);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const dottedMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!dottedMatch) {
    return '';
  }

  const [, day, month, year] = dottedMatch;
  const normalized = `${year}-${month}-${day}`;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (date.getFullYear() !== Number(year) || (date.getMonth() + 1) !== Number(month) || date.getDate() !== Number(day)) {
    return '';
  }

  return normalized;
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
  const suggestedDate = formatDateForDisplay(currentEndDate || defaultDate);
  const result = window.prompt('Въведете последен работен ден (ДД.ММ.ГГГГ):', suggestedDate);
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

function loadPendingConnectionLogs() {
  try {
    const raw = localStorage.getItem('pendingConnectionLogs');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function savePendingConnectionLogs() {
  localStorage.setItem('pendingConnectionLogs', JSON.stringify((state.pendingConnectionLogs || []).slice(-200)));
}

function updateBackendConnectionIndicator(isOnline, tooltipText) {
  if (!backendConnectionDot) {
    return;
  }

  const hasStateChanged = state.backendConnectionOnline !== isOnline;
  state.backendConnectionOnline = isOnline;
  backendConnectionDot.classList.toggle('backend-connection-dot--online', isOnline);
  backendConnectionDot.classList.toggle('backend-connection-dot--offline', !isOnline);
  backendConnectionDot.title = tooltipText || (isOnline ? 'Свързан към сървъра' : 'Няма връзка със сървъра');

  if (hasStateChanged && isOnline) {
    flushPendingConnectionLogs().catch(() => {
      // will retry automatically later
    });
  }
}

function getReadableConnectionError(error) {
  const message = cleanStoredValue(error?.message || error);
  if (!message) {
    return 'Неуспешна връзка с API сървъра.';
  }
  if (message.includes('Failed to fetch')) {
    return 'Сървърът не отговаря или връзката е прекъсната (network error).';
  }
  if (message.includes('Health check failed')) {
    return 'Health check към сървъра е неуспешен.';
  }
  return message;
}

function pushConnectionLogEntry(error, context = {}) {
  const tenantId = state.selectedTenantId || state.currentUser?.tenantId || null;
  const readable = getReadableConnectionError(error);
  const signature = `${tenantId || 'no-tenant'}|${readable}`;

  if (state.lastConnectionErrorSignature === signature) {
    return;
  }

  state.lastConnectionErrorSignature = signature;

  state.pendingConnectionLogs.push({
    type: 'connection_error',
    action: 'backend_connection_lost',
    entity: 'backend_connection',
    tenantId,
    details: {
      error: readable,
      apiBaseUrl: state.apiBaseUrl,
      context,
    },
    createdAt: new Date().toISOString(),
  });
  savePendingConnectionLogs();
  flushPendingConnectionLogs().catch(() => {
    // backend is down; keep queue in local storage
  });
}

async function flushPendingConnectionLogs() {
  if (!state.pendingConnectionLogs.length || !state.authToken || !state.backendConnectionOnline) {
    return;
  }

  const queued = [...state.pendingConnectionLogs];
  for (let index = 0; index < queued.length; index += 1) {
    const item = queued[index];
    try {
      await apiFetch('/api/logs/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      state.pendingConnectionLogs.shift();
      savePendingConnectionLogs();
    } catch (_error) {
      break;
    }
  }
}

async function withBackendReconnect(work, options = {}) {
  try {
    const result = await work();
    updateBackendConnectionIndicator(true, 'Свързан към сървъра');
    state.lastConnectionErrorSignature = '';
    return result;
  } catch (error) {
    updateBackendConnectionIndicator(false, getReadableConnectionError(error));
    pushConnectionLogEntry(error, { source: options.source || 'unknown' });

    if (!options.skipReconnect) {
      scheduleReconnect();
    }

    throw error;
  }
}

function scheduleReconnect() {
  if (state.backendReconnectInFlight) {
    return;
  }
  state.backendReconnectInFlight = true;

  const attempt = async () => {
    const connected = await loadFromBackend({ silentStatus: true, skipReconnectSchedule: true });
    if (!connected) {
      setTimeout(attempt, 3000);
      return;
    }

    state.backendReconnectInFlight = false;
    setStatus('Връзката със сървъра е възстановена.', true);
  };

  setTimeout(attempt, 1200);
}

function detectApiBaseUrl() {
  const saved = localStorage.getItem('apiBaseUrl');
  if (saved) {
    return normalizeApiBaseUrl(saved);
  }

  if (window.__API_BASE_URL__) {
    return normalizeApiBaseUrl(window.__API_BASE_URL__);
  }

  // Prefer same-origin first (reverse proxy deployments), and let reconnect fallback
  // logic try host:4000 if needed.
  return normalizeApiBaseUrl(window.location.origin);
}

function normalizeApiBaseUrl(url) {
  if (!url) {
    return window.location.origin;
  }
  return String(url).replace(/\/$/, '');
}

function buildApiUrl(baseUrl, path) {
  const normalizedBase = normalizeApiBaseUrl(baseUrl);
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${normalizedBase}${path}`;
}

function syncApiBaseUrl(baseUrl) {
  const normalized = normalizeApiBaseUrl(baseUrl);
  if (state.apiBaseUrl === normalized) {
    return;
  }
  state.apiBaseUrl = normalized;
  localStorage.setItem('apiBaseUrl', normalized);
  if (apiUrlInput) {
    apiUrlInput.value = normalized;
  }
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-User-Role', state.userRole);
  if (state.authToken) {
    headers.set('Authorization', `Bearer ${state.authToken}`);
  }

  let response;
  try {
    response = await fetch(buildApiUrl(state.apiBaseUrl, path), {
      ...options,
      headers
    });
    updateBackendConnectionIndicator(true, 'Свързан към сървъра');
    state.lastConnectionErrorSignature = '';
  } catch (error) {
    const sameOriginBase = normalizeApiBaseUrl(window.location.origin);
    const fallback4000 = normalizeApiBaseUrl(`${window.location.protocol}//${window.location.hostname}:4000`);
    const triedBase = normalizeApiBaseUrl(state.apiBaseUrl);
    const fallbackCandidates = [sameOriginBase, fallback4000].filter((candidate, idx, arr) => candidate !== triedBase && arr.indexOf(candidate) === idx);

    let recovered = false;
    for (const fallbackBase of fallbackCandidates) {
      try {
        response = await fetch(buildApiUrl(fallbackBase, path), {
          ...options,
          headers
        });
        syncApiBaseUrl(fallbackBase);
        updateBackendConnectionIndicator(true, `Свързан към сървъра (${fallbackBase})`);
        setStatus(`Автоматично превключване към API: ${fallbackBase}`, true);
        recovered = true;
        break;
      } catch (_fallbackError) {
        // continue to next fallback candidate
      }
    }

    if (!recovered) {
      updateBackendConnectionIndicator(false, getReadableConnectionError(error));
      pushConnectionLogEntry(error, { source: `apiFetch:${path}` });
      scheduleReconnect();
      throw error;
    }
  }

  if (response.status === 401 && state.authToken && !state.isHandlingUnauthorized) {
    state.isHandlingUnauthorized = true;
    clearAuthSession();
    resetTenantScopedState({ clearLocalStorage: true });
    updateAuthUi();
    updateAuthGate();
    renderAll();
    setStatus('Сесията е изтекла. Моля, влезте отново.', false);
    state.isHandlingUnauthorized = false;
  }

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
  const singleDepartmentFilter = getEffectiveSingleDepartmentFilter();
  if (singleDepartmentFilter) {
    query.set('department_id', singleDepartmentFilter);
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
  await loadHolidayRangeForMonth(monthKey);

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


async function buildSirvScheduleCache(referenceMonth, employees) {
  const sirvEmployees = (employees || []).filter((employee) => Boolean(employee?.isSirv));
  if (!sirvEmployees.length) {
    return {};
  }

  const maxPeriod = Math.max(...sirvEmployees.map((employee) => Number(employee?.sirvPeriodMonths || 1) || 1));
  const months = getPeriodMonths(referenceMonth, maxPeriod);
  const sirvEmployeeIds = new Set(sirvEmployees.map((employee) => employee.id));
  const cache = {};

  for (const monthKey of months) {
    const schedulesResponse = await apiFetch(`/api/schedules?month=${encodeURIComponent(monthKey)}`);
    if (!schedulesResponse.ok) {
      continue;
    }

    const schedulesPayload = await schedulesResponse.json();
    const schedules = Array.isArray(schedulesPayload.schedules) ? schedulesPayload.schedules : [];
    if (!schedules.length) {
      continue;
    }

    const details = await Promise.all(schedules.map(async (schedule) => {
      try {
        return await fetchScheduleDetails(schedule.id);
      } catch {
        return null;
      }
    }));

    details.forEach((detail) => {
      if (!detail) {
        return;
      }

      const detailMonth = cleanStoredValue(detail.schedule?.month_key) || monthKey;
      (detail.entries || []).forEach((entry) => {
        if (!sirvEmployeeIds.has(entry.employeeId)) {
          return;
        }
        cache[scheduleKey(entry.employeeId, detailMonth, entry.day)] = normalizeShiftCodeForApi(entry.shiftCode);
      });
    });
  }

  return cache;
}

async function refreshMonthlyView() {
  if (!state.backendAvailable) {
    return;
  }

  const month = state.month || monthPicker.value || todayMonth();
  state.month = month;
  await loadSchedulesForMonth();

  const monthParam = encodeURIComponent(month);
  const singleDepartmentFilter = getEffectiveSingleDepartmentFilter();
  const employeeQuery = singleDepartmentFilter
    ? `/api/employees?department_id=${encodeURIComponent(singleDepartmentFilter)}&month_key=${monthParam}`
    : `/api/employees?month_key=${monthParam}`;
  const employeeResponse = await apiFetch(employeeQuery);
  const employeePayload = employeeResponse.ok ? await employeeResponse.json() : { employees: [] };
  const allowedEmployees = Array.isArray(employeePayload.employees) ? employeePayload.employees : [];
  const allowedIds = new Set(allowedEmployees.map((employee) => employee.id));
  state.employees = allowedEmployees.map(normalizeEmployeeVacationData);
  state.sirvSchedule = await buildSirvScheduleCache(month, state.employees);

  try {
    const leaveTypesResponse = await apiFetch('/api/leaves/types');
    if (leaveTypesResponse.ok) {
      const leaveTypesPayload = await leaveTypesResponse.json();
      state.leaveTypes = Array.isArray(leaveTypesPayload.leave_types) ? leaveTypesPayload.leave_types : [];
    }
  } catch {
    state.leaveTypes = [];
  }

  try {
    const leaveQuery = new URLSearchParams({ month });
    if (singleDepartmentFilter) {
      leaveQuery.set('department_id', singleDepartmentFilter);
    }
    const leavesResponse = await apiFetch(`/api/leaves?${leaveQuery.toString()}`);
    if (leavesResponse.ok) {
      const leavesPayload = await leavesResponse.json();
      state.leaves = Array.isArray(leavesPayload.leaves) ? leavesPayload.leaves : [];
      rebuildLeavesIndex();
    }
  } catch {
    state.leaves = [];
    rebuildLeavesIndex();
  }

  if (!state.selectedScheduleIds.length) {
    state.scheduleEmployees = [];
    state.scheduleEntriesById = {};
    state.scheduleEntrySnapshotsById = {};
    state.scheduleEntryValidationsById = {};
    return;
  }

  const selectedIds = state.selectedScheduleIds.slice();
  const requests = selectedIds.map((id) => fetchScheduleDetails(id));
  const details = await Promise.all(requests);

  const employeeById = new Map();
  const mappedEntries = {};
  const mappedEntrySnapshots = {};
  const mappedEntryValidations = {};

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
      const entryKey = `${schedule.id}|${entry.employeeId}|${entry.day}`;
      mappedEntries[entryKey] = normalizeShiftCodeForApi(entry.shiftCode);
      mappedEntrySnapshots[entryKey] = {
        workMinutes: Number(entry.workMinutes ?? 0),
        workMinutesTotal: Number(entry.workMinutesTotal ?? entry.workMinutes ?? 0),
        nightMinutes: Number(entry.nightMinutes ?? 0),
        holidayMinutes: Number(entry.holidayMinutes ?? 0),
        weekendMinutes: Number(entry.weekendMinutes ?? 0),
        overtimeMinutes: Number(entry.overtimeMinutes ?? 0),
      };
      mappedEntryValidations[entryKey] = {
        errors: Array.isArray(entry.validation?.errors) ? entry.validation.errors : [],
        warnings: Array.isArray(entry.validation?.warnings) ? entry.validation.warnings : [],
      };
    });
  });

  const mergedEmployees = Array.from(employeeById.values());
  mergedEmployees.sort((a, b) => a.name.localeCompare(b.name, 'bg'));
  state.scheduleEmployees = mergedEmployees.map(normalizeEmployeeVacationData);
  state.scheduleEntriesById = mappedEntries;
  state.scheduleEntrySnapshotsById = mappedEntrySnapshots;
  state.scheduleEntryValidationsById = mappedEntryValidations;
  state.scheduleShiftTemplatesById = {};

  details.forEach((detail) => {
    const scheduleId = cleanStoredValue(detail?.schedule?.id);
    if (!scheduleId) {
      return;
    }
    const backendShiftTemplates = Array.isArray(detail?.shiftTemplates) ? detail.shiftTemplates : [];
    state.scheduleShiftTemplatesById[scheduleId] = mergeShiftTemplates(backendShiftTemplates);
  });
}

async function loadFromBackend(options = {}) {
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
      state.shiftTemplates = mergeShiftTemplates(backendShiftTemplates);
      saveShiftTemplates();
    }

    updateBackendConnectionIndicator(true, 'Свързан към сървъра');
    if (!options.silentStatus) {
      setStatus(`Свързан с PostgreSQL бекенд (${state.apiBaseUrl}).`, true);
    }
    persistEmployeesLocal();
    saveScheduleLocal();
    return true;
  } catch (error) {
    // keep backend mode active; surface error via status

    const message = cleanStoredValue(error?.message);
    const missingTenantContext = message.includes('Изберете организация (tenant)') || message.includes('Missing tenant context');

    if (state.authToken && missingTenantContext) {
      try {
        const payload = await apiRequest('/api/me/tenants', { method: 'GET' });
        const tenants = Array.isArray(payload.tenants) ? payload.tenants : [];
        if (tenants.length > 1) {
          state.availableTenants = tenants;
          state.pendingLoginToken = '';
          state.requiresTenantSelection = true;
          updateAuthGate();
          setStatus('Изберете фирма за продължение.', false);
        }
      } catch (_inner) {
        // fallback ignore
      }
    }

    updateBackendConnectionIndicator(false, getReadableConnectionError(error));
    pushConnectionLogEntry(error, { source: 'loadFromBackend' });
    if (!options.skipReconnectSchedule) {
      scheduleReconnect();
    }

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
        baseVacationAllowance: resolveBaseVacationAllowance(employee),
        is_sirv: Boolean(employee.isSirv),
        sirv_period_months: Number(employee.sirvPeriodMonths) || 1
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
    // keep backend mode active; surface error via status
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

async function saveScheduleEntryBackend(employee, day, shiftCode, options = {}) {
  try {
    const scheduleId = options.scheduleId || getEmployeeScheduleId(employee);
    if (!scheduleId) {
      setStatus('Липсва график за отдела.', false);
      return { ok: false, message: 'Липсва график за отдела.' };
    }

    const payload = {
      employee_id: employee.id,
      day,
      shift_code: normalizeShiftCodeForApi(shiftCode),
      month_key: options.monthKey || state.month,
    };
    if (options.shiftId) {
      payload.shift_id = options.shiftId;
    }

    const response = await apiFetch(`/api/schedules/${scheduleId}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = responsePayload.message || response.statusText || 'Save schedule entry failed';
      setStatus(message, false);
      return { ok: false, message };
    }

    if (responsePayload?.entry) {
      state.schedule[scheduleKey(employee.id, options.monthKey || state.month, day)] = responsePayload.entry.shiftCode || shiftCode;
      state.scheduleEntriesById[`${scheduleId}|${employee.id}|${day}`] = responsePayload.entry.shiftCode || shiftCode;
      state.scheduleEntrySnapshotsById[`${scheduleId}|${employee.id}|${day}`] = {
        workMinutes: Number(responsePayload.entry.workMinutes ?? 0),
        workMinutesTotal: Number(responsePayload.entry.workMinutesTotal ?? responsePayload.entry.workMinutes ?? 0),
        nightMinutes: Number(responsePayload.entry.nightMinutes ?? 0),
        holidayMinutes: Number(responsePayload.entry.holidayMinutes ?? 0),
        weekendMinutes: Number(responsePayload.entry.weekendMinutes ?? 0),
        overtimeMinutes: Number(responsePayload.entry.overtimeMinutes ?? 0),
      };
      state.scheduleEntryValidationsById[`${scheduleId}|${employee.id}|${day}`] = {
        errors: Array.isArray(responsePayload.entry.validation?.errors) ? responsePayload.entry.validation.errors : [],
        warnings: Array.isArray(responsePayload.entry.validation?.warnings) ? responsePayload.entry.validation.warnings : [],
      };
      saveScheduleLocal();
      await refreshMonthlyView();
    }

    return { ok: true, data: responsePayload };
  } catch (error) {
    setStatus(error.message || `Грешка към бекенд (${state.apiBaseUrl}).`, false);
    return { ok: false, error };
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
    // keep backend mode active; surface error via status
  }
}

async function deleteShiftTemplateBackend(code, departmentId = null) {
  if (!state.backendAvailable) {
    return;
  }

  try {
    const query = new URLSearchParams();
    if (departmentId) {
      query.set('department_id', String(departmentId));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await apiFetch(`/api/shift-template/${encodeURIComponent(code)}${suffix}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Delete shift template failed');
    }
  } catch {
    setStatus(`Грешка към бекенд (${state.apiBaseUrl}). Данните са запазени локално.`, false);
    // keep backend mode active; surface error via status
  }
}

function canManageScheduleLock() {
  const role = String(state.currentUser?.role || state.userRole || '').toLowerCase();
  return ['owner', 'admin', 'manager'].includes(role);
}

function canUnlockSchedule() {
  const role = String(state.currentUser?.role || state.userRole || '').toLowerCase();
  return ['owner', 'admin'].includes(role);
}

async function downloadScheduleFile(scheduleId, extension) {
  const response = await apiFetch(`/api/schedules/${scheduleId}/export.${extension}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    setStatus(payload.message || `Неуспешен експорт ${extension.toUpperCase()}.`, false);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schedule-${scheduleId}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  if (!storageStatus) {
    return;
  }

  storageStatus.textContent = message;
  storageStatus.className = `status-toast ${good ? 'status-ok' : 'status-warn'} status-toast-visible`;

  if (statusToastTimer) {
    clearTimeout(statusToastTimer);
  }

  statusToastTimer = setTimeout(() => {
    storageStatus.classList.remove('status-toast-visible');
  }, good ? 3200 : 5600);
}

function getVacationUsedForYear(employeeId, year) {
  return getVacationDateKeysForYear(employeeId, year).length;
}

function getVacationDateKeysForYear(employeeId, year) {
  const entries = new Set();

  Object.entries(state.schedule).forEach(([key, code]) => {
    if (!key.startsWith(`${employeeId}|${year}-`) || code !== 'O') {
      return;
    }

    const [, monthKey, dayPart] = key.split('|');
    const day = Number(dayPart);
    if (!monthKey || !Number.isFinite(day)) {
      return;
    }
    entries.add(`${monthKey}-${String(day).padStart(2, '0')}`);
  });

  const scheduleById = new Map(state.schedules.map((schedule) => [String(schedule.id), schedule]));
  const activeSchedule = getActiveSchedule();
  Object.entries(state.scheduleEntriesById).forEach(([entryKey, code]) => {
    if (code !== 'O') {
      return;
    }

    const [scheduleId, entryEmployeeId, dayPart] = entryKey.split('|');
    if (entryEmployeeId !== employeeId) {
      return;
    }

    const schedule = scheduleById.get(String(scheduleId));
    const monthKey = schedule?.month_key || (activeSchedule && String(activeSchedule.id) === String(scheduleId) ? state.month : '');
    const day = Number(dayPart);
    if (!monthKey || !monthKey.startsWith(`${year}-`) || !Number.isFinite(day)) {
      return;
    }

    entries.add(`${monthKey}-${String(day).padStart(2, '0')}`);
  });

  return Array.from(entries).sort();
}

function getVacationRangesForYear(employeeId, year) {
  const entries = getVacationDateKeysForYear(employeeId, year);
  if (!entries.length) {
    return [];
  }

  const ranges = [];
  let rangeStart = entries[0];
  let previous = entries[0];

  for (let index = 1; index < entries.length; index += 1) {
    const current = entries[index];
    if (isContinuousVacationPeriod(previous, current)) {
      previous = current;
      continue;
    }

    ranges.push([rangeStart, previous]);
    rangeStart = current;
    previous = current;
  }
  ranges.push([rangeStart, previous]);
  return ranges;
}

function getVacationPeriodsForYear(employeeId, year) {
  const ranges = getVacationRangesForYear(employeeId, year);
  if (!ranges.length) {
    return '-';
  }

  return ranges
    .map(([start, end]) => {
      const formattedStart = formatDateForDisplay(start);
      const formattedEnd = formatDateForDisplay(end);
      return start === end ? formattedStart : `${formattedStart} - ${formattedEnd}`;
    })
    .join(', ');
}


function isContinuousVacationPeriod(previousDateKey, currentDateKey) {
  const previousDate = new Date(`${previousDateKey}T00:00:00`);
  const currentDate = new Date(`${currentDateKey}T00:00:00`);
  if (Number.isNaN(previousDate.getTime()) || Number.isNaN(currentDate.getTime())) {
    return false;
  }

  const nextDay = new Date(previousDate);
  nextDay.setDate(previousDate.getDate() + 1);
  if (nextDay.getTime() === currentDate.getTime()) {
    return true;
  }

  const cursor = new Date(nextDay);
  while (cursor < currentDate) {
    if (!isWeekend(cursor) && !isOfficialHoliday(cursor)) {
      return false;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return true;
}

function normalizeEmployeeVacationData(employee) {
  const normalized = employee ? { ...employee } : {};
  normalized.telk = Boolean(normalized.telk);
  normalized.youngWorkerBenefit = Boolean(normalized.youngWorkerBenefit);
  normalized.baseVacationAllowance = resolveBaseVacationAllowance(normalized);
  normalized.isSirv = Boolean(normalized.isSirv ?? normalized.is_sirv);
  normalized.sirvPeriodMonths = normalizeSirvPeriod(Number(normalized.sirvPeriodMonths ?? normalized.sirv_period_months ?? 1) || 1);
  normalized.vacationAllowance = calculateVacationAllowance(normalized.baseVacationAllowance, normalized.telk, normalized.youngWorkerBenefit, normalized.startDate);
  return normalized;
}

function scheduleKey(employeeId, month, day) {
  return `${employeeId}|${month}|${day}`;
}

function enumerateLeaveDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    return [];
  }
  const result = [];
  const current = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function getLeaveBadgeLabel(leaveType) {
  const code = String(leaveType?.code || '').toUpperCase();
  if (code === 'SICK') {
    return 'Б';
  }
  return String(leaveType?.name || code || 'L').slice(0, 2).toUpperCase();
}

function rebuildLeavesIndex() {
  const byDay = {};
  (state.leaves || []).forEach((leave) => {
    const employeeId = String(leave.employee_id || '');
    if (!employeeId) {
      return;
    }
    enumerateLeaveDays(leave.date_from, leave.date_to).forEach((day) => {
      byDay[`${employeeId}|${day}`] = leave;
    });
  });
  state.leavesByEmployeeDay = byDay;
}

function getLeaveForCell(employeeId, month, day) {
  const dateKey = `${month}-${String(day).padStart(2, '0')}`;
  return state.leavesByEmployeeDay[`${employeeId}|${dateKey}`] || null;
}

function canManageLeaves() {
  return ['owner', 'admin', 'manager', 'super_admin'].includes(state.userRole);
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
  const merged = [
    ...SYSTEM_SHIFTS.map((shift) => ({ ...shift, id: null })),
    { ...DEFAULT_WORK_SHIFT, id: null }
  ];

  backendShiftTemplates.forEach((shift) => {
    const code = String(shift.code || '').trim().toUpperCase();
    if (!code || merged.some((existing) => existing.code === code)) {
      return;
    }

    merged.push({
      id: shift.id || null,
      code,
      label: code,
      name: String(shift.name || code),
      departmentId: cleanStoredValue(shift.departmentId || shift.department_id) || null,
      type: 'work',
      start: String(shift.start || ''),
      end: String(shift.end || ''),
      hours: getStoredShiftHours(shift),
      locked: false,
      break_minutes: breakMinutes,
      break_included: breakIncluded
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
  return String(active.status || '').toLowerCase() === 'locked';
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

  const totalHours = (endMinutes - startMinutes) / 60;
  const paidHours = totalHours >= BREAK_DEDUCTION_THRESHOLD_HOURS
    ? Math.max(totalHours - STANDARD_BREAK_HOURS, 0)
    : totalHours;

  return Number(paidHours.toFixed(2));
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
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return Boolean(getHolidayMeta(iso)?.isHoliday);
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


async function saveDepartmentShiftBackend(departmentId, payload) {
  if (!state.backendAvailable) return;
  try {
    const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Create department shift failed');
  } catch (error) {
    setStatus(error.message || 'Неуспешно добавяне на смяна към отдел.', false);
  }
}

async function loadDepartmentShifts(departmentId, options = {}) {
  if (!departmentId || !state.backendAvailable) return [];
  if (!options.force && Array.isArray(state.departmentShiftsCache[departmentId])) {
    return state.departmentShiftsCache[departmentId];
  }

  try {
    const response = await apiFetch(`/api/departments/${encodeURIComponent(departmentId)}/shifts`);
    if (!response.ok) throw new Error('Неуспешно зареждане на смени за отдел.');
    const payload = await response.json();
    const mapped = Array.isArray(payload.shifts) ? payload.shifts.map((shift) => ({
      id: shift.id || null,
      code: String(shift.code || '').toUpperCase(),
      label: String(shift.code || '').toUpperCase(),
      name: String(shift.name || shift.code || ''),
      departmentId: cleanStoredValue(shift.departmentId || shift.department_id) || null,
      type: 'work',
      start: String(shift.start || shift.start_time || ''),
      end: String(shift.end || shift.end_time || ''),
      hours: Number(shift.hours || calcShiftHours(shift.start || shift.start_time || '', shift.end || shift.end_time || '')) || 0,
      break_minutes: Number(shift.break_minutes || 0),
      break_included: Boolean(shift.break_included),
      locked: ['P', 'O', 'B', 'R'].includes(String(shift.code || '').toUpperCase())
    })) : [];
    state.departmentShiftsCache[departmentId] = mergeShiftTemplates(mapped);
    return state.departmentShiftsCache[departmentId];
  } catch (error) {
    setStatus(error.message || 'Неуспешно зареждане на departmental смени. Ползва се fallback.', false);
    return state.shiftTemplates.filter((shift) => !cleanStoredValue(shift.departmentId) || cleanStoredValue(shift.departmentId) === cleanStoredValue(departmentId));
  }
}
