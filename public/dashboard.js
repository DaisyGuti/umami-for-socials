(function () {
  'use strict';
  const { api, fmt } = window.UFS;
  const $ = (id) => document.getElementById(id);

  const siteSelect = $('site-select');
  const rangeSelect = $('range-select');
  let sourcesChart;
  let timelineChart;

  // The dashboard hits the worker every time the user changes site or range.
  // Queries are cheap (single indexed scan each) so we re-fetch the whole page
  // rather than diff — simpler code, fast enough for hand-scale traffic.
  async function refresh() {
    const site = siteSelect.value;
    if (!site) return;
    const range = parseInt(rangeSelect.value, 10);
    const to = Math.floor(Date.now() / 1000);
    const from = to - range;
    const qs = `?site=${encodeURIComponent(site)}&from=${from}&to=${to}`;

    const [ov, src, ref, cty, lng, pgs, tl] = await Promise.all([
      api(`/api/stats/overview${qs}`),
      api(`/api/stats/sources${qs}`),
      api(`/api/stats/referrers${qs}`),
      api(`/api/stats/countries${qs}`),
      api(`/api/stats/languages${qs}`),
      api(`/api/stats/pages${qs}`),
      api(`/api/stats/timeline${qs}&bucket=${range <= 86400 * 2 ? 'hour' : 'day'}`),
    ]);

    $('stat-pageviews').textContent = fmt(ov.overview?.pageviews);
    $('stat-uniques').textContent = fmt(ov.overview?.uniques);

    drawSources(src.sources || []);
    drawTimeline(tl.series || [], tl.bucket);
    renderTable($('referrers-table'), ['Host', 'Source', 'Views', 'Uniques'], (ref.referrers || []).map(r => [r.host, r.source, r.pageviews, r.uniques]));
    renderTable($('countries-table'), ['Country', 'Views', 'Uniques'], (cty.countries || []).map(r => [r.country, r.pageviews, r.uniques]));
    renderTable($('languages-table'), ['Language', 'Views', 'Uniques'], (lng.languages || []).map(r => [r.language, r.pageviews, r.uniques]));
    renderTable($('pages-table'), ['Path', 'Views', 'Uniques'], (pgs.pages || []).map(r => [r.path, r.pageviews, r.uniques]));

    await refreshUtm(qs);
  }

  async function refreshUtm(qs) {
    const dim = $('utm-dim').value;
    const data = await api(`/api/stats/utm${qs}&dimension=${dim}`);
    renderTable($('utm-table'), [`utm_${dim}`, 'Views', 'Uniques'], (data.rows || []).map(r => [r.value, r.pageviews, r.uniques]));
  }

  function renderTable(el, headers, rows) {
    if (!rows.length) {
      el.innerHTML = `<tbody><tr><td class="muted">No data in this range yet.</td></tr></tbody>`;
      return;
    }
    el.innerHTML =
      `<thead><tr>${headers.map((h, i) => `<th class="${i > 0 ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 ? 'num' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function drawSources(rows) {
    const ctx = document.getElementById('sources-chart');
    const labels = rows.map(r => r.source || '(direct)');
    const data = rows.map(r => r.pageviews);
    if (sourcesChart) sourcesChart.destroy();
    sourcesChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Pageviews', data, backgroundColor: '#6c4cf5' }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function drawTimeline(series, bucket) {
    const ctx = document.getElementById('timeline-chart');
    const labels = series.map(p => {
      const d = new Date(p.bucket_ts * 1000);
      return bucket === 'hour'
        ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    const pageviews = series.map(p => p.pageviews);
    const uniques = series.map(p => p.uniques);
    if (timelineChart) timelineChart.destroy();
    timelineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Pageviews', data: pageviews, borderColor: '#6c4cf5', backgroundColor: 'rgba(108,76,245,0.15)', tension: 0.25, fill: true },
          { label: 'Uniques',   data: uniques,   borderColor: '#15151a', tension: 0.25 },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  async function loadSites() {
    const data = await api('/api/sites');
    siteSelect.innerHTML = (data.sites || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    if (!siteSelect.options.length) {
      siteSelect.innerHTML = '<option value="">No sites yet — add one on the Sites page</option>';
    }
  }

  siteSelect.addEventListener('change', refresh);
  rangeSelect.addEventListener('change', refresh);
  document.getElementById('utm-dim').addEventListener('change', () => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - parseInt(rangeSelect.value, 10);
    refreshUtm(`?site=${encodeURIComponent(siteSelect.value)}&from=${from}&to=${to}`);
  });

  loadSites().then(refresh).catch(() => { /* gate() in app.js handles auth bounces */ });
})();
