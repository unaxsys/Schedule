(function attachAdminCalculationSettings(global) {
  const DEFAULT_CALCULATION_SETTINGS = {
    id: null,
    name: 'Основни правила',
    scope: 'global', // global | department | schedule
    departmentId: '',
    scheduleId: '',
    isActive: true,

    calculationMode: 'worked-hours', // standard | sirv | planned-hours | worked-hours | fixed-8h | shift-template
    workedDayRule: 'working-shift-and-minutes', // working-shift-and-minutes | any-entry | working-template-only | exclude-leaves
    holidayMode: 'segments-only', // segments-only | whole-shift
    weekendMode: 'segments-only', // segments-only | whole-shift
    nightMode: 'range-22-06', // auto | range-22-06 | disabled

    includeBreakInWorkedHours: false,
    sumSplitIntervals: true,
    holidayOnlyWorkedSegments: true,
    weekendOnlyWorkedSegments: true,
    excludeNonWorkingCodesFromWorkedDay: true,
    useShiftIdPriority: true,
    scopeAwareFallback: true,

    nonWorkingCodes: 'O,B,OFF,REST,LEAVE,SICK',
    workingCodes: 'Р,1СМ,2СМ,3СМ,4СМ,5СМ,6СМ,7СМ,Рд',

    formulaText: [
      'worked_day = is_working_shift && work_minutes > 0',
      'holiday_minutes = sum(all_work_segments_overlapping_holiday)',
      'weekend_minutes = sum(all_work_segments_overlapping_weekend)',
      'night_minutes = sum(all_work_segments_overlapping_22_06)',
      'payable_hours = work_minutes / 60',
    ].join('\n'),
  };

  function createAdminCalculationSettingsState(overrides = {}) {
    return {
      ...DEFAULT_CALCULATION_SETTINGS,
      ...overrides,
    };
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
    const onPreview = typeof options.onPreview === 'function' ? options.onPreview : null;

    let state = { ...initialValue };

    container.innerHTML = `
      <div class="calc-settings-card">
        <div class="calc-settings-header">
          <div>
            <h2>Настройки за изчисление</h2>
            <p>Управлявай логиката за worked days, часове, СИРВ, празничен, почивен и нощен труд.</p>
          </div>
          <span class="calc-settings-badge">${state.isActive ? 'Активна' : 'Неактивна'}</span>
        </div>

        <form id="adminCalculationSettingsForm" class="calc-settings-form">
          <section class="calc-settings-section">
            <h3>Основни настройки</h3>
            <div class="calc-grid">
              <div class="calc-field">
                <label for="calcSettingName">Име на настройката</label>
                <input id="calcSettingName" name="name" type="text" value="${escapeHtml(state.name)}" placeholder="Напр. Основни правила за СИРВ" />
              </div>

              <div class="calc-field">
                <label for="calcScope">Обхват</label>
                <select id="calcScope" name="scope">
                  <option value="global" ${state.scope === 'global' ? 'selected' : ''}>Глобално</option>
                  <option value="department" ${state.scope === 'department' ? 'selected' : ''}>За отдел</option>
                  <option value="schedule" ${state.scope === 'schedule' ? 'selected' : ''}>За график</option>
                </select>
              </div>

              <div class="calc-field ${state.scope === 'department' ? '' : 'is-disabled'}">
                <label for="calcDepartmentId">Отдел</label>
                <select id="calcDepartmentId" name="departmentId" ${state.scope === 'department' ? '' : 'disabled'}>
                  <option value="">Избери отдел</option>
                  ${departments.map((department) => `
                    <option value="${escapeHtml(String(department.id || ''))}" ${String(state.departmentId || '') === String(department.id || '') ? 'selected' : ''}>
                      ${escapeHtml(department.name || department.label || 'Без име')}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="calc-field ${state.scope === 'schedule' ? '' : 'is-disabled'}">
                <label for="calcScheduleId">График</label>
                <select id="calcScheduleId" name="scheduleId" ${state.scope === 'schedule' ? '' : 'disabled'}>
                  <option value="">Избери график</option>
                  ${schedules.map((schedule) => `
                    <option value="${escapeHtml(String(schedule.id || ''))}" ${String(state.scheduleId || '') === String(schedule.id || '') ? 'selected' : ''}>
                      ${escapeHtml(schedule.name || `${schedule.month || ''} ${schedule.department || ''}`.trim() || 'График')}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="calc-field">
                <label for="calcIsActive">Статус</label>
                <select id="calcIsActive" name="isActive">
                  <option value="true" ${state.isActive ? 'selected' : ''}>Активна</option>
                  <option value="false" ${!state.isActive ? 'selected' : ''}>Неактивна</option>
                </select>
              </div>
            </div>
          </section>

          <section class="calc-settings-section">
            <h3>Логика за изчисление</h3>
            <div class="calc-grid">
              <div class="calc-field">
                <label for="calcMode">Как да се изчислява</label>
                <select id="calcMode" name="calculationMode">
                  <option value="standard" ${state.calculationMode === 'standard' ? 'selected' : ''}>Стандартно</option>
                  <option value="sirv" ${state.calculationMode === 'sirv' ? 'selected' : ''}>СИРВ</option>
                  <option value="planned-hours" ${state.calculationMode === 'planned-hours' ? 'selected' : ''}>По планирани часове</option>
                  <option value="worked-hours" ${state.calculationMode === 'worked-hours' ? 'selected' : ''}>По реално отработени часове</option>
                  <option value="fixed-8h" ${state.calculationMode === 'fixed-8h' ? 'selected' : ''}>Фиксирани 8 часа</option>
                  <option value="shift-template" ${state.calculationMode === 'shift-template' ? 'selected' : ''}>По шаблон на смяна</option>
                </select>
                <small class="calc-help">Това е основният режим, по който engine-ът ще смята worked days и часовете.</small>
              </div>

              <div class="calc-field">
                <label for="workedDayRule">Работен ден се брои ако</label>
                <select id="workedDayRule" name="workedDayRule">
                  <option value="working-shift-and-minutes" ${state.workedDayRule === 'working-shift-and-minutes' ? 'selected' : ''}>Има работна смяна и work_minutes > 0</option>
                  <option value="any-entry" ${state.workedDayRule === 'any-entry' ? 'selected' : ''}>Има запис в клетката</option>
                  <option value="working-template-only" ${state.workedDayRule === 'working-template-only' ? 'selected' : ''}>Само ако шаблонът е работен</option>
                  <option value="exclude-leaves" ${state.workedDayRule === 'exclude-leaves' ? 'selected' : ''}>Без отпуск, болничен и почивка</option>
                </select>
              </div>

              <div class="calc-field">
                <label for="holidayMode">Празничен труд</label>
                <select id="holidayMode" name="holidayMode">
                  <option value="segments-only" ${state.holidayMode === 'segments-only' ? 'selected' : ''}>Само по работните сегменти</option>
                  <option value="whole-shift" ${state.holidayMode === 'whole-shift' ? 'selected' : ''}>По цялата смяна</option>
                </select>
              </div>

              <div class="calc-field">
                <label for="weekendMode">Почивен труд</label>
                <select id="weekendMode" name="weekendMode">
                  <option value="segments-only" ${state.weekendMode === 'segments-only' ? 'selected' : ''}>Само по работните сегменти</option>
                  <option value="whole-shift" ${state.weekendMode === 'whole-shift' ? 'selected' : ''}>По цялата смяна</option>
                </select>
              </div>

              <div class="calc-field">
                <label for="nightMode">Нощен труд</label>
                <select id="nightMode" name="nightMode">
                  <option value="auto" ${state.nightMode === 'auto' ? 'selected' : ''}>Автоматично</option>
                  <option value="range-22-06" ${state.nightMode === 'range-22-06' ? 'selected' : ''}>Само 22:00–06:00</option>
                  <option value="disabled" ${state.nightMode === 'disabled' ? 'selected' : ''}>Изключено</option>
                </select>
              </div>
            </div>
          </section>

          <section class="calc-settings-section">
            <h3>Правила за engine-а</h3>
            <div class="calc-checkbox-grid">
              ${renderCheckboxField('includeBreakInWorkedHours', 'Включвай почивката в работните часове', state.includeBreakInWorkedHours)}
              ${renderCheckboxField('sumSplitIntervals', 'При прекъсната смяна сумирай всички интервали', state.sumSplitIntervals)}
              ${renderCheckboxField('holidayOnlyWorkedSegments', 'Празничният труд да се смята само по работните сегменти', state.holidayOnlyWorkedSegments)}
              ${renderCheckboxField('weekendOnlyWorkedSegments', 'Почивният труд да се смята само по работните сегменти', state.weekendOnlyWorkedSegments)}
              ${renderCheckboxField('excludeNonWorkingCodesFromWorkedDay', 'Почивки и отпуски да не участват в worked day', state.excludeNonWorkingCodesFromWorkedDay)}
              ${renderCheckboxField('useShiftIdPriority', 'Първо използвай shift_id, после code fallback', state.useShiftIdPriority)}
              ${renderCheckboxField('scopeAwareFallback', 'Code fallback да е scope-aware (department -> global)', state.scopeAwareFallback)}
            </div>
          </section>

          <section class="calc-settings-section">
            <h3>Кодове и формула</h3>
            <div class="calc-grid">
              <div class="calc-field calc-field-full">
                <label for="nonWorkingCodes">Кодове, които не се броят за работни</label>
                <input id="nonWorkingCodes" name="nonWorkingCodes" type="text" value="${escapeHtml(state.nonWorkingCodes)}" placeholder="Напр. O,B,OFF,REST,LEAVE,SICK" />
                <small class="calc-help">Разделяй с запетая. Тези кодове не трябва да вдигат worked days и work minutes.</small>
              </div>

              <div class="calc-field calc-field-full">
                <label for="workingCodes">Кодове, които се считат за работни</label>
                <input id="workingCodes" name="workingCodes" type="text" value="${escapeHtml(state.workingCodes)}" placeholder="Напр. Р,1СМ,2СМ,Рд" />
              </div>

              <div class="calc-field calc-field-full">
                <label for="formulaText">Поле за правило / как да изчислява</label>
                <textarea id="formulaText" name="formulaText" rows="8" placeholder="Опиши логиката за изчисление">${escapeHtml(state.formulaText)}</textarea>
                <small class="calc-help">Това поле може да се пази като конфигурация и да се използва за документация или бъдещо rule engine изпълнение.</small>
              </div>
            </div>
          </section>

          <section class="calc-settings-section">
            <h3>Преглед на логиката</h3>
            <div class="calc-preview-box" id="calcPreviewBox">
              ${renderCalculationPreview(state)}
            </div>
          </section>

          <div class="calc-actions">
            <button type="button" class="calc-btn calc-btn-secondary" id="calcCancelBtn">Отказ</button>
            <button type="button" class="calc-btn calc-btn-light" id="calcPreviewBtn">Обнови преглед</button>
            <button type="submit" class="calc-btn calc-btn-primary">Запази настройките</button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#adminCalculationSettingsForm');
    const previewBox = container.querySelector('#calcPreviewBox');
    const scopeSelect = container.querySelector('#calcScope');
    const cancelBtn = container.querySelector('#calcCancelBtn');
    const previewBtn = container.querySelector('#calcPreviewBtn');

    function readFormState() {
      const formData = new FormData(form);
      return {
        ...state,
        name: String(formData.get('name') || '').trim(),
        scope: String(formData.get('scope') || 'global'),
        departmentId: String(formData.get('departmentId') || '').trim(),
        scheduleId: String(formData.get('scheduleId') || '').trim(),
        isActive: String(formData.get('isActive')) === 'true',

        calculationMode: String(formData.get('calculationMode') || 'worked-hours'),
        workedDayRule: String(formData.get('workedDayRule') || 'working-shift-and-minutes'),
        holidayMode: String(formData.get('holidayMode') || 'segments-only'),
        weekendMode: String(formData.get('weekendMode') || 'segments-only'),
        nightMode: String(formData.get('nightMode') || 'range-22-06'),

        includeBreakInWorkedHours: formData.get('includeBreakInWorkedHours') === 'on',
        sumSplitIntervals: formData.get('sumSplitIntervals') === 'on',
        holidayOnlyWorkedSegments: formData.get('holidayOnlyWorkedSegments') === 'on',
        weekendOnlyWorkedSegments: formData.get('weekendOnlyWorkedSegments') === 'on',
        excludeNonWorkingCodesFromWorkedDay: formData.get('excludeNonWorkingCodesFromWorkedDay') === 'on',
        useShiftIdPriority: formData.get('useShiftIdPriority') === 'on',
        scopeAwareFallback: formData.get('scopeAwareFallback') === 'on',

        nonWorkingCodes: normalizeCommaCodes(formData.get('nonWorkingCodes')),
        workingCodes: normalizeCommaCodes(formData.get('workingCodes')),
        formulaText: String(formData.get('formulaText') || '').trim(),
      };
    }

    function validateSettings(nextState) {
      if (!nextState.name) {
        return { ok: false, message: 'Попълнете име на настройката.' };
      }
      if (nextState.scope === 'department' && !nextState.departmentId) {
        return { ok: false, message: 'Изберете отдел за настройката.' };
      }
      if (nextState.scope === 'schedule' && !nextState.scheduleId) {
        return { ok: false, message: 'Изберете график за настройката.' };
      }
      if (!nextState.calculationMode) {
        return { ok: false, message: 'Изберете режим на изчисление.' };
      }
      if (!nextState.workedDayRule) {
        return { ok: false, message: 'Изберете правило за worked day.' };
      }
      return { ok: true };
    }

    function updateScopeState() {
      state = readFormState();
      renderAdminCalculationSettings(container, {
        ...options,
        initialValue: state,
      });
    }

    scopeSelect?.addEventListener('change', updateScopeState);

    previewBtn?.addEventListener('click', () => {
      state = readFormState();
      previewBox.innerHTML = renderCalculationPreview(state);
      if (onPreview) {
        onPreview(state);
      }
    });

    cancelBtn?.addEventListener('click', () => {
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
          showCalculationSettingsMessage(container, result.message || 'Грешка при запис на настройките.', false);
          return;
        }
      }

      showCalculationSettingsMessage(container, 'Настройките са запазени успешно.', true);
    });
  }

  function renderCheckboxField(name, label, checked) {
    return `
      <label class="calc-checkbox">
        <input type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function renderCalculationPreview(state) {
    const lines = [
      `Режим: ${getCalculationModeLabel(state.calculationMode)}`,
      `Worked day: ${getWorkedDayRuleLabel(state.workedDayRule)}`,
      `Празничен труд: ${getSegmentModeLabel(state.holidayMode)}`,
      `Почивен труд: ${getSegmentModeLabel(state.weekendMode)}`,
      `Нощен труд: ${getNightModeLabel(state.nightMode)}`,
      `Прекъсната смяна: ${state.sumSplitIntervals ? 'Сумирай всички интервали' : 'Не сумирай всички интервали'}`,
      `Scope-aware fallback: ${state.scopeAwareFallback ? 'Да' : 'Не'}`,
      `Shift ID priority: ${state.useShiftIdPriority ? 'Да' : 'Не'}`,
      `Non-working codes: ${state.nonWorkingCodes || 'няма'}`,
      `Working codes: ${state.workingCodes || 'няма'}`,
    ];

    return `
      <ul class="calc-preview-list">
        ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
      <div class="calc-preview-formula">
        <strong>Формула / правило:</strong>
        <pre>${escapeHtml(state.formulaText || 'Няма зададена формула.')}</pre>
      </div>
    `;
  }

  function getCalculationModeLabel(value) {
    const map = {
      standard: 'Стандартно',
      sirv: 'СИРВ',
      'planned-hours': 'По планирани часове',
      'worked-hours': 'По реално отработени часове',
      'fixed-8h': 'Фиксирани 8 часа',
      'shift-template': 'По шаблон на смяна',
    };
    return map[value] || value;
  }

  function getWorkedDayRuleLabel(value) {
    const map = {
      'working-shift-and-minutes': 'Има работна смяна и work_minutes > 0',
      'any-entry': 'Има запис в клетката',
      'working-template-only': 'Само ако шаблонът е работен',
      'exclude-leaves': 'Без отпуск, болничен и почивка',
    };
    return map[value] || value;
  }

  function getSegmentModeLabel(value) {
    const map = {
      'segments-only': 'Само по работните сегменти',
      'whole-shift': 'По цялата смяна',
    };
    return map[value] || value;
  }

  function getNightModeLabel(value) {
    const map = {
      auto: 'Автоматично',
      'range-22-06': 'Само 22:00–06:00',
      disabled: 'Изключено',
    };
    return map[value] || value;
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
