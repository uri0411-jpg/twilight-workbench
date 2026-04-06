// ═══════════════════════════════════════════
//  TWILIGHT — install-prompt.js
//  Prompts user to install PWA (hides address bar)
// ═══════════════════════════════════════════

const DISMISSED_KEY = 'twl_install_dismissed';

let _deferredPrompt = null; // Android/Chrome native install event

// ─────────────────────────────────────────
//  Detect context
// ─────────────────────────────────────────
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
}

function isDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

function setDismissed() {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
}

// ─────────────────────────────────────────
//  Banner (shown at top while in browser)
// ─────────────────────────────────────────
function showBanner() {
  if (document.getElementById('install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light)" stroke-width="2" stroke-linecap="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </div>
    <div class="install-banner-text">
      <strong>התקן את TWILIGHT</strong>
      <span>להסרת שורת הכתובת וחוויה מלאה</span>
    </div>
    <button class="install-banner-btn" id="install-btn">התקן</button>
    <button class="install-banner-close" id="install-dismiss" aria-label="סגור">✕</button>
  `;

  document.body.appendChild(banner);
  document.body.classList.add('has-install-banner');

  // Animate in
  requestAnimationFrame(() => banner.classList.add('visible'));

  document.getElementById('install-btn').addEventListener('click', () => {
    if (isIOS()) {
      showIOSInstructions();
    } else if (_deferredPrompt) {
      _deferredPrompt.prompt();
      _deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          hideBanner();
        }
        _deferredPrompt = null;
      });
    }
  });

  document.getElementById('install-dismiss').addEventListener('click', () => {
    setDismissed();
    hideBanner();
  });
}

function hideBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.classList.remove('visible');
  document.body.classList.remove('has-install-banner');
  setTimeout(() => banner.remove(), 300);
}

// ─────────────────────────────────────────
//  iOS Instructions overlay
// ─────────────────────────────────────────
function showIOSInstructions() {
  if (document.getElementById('ios-install-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ios-install-overlay';
  overlay.className = 'overlay-sheet';
  overlay.innerHTML = `
    <div class="ios-install-sheet">
      <div class="ios-install-handle"></div>
      <div class="ios-install-title">
        <img src="images/icon-96.png" width="40" height="40" style="border-radius:10px;margin-left:10px" alt="TWILIGHT icon">
        הוסף לדף הבית
      </div>
      <p class="ios-install-sub">כך תסיר את שורת הכתובת ותקבל חוויה מלאה:</p>

      <div class="ios-install-step">
        <div class="ios-step-num">1</div>
        <div class="ios-step-text">
          לחץ על כפתור השיתוף
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light)" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:4px">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          בסרגל הדפדפן
        </div>
      </div>

      <div class="ios-install-step">
        <div class="ios-step-num">2</div>
        <div class="ios-step-text">גלול מטה ולחץ <strong style="color:var(--cream)">"הוסף למסך הבית"</strong></div>
      </div>

      <div class="ios-install-step">
        <div class="ios-step-num">3</div>
        <div class="ios-step-text">לחץ <strong style="color:var(--cream)">"הוסף"</strong> — זהו!</div>
      </div>

      <button class="btn-pill" id="ios-install-close" style="margin-top:20px;font-size:14px">הבנתי</button>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.querySelector('.ios-install-sheet').classList.add('open'));

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.id === 'ios-install-close') {
      overlay.querySelector('.ios-install-sheet').classList.remove('open');
      setTimeout(() => overlay.remove(), 320);
    }
  });
}

// ─────────────────────────────────────────
//  Init
// ─────────────────────────────────────────
export function initInstallPrompt() {
  // Already installed — nothing to do
  if (isStandalone()) return;

  // Capture Android/Chrome install event
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    if (!isDismissed()) showBanner();
  });

  // iOS: show banner after short delay (no beforeinstallprompt on Safari)
  if (isIOS() && !isDismissed()) {
    setTimeout(showBanner, 2500);
  }

  // Fallback: if no beforeinstallprompt fires within 4s and not iOS, still show banner
  // (handles some desktop Chrome and edge cases)
  if (!isIOS()) {
    setTimeout(() => {
      if (!_deferredPrompt && !isStandalone() && !isDismissed()) {
        // Only show if browser supports installation at all (check via getInstalledRelatedApps)
        if ('getInstalledRelatedApps' in navigator) showBanner();
      }
    }, 4000);
  }

  // Hide banner when installed
  window.addEventListener('appinstalled', () => {
    hideBanner();
    _deferredPrompt = null;
  });
}
