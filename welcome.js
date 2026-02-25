// welcome.js (Illustrated SaaS WOW welcome + hard auto-hide)
(() => {
  const SHOW_MS = 5000;          // точно 5 секунди
  const ANIM_MS = 5200;          // прогрес анимация
  const HARD_FAILSAFE_MS = 8000; // ако нещо се обърка - маха до 8 сек

  function qs(sel) { return document.querySelector(sel); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    if (el.classList.contains('hidden')) return false;
    return true;
  }

  function ensureOverlay() {
    let el = qs('#welcomeOverlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'welcomeOverlay';
    el.className = 'welcome-overlay hidden';
    el.innerHTML = `
      <div class="ws-bg" aria-hidden="true">
        <div class="ws-sky"></div>
        <div class="ws-cloud c1"></div>
        <div class="ws-cloud c2"></div>
        <div class="ws-cloud c3"></div>
        <div class="ws-particles"></div>
        <div class="ws-gears"></div>
      </div>

      <div class="ws-wrap">
        <div class="ws-top">
          <div class="ws-brand">
            <div class="ws-brandmark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M7 7h10v10H7V7Z" stroke="white" stroke-width="2" opacity="0.9"/>
                <path d="M4 12a8 8 0 1 1 16 0" stroke="white" stroke-width="2" opacity="0.75"/>
              </svg>
            </div>
            <div class="ws-brandtxt">
              <div class="ws-kicker">Платформа</div>
              <div class="ws-title">Графици</div>
            </div>
          </div>

          <div class="ws-topright">
            <button class="ws-login" id="wsSkipBtn" type="button">Пропусни</button>
          </div>
        </div>

        <div class="ws-hero">
          <!-- LEFT -->
          <div class="ws-left">
            <h1 class="ws-h1" id="wsH1">Добре дошъл 👋</h1>
            <p class="ws-sub">
              Управлявай графици, смени и задачи на едно място — с отдели, правила и автоматични изчисления.
            </p>

            <div class="ws-cta">
              <button class="ws-btn primary" type="button" id="wsGetStarted">Продължи</button>
              <button class="ws-btn ghost" type="button" id="wsLearnMore">Какво се зарежда?</button>
            </div>

            <div class="ws-progress">
              <div class="ws-progress-row">
                <div class="ws-progress-title">Зареждане</div>
                <div class="ws-progress-pct"><span id="wsPct">0</span>%</div>
              </div>
              <div class="ws-bar">
                <div class="ws-fill" id="wsFill"></div>
                <div class="ws-glow" id="wsGlow"></div>
              </div>
              <div class="ws-chips">
                <span class="ws-chip">Служители</span>
                <span class="ws-chip">Смени</span>
                <span class="ws-chip">Календар</span>
                <span class="ws-chip">Права</span>
              </div>
            </div>

            <div class="ws-features">
              <div class="ws-feature">
                <div class="ws-fi ic1" aria-hidden="true">📅</div>
                <div>
                  <div class="ws-ft">Графици</div>
                  <div class="ws-fs">Редуване, почивки, празници</div>
                </div>
              </div>
              <div class="ws-feature">
                <div class="ws-fi ic2" aria-hidden="true">✅</div>
                <div>
                  <div class="ws-ft">Задачи</div>
                  <div class="ws-fs">Контрол и история на промени</div>
                </div>
              </div>
              <div class="ws-feature">
                <div class="ws-fi ic3" aria-hidden="true">👥</div>
                <div>
                  <div class="ws-ft">Отдели</div>
                  <div class="ws-fs" id="wsCompanyLine">Един или повече графици на екран</div>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT (Illustration) -->
          <div class="ws-right" aria-hidden="true">
            <div class="ws-desk">
              <div class="ws-card card-left">
                <div class="ws-card-top">
                  <span class="ws-pill">Employee Schedule</span>
                  <span class="ws-dot"></span>
                </div>
                <div class="ws-list">
                  <div class="ws-row"><span class="ws-avatar a1"></span><span>9:00 – 17:00</span><span class="ws-muted">Производство</span></div>
                  <div class="ws-row"><span class="ws-avatar a2"></span><span>10:00 – 18:00</span><span class="ws-muted">Поддръжка</span></div>
                  <div class="ws-row"><span class="ws-avatar a3"></span><span>8:00 – 16:00</span><span class="ws-muted">Спедиция</span></div>
                </div>
              </div>

              <div class="ws-card card-center">
                <div class="ws-card-top">
                  <span class="ws-pill">Company Calendar</span>
                  <span class="ws-dot"></span>
                </div>
                <div class="ws-cal">
                  <div class="ws-cal-head">
                    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                  </div>
                  <div class="ws-cal-grid">
                    ${Array.from({ length: 21 }).map((_, i) => {
                      const cls = [6, 12, 18].includes(i) ? 'b' : [4, 10, 16].includes(i) ? 'g' : [8, 14, 20].includes(i) ? 'p' : '';
                      return `<div class="ws-day ${cls}"></div>`;
                    }).join('')}
                  </div>
                </div>
                <div class="ws-clock"></div>
              </div>

              <div class="ws-card card-right">
                <div class="ws-card-top">
                  <span class="ws-pill">Task Management</span>
                  <span class="ws-dot"></span>
                </div>
                <div class="ws-tasks">
                  <div class="ws-task"><span class="ws-check"></span> 09:00 • Обаждане клиент</div>
                  <div class="ws-task"><span class="ws-check"></span> 10:30 • Обновяване проект</div>
                  <div class="ws-task"><span class="ws-check"></span> 12:00 • Доклад</div>
                  <div class="ws-task"><span class="ws-check"></span> 15:00 • Преглед сайт</div>
                </div>
              </div>

              <div class="ws-props">
                <div class="ws-paper"></div>
                <div class="ws-pen"></div>
                <div class="ws-cup"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="ws-bottom">
          <div class="ws-foot">© <span id="wsYear"></span> Графици</div>
          <div class="ws-foot-right">
            <span class="ws-badge">Version: dev</span>
            <span class="ws-badge">Secure session</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  function setTextFromStorage() {
    try {
      const raw = localStorage.getItem('currentUser');
      if (!raw) return;
      const user = JSON.parse(raw);

      const h1 = qs('#wsH1');
      if (h1 && user?.email) h1.textContent = `Добре дошъл, ${user.email} 👋`;

      const companyLineEl = qs('#wsCompanyLine');
      const companyName =
        user?.companyName || user?.tenant?.companyName || localStorage.getItem('companyName');

      if (companyLineEl && companyName) companyLineEl.textContent = `Фирма: ${companyName}`;
    } catch {
      // ignore
    }
  }

  let hideTimer = null;
  let hardFailsafe = null;
  let running = false;

  function showOverlay(appShell) {
    if (running) return;
    running = true;

    const el = ensureOverlay();
    setTextFromStorage();

    el.classList.remove('hidden');
    document.documentElement.classList.add('welcome-lock');

    if (appShell) appShell.classList.add('welcome-app-hidden');

    runProgress();

    // controls
    const skipBtn = qs('#wsSkipBtn');
    const getStarted = qs('#wsGetStarted');
    const learnMore = qs('#wsLearnMore');

    const hideNow = () => hideOverlay(appShell);

    if (skipBtn) skipBtn.onclick = hideNow;
    if (getStarted) getStarted.onclick = hideNow;
    if (learnMore) learnMore.onclick = () => {
      alert('Зареждаме: API връзка, профил, отдели, шаблони смени и календар. След малко влизаш в приложението.');
    };

    window.addEventListener('keydown', onKeyDown);

    // ✅ ГАРАНТИРАНО махане след 5 сек
    hideTimer = setTimeout(hideNow, SHOW_MS);

    // ✅ failsafe
    hardFailsafe = setTimeout(hideNow, HARD_FAILSAFE_MS);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      const appShell = qs('#appShell');
      hideOverlay(appShell);
    }
  }

  function hideOverlay(appShell) {
    const el = ensureOverlay();
    el.classList.add('hidden');
    document.documentElement.classList.remove('welcome-lock');
    if (appShell) appShell.classList.remove('welcome-app-hidden');

    if (hideTimer) clearTimeout(hideTimer);
    if (hardFailsafe) clearTimeout(hardFailsafe);

    window.removeEventListener('keydown', onKeyDown);
    running = false;
  }

  function runProgress() {
    const pct = qs('#wsPct');
    const fill = qs('#wsFill');
    const glow = qs('#wsGlow');
    const year = qs('#wsYear');
    if (year) year.textContent = String(new Date().getFullYear());

    const start = performance.now();

    const tick = (now) => {
      if (!running) return;
      const t = clamp((now - start) / ANIM_MS, 0, 1);
      const eased = easeOutCubic(t);
      const val = t < 1 ? Math.floor(eased * 99) : 100;

      if (pct) pct.textContent = String(val);
      if (fill) fill.style.width = `${val}%`;
      if (glow) glow.style.left = `calc(${val}% - 26px)`;

      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function observeAuthGate() {
    const preAuth = qs('#preAuthScreen');
    const appShell = qs('#appShell');
    if (!appShell) return;

    let lastAuthed = false;

    const check = () => {
      const authed = isVisible(appShell) && (preAuth ? !isVisible(preAuth) : true);

      if (authed && !lastAuthed) showOverlay(appShell);
      if (!authed && lastAuthed) hideOverlay(appShell);

      lastAuthed = authed;
    };

    check();

    const mo = new MutationObserver(check);
    mo.observe(appShell, { attributes: true, attributeFilter: ['class', 'style'] });
    if (preAuth) mo.observe(preAuth, { attributes: true, attributeFilter: ['class', 'style'] });

    setInterval(check, 900);
  }

  window.addEventListener('DOMContentLoaded', () => {
    ensureOverlay();
    observeAuthGate();
  });
})();
