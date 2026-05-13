/* Report Hub — shared JS helpers.
 *
 * Usage (linked mode):
 *   <script src="../shared/hub.js"></script>
 *   <script>
 *     const state = setupTheme('themeToggle', 'report-hub:my_report');
 *     // state.theme is 'auto' | 'light' | 'dark' — persists to localStorage
 *   </script>
 *
 * Usage (inline mode): paste the function bodies into your <script> tag.
 *
 * All helpers are idempotent and safe to call once on DOMReady. */

/* setupTheme — wires up an auto/light/dark cycle button and persists choice.
 * Returns the persisted state object (mutable; call persistState to save changes
 * to other keys you've added). */
function setupTheme(btnId, storageKey) {
  const btn = document.getElementById(btnId);
  if (!btn) return null;
  const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
  state.theme = state.theme || 'auto';
  const apply = () => {
    if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.theme);
    btn.textContent = state.theme;
  };
  btn.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    apply();
    persistState(storageKey, state);
  });
  apply();
  return state;
}

/* persistState — write a state object to localStorage as JSON. */
function persistState(storageKey, state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

/* loadState — read a state object from localStorage (with fallback). */
function loadState(storageKey, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '') || (fallback ?? {});
  } catch (e) {
    return fallback ?? {};
  }
}

/* escapeHtml — safe string interpolation into innerHTML. */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* setupAnchorNav — highlight the currently-visible anchor in a nav.
 * Pass a CSS selector matching <a href="#section-id"> links. */
function setupAnchorNav(linksSelector, offset = 100) {
  const links = document.querySelectorAll(linksSelector);
  if (links.length === 0) return;
  const sections = [...links].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const onScroll = () => {
    const y = window.scrollY + offset;
    let cur = sections[0];
    for (const s of sections) if (s.offsetTop <= y) cur = s;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur.id));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* setupReadingProgress — update a fixed-position .progress-bar width as the page scrolls.
 * Pass the bar element's ID. */
function setupReadingProgress(barId) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? (window.scrollY / h) * 100 : 0;
    bar.style.width = p + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
