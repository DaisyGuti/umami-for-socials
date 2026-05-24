(function () {
  'use strict';
  const { api, fmt } = window.UFS;
  const tableEl = document.getElementById('sites-table');
  const formEl = document.getElementById('create-site');
  const snippetCard = document.getElementById('snippet-card');
  const snippetEl = document.getElementById('snippet');

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function snippetFor(siteId) {
    return `<script async defer src="${location.origin}/tracker.js" data-site="${siteId}"></script>`;
  }

  async function load() {
    const data = await api('/api/sites');
    const rows = data.sites || [];
    if (!rows.length) {
      tableEl.innerHTML = `<tbody><tr><td class="muted">No sites yet. Add one above.</td></tr></tbody>`;
      return;
    }
    tableEl.innerHTML =
      `<thead><tr><th>Name</th><th>Site ID</th><th class="num">Views (24h)</th><th class="num">Uniques (24h)</th><th></th><th></th></tr></thead>` +
      `<tbody>${rows.map(s => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td><code>${escapeHtml(s.id)}</code></td>
          <td class="num">${fmt(s.pageviews_24h)}</td>
          <td class="num">${fmt(s.uniques_24h)}</td>
          <td><button class="link js-snippet" data-id="${s.id}">Embed</button></td>
          <td><button class="link js-delete" data-id="${s.id}" data-name="${escapeHtml(s.name)}">Delete</button></td>
        </tr>`).join('')}</tbody>`;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('site-name').value.trim();
    if (!name) return;
    await api('/api/sites', { method: 'POST', body: JSON.stringify({ name }) });
    formEl.reset();
    load();
  });

  tableEl.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('js-snippet')) {
      snippetEl.textContent = snippetFor(target.dataset.id);
      snippetCard.hidden = false;
      snippetCard.scrollIntoView({ behavior: 'smooth' });
    } else if (target.classList.contains('js-delete')) {
      const id = target.dataset.id;
      const name = target.dataset.name;
      if (!confirm(`Delete site "${name}"? This deletes all its events too.`)) return;
      await api(`/api/sites/${encodeURIComponent(id)}`, { method: 'DELETE' });
      load();
    }
  });

  document.getElementById('copy-snippet').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(snippetEl.textContent); } catch (_) { /* ignore */ }
  });

  load();
})();
