/*
 * Umami for Socials — client tracker
 *
 * Embed on a site like:
 *   <script async defer
 *     src="https://YOUR-WORKER.workers.dev/tracker.js"
 *     data-site="YOUR_SITE_ID"></script>
 *
 * Optional attributes:
 *   data-track-localhost="true"   send events from localhost (off by default)
 *   data-respect-dnt="true"       skip when navigator.doNotTrack === "1"
 *
 * Sends pageviews + UTM params + language. The server adds country (from
 * Cloudflare's edge) and a daily-rotating visitor hash. No cookies are set.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var siteId = script.getAttribute('data-site');
  if (!siteId) return;

  var endpoint = new URL('/api/collect', script.src).toString();
  var trackLocalhost = script.getAttribute('data-track-localhost') === 'true';
  var respectDnt = script.getAttribute('data-respect-dnt') === 'true';

  // Bail on localhost unless explicitly opted in — saves dev noise from
  // polluting prod numbers when devs forget to swap the snippet out.
  if (!trackLocalhost) {
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return;
  }
  if (respectDnt && navigator.doNotTrack === '1') return;

  // Parse UTM params off the current URL. We only forward the five canonical
  // utm_* keys — anything else is noise and gets dropped server-side anyway.
  function readUtm() {
    var p = new URLSearchParams(location.search);
    var keys = ['source', 'medium', 'campaign', 'term', 'content'];
    var out = {};
    var any = false;
    for (var i = 0; i < keys.length; i++) {
      var v = p.get('utm_' + keys[i]);
      if (v) { out[keys[i]] = v; any = true; }
    }
    return any ? out : null;
  }

  function send() {
    var payload = {
      site_id: siteId,
      host: location.hostname,
      path: location.pathname + location.search,
      referrer: document.referrer || null,
      language: navigator.language || null,
      utm: readUtm(),
    };
    var body = JSON.stringify(payload);

    // Prefer sendBeacon during page unloads (the only path where fetch may be
    // killed mid-flight). For the initial pageview a plain keepalive fetch is
    // fine and gives us richer error handling.
    try {
      if (navigator.sendBeacon && document.visibilityState === 'hidden') {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch (_) { /* fall through to fetch */ }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    }).catch(function () { /* swallow — analytics must never break the host page */ });
  }

  // Monkeypatch history methods so SPAs (React Router, Vue Router, etc.) emit
  // a synthetic event we can listen for. The History API spec doesn't fire one
  // on its own, which is why every analytics tracker has to do this dance.
  function patch(name) {
    var orig = history[name];
    history[name] = function () {
      var ret = orig.apply(this, arguments);
      window.dispatchEvent(new Event('ufs:locationchange'));
      return ret;
    };
  }
  patch('pushState');
  patch('replaceState');
  window.addEventListener('popstate', function () {
    window.dispatchEvent(new Event('ufs:locationchange'));
  });

  var lastPath = '';
  function trackIfChanged() {
    var path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;
    send();
  }

  // Initial pageview after the doc is ready enough to have a referrer set.
  if (document.readyState === 'complete') trackIfChanged();
  else window.addEventListener('load', trackIfChanged, { once: true });

  window.addEventListener('ufs:locationchange', trackIfChanged);
})();
