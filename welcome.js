// welcome.js
(() => {
  const DURATION_MS = 5200; // реално ~5s + малко за 100%

  function qs(sel) {
    return document.querySelector(sel);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function ensureOverlay() {
    let el = qs('#welcomeOverlay');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'welcomeOverlay';
    el.className = 'welcome-overlay hidden';
    el.innerHTML = `
      <div class="welcome-bg">
        <div class="welcome-grid"></div>
        <div class="welcome-glow"></div>
      </div>

      <div class="welcome-wrap">
        <div class="welcome-top">
          <div class="welcome-brand">
            <div class="welcome-logo" aria-hidden="true"></div>
            <div class="welcome-brand-text">
              <div class="welcome-kicker">Платформа</div>
              <div class="welcome-title">Графици</div>
            </div>
          </div>

          <div class="welcome-badge">
            <span class="welcome-dot">
              <span class="ping"></span>
              <span class="dot"></span>
            </span>
            Проверка • Профил • Настройки
          </div>
        </div>

        <div class="welcome-main">
          <div class="welcome-hero">
            <h1 class="welcome-h1">Добре дошъл 👋</h1>
            <p class="welcome-sub">
              Подготвяме работната среда — графици, служители, отдели и правила за изчисления.
            </p>
          </div>

          <div class="welcome-cards">
            <div class="welcome-card">
              <div class="welcome-card-title">Синхронизация</div>
              <div class="welcome-card-sub">Проверка на API и база данни</div>
              <div class="welcome-mini-bar"><div class="welcome-mini-fill" id="welcomeMiniFill"></div></div>
            </div>

            <div class="welcome-card">
              <div class="welcome-card-title">Правила</div>
              <div class="welcome-card-sub">8ч + 1ч почивка • Празници • Нощен труд</div>
              <div class="welcome-tags">
                <span class="welcome-tag">8ч + 1ч</span>
                <span class="welcome-tag">Празници</span>
                <span class="welcome-tag">Нощен</span>
              </div>
            </div>

            <div class="welcome-card">
              <div class="welcome-card-title">Отдели</div>
              <div class="welcome-card-sub">Готово за отделни графици</div>
              <div class="welcome-card-note" id="welcomeCompanyLine">Можеш да визуализираш един или повече графици на екран.</div>
            </div>
          </div>

          <div class="welcome-progress">
            <div class="welcome-progress-row">
              <div class="welcome-progress-title">Зареждане</div>
              <div class="welcome-progress-pct"><span id="welcomePct">0</span>%</div>
            </div>
            <div class="welcome-bar"><div class="welcome-fill" id="welcomeFill"></div></div>
            <div class="welcome-chips">
              <span class="welcome-chip">Служители</span>
              <span class="welcome-chip">Смени</span>
              <span class="welcome-chip">Календар</span>
              <span class="welcome-chip">Права</span>
            </div>
          </div>
        </div>

        <div class="welcome-bottom">
          <div class="welcome-foot">© <span id="welcomeYear"></span> Графици</div>
          <div class="welcome-foot-right">
            <span class="welcome-pill">Version: dev</span>
            <span class="welcome-pill">Secure session</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  function setWelcomeTextFromStorage() {
    // app.js пази currentUser в localStorage (вижда се по кода)
    try {
      const raw = localStorage.getItem('currentUser');
      if (!raw) return;

      const user = JSON.parse(raw);
      const h1 = qs('#welcomeOverlay .welcome-h1');
      if (h1 && user && user.email) {
        h1.textContent = `Добре дошъл, ${user.email} 👋`;
      }

      // ако пазиш фирмата някъде – може да я сложим тук
      // (ако нямаш, оставяме default текста)
      const companyLine = qs('#welcomeCompanyLine');
      const companyName =
        user?.companyName || user?.tenant?.companyName || localStorage.getItem('companyName');

      if (companyLine && companyName) {
        companyLine.textContent = `Фирма: ${companyName}`;
      }
    } catch {
      // ignore
    }
  }

  function runProgressAnimation() {
    const pct = qs('#welcomePct');
    const fill = qs('#welcomeFill');
    const mini = qs('#welcomeMiniFill');
    const year = qs('#welcomeYear');

    if (year) year.textContent = String(new Date().getFullYear());

    const start = performance.now();

    const tick = (now) => {
      const t = clamp((now - start) / DURATION_MS, 0, 1);
      const eased = easeOutCubic(t);
      const val = t < 1 ? Math.floor(eased * 99) : 100;

      if (pct) pct.textContent = String(val);
      if (fill) fill.style.width = `${val}%`;
      if (mini) mini.style.width = `${Math.min(val + 10, 100)}%`;

      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function showOverlay() {
    const el = ensureOverlay();
    setWelcomeTextFromStorage();
    el.classList.remove('hidden');
    document.documentElement.classList.add('welcome-lock'); // lock scroll
    runProgressAnimation();
  }

  function hideOverlay() {
    const el = ensureOverlay();
    el.classList.add('hidden');
    document.documentElement.classList.remove('welcome-lock');
  }

  function isElementVisible(el) {
    if (!el) return false;
    if (el.classList.contains('hidden')) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function observeAuthGate() {
    const preAuth = qs('#preAuthScreen');
    const appShell = qs('#appShell');

    if (!appShell) return;

    let alreadyShownThisSession = false;

    const maybeTrigger = () => {
      const isAuthed = isElementVisible(appShell) && (preAuth ? !isElementVisible(preAuth) : true);

      // показваме welcome само при преминаване към “authed” UI
      if (isAuthed && !alreadyShownThisSession) {
        alreadyShownThisSession = true;
        showOverlay();

        // скриваме реалния UI докато екрана е активен
        appShell.classList.add('welcome-app-hidden');

        setTimeout(() => {
          hideOverlay();
          appShell.classList.remove('welcome-app-hidden');
        }, 5000);
      }

      // ако излезеш (logout) — разреши да се покаже пак при следващ вход
      if (!isAuthed) {
        alreadyShownThisSession = false;
      }
    };

    // 1) initial
    maybeTrigger();

    // 2) mutation observer (app.js toggle-ва класове)
    const mo = new MutationObserver(maybeTrigger);
    mo.observe(appShell, { attributes: true, attributeFilter: ['class', 'style'] });
    if (preAuth) mo.observe(preAuth, { attributes: true, attributeFilter: ['class', 'style'] });

    // 3) fallback poll (ако някой toggle-ва по друг начин)
    setInterval(maybeTrigger, 600);
  }

  // init
  window.addEventListener('DOMContentLoaded', () => {
    ensureOverlay();
    observeAuthGate();
  });
})();
