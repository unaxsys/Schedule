(function attachAdminCalculationSettings(global) {
  const DEFAULT_CALCULATION_SETTINGS = {
    id: null,
    name: 'Основни правила',
    scope: 'global',
    departmentId: '',
    scheduleId: '',
    isActive: true,
    priority: 100,
    conflictResolution: 'highest-priority-wins',

    shiftResolutionPrimary: 'shift-id-first',
    shiftResolutionFallback: 'department-local-then-global',
    shiftClassificationSource: 'template-metadata',
    allowCodeOnlyFallback: false,
    legacyCodeFallbackMode: 'fallback-only',

    workedDayRule: 'working-shift-and-positive-minutes',
    workedMinutesSource: 'snapshot',
    includeBreakInWorkedHours: false,
    splitShiftAggregationMode: 'sum-all-intervals',
    zeroSnapshotForNonWorking: true,
    workedDayRequiresPositiveMinutes: true,
    excludeNonWorkingCodesFromWorkedDay: true,

    holidayCalculationSource: 'segments-only',
    weekendCalculationSource: 'segments-only',
    nightCalculationSource: 'segments-only',
    holidayPremiumCoefficient: '2.00',
    weekendPremiumCoefficient: '1.75',
    nightPremiumCoefficient: '0.25',
    specialHoursOnlyIfWorkMinutesPositive: true,
    splitByCalendarDate: true,
    crossMidnightSplitMode: 'split-by-date',

    payableHoursMode: 'worked-plus-premiums',
    overtimeMode: 'worked-vs-norm',
    comparisonMode: 'monthly-norm',
    includePremiumsInPayable: true,
    nightConversionMode: 'disabled',

    enableRuleTrace: true,
    showAppliedRules: true,
    showRejectedRules: true,

    nonWorkingCodes: 'O,B,OFF,REST,LEAVE,SICK',
    workingCodes: 'Р,1СМ,2СМ,3СМ,4СМ,5СМ,6СМ,7СМ,Рд',
    formulaText: 'worked_day = working_shift && work_minutes > 0',
  };

  function createAdminCalculationSettingsState(overrides = {}) {
    return { ...DEFAULT_CALCULATION_SETTINGS, ...overrides };
  }

  function normalizeCommaCodes(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
  }

  function renderAdminCalculationSettings(container, options = {}) {
    if (!container) return;

    const departments = Array.isArray(options.departments) ? options.departments : [];
    const schedules = Array.isArray(options.schedules) ? options.schedules : [];
    const initialValue = createAdminCalculationSettingsState(options.initialValue || {});
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
    let state = { ...initialValue };

    container.innerHTML = `
      <div class="calc-settings-card">
        <div class="calc-settings-header">
          <div>
            <h2>Rule engine admin screen</h2>
            <p>Изберете източник на истина, изчисления и симулация с видим execution order.</p>
          </div>
          <span class="calc-settings-badge">${state.isActive ? 'Активна' : 'Неактивна'}</span>
        </div>

        <div class="calc-tabs" role="tablist" aria-label="Calculation tabs">
          <button type="button" class="calc-tab-btn is-active" data-calc-tab="general">Общи правила</button>
          <button type="button" class="calc-tab-btn" data-calc-tab="calculations">Изчисления</button>
          <button type="button" class="calc-tab-btn" data-calc-tab="simulation">Симулация и дебъг</button>
        </div>

        <form id="adminCalculationSettingsForm" class="calc-settings-form">
          <section class="calc-settings-section" data-tab-panel="general">
            <h3>Карта: Scope rules</h3>
            <div class="calc-grid">
              <div class="calc-field"><label for="calcSettingName">Име</label><input id="calcSettingName" name="name" type="text" value="${escapeHtml(state.name)}" /></div>
              <div class="calc-field"><label for="calcIsActive">Статус</label><select id="calcIsActive" name="isActive"><option value="true" ${state.isActive ? 'selected' : ''}>Активна</option><option value="false" ${!state.isActive ? 'selected' : ''}>Неактивна</option></select></div>
              <div class="calc-field"><label for="calcScope">Обхват</label><select id="calcScope" name="scope"><option value="global" ${state.scope === 'global' ? 'selected' : ''}>Global</option><option value="department" ${state.scope === 'department' ? 'selected' : ''}>Department</option><option value="schedule" ${state.scope === 'schedule' ? 'selected' : ''}>Schedule</option></select></div>
              <div class="calc-field"><label for="calcPriority">Priority</label><input id="calcPriority" name="priority" type="number" min="1" value="${escapeHtml(state.priority)}" /></div>
              <div class="calc-field"><label for="calcConflictResolution">Conflict resolution</label><select id="calcConflictResolution" name="conflictResolution"><option value="highest-priority-wins" ${state.conflictResolution === 'highest-priority-wins' ? 'selected' : ''}>Highest priority wins</option><option value="latest-updated-wins" ${state.conflictResolution === 'latest-updated-wins' ? 'selected' : ''}>Latest updated wins</option></select></div>
              <div class="calc-field ${state.scope === 'department' ? '' : 'is-disabled'}"><label for="calcDepartmentId">Отдел</label><select id="calcDepartmentId" name="departmentId" ${state.scope === 'department' ? '' : 'disabled'}><option value="">Избери отдел</option>${departments.map((department) => `<option value="${escapeHtml(String(department.id || ''))}" ${String(state.departmentId || '') === String(department.id || '') ? 'selected' : ''}>${escapeHtml(department.name || department.label || 'Без име')}</option>`).join('')}</select></div>
              <div class="calc-field ${state.scope === 'schedule' ? '' : 'is-disabled'}"><label for="calcScheduleId">График</label><select id="calcScheduleId" name="scheduleId" ${state.scope === 'schedule' ? '' : 'disabled'}><option value="">Избери график</option>${schedules.map((schedule) => `<option value="${escapeHtml(String(schedule.id || ''))}" ${String(state.scheduleId || '') === String(schedule.id || '') ? 'selected' : ''}>${escapeHtml(schedule.name || 'График')}</option>`).join('')}</select></div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="general">
            <h3>Карта: Source of truth</h3>
            <div class="calc-grid">
              <div class="calc-field"><label>Primary shift resolution</label><select name="shiftResolutionPrimary"><option value="shift-id-first" ${state.shiftResolutionPrimary === 'shift-id-first' ? 'selected' : ''}>shift_id first</option><option value="department-local-first" ${state.shiftResolutionPrimary === 'department-local-first' ? 'selected' : ''}>department-local first</option></select></div>
              <div class="calc-field"><label>Secondary fallback</label><select name="shiftResolutionFallback"><option value="department-local-then-global" ${state.shiftResolutionFallback === 'department-local-then-global' ? 'selected' : ''}>department-local → global</option><option value="global-only" ${state.shiftResolutionFallback === 'global-only' ? 'selected' : ''}>global only</option></select></div>
              <div class="calc-field"><label>Classification source</label><select name="shiftClassificationSource"><option value="template-metadata" ${state.shiftClassificationSource === 'template-metadata' ? 'selected' : ''}>template metadata</option><option value="working-non-working-type" ${state.shiftClassificationSource === 'working-non-working-type' ? 'selected' : ''}>working/non-working type</option></select></div>
              <div class="calc-field"><label>Code override policy</label><select name="legacyCodeFallbackMode"><option value="fallback-only" ${state.legacyCodeFallbackMode === 'fallback-only' ? 'selected' : ''}>allowed as fallback only</option><option value="disabled" ${state.legacyCodeFallbackMode === 'disabled' ? 'selected' : ''}>disabled</option><option value="legacy-only" ${state.legacyCodeFallbackMode === 'legacy-only' ? 'selected' : ''}>allowed for legacy entries</option></select></div>
              <div class="calc-field calc-field-full">${renderCheckboxField('allowCodeOnlyFallback', 'allowCodeOnlyFallback (working/non-working never code-only)', state.allowCodeOnlyFallback)}</div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="general">
            <h3>Карта: Non-working handling</h3>
            <div class="calc-grid">
              <div class="calc-field calc-field-full"><label for="nonWorkingCodes">Non-working codes</label><input id="nonWorkingCodes" name="nonWorkingCodes" value="${escapeHtml(state.nonWorkingCodes)}" /></div>
              <div class="calc-field calc-field-full"><label for="workingCodes">Working codes</label><input id="workingCodes" name="workingCodes" value="${escapeHtml(state.workingCodes)}" /></div>
              <div class="calc-field calc-field-full">${renderCheckboxField('zeroSnapshotForNonWorking', 'zeroSnapshotForNonWorking', state.zeroSnapshotForNonWorking)}</div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="calculations" hidden>
            <h3>Карта: Worked day / Worked minutes</h3>
            <div class="calc-grid">
              <div class="calc-field"><label>Worked day rule</label><select name="workedDayRule"><option value="working-shift-and-positive-minutes" ${state.workedDayRule === 'working-shift-and-positive-minutes' ? 'selected' : ''}>working shift + positive minutes</option><option value="any-working-entry" ${state.workedDayRule === 'any-working-entry' ? 'selected' : ''}>any working entry</option></select></div>
              <div class="calc-field"><label>workedMinutesSource</label><select name="workedMinutesSource"><option value="snapshot" ${state.workedMinutesSource === 'snapshot' ? 'selected' : ''}>snapshot</option><option value="shift-template" ${state.workedMinutesSource === 'shift-template' ? 'selected' : ''}>shift template</option><option value="actual-intervals" ${state.workedMinutesSource === 'actual-intervals' ? 'selected' : ''}>actual intervals</option></select></div>
              <div class="calc-field"><label>Break handling</label><select name="includeBreakInWorkedHours"><option value="false" ${!state.includeBreakInWorkedHours ? 'selected' : ''}>изключена</option><option value="true" ${state.includeBreakInWorkedHours ? 'selected' : ''}>включена</option></select></div>
              <div class="calc-field"><label>splitShiftAggregationMode</label><select name="splitShiftAggregationMode"><option value="sum-all-intervals" ${state.splitShiftAggregationMode === 'sum-all-intervals' ? 'selected' : ''}>sum all intervals</option><option value="first-interval-only" ${state.splitShiftAggregationMode === 'first-interval-only' ? 'selected' : ''}>first interval only</option></select></div>
              <div class="calc-field">${renderCheckboxField('workedDayRequiresPositiveMinutes', 'workedDayRequiresPositiveMinutes', state.workedDayRequiresPositiveMinutes)}</div>
              <div class="calc-field">${renderCheckboxField('excludeNonWorkingCodesFromWorkedDay', 'excludeNonWorkingCodesFromWorkedDay', state.excludeNonWorkingCodesFromWorkedDay)}</div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="calculations" hidden>
            <h3>Карта: Special hours</h3>
            <div class="calc-grid">
              <div class="calc-field"><label>holidayCalculationSource</label><select name="holidayCalculationSource"><option value="segments-only" ${state.holidayCalculationSource === 'segments-only' ? 'selected' : ''}>segments only</option><option value="whole-shift" ${state.holidayCalculationSource === 'whole-shift' ? 'selected' : ''}>whole shift</option></select></div>
              <div class="calc-field"><label>weekendCalculationSource</label><select name="weekendCalculationSource"><option value="segments-only" ${state.weekendCalculationSource === 'segments-only' ? 'selected' : ''}>segments only</option><option value="whole-shift" ${state.weekendCalculationSource === 'whole-shift' ? 'selected' : ''}>whole shift</option></select></div>
              <div class="calc-field"><label>nightCalculationSource</label><select name="nightCalculationSource"><option value="segments-only" ${state.nightCalculationSource === 'segments-only' ? 'selected' : ''}>segments only</option><option value="whole-shift" ${state.nightCalculationSource === 'whole-shift' ? 'selected' : ''}>whole shift</option></select></div>
              <div class="calc-field"><label>crossMidnightSplitMode</label><select name="crossMidnightSplitMode"><option value="split-by-date" ${state.crossMidnightSplitMode === 'split-by-date' ? 'selected' : ''}>split by calendar date</option><option value="keep-original-shift" ${state.crossMidnightSplitMode === 'keep-original-shift' ? 'selected' : ''}>keep original shift</option></select></div>
              <div class="calc-field"><label>Holiday premium</label><input name="holidayPremiumCoefficient" type="number" step="0.01" min="0" value="${escapeHtml(state.holidayPremiumCoefficient)}" /></div>
              <div class="calc-field"><label>Weekend premium</label><input name="weekendPremiumCoefficient" type="number" step="0.01" min="0" value="${escapeHtml(state.weekendPremiumCoefficient)}" /></div>
              <div class="calc-field"><label>Night premium</label><input name="nightPremiumCoefficient" type="number" step="0.01" min="0" value="${escapeHtml(state.nightPremiumCoefficient)}" /></div>
              <div class="calc-field">${renderCheckboxField('specialHoursOnlyIfWorkMinutesPositive', 'Count only if work_minutes > 0', state.specialHoursOnlyIfWorkMinutesPositive)}</div>
              <div class="calc-field">${renderCheckboxField('splitByCalendarDate', 'Split by calendar date', state.splitByCalendarDate)}</div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="calculations" hidden>
            <h3>Карта: Totals and payroll</h3>
            <div class="calc-grid">
              <div class="calc-field"><label>payableHoursMode</label><select name="payableHoursMode"><option value="worked-plus-premiums" ${state.payableHoursMode === 'worked-plus-premiums' ? 'selected' : ''}>worked + premiums</option><option value="worked-only" ${state.payableHoursMode === 'worked-only' ? 'selected' : ''}>worked only</option></select></div>
              <div class="calc-field"><label>overtimeMode</label><select name="overtimeMode"><option value="worked-vs-norm" ${state.overtimeMode === 'worked-vs-norm' ? 'selected' : ''}>worked vs norm</option><option value="payable-vs-norm" ${state.overtimeMode === 'payable-vs-norm' ? 'selected' : ''}>payable vs norm</option></select></div>
              <div class="calc-field"><label>comparisonMode</label><select name="comparisonMode"><option value="monthly-norm" ${state.comparisonMode === 'monthly-norm' ? 'selected' : ''}>monthly norm</option><option value="sirv-norm" ${state.comparisonMode === 'sirv-norm' ? 'selected' : ''}>SIRV norm</option><option value="fixed-planned-hours" ${state.comparisonMode === 'fixed-planned-hours' ? 'selected' : ''}>fixed planned hours</option></select></div>
              <div class="calc-field"><label>nightConversionMode</label><select name="nightConversionMode"><option value="disabled" ${state.nightConversionMode === 'disabled' ? 'selected' : ''}>no conversion</option><option value="to-day-equivalent" ${state.nightConversionMode === 'to-day-equivalent' ? 'selected' : ''}>convert to day equivalent</option></select></div>
              <div class="calc-field">${renderCheckboxField('includePremiumsInPayable', 'includePremiumsInPayable', state.includePremiumsInPayable)}</div>
            </div>
          </section>

          <section class="calc-settings-section" data-tab-panel="simulation" hidden>
            <h3>Execution order + simulation</h3>
            <div class="calc-grid calc-grid-2-1">
              <div class="calc-field calc-field-full">
                <label>Execution pipeline</label>
                <ol class="calc-preview-list">
                  <li>Resolve shift source (primary + fallback).</li>
                  <li>Classify working/non-working.</li>
                  <li>Calculate worked day and worked minutes.</li>
                  <li>Calculate holiday/weekend/night segments.</li>
                  <li>Apply payable + overtime + comparison mode.</li>
                </ol>
              </div>
              <div class="calc-field calc-field-full">
                <label for="formulaText">Execution trace template</label>
                <textarea id="formulaText" name="formulaText" rows="8">${escapeHtml(state.formulaText)}</textarea>
              </div>
              <div class="calc-field">${renderCheckboxField('enableRuleTrace', 'enableRuleTrace', state.enableRuleTrace)}</div>
              <div class="calc-field">${renderCheckboxField('showAppliedRules', 'showAppliedRules', state.showAppliedRules)}</div>
              <div class="calc-field">${renderCheckboxField('showRejectedRules', 'showRejectedRules', state.showRejectedRules)}</div>
              <div class="calc-field calc-field-full">
                <label>Test case input / Output / Explanation trace</label>
                <div id="calcPreviewBox" class="calc-preview-box">${renderCalculationPreview(state)}</div>
              </div>
            </div>
          </section>

          <div class="calc-actions">
            <button type="button" class="calc-btn calc-btn-secondary" id="calcCancelBtn">Отказ</button>
            <button type="button" class="calc-btn calc-btn-light" id="calcPreviewBtn">Симулирай</button>
            <button type="submit" class="calc-btn calc-btn-primary">Запази настройките</button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#adminCalculationSettingsForm');
    const previewBox = container.querySelector('#calcPreviewBox');
    const scopeSelect = container.querySelector('#calcScope');

    function toggleTab(tabKey) {
      container.querySelectorAll('.calc-tab-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.calcTab === tabKey);
      });
      container.querySelectorAll('[data-tab-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== tabKey;
      });
    }

    container.querySelectorAll('.calc-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => toggleTab(btn.dataset.calcTab));
    });

    function readFormState() {
      const formData = new FormData(form);
      return {
        ...state,
        name: String(formData.get('name') || '').trim(),
        scope: String(formData.get('scope') || 'global'),
        departmentId: String(formData.get('departmentId') || '').trim(),
        scheduleId: String(formData.get('scheduleId') || '').trim(),
        isActive: String(formData.get('isActive')) === 'true',
        priority: Number(formData.get('priority') || 100),
        conflictResolution: String(formData.get('conflictResolution') || 'highest-priority-wins'),
        shiftResolutionPrimary: String(formData.get('shiftResolutionPrimary') || 'shift-id-first'),
        shiftResolutionFallback: String(formData.get('shiftResolutionFallback') || 'department-local-then-global'),
        shiftClassificationSource: String(formData.get('shiftClassificationSource') || 'template-metadata'),
        allowCodeOnlyFallback: formData.get('allowCodeOnlyFallback') === 'on',
        legacyCodeFallbackMode: String(formData.get('legacyCodeFallbackMode') || 'fallback-only'),
        workedDayRule: String(formData.get('workedDayRule') || 'working-shift-and-positive-minutes'),
        workedMinutesSource: String(formData.get('workedMinutesSource') || 'snapshot'),
        includeBreakInWorkedHours: String(formData.get('includeBreakInWorkedHours') || 'false') === 'true',
        splitShiftAggregationMode: String(formData.get('splitShiftAggregationMode') || 'sum-all-intervals'),
        zeroSnapshotForNonWorking: formData.get('zeroSnapshotForNonWorking') === 'on',
        workedDayRequiresPositiveMinutes: formData.get('workedDayRequiresPositiveMinutes') === 'on',
        excludeNonWorkingCodesFromWorkedDay: formData.get('excludeNonWorkingCodesFromWorkedDay') === 'on',
        holidayCalculationSource: String(formData.get('holidayCalculationSource') || 'segments-only'),
        weekendCalculationSource: String(formData.get('weekendCalculationSource') || 'segments-only'),
        nightCalculationSource: String(formData.get('nightCalculationSource') || 'segments-only'),
        holidayPremiumCoefficient: String(formData.get('holidayPremiumCoefficient') || '2.00'),
        weekendPremiumCoefficient: String(formData.get('weekendPremiumCoefficient') || '1.75'),
        nightPremiumCoefficient: String(formData.get('nightPremiumCoefficient') || '0.25'),
        specialHoursOnlyIfWorkMinutesPositive: formData.get('specialHoursOnlyIfWorkMinutesPositive') === 'on',
        splitByCalendarDate: formData.get('splitByCalendarDate') === 'on',
        crossMidnightSplitMode: String(formData.get('crossMidnightSplitMode') || 'split-by-date'),
        payableHoursMode: String(formData.get('payableHoursMode') || 'worked-plus-premiums'),
        overtimeMode: String(formData.get('overtimeMode') || 'worked-vs-norm'),
        comparisonMode: String(formData.get('comparisonMode') || 'monthly-norm'),
        includePremiumsInPayable: formData.get('includePremiumsInPayable') === 'on',
        nightConversionMode: String(formData.get('nightConversionMode') || 'disabled'),
        enableRuleTrace: formData.get('enableRuleTrace') === 'on',
        showAppliedRules: formData.get('showAppliedRules') === 'on',
        showRejectedRules: formData.get('showRejectedRules') === 'on',
        nonWorkingCodes: normalizeCommaCodes(formData.get('nonWorkingCodes')),
        workingCodes: normalizeCommaCodes(formData.get('workingCodes')),
        formulaText: String(formData.get('formulaText') || '').trim(),
      };
    }

    function validateSettings(nextState) {
      if (!nextState.name) return { ok: false, message: 'Попълнете име.' };
      if (nextState.scope === 'department' && !nextState.departmentId) return { ok: false, message: 'Изберете отдел.' };
      if (nextState.scope === 'schedule' && !nextState.scheduleId) return { ok: false, message: 'Изберете график.' };
      return { ok: true };
    }

    scopeSelect?.addEventListener('change', () => {
      state = readFormState();
      renderAdminCalculationSettings(container, { ...options, initialValue: state });
    });

    container.querySelector('#calcPreviewBtn')?.addEventListener('click', () => {
      state = readFormState();
      previewBox.innerHTML = renderCalculationPreview(state);
    });

    container.querySelector('#calcCancelBtn')?.addEventListener('click', () => {
      if (onCancel) onCancel(state);
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextState = readFormState();
      const validation = validateSettings(nextState);
      if (!validation.ok) {
        showCalculationSettingsMessage(container, validation.message, false);
        return;
      }
      state = nextState;
      previewBox.innerHTML = renderCalculationPreview(state);
      if (onSave) {
        const result = await onSave(state);
        if (result?.ok === false) {
          showCalculationSettingsMessage(container, result.message || 'Грешка при запис.', false);
          return;
        }
      }
      showCalculationSettingsMessage(container, 'Настройките са запазени успешно.', true);
    });
  }

  function renderCheckboxField(name, label, checked) {
    return `<label class="calc-checkbox"><input type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''} /><span>${escapeHtml(label)}</span></label>`;
  }

  function renderCalculationPreview(state) {
    const lines = [
      `Source of truth: ${state.shiftResolutionPrimary} + ${state.shiftResolutionFallback}`,
      `Classification: ${state.shiftClassificationSource} (code-only fallback: ${state.allowCodeOnlyFallback ? 'on' : 'off'})`,
      `Worked day: ${state.workedDayRule}; minutes source: ${state.workedMinutesSource}`,
      `Special hours: holiday=${state.holidayCalculationSource}, weekend=${state.weekendCalculationSource}, night=${state.nightCalculationSource}`,
      `Totals: payable=${state.payableHoursMode}, overtime=${state.overtimeMode}, compare=${state.comparisonMode}`,
      `Trace: ${state.enableRuleTrace ? 'enabled' : 'disabled'} | applied=${state.showAppliedRules ? 'yes' : 'no'} | rejected=${state.showRejectedRules ? 'yes' : 'no'}`,
    ];
    return `<ul class="calc-preview-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><div class="calc-preview-formula"><strong>Explanation trace</strong><pre>${escapeHtml(state.formulaText || 'Няма trace шаблон.')}</pre></div>`;
  }

  function showCalculationSettingsMessage(container, message, isSuccess) {
    let el = container.querySelector('.calc-settings-message');
    if (!el) {
      el = document.createElement('div');
      el.className = 'calc-settings-message';
      container.prepend(el);
    }
    el.textContent = message;
    el.classList.toggle('is-success', Boolean(isSuccess));
    el.classList.toggle('is-error', !isSuccess);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  global.AdminCalculationSettings = {
    DEFAULT_CALCULATION_SETTINGS,
    createAdminCalculationSettingsState,
    renderAdminCalculationSettings,
  };
}(window));
