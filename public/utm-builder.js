(function () {
  'use strict';

  // Presets match the source buckets the server classifier uses, so picking
  // one of these keeps your dashboard groupings consistent over time.
  const PRESETS = [
    { label: 'Instagram bio',     source: 'instagram', medium: 'bio' },
    { label: 'Instagram story',   source: 'instagram', medium: 'story' },
    { label: 'TikTok bio',        source: 'tiktok',    medium: 'bio' },
    { label: 'X/Twitter post',    source: 'twitter',   medium: 'post' },
    { label: 'Facebook post',     source: 'facebook',  medium: 'post' },
    { label: 'LinkedIn post',     source: 'linkedin',  medium: 'post' },
    { label: 'YouTube description', source: 'youtube', medium: 'description' },
    { label: 'Newsletter',        source: 'newsletter', medium: 'email' },
    { label: 'WhatsApp chat',     source: 'whatsapp',  medium: 'chat' },
    { label: 'Telegram chat',     source: 'telegram',  medium: 'chat' },
    { label: 'Discord post',      source: 'discord',   medium: 'chat' },
  ];

  const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const out = document.getElementById('output');
  const urlEl = document.getElementById('url');

  function build() {
    const base = urlEl.value.trim();
    if (!base) { out.textContent = '(enter a destination URL)'; return; }
    let u;
    try { u = new URL(base); }
    catch { out.textContent = '(invalid URL)'; return; }
    for (const f of FIELDS) {
      const v = document.getElementById(f).value.trim();
      if (v) u.searchParams.set(f, v); else u.searchParams.delete(f);
    }
    out.textContent = u.toString();
  }

  function setPreset(p) {
    document.getElementById('utm_source').value = p.source;
    document.getElementById('utm_medium').value = p.medium;
    build();
  }

  // Render preset buttons + the conventions reference table.
  document.getElementById('presets').innerHTML = PRESETS
    .map((p, i) => `<button type="button" data-i="${i}">${p.label}</button>`).join('');
  document.getElementById('presets').addEventListener('click', (e) => {
    const t = e.target;
    if (t instanceof HTMLButtonElement && t.dataset.i) setPreset(PRESETS[+t.dataset.i]);
  });

  document.getElementById('conventions-table').innerHTML =
    `<thead><tr><th>Where you're posting</th><th>utm_source</th><th>utm_medium suggestions</th></tr></thead>` +
    `<tbody>${PRESETS.map(p => `<tr><td>${p.label}</td><td><code>${p.source}</code></td><td><code>${p.medium}</code></td></tr>`).join('')}</tbody>`;

  document.getElementById('utm-form').addEventListener('input', build);
  document.getElementById('copy-url').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(out.textContent); } catch (_) { /* ignore */ }
  });

  build();
})();
