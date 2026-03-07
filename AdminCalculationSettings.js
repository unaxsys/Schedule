(function attachAdminCalculationSettings(global) {
  const DEFAULT_CALCULATION_SETTINGS = {
    id: null,
    name: 'Основни правила',
    scope: 'platform',
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
    ruleEditor: null,
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
    const onPreview = typeof options.onPreview === 'function' ? options.onPreview : null;
    const onPublish = typeof options.onPublish === 'function' ? options.onPublish : null;
    const onRevert = typeof options.onRevert === 'function' ? options.onRevert : null;
    const onHistory = typeof options.onHistory === 'function' ? options.onHistory : null;
    const runtimeDebug = options.runtimeDebug && typeof options.runtimeDebug === 'object' ? options.runtimeDebug : null;
    const uiVersion = String(options.uiVersion || 'admin-ui');
    let state = { ...initialValue };
    state.ruleEditor = normalizeRuleEditorState(state.ruleEditor, state);

    container.innerHTML = `
      <div class="calc-settings-card">
        <div class="calc-settings-header">
          <div>
            <h2>Логика за изчисление</h2>
            <p>Настройте правилата на ясен български език: от избора на смяна до платимите часове и диагностиката.</p>
          </div>
          <span class="calc-settings-badge">${state.isActive ? 'Активна' : 'Неактивна'}</span>
        </div>

        <div class="calc-tabs" role="tablist" aria-label="Calculation tabs">
          <button type="button" class="calc-tab-btn is-active" data-calc-tab="general">Общи правила</button>
          <button type="button" class="calc-tab-btn" data-calc-tab="calculations">Изчисления</button>
          <button type="button" class="calc-tab-btn" data-calc-tab="matrix">Rule matrix</button>
          <button type="button" class="calc-tab-btn" data-calc-tab="simulation">Симулация и дебъг</button>
        </div>

        <form id="adminCalculationSettingsForm" class="calc-settings-form">
          <section class="calc-settings-section calc-section-neutral" data-tab-panel="general">
            <h3>Обхват и приоритет на правилата ${renderUsageBadge('runtime')}</h3>
            <div class="calc-grid">
              ${renderTextField('calcSettingName', 'name', state.name, 'Име на настройката', 'Например: Основни правила за СИРВ', 'Ясното име помага да различавате наборите от правила.', 'Използвайте кратко и описателно име, което да показва за кой режим е настройката.')}
              ${renderSelectField('calcIsActive', 'isActive', state.isActive ? 'true' : 'false', 'Статус', [{ value: 'true', label: 'Активна' }, { value: 'false', label: 'Неактивна' }], 'Активните правила участват в изчисленията.', 'Неактивните записи се пазят за история, но не се прилагат в runtime.')}
              ${renderSelectField('calcScope', 'scope', state.scope, 'За какво важат тези правила', [{ value: 'platform', label: 'Платформено ядро (source of truth)' }, { value: 'company', label: 'Фирмен override (бъдещ слой)' }, { value: 'department', label: 'Отделен override (бъдещ слой)' }, { value: 'schedule', label: 'График override (бъдещ слой)' }], 'Определя слоя в override веригата platform → company → department → schedule → manual cell.', 'Platform layer е основен source of truth. Останалите слоеве са само контролирани override-и.')}
              ${renderNumberField('calcPriority', 'priority', state.priority, 'Приоритет', 'Когато има няколко активни правила, по-високият приоритет печели.', 'При равни условия системата първо гледа приоритета.', 1, 1)}
              ${renderSelectField('calcConflictResolution', 'conflictResolution', state.conflictResolution, 'Решаване при конфликт', [{ value: 'highest-priority-wins', label: 'Печели по-висок приоритет' }, { value: 'latest-updated-wins', label: 'Печели последно обновената настройка' }], 'Как да се избере между две сходни настройки.', 'Препоръчително е „Печели по-висок приоритет“ за предвидимост.')}
              <div class="calc-field ${state.scope === 'department' ? '' : 'is-disabled'}">
                ${renderFieldLabel('calcDepartmentId', 'Отдел', 'Изберете отдел, когато обхватът е отделен.', 'Ползва се само ако сте избрали „Само за конкретен отдел“.')}
                <select id="calcDepartmentId" name="departmentId" ${state.scope === 'department' ? '' : 'disabled'}>
                  <option value="">Избери отдел</option>
                  ${departments.map((department) => `<option value="${escapeHtml(String(department.id || ''))}" ${String(state.departmentId || '') === String(department.id || '') ? 'selected' : ''}>${escapeHtml(department.name || department.label || 'Без име')}</option>`).join('')}
                </select>
                <small class="calc-help">Става задължително поле при отделен обхват.</small>
              </div>
              <div class="calc-field ${state.scope === 'schedule' ? '' : 'is-disabled'}">
                ${renderFieldLabel('calcScheduleId', 'График', 'Изберете график, когато обхватът е за конкретен график.', 'Ползва се само ако сте избрали „Само за конкретен график“.')}
                <select id="calcScheduleId" name="scheduleId" ${state.scope === 'schedule' ? '' : 'disabled'}>
                  <option value="">Избери график</option>
                  ${schedules.map((schedule) => `<option value="${escapeHtml(String(schedule.id || ''))}" ${String(state.scheduleId || '') === String(schedule.id || '') ? 'selected' : ''}>${escapeHtml(schedule.name || 'График')}</option>`).join('')}
                </select>
                <small class="calc-help">Става задължително поле при обхват „график“.</small>
              </div>
            </div>
          </section>

          <section class="calc-settings-section calc-section-shift" data-tab-panel="general">
            <h3>Определяне на смяната ${renderUsageBadge('runtime')}</h3>
            <div class="calc-grid">
              ${renderSelectField('shiftResolutionPrimary', 'shiftResolutionPrimary', state.shiftResolutionPrimary, 'Първи начин за намиране на смяната', [{ value: 'shift-id-first', label: 'Първо по ID на смяната' }, { value: 'department-local-first', label: 'Първо по шаблон в отдела' }], 'Това е първата стъпка при търсене на точната смяна.', 'Изберете „ID на смяната“, ако данните идват от стабилен импорт или интеграция.')}
              ${renderSelectField('shiftResolutionFallback', 'shiftResolutionFallback', state.shiftResolutionFallback, 'Резервен начин, ако първият липсва', [{ value: 'department-local-then-global', label: 'Ако няма ID, търси първо в отдела, после глобално' }, { value: 'global-only', label: 'Ако няма ID, търси само в глобалните шаблони' }], 'Определя какво става, когато не е намерено съвпадение по първото правило.', 'Първо „отдел, после глобално“ е най-безопасният вариант за смесени структури.')}
              ${renderSelectField('shiftClassificationSource', 'shiftClassificationSource', state.shiftClassificationSource, 'Как се определя дали смяната е работна', [{ value: 'template-metadata', label: 'По настройките в шаблона на смяната' }, { value: 'working-non-working-type', label: 'По тип: работен / неработен' }], 'Класификацията влияе върху worked day и специалните часове.', 'Препоръчително е да се ползва шаблонна метаданна, за да няма двусмислие.')}
              ${renderSelectField('legacyCodeFallbackMode', 'legacyCodeFallbackMode', state.legacyCodeFallbackMode, 'Политика за стари кодове', [{ value: 'fallback-only', label: 'Разреши кодове само като резервен вариант' }, { value: 'disabled', label: 'Изключи fallback по код' }, { value: 'legacy-only', label: 'Разреши кодове само за наследени записи' }], 'Управлява как да се тълкуват исторически записи с кодове.', 'При чисти данни е добре fallback по код да е изключен.')}
              ${renderCheckboxField('allowCodeOnlyFallback', 'allowCodeOnlyFallback', state.allowCodeOnlyFallback, 'Разреши класификация само по код', 'Ако е изключено, системата няма да разчита единствено на код в клетката.', 'Препоръчително: изключено, за да няма скрити грешки в класификацията.')}
            </div>
          </section>

          <section class="calc-settings-section calc-section-worked" data-tab-panel="calculations" hidden>
            <h3>Отработени дни и часове ${renderUsageBadge('runtime')}</h3>
            <div class="calc-grid">
              ${renderSelectField('workedDayRule', 'workedDayRule', state.workedDayRule, 'Кога денят се счита за отработен', [{ value: 'working-shift-and-positive-minutes', label: 'Има работна смяна и положителни минути' }, { value: 'any-working-entry', label: 'Има работен запис в деня' }], 'Определя броя worked days в обобщенията.', 'Изберете първия вариант, ако искате по-строг контрол и по-малко фалшиви worked days.')}
              ${renderSelectField('workedMinutesSource', 'workedMinutesSource', state.workedMinutesSource, 'От къде да вземем отработените минути', [{ value: 'snapshot', label: 'От snapshot-а на смяната' }, { value: 'shift-template', label: 'От часовете в шаблона на смяната' }, { value: 'actual-intervals', label: 'От реалните интервали по смяната' }], 'Определя откъде системата взема минутите за отработено време. Препоръчително е snapshot от смяната, защото пази реално изчислените минути за деня.', 'При липса на качествени интервали ползвайте snapshot; ако имате надежден контрол на присъствията, може да ползвате реални интервали.')}
              ${renderSelectField('includeBreakInWorkedHours', 'includeBreakInWorkedHours', String(state.includeBreakInWorkedHours), 'Почивката влиза ли в отработените часове', [{ value: 'false', label: 'Не, почивката се изважда' }, { value: 'true', label: 'Да, почивката се включва' }], 'Решава дали почивката намалява worked minutes.', 'В повечето случаи почивката е неплатена и се изважда.')}
              ${renderSelectField('splitShiftAggregationMode', 'splitShiftAggregationMode', state.splitShiftAggregationMode, 'При смяна с няколко интервала', [{ value: 'sum-all-intervals', label: 'Сумирай всички интервали' }, { value: 'first-interval-only', label: 'Вземи само първия интервал' }], 'Влияе как се изчисляват работните минути при split shift.', 'Изберете сумиране, ако служителите реално работят на части в един ден.')}
              ${renderCheckboxField('workedDayRequiresPositiveMinutes', 'workedDayRequiresPositiveMinutes', state.workedDayRequiresPositiveMinutes, 'Трябват реално отработени минути за worked day', 'Ако е включено, нулевите минути не вдигат отработен ден.', 'Препоръчително включено, за да се избегнат празни/технически записи.')}
              ${renderCheckboxField('excludeNonWorkingCodesFromWorkedDay', 'excludeNonWorkingCodesFromWorkedDay', state.excludeNonWorkingCodesFromWorkedDay, 'Изключи неработните кодове от worked day', 'Отпуск, болничен и почивка няма да увеличават worked days.', 'Ползвайте включено за коректни норми и присъственост.')}
              ${renderCheckboxField('zeroSnapshotForNonWorking', 'zeroSnapshotForNonWorking', state.zeroSnapshotForNonWorking, 'Нулирай минутите за неработни записи', 'Когато денят е неработен, snapshot минутите стават 0.', 'Включете, за да няма платими часове върху неработни записи.')}
              ${renderTextField('nonWorkingCodes', 'nonWorkingCodes', state.nonWorkingCodes, 'Неработни кодове (помощно/override)', 'Пример: O,B,OFF,REST,LEAVE,SICK', 'Тези кодове се използват само като помощно правило или резервен вариант. Основната класификация трябва да идва от избраната смяна и нейните настройки.', 'Не използвайте това поле като основен източник на истината. Приоритет имат ID на смяната и настройките на шаблона.')}
              ${renderTextField('workingCodes', 'workingCodes', state.workingCodes, 'Работни кодове (помощно/override)', 'Пример: Р,1СМ,2СМ', 'Тези кодове се използват само като помощно правило или резервен вариант. Основната класификация трябва да идва от избраната смяна и нейните настройки.', 'Използвайте само за наследени/спорни записи. Приоритет имат ID на смяната и настройките на шаблона.')}
            </div>
          </section>

          <section class="calc-settings-section calc-section-special" data-tab-panel="calculations" hidden>
            <h3>Празничен, почивен и нощен труд ${renderUsageBadge('runtime')}</h3>
            <div class="calc-grid">
              ${renderSelectField('holidayCalculationSource', 'holidayCalculationSource', state.holidayCalculationSource, 'Празничен труд се изчислява', [{ value: 'segments-only', label: 'Само по реално отработените сегменти' }, { value: 'whole-shift', label: 'По цялата смяна' }], 'Влияе върху минутите и премията за официални празници.', '„По сегменти“ е по-точно при частично отработени смени.')}
              ${renderSelectField('weekendCalculationSource', 'weekendCalculationSource', state.weekendCalculationSource, 'Почивен труд се изчислява', [{ value: 'segments-only', label: 'Само по реално отработените сегменти' }, { value: 'whole-shift', label: 'По цялата смяна' }], 'Влияе върху уикенд минутите и плащането им.', 'Изберете „по сегменти“, ако има чести корекции по интервали.')}
              ${renderSelectField('nightCalculationSource', 'nightCalculationSource', state.nightCalculationSource, 'Нощен труд се изчислява', [{ value: 'segments-only', label: 'Само по реално отработените сегменти' }, { value: 'whole-shift', label: 'По цялата смяна' }], 'Определя дали нощните минути се режат според реална работа.', 'При строг контрол на нощния труд използвайте „по сегменти“.')}
              ${renderSelectField('crossMidnightSplitMode', 'crossMidnightSplitMode', state.crossMidnightSplitMode, 'Смяна, която минава през полунощ', [{ value: 'split-by-date', label: 'Раздели по календарни дати' }, { value: 'keep-original-shift', label: 'Остави като една смяна' }], 'Важен избор за празник/уикенд и нощни часове.', 'Разделяне по дати е препоръчително за точни дневни отчети.')}
              ${renderNumberField('holidayPremiumCoefficient', 'holidayPremiumCoefficient', state.holidayPremiumCoefficient, 'Коефициент за празничен труд', 'Умножител за плащане на празничните часове.', 'Обичайна стойност: 2.00.', 0, 0.01)}
              ${renderNumberField('weekendPremiumCoefficient', 'weekendPremiumCoefficient', state.weekendPremiumCoefficient, 'Коефициент за почивен труд', 'Умножител за плащане на уикенд часове.', 'Обичайна стойност: 1.75.', 0, 0.01)}
              ${renderNumberField('nightPremiumCoefficient', 'nightPremiumCoefficient', state.nightPremiumCoefficient, 'Коефициент за нощен труд', 'Допълнителен коефициент върху нощните часове.', 'Ползвайте според вътрешна политика или КТ.', 0, 0.01)}
              ${renderCheckboxField('specialHoursOnlyIfWorkMinutesPositive', 'specialHoursOnlyIfWorkMinutesPositive', state.specialHoursOnlyIfWorkMinutesPositive, 'Специалните часове се броят само при реална работа', 'Ако няма отработени минути, няма празнични/нощни/уикенд минути.', 'Препоръчително включено за чисти и защитими изчисления.')}
              ${renderCheckboxField('splitByCalendarDate', 'splitByCalendarDate', state.splitByCalendarDate, 'Разделяй по календарна дата', 'Помага при смени, които минават през полунощ.', 'Включено е подходящо, когато отчетът е по календарни дни.')}
            </div>
          </section>

          <section class="calc-settings-section calc-section-payroll" data-tab-panel="calculations" hidden>
            <h3>Платими часове и извънреден труд ${renderUsageBadge('runtime')}</h3>
            <div class="calc-grid">
              ${renderSelectField('payableHoursMode', 'payableHoursMode', state.payableHoursMode, 'Как се формират платимите часове', [{ value: 'worked-plus-premiums', label: 'Отработени часове + премии' }, { value: 'worked-only', label: 'Само отработени часове' }], 'Определя финалните часове за заплащане.', 'Първият режим е стандартен при плащане на добавки.')}
              ${renderSelectField('overtimeMode', 'overtimeMode', state.overtimeMode, 'Как се изчислява извънредният труд', [{ value: 'worked-vs-norm', label: 'Сравни отработени часове с норма' }, { value: 'payable-vs-norm', label: 'Сравни платими часове с норма' }], 'Влияе директно върху overtime стойностите.', 'Изберете втория вариант само ако политиката ви гледа платимите часове.')}
              ${renderSelectField('comparisonMode', 'comparisonMode', state.comparisonMode, 'Норма за сравнение', [{ value: 'monthly-norm', label: 'Месечна норма' }, { value: 'sirv-norm', label: 'Норма по СИРВ период' }, { value: 'fixed-planned-hours', label: 'Фиксирани планирани часове' }], 'Определя с коя норма се сравнява трудът.', 'За СИРВ служители използвайте „Норма по СИРВ период“.')}
              ${renderSelectField('nightConversionMode', 'nightConversionMode', state.nightConversionMode, 'Преобразуване на нощен труд', [{ value: 'disabled', label: 'Без преобразуване' }, { value: 'to-day-equivalent', label: 'Преобразувай към дневен еквивалент' }], 'Влияе върху начина на отчитане на нощните часове.', 'Включвайте само ако методиката ви го изисква изрично.')}
              ${renderCheckboxField('includePremiumsInPayable', 'includePremiumsInPayable', state.includePremiumsInPayable, 'Включи премиите в платимите часове', 'Когато е включено, премийните компоненти увеличават payable.', 'Изключете само при режим, в който премиите се плащат отделно от часовете.')}
            </div>
          </section>

          <section class="calc-settings-section calc-section-neutral" data-tab-panel="matrix" hidden>
            <h3>Excel-подобна матрица на правилата ${renderUsageBadge('documentation')}</h3>
            <p class="calc-matrix-intro">Един изглед за правилата, източниците на данни, параметрите и реда на изпълнение. Таблиците са редактиуеми там, където е позволено.</p>

            <div class="calc-matrix-toolbar">
              <button type="button" class="calc-btn calc-btn-light" id="calcTraceBtn">Покажи разчет за избраната клетка</button>
              <span class="calc-matrix-toolbar-note">Debug trace показва примерен път: смяна → минути → премии → overtime contribution.</span>
            </div>

            <div class="calc-subtabs" role="tablist" aria-label="Rule matrix tabs">
              <button type="button" class="calc-subtab-btn is-active" data-calc-subtab="rules">Правила</button>
              <button type="button" class="calc-subtab-btn" data-calc-subtab="sources">Източници на данни</button>
              <button type="button" class="calc-subtab-btn" data-calc-subtab="parameters">Параметри</button>
              <button type="button" class="calc-subtab-btn" data-calc-subtab="execution">Execution order</button>
            </div>

            <div data-calc-subpanel="rules">${renderRulesMatrixTable(state)}</div>
            <div data-calc-subpanel="sources" hidden>${renderDataSourcesTable(state)}</div>
            <div data-calc-subpanel="parameters" hidden>${renderParametersTable(state)}</div>
            <div data-calc-subpanel="execution" hidden>${renderExecutionOrderTable(state)}</div>

            <div id="calcRuleDetails" class="calc-rule-details">
              ${renderRuleDetailsPanel(buildRuleMatrixRows(state)[0])}
            </div>
            <div id="calcTracePanel" class="calc-trace-panel" hidden></div>
            <div id="calcRuleEditorRoot">${renderRuleEditor(state.ruleEditor)}</div>
          </section>

          <section class="calc-settings-section calc-section-debug" data-tab-panel="simulation" hidden>
            <h3>Диагностика и проследяване ${renderUsageBadge('simulation')}</h3>
            <div class="calc-field calc-field-full">
              <label>Статус на live engine</label>
              <div id="calcRuntimeStatusBox" class="calc-preview-box">${renderRuntimeStatusBox(state, runtimeDebug, uiVersion)}</div>
            </div>
            <div class="calc-grid calc-grid-2-1">
              <div class="calc-field calc-field-full">
                ${renderFieldLabel('', 'Ред на изпълнение на правилата', 'Показва в какъв ред engine-ът прилага правилата.', 'Това улеснява дебъгването при неочакван резултат.')}
                <ol class="calc-preview-list">
                  <li>Определи смяната (първично правило + резервен вариант).</li>
                  <li>Определи дали записът е работен или неработен.</li>
                  <li>Изчисли отработен ден и отработени минути.</li>
                  <li>Изчисли празничен, почивен и нощен труд.</li>
                  <li>Изчисли платими часове, извънреден труд и сравнение с норма.</li>
                </ol>
              </div>
              ${renderCheckboxField('enableRuleTrace', 'enableRuleTrace', state.enableRuleTrace, 'Включи подробен trace', 'Записва какви правила са приложени по време на изчислението.', 'Полезно при проверка на спорни резултати или одит.')}
              ${renderCheckboxField('showAppliedRules', 'showAppliedRules', state.showAppliedRules, 'Показвай приложените правила', 'В прегледа ще виждате кои правила са били използвани.', 'Оставете включено, ако екипът често анализира изчисленията.')}
              ${renderCheckboxField('showRejectedRules', 'showRejectedRules', state.showRejectedRules, 'Показвай отхвърлените правила', 'Виждате кои правила не са отговаряли на условията.', 'Полезно при конфликтни настройки или fallback сценарии.')}
              <div class="calc-field calc-field-full">
                ${renderFieldLabel('formulaText', 'Текст за проследяване и документация', 'Тук описвате човешко четим trace на логиката.', 'Използвайте го за екипна документация и бърза проверка на правила.')}
                <textarea id="formulaText" name="formulaText" rows="8">${escapeHtml(state.formulaText)}</textarea>
                <small class="calc-help">Този текст не е програмен код за изпълнение. Той е за обяснение и проследяване.</small>
              </div>
              <div class="calc-field calc-field-full">
                <label>Преглед на текущата конфигурация</label>
                <div id="calcPreviewBox" class="calc-preview-box">${renderCalculationPreview(state)}</div>
              </div>
              <div class="calc-field calc-field-full">
                <label>Debug за реална клетка (служител + ден)</label>
                <div id="calcCellDebugBox" class="calc-preview-box">${renderCellDebugPanel(state)}</div>
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

    container.querySelectorAll('.calc-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.calcSubtab;
        container.querySelectorAll('.calc-subtab-btn').forEach((subBtn) => {
          subBtn.classList.toggle('is-active', subBtn.dataset.calcSubtab === key);
        });
        container.querySelectorAll('[data-calc-subpanel]').forEach((panel) => {
          panel.hidden = panel.dataset.calcSubpanel !== key;
        });
      });
    });

    container.addEventListener('click', (event) => {
      const ruleBtn = event.target.closest('[data-rule-key]');
      if (!ruleBtn || !container.contains(ruleBtn)) return;
      const ruleKey = ruleBtn.dataset.ruleKey;
      const matrixRows = buildRuleMatrixRows(state);
      const editorRows = Array.isArray(state?.ruleEditor?.draft?.rules) ? state.ruleEditor.draft.rules : [];
      const row = matrixRows.find((item) => item.key === ruleKey)
        || editorRows.find((item) => item.key === ruleKey)
        || null;
      if (!row) return;
      const details = container.querySelector('#calcRuleDetails');
      if (details) details.innerHTML = renderRuleDetailsPanel(row);
    });

    container.querySelector('#calcTraceBtn')?.addEventListener('click', () => {
      const tracePanel = container.querySelector('#calcTracePanel');
      if (!tracePanel) return;
      tracePanel.hidden = false;
      tracePanel.innerHTML = renderDebugTrace(readFormState(), state?.simulationResult || null);
    });

    container.querySelector('#calcCellDebugBtn')?.addEventListener('click', () => {
      const box = container.querySelector('#calcCellDebugResult');
      if (!box) return;
      state = readFormState();
      box.innerHTML = renderCellDebugResult(state);
    });

    bindRuleEditorEvents(container, state, {
      onChange(nextEditor) {
        state.ruleEditor = nextEditor;
      },
      onStatus(message, ok = true) {
        setInlineStatus(container, message, ok);
      },
      onPublish,
      onRevert,
      onHistory,
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
        ruleEditor: state.ruleEditor,
      };
    }

    function validateSettings(nextState) {
      if (!nextState.name) return { ok: false, message: 'Попълнете име на настройката.' };
      if (nextState.scope === 'department' && !nextState.departmentId) return { ok: false, message: 'Изберете отдел.' };
      if (nextState.scope === 'schedule' && !nextState.scheduleId) return { ok: false, message: 'Изберете график.' };
      return { ok: true };
    }

    scopeSelect?.addEventListener('change', () => {
      state = readFormState();
      renderAdminCalculationSettings(container, { ...options, initialValue: state });
    });

    container.querySelector('#calcPreviewBtn')?.addEventListener('click', async () => {
      state = readFormState();
      const runtimeBox = container.querySelector('#calcRuntimeStatusBox');
      if (runtimeBox) runtimeBox.innerHTML = renderRuntimeStatusBox(state, runtimeDebug, uiVersion);
      let simulation = null;
      if (onPreview) {
        simulation = await onPreview(state);
      }
      state.simulationResult = simulation;
      previewBox.innerHTML = renderCalculationPreview(state, simulation);
      const tracePanel = container.querySelector('#calcTracePanel');
      if (tracePanel && !tracePanel.hidden) {
        tracePanel.innerHTML = renderDebugTrace(state, simulation);
      }
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

  function renderFieldLabel(forId, label, helper, tooltip) {
    return `
      <label ${forId ? `for="${escapeHtml(forId)}"` : ''} class="calc-field-label">
        <span>${escapeHtml(label)}</span>
        <button type="button" class="calc-help-icon" tabindex="0" aria-label="Помощ" title="${escapeHtml(tooltip)}">?</button>
      </label>
      <small class="calc-help">${escapeHtml(helper)}</small>
    `;
  }

  function renderTextField(id, name, value, label, placeholder, helper, tooltip) {
    return `
      <div class="calc-field">
        ${renderFieldLabel(id, label, helper, tooltip)}
        <input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder || '')}" />
      </div>
    `;
  }

  function renderNumberField(id, name, value, label, helper, tooltip, min = 0, step = 1) {
    return `
      <div class="calc-field">
        ${renderFieldLabel(id, label, helper, tooltip)}
        <input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="number" min="${escapeHtml(min)}" step="${escapeHtml(step)}" value="${escapeHtml(value)}" />
      </div>
    `;
  }

  function renderSelectField(id, name, selectedValue, label, options, helper, tooltip) {
    return `
      <div class="calc-field">
        ${renderFieldLabel(id, label, helper, tooltip)}
        <select id="${escapeHtml(id)}" name="${escapeHtml(name)}">
          ${(options || []).map((option) => `<option value="${escapeHtml(option.value)}" ${String(selectedValue) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function renderCheckboxField(name, id, checked, label, helper, tooltip) {
    return `
      <label class="calc-checkbox" title="${escapeHtml(tooltip)}">
        <input id="${escapeHtml(id)}" type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(label)}</span>
        <button type="button" class="calc-help-icon" tabindex="0" aria-label="Помощ" title="${escapeHtml(tooltip)}">?</button>
        <small class="calc-help">${escapeHtml(helper)}</small>
      </label>
    `;
  }

  function renderUsageBadge(type) {
    const map = {
      runtime: '<span class="calc-usage-badge calc-usage-badge-runtime">Използва се в реалните изчисления</span>',
      simulation: '<span class="calc-usage-badge calc-usage-badge-sim">Само за симулация</span>',
      documentation: '<span class="calc-usage-badge calc-usage-badge-doc">Само за документация</span>',
    };
    return map[type] || '';
  }

  function buildRuleMatrixRows(state) {
    return [
      {
        key: 'worked-day',
        name: 'Worked day',
        scheduleColumn: 'Отр. дни',
        action: 'Определя дали денят е отработен',
        inputs: 'is_real_working_shift, work_minutes',
        condition: state.workedDayRequiresPositiveMinutes ? 'work_minutes > 0' : 'има работна смяна',
        formula: 'is_real_working_shift && work_minutes > 0',
        parameters: 'worked_day_requires_positive_minutes',
        from: 'global',
        to: 'global',
        priority: 100,
        isActive: 'Да',
        editable: 'Не',
        note: 'Основно правило',
        impacts: 'Отр. дни',
        module: 'computeEntrySnapshot',
        endpoint: '/api/schedules/:id/generate',
        fallback: 'Неработна смяна => worked_day = Не',
        example: 'work_minutes=540 => worked_day=Да',
      },
      {
        key: 'work-minutes',
        name: 'Work minutes',
        scheduleColumn: 'Часове',
        action: 'Изчислява работните минути',
        inputs: 'intervals, break_minutes',
        condition: 'working shift',
        formula: 'sum(work_segments) - break',
        parameters: `split_shift_mode=${state.splitShiftAggregationMode}`,
        from: 'global',
        to: 'global',
        priority: 100,
        isActive: 'Да',
        editable: 'Да',
        note: 'Базови минути',
        impacts: 'Часове, Платими часове, Overtime',
        module: 'computeEntrySnapshot',
        endpoint: '/api/admin/calculation-settings/simulate',
        fallback: 'Без snapshot => 0 минути',
        example: '08:00-17:00, break 60 => 480 мин',
      },
      {
        key: 'holiday-minutes',
        name: 'Holiday minutes',
        scheduleColumn: 'Труд празник',
        action: 'Изчислява минутите в официален празник',
        inputs: 'work_segments, holiday_calendar',
        condition: 'is_holiday',
        formula: 'sum(overlap(work_segments, holiday))',
        parameters: `holiday_rate=${state.holidayPremiumCoefficient}`,
        from: 'global',
        to: 'global',
        priority: 90,
        isActive: 'Да',
        editable: 'Да',
        note: 'Само реални сегменти',
        impacts: 'Труд празник, Платими часове',
        module: 'computeEntrySnapshot',
        endpoint: '/api/admin/calculation-settings/runtime-debug',
        fallback: 'Няма празник => 0',
        example: '240 мин в празник => holiday_minutes=240',
      },
      {
        key: 'weekend-minutes',
        name: 'Weekend minutes',
        scheduleColumn: 'Труд почивен',
        action: 'Изчислява минутите в уикенд',
        inputs: 'work_segments, calendar',
        condition: 'is_weekend',
        formula: 'sum(overlap(work_segments, weekend))',
        parameters: `weekend_rate=${state.weekendPremiumCoefficient}`,
        from: 'global',
        to: 'global',
        priority: 90,
        isActive: 'Да',
        editable: 'Да',
        note: 'Само реални сегменти',
        impacts: 'Труд почивен, Платими часове',
        module: 'computeEntrySnapshot',
        endpoint: '/api/admin/calculation-settings/runtime-debug',
        fallback: 'Делничен ден => 0',
        example: 'Събота 8ч => weekend_minutes=480',
      },
      {
        key: 'night-minutes',
        name: 'Night minutes',
        scheduleColumn: 'Нощен труд',
        action: 'Изчислява нощните минути',
        inputs: 'work_segments',
        condition: 'overlap 22:00-06:00',
        formula: 'sum(overlap(work_segments, 22-06))',
        parameters: `night_rate=${state.nightPremiumCoefficient}`,
        from: 'global',
        to: 'global',
        priority: 90,
        isActive: 'Да',
        editable: 'Да',
        note: '',
        impacts: 'Нощен труд, Платими часове',
        module: 'computeEntrySnapshot',
        endpoint: '/api/admin/calculation-settings/runtime-debug',
        fallback: 'Без overlap => 0',
        example: '22:00-02:00 => 240 мин',
      },
      {
        key: 'payable-hours',
        name: 'Payable hours',
        scheduleColumn: 'Платими часове',
        action: 'Изчислява платимите часове',
        inputs: 'work_minutes, premiums',
        condition: 'active',
        formula: 'base + premiums',
        parameters: 'holiday_rate, weekend_rate, night_rate',
        from: 'global',
        to: 'global',
        priority: 80,
        isActive: 'Да',
        editable: 'Да',
        note: '',
        impacts: 'Платими часове, Overtime (ако е включено)',
        module: 'collectSummary',
        endpoint: '/api/schedules/:id/summary',
        fallback: 'Без премии => payable = worked',
        example: '480 базови + 60 премии = 540',
      },
      {
        key: 'overtime',
        name: 'Overtime',
        scheduleColumn: 'Извънреден',
        action: 'Сравнява с норма',
        inputs: 'worked_hours, norm_hours',
        condition: 'worked > norm',
        formula: 'max(0, worked - norm)',
        parameters: `comparison_mode=${state.comparisonMode}`,
        from: 'global',
        to: 'global',
        priority: 80,
        isActive: 'Да',
        editable: 'Да',
        note: '',
        impacts: 'Извънреден',
        module: 'calculateEmployeeTotals',
        endpoint: '/api/schedules/:id/summary',
        fallback: 'Липсва норма => overtime=0',
        example: '176ч worked - 160ч norm = 16ч',
      },
      {
        key: 'sirv-worked',
        name: 'SIRV worked',
        scheduleColumn: 'СИРВ отраб.',
        action: 'Отработено по СИРВ',
        inputs: 'work_minutes',
        condition: 'SIRV schedule',
        formula: 'sum(work_minutes)/60',
        parameters: 'sirv_mode',
        from: 'global',
        to: 'global',
        priority: 80,
        isActive: 'Да',
        editable: 'Да',
        note: '',
        impacts: 'СИРВ отраб., Overtime',
        module: 'calculateEmployeeTotals',
        endpoint: '/api/schedules/:id/summary',
        fallback: 'Не е СИРВ => стандартен режим',
        example: '9600 мин/60 => 160 ч',
      },
      {
        key: 'deviation',
        name: 'Deviation',
        scheduleColumn: 'Отклонение',
        action: 'Разлика между план и реалност',
        inputs: 'planned_minutes, worked_minutes',
        condition: 'always',
        formula: 'worked - planned',
        parameters: 'deviation_mode',
        from: 'global',
        to: 'global',
        priority: 70,
        isActive: 'Да',
        editable: 'Да',
        note: 'Помага за контрол',
        impacts: 'Отклонение, Dashboard KPI',
        module: 'collectSummary',
        endpoint: '/api/schedules/:id/summary',
        fallback: 'Липсва план => показва само worked',
        example: '480 - 450 = +30 мин',
      },
    ];
  }

  function renderRulesMatrixTable(state) {
    const rows = buildRuleMatrixRows(state);
    const headers = ['Име на логика', 'Колона в графика', 'Какво прави', 'Какво влиза', 'Условие', 'Формула', 'Параметри', 'От', 'До', 'Приоритет', 'Активно', 'Редактируемо', 'Бележка'];
    return renderMatrixTable(headers, rows.map((row) => [
      { html: true, value: `<button type=\"button\" class=\"calc-link-btn\" data-rule-key=\"${escapeHtml(row.key)}\">${escapeHtml(row.name)}</button>` },
      row.scheduleColumn,
      row.action,
      row.inputs,
      row.condition,
      row.formula,
      row.parameters,
      row.from,
      row.to,
      String(row.priority),
      row.isActive,
      row.editable,
      row.note,
    ]));
  }

  function renderDataSourcesTable(state) {
    const rows = [
      ['entry_shift_id', 'Смяна в графика за деня', 'schedule entry', 'UUID', '6ec9...', 'Resolve shift by ID'],
      ['resolved_shift_id', 'Реално избран шаблон след fallback', 'shift resolver', 'UUID', 'f14b...', 'Compute work minutes'],
      ['work_minutes', 'Реално отработени минути', state.workedMinutesSource, 'number', '480', 'Worked day, Payable, Overtime'],
      ['holiday_minutes', 'Минути в празник', 'overlap engine', 'number', '120', 'Holiday minutes, Payable'],
      ['employee.department_id', 'Отдел на служителя', 'employee', 'UUID', 'dep-12', 'Resolve shift fallback'],
      ['is_holiday', 'Денят е официален празник', 'holiday calendar', 'boolean', 'true', 'Holiday minutes'],
      ['is_weekend', 'Денят е събота/неделя', 'calendar logic', 'boolean', 'false', 'Weekend minutes'],
    ];
    return renderMatrixTable(['Поле', 'Описание', 'Откъде идва', 'Тип', 'Пример', 'Използва се в'], rows);
  }

  function renderParametersTable(state) {
    const rows = [
      ['holiday_rate', state.holidayPremiumCoefficient, 'коеф.', 'Празнична премия', 'Holiday minutes, Payable', 'Да', 'global'],
      ['weekend_rate', state.weekendPremiumCoefficient, 'коеф.', 'Уикенд премия', 'Weekend minutes, Payable', 'Да', 'global'],
      ['night_rate', state.nightPremiumCoefficient, 'коеф.', 'Нощна премия', 'Night minutes, Payable', 'Да', 'global'],
      ['monthly_norm_mode', state.comparisonMode, 'режим', 'Режим за сравнение с норма', 'Overtime', 'Да', 'global'],
      ['split_shift_mode', state.splitShiftAggregationMode, 'режим', 'Агрегиране на split смени', 'Work minutes', 'Да', 'global'],
      ['worked_day_requires_positive_minutes', state.workedDayRequiresPositiveMinutes ? 'true' : 'false', 'boolean', 'Изисква >0 минути', 'Worked day', 'Да', 'global'],
    ];
    return renderMatrixTable(['Параметър', 'Стойност', 'Единица', 'Описание', 'Използва се в', 'Може ли да се редактира', 'Scope'], rows);
  }

  function renderExecutionOrderTable() {
    const rows = [
      ['1', 'Resolve shift by ID', 'entry_shift_id', 'resolved_shift', 'Fallback to department shift', 'Приоритет: конкретна смяна'],
      ['2', 'Fallback to department shift', 'department_id + date', 'resolved_shift', 'Fallback to global shift', 'Scope-aware fallback'],
      ['3', 'Fallback to global shift', 'global defaults', 'resolved_shift', 'Маркирай неработен ден', 'Последна защитна стъпка'],
      ['4', 'Classify working/non-working', 'resolved_shift + code', 'is_real_working_shift', 'Code fallback', 'Изключва OFF/LEAVE'],
      ['5', 'Compute work minutes', 'intervals + breaks', 'work_minutes', '0 минути', 'sum(work_segments)-break'],
      ['6', 'Compute holiday/weekend/night', 'work_segments + calendars', 'special minutes', '0 за съответния тип', 'По сегменти 22:00-06:00'],
      ['7', 'Compute payable', 'work + premiums', 'payable_hours', 'work_minutes only', 'Според mode и rates'],
      ['8', 'Compute overtime', 'worked/payable + norm', 'overtime_hours', '0 overtime', 'max(0, worked-norm)'],
      ['9', 'Aggregate monthly totals', 'daily snapshots', 'employee totals', 'Непълни суми', 'collectSummary/calculateEmployeeTotals'],
    ];
    return renderMatrixTable(['Стъпка', 'Какво се прави', 'Вход', 'Изход', 'Ако липсва', 'Бележка'], rows);
  }

  function renderRuleDetailsPanel(rule) {
    if (!rule) return '';
    return `
      <h4>Детайли на правило: ${escapeHtml(rule.name)}</h4>
      <ul class="calc-preview-list">
        <li><strong>Описание:</strong> ${escapeHtml(rule.action)}</li>
        <li><strong>Влияе на:</strong> ${escapeHtml(rule.impacts)}</li>
        <li><strong>Използва входове:</strong> ${escapeHtml(rule.inputs)}</li>
        <li><strong>Формула:</strong> ${escapeHtml(rule.formula)}</li>
        <li><strong>Функция / модул:</strong> ${escapeHtml(rule.module)}</li>
        <li><strong>Таблица / endpoint:</strong> ${escapeHtml(rule.endpoint)}</li>
        <li><strong>Fallback:</strong> ${escapeHtml(rule.fallback)}</li>
        <li><strong>Override allowed:</strong> ${escapeHtml(rule.editable)}</li>
        <li><strong>Пример:</strong> ${escapeHtml(rule.example)}</li>
      </ul>
    `;
  }

  function renderDebugTrace(state, simulation = null) {
    const simResult = simulation?.result || null;
    const trace = [
      '1. Resolve shift by ID',
      `2. Shift classified as ${state.shiftClassificationSource}`,
      `3. work_minutes = ${simulation?.input?.workedMinutes ?? 540}`,
      `4. holiday overlap = ${simulation?.input?.holidayMinutes ?? 0}`,
      `5. weekend overlap = ${simulation?.input?.weekendMinutes ?? 540}`,
      `6. night overlap = ${simulation?.input?.nightMinutes ?? 120}`,
      `7. worked_day = ${(simulation?.input?.workedMinutes ?? 0) > 0 ? 'true' : 'false'}`,
      `8. base_payable = ${simResult?.payableHours ?? '-'}`,
      `9. overtime contribution = ${simResult?.overtimeHours ?? '-'}`,
    ];
    return `
      <h4>Debug trace</h4>
      <div class="calc-preview-split">
        <div>
          <strong>Входни данни</strong>
          <ul class="calc-preview-list">
            <li>worked_minutes: ${escapeHtml(simulation?.input?.workedMinutes ?? 540)}</li>
            <li>holiday_minutes: ${escapeHtml(simulation?.input?.holidayMinutes ?? 0)}</li>
            <li>weekend_minutes: ${escapeHtml(simulation?.input?.weekendMinutes ?? 540)}</li>
            <li>night_minutes: ${escapeHtml(simulation?.input?.nightMinutes ?? 120)}</li>
            <li>norm_minutes: ${escapeHtml(simulation?.input?.normMinutes ?? 480)}</li>
          </ul>
        </div>
        <div>
          <strong>Краен резултат</strong>
          <ul class="calc-preview-list">
            <li>payable_hours: ${escapeHtml(simResult?.payableHours ?? '-')}</li>
            <li>overtime_hours: ${escapeHtml(simResult?.overtimeHours ?? '-')}</li>
            <li>deviation_hours: ${escapeHtml(simResult?.deviationHours ?? '-')}</li>
          </ul>
        </div>
      </div>
      <strong>Междинни изчисления</strong>
      <ol class="calc-preview-list">${trace.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol>
      <div class="calc-preview-split">
        <div><strong>Приложени правила</strong><ul class="calc-preview-list"><li><button type="button" class="calc-link-btn" data-rule-key="work-minutes">Work minutes</button></li><li><button type="button" class="calc-link-btn" data-rule-key="weekend-minutes">Weekend minutes</button></li><li><button type="button" class="calc-link-btn" data-rule-key="overtime">Overtime</button></li></ul></div>
        <div><strong>Отхвърлени правила</strong><ul class="calc-preview-list"><li><button type="button" class="calc-link-btn" data-rule-key="holiday-minutes">Holiday minutes</button> (няма припокриване)</li></ul></div>
      </div>
    `;
  }

  function renderRuntimeStatusBox(state, runtimeDebug, uiVersion) {
    const loadedId = runtimeDebug?.loadedSettingsId || state.id || '-';
    const loadedVersion = state?.ruleEditor?.version || 1;
    const runtimeVersion = runtimeDebug?.loadedSettingsSource || 'unknown';
    const draftPublished = state?.ruleEditor?.status || 'draft';
    const mismatch = runtimeDebug?.loadedSettingsId && state.id ? String(runtimeDebug.loadedSettingsId) !== String(state.id) : false;
    const engineMode = runtimeDebug?.mode || (mismatch ? 'runtime-external' : 'runtime-local');
    const modeLabel = mismatch
      ? 'Runtime engine използва друга версия'
      : (draftPublished === 'published' ? 'Тези настройки участват в live engine' : 'Това е чернова, още не е публикувана');
    const statusItems = [
      { label: 'Live engine', value: mismatch ? 'НЕ (ползва друга версия)' : (draftPublished === 'published' ? 'ДА' : 'НЕ') },
      { label: 'Simulation', value: 'ДА (винаги достъпна в този панел)' },
      { label: 'Draft', value: draftPublished === 'draft' ? 'ДА' : 'НЕ' },
      { label: 'Published', value: draftPublished === 'published' ? 'ДА' : 'НЕ' },
      { label: 'Runtime версията съвпада', value: mismatch ? 'НЕ' : 'ДА' },
    ];
    return `
      <p><strong>${escapeHtml(modeLabel)}</strong></p>
      <div class="calc-preview-formula">
        <strong>Status box (ясно за режима):</strong>
        <ul class="calc-preview-list">${statusItems.map((item) => `<li>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</li>`).join('')}</ul>
      </div>
      <ul class="calc-preview-list">
        <li>Loaded settings id: ${escapeHtml(loadedId)}</li>
        <li>Loaded settings version: ${escapeHtml(loadedVersion)}</li>
        <li>Draft / Published: ${escapeHtml(draftPublished)}</li>
        <li>Runtime engine version: ${escapeHtml(runtimeVersion)}</li>
        <li>Engine mode: ${escapeHtml(engineMode)}</li>
        <li>UI version: ${escapeHtml(uiVersion)}</li>
        <li>Mismatch: ${mismatch ? 'Да' : 'Не'}</li>
      </ul>
    `;
  }

  function renderCellDebugPanel(state) {
    return `
      <div class="calc-cell-debug-head">
        <button type="button" class="calc-btn calc-btn-light" id="calcCellDebugBtn">Покажи разчет за избраната клетка</button>
      </div>
      <div id="calcCellDebugResult">
        ${renderCellDebugResult(state)}
      </div>
    `;
  }

  function renderCellDebugResult(state) {
    const monthly = {
      worked_days_total: 20,
      worked_hours_total: 168,
      holiday_minutes_total: 0,
      weekend_minutes_total: 960,
      night_minutes_total: 240,
      payable_total: 184,
      overtime_total: 8,
      deviation_total: 4,
    };
    return `
      <div class="calc-preview-split">
        <div>
          <strong>Разчет за конкретна клетка</strong>
          <ul class="calc-preview-list">
            <li>employee: Demo Employee</li>
            <li>date: 2026-03-01</li>
            <li>избрана смяна: 2СМ</li>
            <li>shift_id: sh-2sm</li>
            <li>display name: Следобедна 2-ра смяна</li>
            <li>функция на смяната: работна смяна (14:00-23:00)</li>
            <li>flags: is_working=true, is_split=false, crosses_midnight=false</li>
            <li>как е разпозната: shift-id-first → department-local-then-global</li>
            <li>тип смяна: работна (template metadata)</li>
            <li>интервали: 14:00-23:00</li>
            <li>почивки: 60 мин</li>
            <li>work_minutes: 540</li>
            <li>holiday_minutes: 0</li>
            <li>weekend_minutes: 540</li>
            <li>night_minutes: 120</li>
            <li>payable contribution: 10.5</li>
            <li>overtime contribution: 1.0</li>
            <li>applied rules: work-minutes, weekend-minutes, night-minutes, payable-hours</li>
            <li>rejected rules: holiday-minutes (няма припокриване с празник)</li>
          </ul>
        </div>
        <div>
          <strong>Крайна стойност по засегнатите колони</strong>
          <ul class="calc-preview-list">
            <li>Отр. дни: +1 (от worked-day)</li>
            <li>Часове: +9.0 (от work-minutes)</li>
            <li>Труд почивен: +9.0 (от weekend-minutes)</li>
            <li>Нощен труд: +2.0 (от night-minutes)</li>
            <li>Платими часове: +10.5 (от payable-hours)</li>
            <li>Извънреден: +1.0 (от overtime)</li>
            <li>formula trace: payable = base + weekend + night</li>
          </ul>
          <strong>Визуална връзка с правила</strong>
          <ul class="calc-preview-list">
            <li><button type="button" class="calc-link-btn" data-rule-key="work-minutes">Rule: work-minutes</button> → параметър split_shift_mode → execution step #5</li>
            <li><button type="button" class="calc-link-btn" data-rule-key="weekend-minutes">Rule: weekend-minutes</button> → параметър weekend_rate → execution step #6</li>
            <li><button type="button" class="calc-link-btn" data-rule-key="payable-hours">Rule: payable-hours</button> → параметри rates → execution step #7</li>
          </ul>
          <strong>Месечен debug summary</strong>
          <ul class="calc-preview-list">${Object.entries(monthly).map(([k,v]) => `<li>${escapeHtml(k)}: ${escapeHtml(v)}</li>`).join('')}</ul>
        </div>
      </div>
    `;
  }

  function renderMatrixTable(headers, rows) {
    return `
      <div class="calc-table-wrap">
        <table class="calc-matrix-table">
          <thead>
            <tr>${(headers || []).map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${(rows || []).map((row) => `<tr>${row.map((cell) => {
              if (cell && typeof cell === 'object' && cell.html) return `<td>${cell.value || ''}</td>`;
              return `<td>${escapeHtml(cell)}</td>`;
            }).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCalculationPreview(state, simulation = null) {
    const lines = [
      `Определяне на смяната: ${humanShiftSource(state)}`,
      `Отработени дни и часове: ${humanWorkedRule(state)}`,
      `Специални часове: ${humanSpecialHours(state)}`,
      `Платими и извънредни: ${humanTotals(state)}`,
      `Диагностика: ${state.enableRuleTrace ? 'Подробен trace е включен' : 'Trace е изключен'}`,
      `Симулация: ${simulation?.source || 'preview'}`,
      `Версия: ${state?.ruleEditor?.version || 1}, статус: ${state?.ruleEditor?.status || 'draft'}`,
    ];

    const explain = buildSimulationExplanation(state);
    const statuses = [
      `Source of truth: ID на смяната + настройките на шаблона`,
      `Helper/override: Работни кодове и Неработни кодове`,
      `Само simulation/debug: enableRuleTrace, showAppliedRules, showRejectedRules, formulaText`,
    ];
    const howSteps = buildHowSystemCalculatesSteps(state, simulation);
    const humanRules = buildHumanRuleFormulas(state);
    const columnExplainers = buildColumnExplainers();
    const anomalies = buildAnomalyGuidance(state, simulation);

    return `
      <ul class="calc-preview-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      <div class="calc-preview-formula">
        <strong>1) Как системата смята</strong>
        <ol class="calc-preview-list">${howSteps.map((step) => `<li><strong>${escapeHtml(step.title)}:</strong> ${escapeHtml(step.description)}</li>`).join('')}</ol>
      </div>
      <div class="calc-preview-formula">
        <strong>2) Формула на човешки език</strong>
        <ul class="calc-preview-list">${humanRules.map((item) => `<li><strong>${escapeHtml(item.rule)}:</strong> ${escapeHtml(item.meaning)} Вход: ${escapeHtml(item.input)}. Връща: ${escapeHtml(item.output)}. Прилага се: ${escapeHtml(item.when)}.</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-formula">
        <strong>3) Коя колона как се получава</strong>
        <ul class="calc-preview-list">${columnExplainers.map((item) => `<li><strong>${escapeHtml(item.column)}:</strong> правила ${escapeHtml(item.rules)}; вход ${escapeHtml(item.inputs)}; смятане ${escapeHtml(item.calculation)}; пример ${escapeHtml(item.example)}.</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-split">
        <div>
          <strong>Приложени правила:</strong>
          <ul class="calc-preview-list">${explain.applied.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>
        <div>
          <strong>Неприложени правила:</strong>
          <ul class="calc-preview-list">${explain.rejected.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="calc-preview-formula">
        <strong>Защо е такъв резултатът:</strong>
        <ul class="calc-preview-list">${explain.why.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-formula">
        <strong>Откъде идват стойностите:</strong>
        <ul class="calc-preview-list">${explain.sources.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-formula">
        <strong>Статус на полетата:</strong>
        <ul class="calc-preview-list">${statuses.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-formula">
        <strong>5) Откъде идва грешката</strong>
        <ul class="calc-preview-list">${anomalies.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="calc-preview-formula">
        <strong>6) Визуална връзка между резултат и правило</strong>
        <ul class="calc-preview-list">
          <li>Резултат „Платими часове" → <button type="button" class="calc-link-btn" data-rule-key="payable-hours">правило payable-hours</button> → параметри holiday/weekend/night rate → дефиниция на смяна → execution step #7.</li>
          <li>Резултат „Извънреден" → <button type="button" class="calc-link-btn" data-rule-key="overtime">правило overtime</button> → параметър comparison_mode → execution step #8.</li>
          <li>Резултат „Нощен труд" → <button type="button" class="calc-link-btn" data-rule-key="night-minutes">правило night-minutes</button> → нощен интервал 22:00-06:00 → execution step #6.</li>
        </ul>
      </div>
      <div class="calc-preview-formula">
        <strong>Описание на логиката:</strong>
        <pre>${escapeHtml(state.formulaText || 'Няма въведено описание.')}</pre>
      </div>
    `;
  }

  function buildHowSystemCalculatesSteps(state, simulation) {
    const workedMinutes = simulation?.input?.workedMinutes ?? 540;
    return [
      { title: 'Определяне на смяната', description: `Системата първо търси смяната по ID, после използва fallback (${humanShiftSource(state)}), ако липсва директно съвпадение.` },
      { title: 'Определяне на типа на смяната', description: `Типът се разпознава по ${state.shiftClassificationSource === 'template-metadata' ? 'метаданните на шаблона' : 'работен/неработен флаг'} и помощните кодове.` },
      { title: 'Изчисляване на интервалите', description: 'Смяната се разделя на реални работни интервали, отделят се почивки и се проверява пресичане през полунощ.' },
      { title: 'Изчисляване на работните минути', description: `Работните минути се смятат като сбор на интервалите минус почивките. Текущ пример: ${workedMinutes} мин.` },
      { title: 'Изчисляване на празничен / почивен / нощен труд', description: 'Системата намира припокриване на работните интервали с празници, уикенд и нощен прозорец 22:00-06:00.' },
      { title: 'Изчисляване на платими часове', description: `Режимът е „${state.payableHoursMode === 'worked-plus-premiums' ? 'отработени + премии' : 'само отработени'}“ и отчита настройките за коефициенти.` },
      { title: 'Изчисляване на извънреден труд / отклонение', description: 'Накрая се сравнява с нормата и се формират извънреден труд и отклонение спрямо план/норма.' },
    ];
  }

  function buildHumanRuleFormulas(state) {
    return [
      { rule: 'worked-day', meaning: 'Отработен ден се брои, ако смяната е работна и има положителни отработени минути.', input: 'тип смяна, work_minutes', output: 'Отр. дни (+1 или 0)', when: 'при всеки запис за ден' },
      { rule: 'work-minutes', meaning: 'Реалното време за работа е сумата от работните интервали минус почивки.', input: 'интервали, почивка', output: 'Часове', when: 'ако смяната е работна' },
      { rule: 'holiday/weekend/night minutes', meaning: 'Специалният труд е онази част от работните интервали, която попада в празник, уикенд или нощ.', input: 'интервали + календар', output: 'Труд празник/почивен/нощен', when: 'ако има припокриване' },
      { rule: 'payable-hours', meaning: 'Платимите часове събират базовия труд и премийните надбавки според коефициентите.', input: 'work_minutes + special minutes + rates', output: 'Платими часове', when: 'след изчисляване на специалните минути' },
      { rule: 'overtime/deviation', meaning: 'Извънредният труд е превишението над норма, а отклонението е разликата между план и реалност.', input: 'worked/payable + norm/planned', output: 'Извънреден и Отклонение', when: 'в края на дневния и месечния разчет' },
    ];
  }

  function buildColumnExplainers() {
    return [
      { column: 'Отр. дни', rules: 'worked-day', inputs: 'тип смяна, work_minutes', calculation: '1 ако е работен ден с >0 минути', example: '540 мин → 1 ден' },
      { column: 'Часове', rules: 'work-minutes', inputs: 'интервали, почивки', calculation: '(минути/60)', example: '540 мин → 9.0 ч' },
      { column: 'Норма', rules: 'monthly norm', inputs: 'календар, договор', calculation: 'нормативни часове за периода', example: 'март → 168 ч' },
      { column: 'Отклонение', rules: 'deviation', inputs: 'план, реално', calculation: 'worked - planned', example: '9 - 8 = +1 ч' },
      { column: 'СИРВ норма / СИРВ отраб.', rules: 'sirv-worked + norm', inputs: 'минути по период', calculation: 'сумиране за отчетния период', example: '9600/60 = 160 ч' },
      { column: 'Извънреден', rules: 'overtime', inputs: 'worked/payable, norm', calculation: 'max(0, worked - norm)', example: '176 - 168 = 8 ч' },
      { column: 'Труд празник / Труд почивен / Нощен труд', rules: 'holiday/weekend/night minutes', inputs: 'интервали + календар', calculation: 'припокриване по вид', example: '120 мин нощен = 2 ч' },
      { column: 'Нощен т-д конв.', rules: 'night conversion', inputs: 'night_minutes, conversion mode', calculation: 'конверсия според коефициент', example: '2 ч × k = 2.28 ч' },
      { column: 'Платими часове', rules: 'payable-hours', inputs: 'база + премии', calculation: 'base + premiums', example: '9 + 1.5 = 10.5 ч' },
      { column: 'Отпуск / Ост. отпуск / Болничен / Неплатен отпуск / Самоотлъчка / Майчинство', rules: 'leave mapping', inputs: 'код на отсъствие, салдо', calculation: 'по кодове и политики за отпуск', example: 'код О → Отпуск +1 ден' },
    ];
  }

  function buildAnomalyGuidance(state, simulation) {
    const workedMinutes = simulation?.input?.workedMinutes ?? 540;
    return [
      `Необичайна стойност: ако work_minutes = ${workedMinutes}, но Отр. дни = 0, проверете правилото worked-day и параметъра worked_day_requires_positive_minutes.`,
      'Необичайна стойност: ако има нощни интервали, но Нощен труд = 0, проверете правилото night-minutes и night calculation source.',
      'Необичайна стойност: ако Платими часове изглеждат ниски, проверете дали includePremiumsInPayable е изключено.',
      'Къде да редактирате: таб „Изчисления“ за режими/коефициенти, таб „Rule matrix“ за правило и execution order.',
    ];
  }

  function buildSimulationExplanation(state) {
    const applied = [
      `Worked day = ${state.workedDayRequiresPositiveMinutes ? 'Да, изисква положителни минути' : 'Да, без изискване за положителни минути'}`,
      `Празничен труд = ${state.holidayCalculationSource === 'segments-only' ? 'по реални сегменти' : 'по цяла смяна'}`,
      `Платими часове = ${state.payableHoursMode === 'worked-plus-premiums' ? 'отработени + премии' : 'само отработени'}`,
    ];

    const rejected = [
      state.allowCodeOnlyFallback ? 'Няма отхвърлено code-only правило' : 'Code-only класификация е отхвърлена (изключена)',
      state.includePremiumsInPayable ? 'Режим „само отработени часове“ е отхвърлен' : 'Премиите в payable са отхвърлени',
      state.nightConversionMode === 'disabled' ? 'Преобразуване на нощен труд е отхвърлено' : 'Режим без преобразуване е отхвърлен',
    ];

    const why = [
      `Worked day = Да, защото ${state.workedDayRule === 'working-shift-and-positive-minutes' ? 'има работна смяна + положителни минути' : 'има работен запис'}.`,
      `Holiday = зависи от настройка „${state.holidayCalculationSource === 'segments-only' ? 'Само по реално отработените сегменти' : 'По цялата смяна'}“.`,
      `Overtime = по режим „${state.overtimeMode === 'worked-vs-norm' ? 'Сравни отработени часове с норма' : 'Сравни платими часове с норма'}“.`,
    ];

    const sources = [
      `Worked minutes source = ${state.workedMinutesSource === 'snapshot' ? 'snapshot от смяната' : (state.workedMinutesSource === 'shift-template' ? 'часове от шаблон' : 'реални интервали')}.`,
      `Класификация = ${state.shiftClassificationSource === 'template-metadata' ? 'от метаданните на шаблона' : 'от тип работен/неработен'}.`,
      `Fallback по код = ${state.allowCodeOnlyFallback ? 'разрешен' : 'ограничен (само помощно/резервно)'}.`,
    ];

    return { applied, rejected, why, sources };
  }

  function humanShiftSource(state) {
    return `${state.shiftResolutionPrimary === 'shift-id-first' ? 'първо по ID' : 'първо по отделен шаблон'}, ${state.shiftResolutionFallback === 'department-local-then-global' ? 'после отдел → глобално' : 'после само глобално'}`;
  }

  function humanWorkedRule(state) {
    return `${state.workedDayRule === 'working-shift-and-positive-minutes' ? 'работна смяна + реални минути' : 'наличен работен запис'}, източник: ${state.workedMinutesSource === 'snapshot' ? 'snapshot' : (state.workedMinutesSource === 'shift-template' ? 'шаблон' : 'интервали')}`;
  }

  function humanSpecialHours(state) {
    return `празник: ${state.holidayCalculationSource === 'segments-only' ? 'по сегменти' : 'цяла смяна'}, уикенд: ${state.weekendCalculationSource === 'segments-only' ? 'по сегменти' : 'цяла смяна'}, нощен: ${state.nightCalculationSource === 'segments-only' ? 'по сегменти' : 'цяла смяна'}`;
  }

  function humanTotals(state) {
    return `платими: ${state.payableHoursMode === 'worked-plus-premiums' ? 'отработени + премии' : 'само отработени'}, извънреден: ${state.overtimeMode === 'worked-vs-norm' ? 'отработени срещу норма' : 'платими срещу норма'}`;
  }


  function normalizeEditorRule(rule = {}, index = 0) {
    const key = String(rule.key || `rule-${index + 1}`).trim() || `rule-${index + 1}`;
    return {
      key,
      name: String(rule.name || rule.label || key),
      condition: String(rule.condition || 'always'),
      formula: String(rule.formula || ''),
      parameters: String(rule.parameters || ''),
      description: String(rule.description || ''),
      note: String(rule.note || rule.notes || ''),
      scope: String(rule.scope || 'global'),
      executionOrder: Number(rule.executionOrder || rule.step || (index + 1) * 10),
      priority: Number(rule.priority || 100),
      active: rule.active === undefined ? true : Boolean(rule.active),
    };
  }

  function normalizeRuleEditorState(input, state) {
    const fallback = {
      draft: {
        rules: buildRuleMatrixRows(state).map((row, index) => normalizeEditorRule(row, index)),
        sources: [
          { description: 'Смяна от шаблон', source: 'shift_templates', example: '08:00-17:00', usedIn: 'Work minutes', isActive: true },
          { description: 'Календар празници', source: 'holidays', example: '2026-03-03', usedIn: 'Holiday minutes', isActive: true },
        ],
        parameters: [
          { parameter: 'holiday_rate', value: state.holidayPremiumCoefficient, unit: 'coef', description: 'Празничен коефициент', usedIn: 'Holiday', isEditable: true, scope: 'global' },
          { parameter: 'weekend_rate', value: state.weekendPremiumCoefficient, unit: 'coef', description: 'Уикенд коефициент', usedIn: 'Weekend', isEditable: true, scope: 'global' },
          { parameter: 'night_rate', value: state.nightPremiumCoefficient, unit: 'coef', description: 'Нощен коефициент', usedIn: 'Night', isEditable: true, scope: 'global' },
        ],
        execution: [
          { step: 1, action: 'Resolve shift', input: 'entry', output: 'resolved shift', fallback: 'global template', notes: '' },
          { step: 2, action: 'Compute work minutes', input: 'intervals', output: 'work_minutes', fallback: '0', notes: '' },
          { step: 3, action: 'Compute premiums', input: 'minutes+rated', output: 'payable', fallback: 'worked only', notes: '' },
        ],
      },
      published: null,
      version: 1,
      status: 'draft',
      hasUnsavedChanges: false,
      conflicts: false,
      lastChangedBy: '',
      lastChangedAt: '',
      history: [],
    };
    if (!input || typeof input !== 'object') return fallback;
    return {
      ...fallback,
      ...input,
      draft: {
        ...fallback.draft,
        ...(input.draft || {}),
        rules: (Array.isArray(input?.draft?.rules) ? input.draft.rules : fallback.draft.rules).map((rule, index) => normalizeEditorRule(rule, index)),
      },
      published: input.published || null,
      history: Array.isArray(input.history) ? input.history : [],
    };
  }

  function renderRuleEditor(editorState) {
    const e = editorState || {};
    const rules = Array.isArray(e?.draft?.rules) ? e.draft.rules.map((rule, index) => normalizeEditorRule(rule, index)) : [];
    return `
      <section class="calc-rule-editor">
        <h3>Редактор на правила (платформено ядро + бъдещи override слоеве)</h3>
        <div class="calc-rule-editor-status">
          <span>${e.hasUnsavedChanges ? 'Има незаписани промени' : 'Няма незаписани промени'}</span>
          <span>Режим: ${escapeHtml(e.status || 'draft')}</span>
          <span>Версия: ${escapeHtml(e.version || 1)}</span>
          <span>${e.conflicts ? 'Има конфликт' : 'Няма конфликт'}</span>
          <span>Последна промяна от: ${escapeHtml(e.lastChangedBy || '-')}</span>
        </div>
        <div class="calc-rule-editor-toolbar">
          <button type="button" class="calc-btn calc-btn-light" data-editor-action="add-row" data-editor-table="rules">Добави нов ред</button>
          <button type="button" class="calc-btn calc-btn-primary" data-editor-action="save-all">Запази всички промени</button>
          <button type="button" class="calc-btn calc-btn-secondary" data-editor-action="cancel-all">Отмени всички промени</button>
          <button type="button" class="calc-btn calc-btn-primary" data-editor-action="publish">Публикувай</button>
          <button type="button" class="calc-btn calc-btn-secondary" data-editor-action="revert">Върни предишна версия</button>
          <button type="button" class="calc-btn calc-btn-light" data-editor-action="history">История на промените</button>
          <button type="button" class="calc-btn calc-btn-light" data-editor-action="import">Импорт</button>
          <button type="button" class="calc-btn calc-btn-light" data-editor-action="export">Експорт</button>
        </div>
        <div class="calc-table-wrap">
          <table class="calc-matrix-table calc-editor-table">
            <thead><tr><th>Key</th><th>Име</th><th>Condition</th><th>Formula</th><th>Parameters</th><th>Описание</th><th>Бележка</th><th>Scope</th><th>Execution</th><th>Priority</th><th>Active</th><th>Действия</th></tr></thead>
            <tbody>
            ${rules.map((rule, idx) => `<tr data-editor-row="${idx}">
              <td><input type="text" data-editor-field="key" value="${escapeHtml(rule.key)}" /></td>
              <td><input type="text" data-editor-field="name" value="${escapeHtml(rule.name)}" /></td>
              <td><textarea data-editor-field="condition" rows="2">${escapeHtml(rule.condition)}</textarea></td>
              <td><textarea data-editor-field="formula" rows="2">${escapeHtml(rule.formula)}</textarea></td>
              <td><input type="text" data-editor-field="parameters" value="${escapeHtml(rule.parameters)}" /></td>
              <td><textarea data-editor-field="description" rows="2">${escapeHtml(rule.description)}</textarea></td>
              <td><textarea data-editor-field="note" rows="2">${escapeHtml(rule.note)}</textarea></td>
              <td><select data-editor-field="scope"><option value="global" ${rule.scope==='global'?'selected':''}>global</option><option value="department" ${rule.scope==='department'?'selected':''}>department</option><option value="schedule" ${rule.scope==='schedule'?'selected':''}>schedule</option></select></td>
              <td><input type="number" data-editor-field="executionOrder" value="${escapeHtml(rule.executionOrder)}" /></td>
              <td><input type="number" data-editor-field="priority" value="${escapeHtml(rule.priority)}" /></td>
              <td><input type="checkbox" data-editor-field="active" ${rule.active?'checked':''} /></td>
              <td><button type="button" class="calc-btn calc-btn-light" data-editor-action="save-row" data-editor-row="${idx}">Запази</button><button type="button" class="calc-btn calc-btn-light" data-editor-action="cancel-row" data-editor-row="${idx}">Откажи</button><button type="button" class="calc-btn calc-btn-light" data-editor-action="duplicate-row" data-editor-row="${idx}">Дублирай</button><button type="button" class="calc-btn calc-btn-secondary" data-editor-action="delete-row" data-editor-row="${idx}">Изтрий</button></td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function setInlineStatus(container, message, ok = true) {
    const root = container.querySelector('.calc-rule-editor');
    if (!root) return;
    let status = root.querySelector('.calc-rule-inline-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'calc-rule-inline-status';
      root.appendChild(status);
    }
    status.textContent = message;
    status.dataset.ok = ok ? '1' : '0';
  }

  function bindRuleEditorEvents(container, state, handlers = {}) {
    const root = container.querySelector('#calcRuleEditorRoot');
    if (!root) return;

    function readRowsFromDom() {
      const rows = [];
      root.querySelectorAll('tr[data-editor-row]').forEach((tr, idx) => {
        const get = (field) => tr.querySelector(`[data-editor-field="${field}"]`);
        rows.push(normalizeEditorRule({
          key: get('key')?.value,
          name: get('name')?.value,
          condition: get('condition')?.value,
          formula: get('formula')?.value,
          parameters: get('parameters')?.value,
          description: get('description')?.value,
          note: get('note')?.value,
          scope: get('scope')?.value,
          executionOrder: Number(get('executionOrder')?.value || 0),
          priority: Number(get('priority')?.value || 100),
          active: Boolean(get('active')?.checked),
        }, idx));
      });
      return rows;
    }

    async function rebindWithState(nextEditor) {
      state.ruleEditor = normalizeRuleEditorState(nextEditor, state);
      handlers.onChange?.(state.ruleEditor);
      const target = container.querySelector('#calcRuleEditorRoot');
      if (target) {
        target.innerHTML = renderRuleEditor(state.ruleEditor);
      }
      bindRuleEditorEvents(container, state, handlers);
    }

    root.querySelectorAll('[data-editor-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.editorAction;
        const rowIdx = Number(btn.dataset.editorRow || -1);
        const currentRules = readRowsFromDom();
        if (action === 'add-row') {
          currentRules.push(normalizeEditorRule({}, currentRules.length));
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: currentRules }, hasUnsavedChanges: true });
          handlers.onStatus?.('Добавен е нов ред в draft.', true);
          return;
        }
        if (action === 'save-row') {
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: currentRules }, hasUnsavedChanges: true });
          handlers.onStatus?.('Редът е запазен в черновата.', true);
          return;
        }
        if (action === 'cancel-row') {
          await rebindWithState({ ...state.ruleEditor, hasUnsavedChanges: false });
          handlers.onStatus?.('Редакцията на реда е отказана.', true);
          return;
        }
        if (action === 'duplicate-row') {
          if (rowIdx >= 0 && currentRules[rowIdx]) {
            const clone = normalizeEditorRule({ ...currentRules[rowIdx], key: `${currentRules[rowIdx].key}-copy` }, currentRules.length);
            currentRules.splice(rowIdx + 1, 0, clone);
          }
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: currentRules }, hasUnsavedChanges: true });
          handlers.onStatus?.('Редът е дублиран.', true);
          return;
        }
        if (action === 'delete-row') {
          const nextRules = currentRules.filter((_, idx) => idx !== rowIdx);
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: nextRules }, hasUnsavedChanges: true });
          handlers.onStatus?.('Редът е изтрит от черновата.', true);
          return;
        }

        if (action === 'save-all') {
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: currentRules }, hasUnsavedChanges: false, status: 'draft' });
          handlers.onStatus?.('Черновата е запазена.', true);
        } else if (action === 'cancel-all') {
          await rebindWithState({ ...state.ruleEditor, hasUnsavedChanges: false });
          handlers.onStatus?.('Промените в черновата са отменени.', true);
        } else if (action === 'publish') {
          const result = handlers.onPublish ? await handlers.onPublish(state) : { ok: true };
          handlers.onStatus?.(result?.message || 'Публикувано успешно.', result?.ok !== false);
        } else if (action === 'revert') {
          const result = handlers.onRevert ? await handlers.onRevert(state) : { ok: true };
          handlers.onStatus?.(result?.message || 'Черновата е върната към публикуваната версия.', result?.ok !== false);
        } else if (action === 'history') {
          const result = handlers.onHistory ? await handlers.onHistory(state) : null;
          if (result?.history) handlers.onStatus?.(`История: ${result.history.length} записа.`, true);
        } else if (action === 'simulate') {
          handlers.onStatus?.('Симулацията използва текущата чернова без да публикува live.', true);
        } else {
          await rebindWithState({ ...state.ruleEditor, draft: { ...state.ruleEditor.draft, rules: currentRules }, hasUnsavedChanges: true });
          handlers.onStatus?.('Промяната е в чернова. Натиснете „Запази всички промени“.', true);
        }
      });
    });
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
