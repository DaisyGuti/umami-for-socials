// Shared dashboard helpers. Loaded on every authed page.
// Handles: redirect to /login.html when the session cookie is missing,
// wires up the log-out button, exposes a thin fetch wrapper.

(function () {
  'use strict';

  // Cloudflare Static Assets serves /login.html at both /login and /login.html
  // (with a 307 from the .html form to the clean URL). We use the clean URL
  // throughout so navigations are single-hop.
  const isLoginPage = location.pathname === '/login' || location.pathname === '/login.html';

  // Gate every page except /login behind a real cookie. We hit a tiny
  // /api/auth/check endpoint instead of trusting client-only state — that way
  // an expired/cleared cookie kicks you back to login on the very next nav.
  async function gate() {
    if (isLoginPage) return;
    try {
      const res = await fetch('/api/auth/check', { credentials: 'same-origin' });
      if (!res.ok) location.replace('/login');
    } catch (_) {
      location.replace('/login');
    }
  }
  gate();

  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/login';
    });
  }

  window.UFS = {
    async api(path, opts) {
      const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...(opts || {}),
      });
      if (res.status === 401) { location.replace('/login'); throw new Error('unauthorized'); }
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      return res.json();
    },
    fmt(n) {
      return new Intl.NumberFormat().format(n ?? 0);
    },
  };
})();
