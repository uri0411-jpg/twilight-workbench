// ═══════════════════════════════════════════
//  TWILIGHT — nav.js v2
//  Screen navigation: slide transitions + haptic
// ═══════════════════════════════════════════

const SCREENS      = ['main', 'spots', 'settings'];
const callbacks    = [];
let currentScreen  = 'main';

const SCREEN_ORDER = { main: 0, spots: 1, settings: 2 };

// Animation class sets — FIX #20: tracked so we can clean up
const ANIM_CLASSES = ['anim-slide-in', 'anim-slide-in-reverse', 'anim-fade'];

/**
 * Haptic feedback helper
 */
function haptic(style = 'light') {
  if (!navigator.vibrate) return;
  switch (style) {
    case 'light':  navigator.vibrate(8);  break;
    case 'medium': navigator.vibrate(15); break;
    case 'heavy':  navigator.vibrate([10, 30, 10]); break;
    default:       navigator.vibrate(8);
  }
}

/**
 * Initialize bottom nav click handlers
 */
export function initNav() {
  document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
    item.addEventListener('click', () => showScreen(item.dataset.screen));
  });
}

/**
 * Show a screen with slide animation + haptic.
 * FIX #20: animation classes removed after animation ends via animationend event.
 */
export function showScreen(id) {
  if (!SCREENS.includes(id)) return;
  if (id === currentScreen)  return;

  haptic('light');

  const prevOrder    = SCREEN_ORDER[currentScreen] ?? 0;
  const nextOrder    = SCREEN_ORDER[id] ?? 0;
  const slideForward = nextOrder > prevOrder;
  const animClass    = slideForward ? 'anim-slide-in' : 'anim-slide-in-reverse';

  // Hide all screens — strip any lingering animation classes
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (!el) return;
    el.classList.remove('active', ...ANIM_CLASSES);
  });

  // Activate target screen
  const target = document.getElementById(`screen-${id}`);
  if (target) {
    target.classList.add('active', animClass);
    target.scrollTop = 0;

    // FIX #20: remove animation class once it finishes — keeps DOM clean
    const cleanup = () => {
      target.classList.remove(animClass);
      target.removeEventListener('animationend', cleanup);
    };
    target.addEventListener('animationend', cleanup, { once: true });
  }

  // Update bottom nav active state
  document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === id);
  });

  const prev    = currentScreen;
  currentScreen = id;

  // Fire registered callbacks
  callbacks.forEach(cb => cb(id, prev));
}

/**
 * Register a callback for screen change events.
 * @param {function} cb - called with (newId, prevId)
 */
export function onScreenChange(cb) {
  callbacks.push(cb);
}

/**
 * Get current active screen id.
 */
export function getCurrentScreen() {
  return currentScreen;
}

export { haptic };

// ✎ fixed #20: animationend listener removes anim classes after transition completes
// ✓ nav.js v2 — complete