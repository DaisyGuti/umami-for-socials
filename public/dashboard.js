(function () {
  'use strict';
  const { api, fmt } = window.UFS;
  const $ = (id) => document.getElementById(id);

  const siteSelect = $('site-select');
  const rangeSelect = $('range-select');
  let sourcesChart;
  let timelineChart;

  const UTM_DIMS = ['source', 'medium', 'campaign', 'term', 'content'];

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

    const utmPromises = UTM_DIMS.map((d) => api(`/api/stats/utm${qs}&dimension=${d}`));

    const [ov, src, ref, cty, lng, pgs, tl, ...utm] = await Promise.all([
      api(`/api/stats/overview${qs}`),
      api(`/api/stats/sources${qs}`),
      api(`/api/stats/referrers${qs}`),
      api(`/api/stats/countries${qs}`),
      api(`/api/stats/languages${qs}`),
      api(`/api/stats/pages${qs}`),
      api(`/api/stats/timeline${qs}&bucket=${range <= 86400 * 2 ? 'hour' : 'day'}`),
      ...utmPromises,
    ]);

    renderKpis(ov.overview, utm[UTM_DIMS.indexOf('campaign')]);

    drawSources(src.sources || []);
    drawTimeline(tl.series || [], tl.bucket);

    UTM_DIMS.forEach((d, i) => {
      renderUtmCard(d, (utm[i] && utm[i].rows) || []);
    });

    renderTable($('referrers-table'),
      ['Host', 'Source', 'Views', 'Uniques'],
      (ref.referrers || []).map(r => [r.host, r.source, r.pageviews, r.uniques]));
    renderTable($('countries-table'),
      ['Country', 'Views', 'Uniques'],
      (cty.countries || []).map(r => [r.country, r.pageviews, r.uniques]));
    renderTable($('languages-table'),
      ['Language', 'Views', 'Uniques'],
      (lng.languages || []).map(r => [r.language, r.pageviews, r.uniques]));
    renderTable($('pages-table'),
      ['Path', 'Views', 'Uniques'],
      (pgs.pages || []).map(r => [r.path, r.pageviews, r.uniques]));
  }

  function renderKpis(overview, campaignData) {
    const pageviews = overview?.pageviews ?? 0;
    const uniques = overview?.uniques ?? 0;
    const tagged = overview?.tagged ?? 0;
    $('kpi-pageviews').textContent = fmt(pageviews);
    $('kpi-uniques').textContent = fmt(uniques);

    const pct = pageviews > 0 ? Math.round((tagged / pageviews) * 100) : 0;
    $('kpi-tagged').textContent = pageviews > 0 ? `${pct}%` : '—';
    $('kpi-tagged-sub').textContent = pageviews > 0
      ? `${fmt(tagged)} of ${fmt(pageviews)} pageviews carry utm_source`
      : 'no pageviews in this range yet';

    // Top campaign — first row of the campaign breakdown that isn't the
    // synthetic "(none)" bucket for untagged traffic.
    const rows = (campaignData && campaignData.rows) || [];
    const top = rows.find(r => r.value && r.value !== '(none)');
    if (top) {
      $('kpi-top-campaign').textContent = top.value;
      $('kpi-top-campaign-sub').textContent = `${fmt(top.pageviews)} views · ${fmt(top.uniques)} unique`;
    } else {
      $('kpi-top-campaign').textContent = '—';
      $('kpi-top-campaign-sub').textContent = 'no tagged campaigns yet';
    }
  }

  // UTM cards each render as a small table where the label column has an
  // inline bar showing share-of-pageviews. The "(none)" row (untagged) is
  // intentionally kept so the user can see how much traffic is missing tags.
  function renderUtmCard(dim, rows) {
    const el = $(`utm-${dim}-table`);
    if (!rows.length) {
      el.innerHTML = `<tbody><tr><td class="muted">No tagged traffic in this range yet.</td></tr></tbody>`;
      return;
    }
    const max = rows.reduce((m, r) => Math.max(m, Number(r.pageviews) || 0), 0) || 1;
    const total = rows.reduce((s, r) => s + (Number(r.pageviews) || 0), 0) || 1;
    const top = rows.slice(0, 10);

    el.innerHTML =
      `<thead><tr>
        <th>utm_${dim}</th>
        <th class="num">Views</th>
        <th class="num">Uniq</th>
      </tr></thead>` +
      `<tbody>${top.map(r => {
        const views = Number(r.pageviews) || 0;
        const widthPct = (views / max) * 100;
        const sharePct = Math.round((views / total) * 100);
        const label = r.value === '(none)' ? '(untagged)' : r.value;
        return `<tr>
          <td class="bar-label" style="--pct: ${widthPct}%">
            ${escapeHtml(label)}<span class="pct">${sharePct}%</span>
          </td>
          <td class="num">${escapeHtml(fmt(views))}</td>
          <td class="num">${escapeHtml(fmt(r.uniques))}</td>
        </tr>`;
      }).join('')}</tbody>`;
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
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
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
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
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

  loadSites().then(refresh).catch(() => { /* gate() in app.js handles auth bounces */ });
})();
