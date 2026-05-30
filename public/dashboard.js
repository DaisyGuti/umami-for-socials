(function () {
  'use strict';
  const { api, fmt } = window.UFS;
  const $ = (id) => document.getElementById(id);
  const fmtMoney = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
  const cap = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };

  const siteSelect = $('site-select');
  const rangeSelect = $('range-select');
  let timelineChart;
  let lastStacked = null;
  let lastBucket;
  let lastUtm = null;
  let lastRev = null;
  let currentFilter = null;
  let lastAnnotations = [];

  const UTM_DIMS = ['source', 'medium', 'campaign', 'term', 'content'];

  // Brand identity for known traffic channels — a brand color (drives the row
  // bar + the timeline series) and a Simple Icons slug (logo served from
  // cdn.simpleicons.org). utm_source is free text, so normalizeChannel folds
  // common aliases (fb -> facebook, ig -> instagram, yt -> youtube) onto these
  // keys; anything unknown falls back to a neutral monogram chip so a row is
  // never blank. iconColor (hex, no #) overrides the logo tint where the brand
  // color is too light to read on the chip (TikTok / X / Threads / Snapchat).
  const CHANNELS = {
    tiktok:    { label: 'TikTok',    color: '#111111', darkColor: '#eef1f3', slug: 'tiktok',        iconColor: '111111' },
    facebook:  { label: 'Facebook',  color: '#1877F2', slug: 'facebook' },
    instagram: { label: 'Instagram', color: '#E4405F', slug: 'instagram' },
    youtube:   { label: 'YouTube',   color: '#FF0000', slug: 'youtube' },
    x:         { label: 'X',         color: '#111111', darkColor: '#eef1f3', slug: 'x',             iconColor: '111111' },
    threads:   { label: 'Threads',   color: '#111111', darkColor: '#eef1f3', slug: 'threads',       iconColor: '111111' },
    linkedin:  { label: 'LinkedIn',  color: '#0A66C2', slug: 'linkedin' },
    pinterest: { label: 'Pinterest', color: '#BD081C', slug: 'pinterest' },
    reddit:    { label: 'Reddit',    color: '#FF4500', slug: 'reddit' },
    snapchat:  { label: 'Snapchat',  color: '#F5C400', slug: 'snapchat',      iconColor: '111111' },
    whatsapp:  { label: 'WhatsApp',  color: '#25D366', slug: 'whatsapp' },
    telegram:  { label: 'Telegram',  color: '#26A5E4', slug: 'telegram' },
    google:    { label: 'Google',    color: '#4285F4', slug: 'google' },
    bing:      { label: 'Bing',      color: '#258FFA', slug: 'microsoftbing' },
    email:     { label: 'Email',     color: '#0F766E', darkColor: '#1aa093', icon: 'envelope' },
  };

  const CHANNEL_ALIASES = {
    fb: 'facebook', meta: 'facebook', 'facebook.com': 'facebook',
    ig: 'instagram', insta: 'instagram', 'instagram.com': 'instagram',
    yt: 'youtube', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
    twitter: 'x', 'twitter.com': 'x', 'x.com': 'x',
    'linkedin.com': 'linkedin', li: 'linkedin',
    pin: 'pinterest', 'pinterest.com': 'pinterest',
    'reddit.com': 'reddit', snap: 'snapchat',
    wa: 'whatsapp', 'whatsapp.com': 'whatsapp',
    tg: 'telegram', 't.me': 'telegram',
    'google.com': 'google', adwords: 'google', googleads: 'google',
    newsletter: 'email', klaviyo: 'email', mailchimp: 'email', mail: 'email', gmail: 'email',
  };

  function normalizeChannel(raw) {
    const k = String(raw == null ? '' : raw).toLowerCase().trim().replace(/^www\./, '');
    if (CHANNELS[k]) return k;
    if (CHANNEL_ALIASES[k]) return CHANNEL_ALIASES[k];
    return k;
  }

  function channelColor(raw) {
    const meta = CHANNELS[normalizeChannel(raw)];
    if (!meta) return '';
    // Black brands (TikTok/X/Threads) would vanish on a dark card — swap to the
    // light variant in dark mode, exactly like their logos invert.
    return (document.documentElement.dataset.theme === 'dark' && meta.darkColor) || meta.color;
  }

  // A small brand-color dot for a channel — crisp identity without the row-height
  // hit a logo chip caused. Known channels use their brand color; anything else
  // gets a neutral dot so rows stay aligned.
  function channelDot(raw) {
    const meta = CHANNELS[normalizeChannel(raw)];
    const color = channelColor(raw);
    const title = meta ? meta.label : String(raw == null ? '' : raw);
    return `<span class="ch-dot"${color ? ` style="--ch: ${color}"` : ''} title="${escapeHtml(title)}"></span>`;
  }

  // The dashboard hits the worker every time the user changes site or range.
  // Queries are cheap (single indexed scan each) so we re-fetch the whole page
  // rather than diff — simpler code, fast enough for hand-scale traffic.
  async function refresh() {
    const site = siteSelect.value;
    if (!site) return;
    document.body.classList.add('loading');
    try {
    const range = parseInt(rangeSelect.value, 10);
    const to = Math.floor(Date.now() / 1000);
    const from = to - range;
    const qs = `?site=${encodeURIComponent(site)}&from=${from}&to=${to}`
      + (currentFilter ? `&source=${encodeURIComponent(currentFilter)}` : '');

    const utmPromises = UTM_DIMS.map((d) => api(`/api/stats/utm${qs}&dimension=${d}`));

    const [ov, ref, pgs, tl, rev, port, ann, ...utm] = await Promise.all([
      api(`/api/stats/overview${qs}`),
      api(`/api/stats/referrers${qs}`),
      api(`/api/stats/pages${qs}`),
      api(`/api/stats/timeline${qs}&bucket=${range <= 86400 * 2 ? 'hour' : 'day'}`),
      api(`/api/stats/revenue${qs}`),
      api(`/api/stats/portfolio?from=${from}&to=${to}`),
      api(`/api/annotations?site=${encodeURIComponent(site)}`),
      ...utmPromises,
    ]);

    renderKpis(ov.overview, ov.previous, utm[UTM_DIMS.indexOf('campaign')]);
    renderRevenue((rev && rev.rows) || []);
    renderInsights(ov.overview, ov.previous, (rev && rev.rows) || [], (utm[0] && utm[0].rows) || []);
    renderPortfolio((port && port.rows) || []);

    lastAnnotations = (ann && ann.rows) || [];
    renderAnnoList(lastAnnotations);
    lastStacked = tl.stacked || { buckets: [], sources: [], stacks: {} };
    lastBucket = tl.bucket;
    drawTimeline(lastStacked, lastBucket);

    lastUtm = utm;
    UTM_DIMS.forEach((d, i) => {
      renderUtmCard(d, (utm[i] && utm[i].rows) || []);
    });

    renderTable($('referrers-table'),
      ['Host', 'Source', 'Views', 'Unique'],
      (ref.referrers || []).map(r => [r.host, r.source, r.pageviews, r.uniques]),
      { textCols: [0, 1], cellRenderers: { 1: (v) => (v ? channelDot(v) : '') + escapeHtml(v) } });
    renderTable($('pages-table'),
      ['Path', 'Views', 'Unique'],
      (pgs.pages || []).map(r => [r.path, r.pageviews, r.uniques]));
    } finally {
      document.body.classList.remove('loading');
    }
  }

  // Period-over-period delta between a current and previous value.
  function deltaInfo(cur, prev) {
    cur = Number(cur) || 0; prev = Number(prev) || 0;
    if (prev === 0) return cur > 0 ? { dir: 'up', text: 'NEW' } : { dir: 'flat', text: '—' };
    const pct = Math.round(((cur - prev) / prev) * 100);
    const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    return { dir, text: `${pct > 0 ? '+' : ''}${pct}%` };
  }
  function deltaChip(cur, prev, opts) {
    const d = deltaInfo(cur, prev);
    if (opts && opts.hideFlat && d.dir === 'flat') return '';
    return `<span class="delta delta-${d.dir}${opts && opts.pill ? ' delta-pill' : ''}">${d.text}</span>`;
  }
  function rangeWord() {
    const opt = rangeSelect.options[rangeSelect.selectedIndex];
    return ((opt && opt.text) || 'period').replace(/^Last\s+/i, '');
  }

  function renderKpis(overview, previous, campaignData) {
    const pageviews = overview?.pageviews ?? 0;
    const uniques = overview?.uniques ?? 0;
    const tagged = overview?.tagged ?? 0;
    const pPageviews = previous?.pageviews ?? 0;
    const pUniques = previous?.uniques ?? 0;
    const pTagged = previous?.tagged ?? 0;

    $('kpi-pageviews').textContent = fmt(pageviews);
    $('kpi-uniques').textContent = fmt(uniques);
    const note = (cur, prev) => `${deltaChip(cur, prev, { pill: true })} <span class="delta-note">vs prev ${escapeHtml(rangeWord())}</span>`;
    $('kpi-pageviews-delta').innerHTML = note(pageviews, pPageviews);
    $('kpi-uniques-delta').innerHTML = note(uniques, pUniques);

    const pct = pageviews > 0 ? Math.round((tagged / pageviews) * 100) : 0;
    $('kpi-tagged').textContent = pageviews > 0 ? `${pct}%` : '—';
    $('kpi-tagged-sub').textContent = pageviews > 0
      ? `${fmt(tagged)} of ${fmt(pageviews)} pageviews carry utm_source`
      : 'no pageviews in this range yet';
    // Tagged is a rate — compare in percentage points, not relative %.
    if (pPageviews > 0) {
      const diff = pct - Math.round((pTagged / pPageviews) * 100);
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      $('kpi-tagged-delta').innerHTML = `<span class="delta delta-pill delta-${dir}">${diff > 0 ? '+' : ''}${diff} pts</span>`;
    } else {
      $('kpi-tagged-delta').innerHTML = '';
    }

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

    // Money KPIs.
    const revenue = overview?.revenue ?? 0;
    const orders = overview?.orders ?? 0;
    const pRevenue = previous?.revenue ?? 0;
    const pOrders = previous?.orders ?? 0;
    const convRate = uniques > 0 ? (orders / uniques) * 100 : 0;
    const pConvRate = pUniques > 0 ? (pOrders / pUniques) * 100 : 0;
    const aov = orders > 0 ? revenue / orders : 0;
    const pAov = pOrders > 0 ? pRevenue / pOrders : 0;
    $('kpi-revenue').textContent = fmtMoney(revenue);
    $('kpi-orders').textContent = fmt(orders);
    $('kpi-convrate').textContent = `${convRate.toFixed(1)}%`;
    $('kpi-aov').textContent = fmtMoney(aov);
    $('kpi-revenue-delta').innerHTML = deltaChip(revenue, pRevenue, { pill: true });
    $('kpi-orders-delta').innerHTML = deltaChip(orders, pOrders, { pill: true });
    $('kpi-aov-delta').innerHTML = deltaChip(aov, pAov, { pill: true });
    if (pUniques > 0) {
      const crDiff = Math.round((convRate - pConvRate) * 10) / 10;
      const crDir = crDiff > 0 ? 'up' : crDiff < 0 ? 'down' : 'flat';
      $('kpi-convrate-delta').innerHTML = `<span class="delta delta-pill delta-${crDir}">${crDiff > 0 ? '+' : ''}${crDiff} pts</span>`;
    } else {
      $('kpi-convrate-delta').innerHTML = '';
    }
  }

  // Revenue-by-channel table: revenue-share bar (brand-colored), orders, AOV,
  // and the period delta. This is the "which channel makes money" view.
  function renderRevenue(rows) {
    lastRev = rows;
    const el = $('revenue-table');
    if (!rows || !rows.length) {
      el.innerHTML = `<tbody><tr><td><div class="empty-state">No orders in this range yet. Once the tracker sends conversion events with a revenue value, channel revenue shows up here.</div></td></tr></tbody>`;
      return;
    }
    const maxRev = rows.reduce((m, r) => Math.max(m, Number(r.revenue) || 0), 0) || 1;
    el.innerHTML =
      `<thead><tr><th></th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">AOV</th></tr></thead>` +
      `<tbody>${rows.map(r => {
        const rev = Number(r.revenue) || 0;
        const orders = Number(r.orders) || 0;
        const aov = orders > 0 ? rev / orders : 0;
        const widthPct = (rev / maxRev) * 100;
        const color = channelColor(r.source);
        const style = `--pct: ${widthPct}%` + (color ? `; --bar: ${color}` : '');
        return `<tr class="drillable" data-drill="${escapeHtml(r.source)}">
          <td class="bar-label" style="${style}">
            <div class="bl-row"><span class="bl-name">${channelDot(r.source)}${escapeHtml(cap(r.source))}</span><span class="bl-meta">${deltaChip(rev, r.prev_revenue, { hideFlat: true })}</span></div>
          </td>
          <td class="num">${escapeHtml(fmtMoney(rev))}</td>
          <td class="num">${escapeHtml(fmt(orders))}</td>
          <td class="num">${escapeHtml(fmtMoney(aov))}</td>
        </tr>`;
      }).join('')}</tbody>`;
  }

  // Plain-English takeaways generated from the numbers already on the page.
  function renderInsights(overview, previous, revRows, sourceRows) {
    const el = $('insights-list');
    const ins = [];
    const revenue = Number(overview?.revenue) || 0;
    const pRevenue = Number(previous?.revenue) || 0;
    if (revenue > 0 && pRevenue > 0) {
      const d = deltaInfo(revenue, pRevenue);
      ins.push({ dir: d.dir === 'down' ? 'warn' : 'up', html: `Revenue is <strong>${fmtMoney(revenue)}</strong>, <strong>${d.text}</strong> vs the previous ${escapeHtml(rangeWord())}.` });
    }
    if (revRows && revRows.length) {
      const top = revRows[0];
      ins.push({ dir: 'up', html: `<strong>${escapeHtml(cap(top.source))}</strong> drove the most revenue — <strong>${fmtMoney(top.revenue)}</strong> from ${fmt(top.orders)} orders.` });
      const eff = revRows.filter(r => Number(r.visitors) >= 30)
        .map(r => ({ src: r.source, rpv: (Number(r.revenue) || 0) / Math.max(1, Number(r.visitors)) }))
        .sort((a, b) => b.rpv - a.rpv)[0];
      if (eff && eff.src !== top.source) {
        ins.push({ dir: 'up', html: `<strong>${escapeHtml(cap(eff.src))}</strong> is your most efficient channel at <strong>${fmtMoney(eff.rpv)}</strong> per visitor.` });
      }
    }
    if (sourceRows && sourceRows.length) {
      const totalPv = sourceRows.reduce((s, r) => s + Number(r.pageviews), 0) || 1;
      const grow = sourceRows.filter(r => r.value && r.value !== '(none)' && Number(r.prev_pageviews) >= 5)
        .map(r => ({ v: r.value, pv: Number(r.pageviews), prev: Number(r.prev_pageviews), g: (Number(r.pageviews) - Number(r.prev_pageviews)) / Number(r.prev_pageviews) }))
        .sort((a, b) => b.g - a.g)[0];
      if (grow && grow.g > 0.05) {
        ins.push({ dir: 'up', html: `<strong>${escapeHtml(cap(grow.v))}</strong> is your fastest-growing channel, <strong>${deltaInfo(grow.pv, grow.prev).text}</strong> in views.` });
      }
      const untagged = sourceRows.find(r => r.value === '(none)');
      if (untagged) {
        const share = Math.round(Number(untagged.pageviews) / totalPv * 100);
        if (share >= 15) ins.push({ dir: 'warn', html: `<strong>${share}% of traffic is untagged</strong> — tag those links so their orders get attributed to a channel.` });
      }
    }
    el.innerHTML = ins.length
      ? ins.slice(0, 4).map(i => `<li class="insight insight-${i.dir}">${i.html}</li>`).join('')
      : `<li class="insight">Not enough data yet — insights appear once there's traffic and orders to compare.</li>`;
  }

  // Multi-site overview: per-site totals, click a row to open that site.
  function renderPortfolio(rows) {
    const card = $('portfolio-card');
    if (!card) return;
    if (!rows || rows.length < 2) { card.hidden = true; return; }
    card.hidden = false;
    $('portfolio-table').innerHTML =
      `<thead><tr><th>Site</th><th class="num">Visitors</th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">Conv rate</th></tr></thead>` +
      `<tbody>${rows.map((r) => {
        const uniques = Number(r.uniques) || 0, orders = Number(r.orders) || 0, rev = Number(r.revenue) || 0;
        const cr = uniques > 0 ? `${(orders / uniques * 100).toFixed(1)}%` : '—';
        const active = r.id === siteSelect.value ? ' is-active' : '';
        return `<tr class="drillable${active}" data-site="${escapeHtml(r.id)}"><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(fmt(uniques))}</td><td class="num">${escapeHtml(fmtMoney(rev))}</td><td class="num">${escapeHtml(fmt(orders))}</td><td class="num">${cr}</td></tr>`;
      }).join('')}</tbody>`;
  }

  // Timeline markers list (under the chart) with a remove button per marker.
  function renderAnnoList(rows) {
    const el = $('anno-list');
    if (!el) return;
    el.innerHTML = (rows || []).map((a) => {
      const d = new Date(a.ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `<span class="anno-pill"><strong>${escapeHtml(a.label)}</strong> · ${escapeHtml(d)} <button class="anno-del" type="button" data-anno="${a.id}" aria-label="Remove marker">✕</button></span>`;
    }).join('');
  }

  async function reloadAnnotations() {
    const site = siteSelect.value;
    if (!site) return;
    const ann = await api(`/api/annotations?site=${encodeURIComponent(site)}`);
    lastAnnotations = (ann && ann.rows) || [];
    renderAnnoList(lastAnnotations);
    if (lastStacked) drawTimeline(lastStacked, lastBucket);
  }

  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
  function exportCsv() {
    let head, body, base;
    if (lastRev && lastRev.length) {
      head = ['Channel', 'Revenue', 'Orders', 'AOV', 'Visitors'];
      body = lastRev.map((r) => { const rev = Number(r.revenue) || 0, o = Number(r.orders) || 0; return [cap(r.source), rev.toFixed(2), o, (o ? rev / o : 0).toFixed(2), r.visitors]; });
      base = 'revenue-by-channel';
    } else {
      const rows = (lastUtm && lastUtm[0] && lastUtm[0].rows) || [];
      head = ['Channel', 'Views', 'Unique'];
      body = rows.map((r) => [r.value === '(none)' ? '(untagged)' : r.value, r.pageviews, r.uniques]);
      base = 'channels';
    }
    const csv = [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const opt = siteSelect.options[siteSelect.selectedIndex];
    const fname = `${base}-${((opt && opt.text) || 'site').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // UTM cards each render as a small table where the label column has an
  // inline bar showing share-of-pageviews. The "(none)" row (untagged) is
  // intentionally kept so the user can see how much traffic is missing tags.
  function renderUtmCard(dim, rows) {
    const el = $(`utm-${dim}-table`);
    if (!rows.length) {
      el.innerHTML = `<tbody><tr><td><div class="empty-state">No tagged traffic in this range yet.</div></td></tr></tbody>`;
      return;
    }
    const max = rows.reduce((m, r) => Math.max(m, Number(r.pageviews) || 0), 0) || 1;
    const total = rows.reduce((s, r) => s + (Number(r.pageviews) || 0), 0) || 1;
    const top = rows.slice(0, 10);

    // Insight line — the leading tagged value and its share of views, so the
    // eye lands on the takeaway before scanning the rows. Falls back when
    // there's no tagged traffic to lead with. The source card is "branded":
    // each row gets the channel's logo chip and its brand color drives the bar.
    const branded = dim === 'source';
    const lead = top.find(r => r.value && r.value !== '(none)');
    // Only show a caption when it adds something the table doesn't: guidance for
    // a mostly-untagged dimension. For real data the leading bar says it already.
    const caption = lead
      ? ''
      : '<caption class="utm-insight"><strong>Mostly untagged</strong> · tag your links to break this down</caption>';

    el.innerHTML =
      caption +
      `<thead><tr>
        <th></th>
        <th class="num">Views</th>
        <th class="num">Unique</th>
      </tr></thead>` +
      `<tbody>${top.map(r => {
        const views = Number(r.pageviews) || 0;
        const widthPct = (views / max) * 100;
        const sharePct = Math.round((views / total) * 100);
        const isUntagged = r.value === '(none)';
        const label = isUntagged ? '(untagged)' : r.value;
        const barColor = branded && !isUntagged ? channelColor(r.value) : '';
        const dot = branded && !isUntagged ? channelDot(r.value) : '';
        const style = `--pct: ${widthPct}%` + (barColor ? `; --bar: ${barColor}` : '');
        const drill = branded && !isUntagged;
        return `<tr class="${isUntagged ? 'untagged' : ''}${drill ? ' drillable' : ''}"${drill ? ` data-drill="${escapeHtml(r.value)}"` : ''}>
          <td class="bar-label" style="${style}">
            <div class="bl-row"><span class="bl-name">${dot}${escapeHtml(label)}</span><span class="bl-meta"><span class="pct">${sharePct}%</span>${deltaChip(views, r.prev_pageviews, { hideFlat: true })}</span></div>
          </td>
          <td class="num">${escapeHtml(fmt(views))}</td>
          <td class="num">${escapeHtml(fmt(r.uniques))}</td>
        </tr>`;
      }).join('')}</tbody>`;
  }

  // opts.textCols lists left-aligned text columns (default just col 0); the rest
  // are right-aligned numbers. opts.cellRenderers maps a column index to a
  // function returning trusted HTML (used to drop a brand dot beside a source).
  function renderTable(el, headers, rows, opts) {
    opts = opts || {};
    const renderers = opts.cellRenderers || {};
    const textCols = opts.textCols || [0];
    const isNum = (i) => textCols.indexOf(i) === -1;
    if (!rows.length) {
      el.innerHTML = `<tbody><tr><td><div class="empty-state">No data in this range yet.</div></td></tr></tbody>`;
      return;
    }
    el.innerHTML =
      `<thead><tr>${headers.map((h, i) => `<th class="${isNum(i) ? 'num' : ''}">${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows.map(r => `<tr>${r.map((c, i) => {
        const html = renderers[i] ? renderers[i](c) : escapeHtml(c);
        return `<td class="${isNum(i) ? 'num' : ''}">${html}</td>`;
      }).join('')}</tr>`).join('')}</tbody>`;
  }

  function escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Distinct categorical palette — stacked segments must be told apart at a
  // glance, so these are separate hues (teal, clay, slate, gold), not shades
  // of one. Graphite is reserved for the folded "Other" bucket, which always
  // lands last in the series order.
  const SERIES_COLORS = ['#007c7a', '#c2673f', '#4f7d9c', '#d9a521', '#8a5a7a'];
  const OTHER_COLOR = '#9aa6ac';

  function colorFor(name, i) {
    if (name === 'Other') return OTHER_COLOR;
    return channelColor(name) || SERIES_COLORS[i % SERIES_COLORS.length];
  }

  // Pageviews stacked by source over time. Short ranges render as stacked bars
  // (one clean bar per day); long ranges (>14 buckets) switch to a stacked area
  // so 30–90 days don't become a wall of skinny striped bars.
  function drawTimeline(stacked, bucket) {
    const ctx = document.getElementById('timeline-chart');
    // Chart paints to a canvas, so it can't inherit CSS tokens — read them so
    // the axes/legend follow the active theme (and re-read on theme toggle).
    const cs = getComputedStyle(document.documentElement);
    const tickColor = cs.getPropertyValue('--muted').trim() || '#667078';
    const gridColor = cs.getPropertyValue('--line').trim() || '#e5ecef';
    const buckets = (stacked && stacked.buckets) || [];
    const names = (stacked && stacked.sources) || [];
    const stacks = (stacked && stacked.stacks) || {};
    const isArea = buckets.length > 14;

    const labels = buckets.map(ts => {
      const d = new Date(ts * 1000);
      return bucket === 'hour'
        ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    const datasets = names.map((name, i) => {
      const color = colorFor(name, i);
      return isArea
        ? { label: name, data: stacks[name] || [], backgroundColor: color, borderColor: '#ffffff', borderWidth: 1, fill: true, pointRadius: 0, tension: 0.25 }
        : { label: name, data: stacks[name] || [], backgroundColor: color, borderWidth: 0, borderRadius: 2, maxBarThickness: 38 };
    });

    // Annotation markers: map each marker's date to its bucket and draw a dashed
    // vertical line + label over the chart.
    const annoSeconds = bucket === 'hour' ? 3600 : 86400;
    const annoMarks = (lastAnnotations || []).map((a) => {
      const idx = buckets.indexOf(Math.floor(a.ts / annoSeconds) * annoSeconds);
      return idx >= 0 ? { idx, label: a.label } : null;
    }).filter(Boolean);
    const annoPlugin = {
      id: 'annos',
      afterDraw(chart) {
        if (!annoMarks.length) return;
        const xs = chart.scales.x, area = chart.chartArea, c = chart.ctx;
        c.save();
        c.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        c.textBaseline = 'top';
        annoMarks.forEach((m) => {
          const px = xs.getPixelForValue(m.idx);
          c.globalAlpha = 0.5; c.strokeStyle = tickColor; c.setLineDash([4, 3]); c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(px, area.top); c.lineTo(px, area.bottom); c.stroke();
          c.setLineDash([]); c.globalAlpha = 1; c.fillStyle = tickColor; c.textAlign = 'center';
          const tw = c.measureText(m.label).width;
          c.fillText(m.label, Math.min(Math.max(px, area.left + tw / 2), area.right - tw / 2), area.top + 1);
        });
        c.restore();
      },
    };

    if (timelineChart) timelineChart.destroy();
    timelineChart = new Chart(ctx, {
      type: isArea ? 'line' : 'bar',
      data: { labels, datasets },
      plugins: [annoPlugin],
      options: {
        maintainAspectRatio: false,
        animation: { duration: 450 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, color: tickColor } },
          tooltip: {
            backgroundColor: '#17191c',
            padding: 10,
          },
        },
        scales: {
          x: { stacked: true, border: { display: false }, grid: { display: false }, ticks: { color: tickColor, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
          y: { stacked: true, border: { display: false }, beginAtZero: true, ticks: { precision: 0, color: tickColor, font: { size: 11 } }, grid: { color: gridColor } },
        },
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

  // Drill-down: clicking a channel (a revenue row or a source row) scopes the
  // whole dashboard to it; the filter bar clears it.
  function updateFilterBar() {
    const bar = $('filter-bar');
    if (!bar) return;
    if (currentFilter) {
      $('filter-chip').innerHTML = `${channelDot(currentFilter)}<strong>${escapeHtml(cap(currentFilter))}</strong>`;
      bar.hidden = false;
      document.body.classList.add('is-filtered');
    } else {
      bar.hidden = true;
      document.body.classList.remove('is-filtered');
    }
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    const drill = e.target.closest('[data-drill]');
    if (drill) {
      const src = drill.getAttribute('data-drill');
      if (src && src !== currentFilter) { currentFilter = src; updateFilterBar(); refresh(); }
      return;
    }
    const siteRow = e.target.closest('[data-site]');
    if (siteRow) {
      const id = siteRow.getAttribute('data-site');
      if (id && id !== siteSelect.value) { siteSelect.value = id; currentFilter = null; updateFilterBar(); refresh(); }
      return;
    }
    const del = e.target.closest('[data-anno]');
    if (del) {
      e.preventDefault();
      api(`/api/annotations/${del.getAttribute('data-anno')}`, { method: 'DELETE' }).then(reloadAnnotations).catch(() => {});
    }
  });
  const filterClear = $('filter-clear');
  if (filterClear) filterClear.addEventListener('click', () => { currentFilter = null; updateFilterBar(); refresh(); });

  const annoAdd = $('anno-add');
  if (annoAdd) annoAdd.addEventListener('click', async () => {
    const date = $('anno-date').value;
    const label = ($('anno-label').value || '').trim();
    if (!date || !label || !siteSelect.value) return;
    const ts = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000);
    await api('/api/annotations', { method: 'POST', body: JSON.stringify({ site_id: siteSelect.value, ts, label }) });
    $('anno-label').value = '';
    reloadAnnotations();
  });
  const exportBtn = $('export-csv');
  if (exportBtn) exportBtn.addEventListener('click', exportCsv);
  // Re-theme the canvas chart when dark/light flips — CSS re-themes the rest of
  // the page on its own; only the chart needs a redraw to repaint its axes.
  window.addEventListener('themechange', () => {
    if (lastStacked) drawTimeline(lastStacked, lastBucket);
    if (lastUtm) UTM_DIMS.forEach((d, i) => renderUtmCard(d, (lastUtm[i] && lastUtm[i].rows) || []));
    if (lastRev) renderRevenue(lastRev);
  });

  loadSites().then(refresh).catch(() => { /* gate() in app.js handles auth bounces */ });
})();
