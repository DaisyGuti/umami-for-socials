import type { Env } from '../types';
import { json } from '../lib/response';
import { requireAuth } from '../lib/auth';
import { asNumber, asString } from '../lib/validate';

interface Window {
  siteId: string;
  from: number;
  to: number;
  source?: string;
}

function parseWindow(url: URL): Window | { error: Response } {
  const siteId = asString(url.searchParams.get('site'));
  if (!siteId) return { error: json({ error: 'site param required' }, 400) };
  const nowSec = Math.floor(Date.now() / 1000);
  const from = asNumber(url.searchParams.get('from')) ?? nowSec - 60 * 60 * 24 * 7;
  const to = asNumber(url.searchParams.get('to')) ?? nowSec;
  const source = asString(url.searchParams.get('source'));
  return { siteId, from: Math.floor(from), to: Math.floor(to), source: source ? source.slice(0, 64) : undefined };
}

// Drill-down: when a channel is selected, every query scopes to events whose
// channel (tagged utm_source, else classified referrer) matches it. Returns a
// SQL fragment + the value to bind, so each query stays parameterized.
function channelFilter(w: Window): { clause: string; bind: string[] } {
  return w.source
    ? { clause: ` AND COALESCE(NULLIF(utm_source, ''), referrer_source, '(direct)') = ?`, bind: [w.source] }
    : { clause: '', bind: [] };
}

export async function handleStats(request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/api\/stats\//, '');
  if (sub === 'portfolio') return portfolio(env, url);

  const w = parseWindow(url);
  if ('error' in w) return w.error;
  switch (sub) {
    case 'overview':   return overview(env, w);
    case 'sources':    return sources(env, w);
    case 'revenue':    return revenueByChannel(env, w);
    case 'utm':        return utm(env, w, url);
    case 'referrers':  return referrers(env, w);
    case 'countries':  return countries(env, w);
    case 'languages':  return languages(env, w);
    case 'pages':      return pages(env, w);
    case 'timeline':   return timeline(env, w, url);
    default:           return json({ error: 'not found' }, 404);
  }
}

function overviewRow(env: Env, siteId: string, from: number, to: number, f: { clause: string; bind: string[] }) {
  return env.DB.prepare(
    `SELECT SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) AS pageviews,
            COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS uniques,
            SUM(CASE WHEN event_type = 'pageview' AND utm_source IS NOT NULL AND utm_source <> '' THEN 1 ELSE 0 END) AS tagged,
            SUM(CASE WHEN event_type = 'conversion' THEN 1 ELSE 0 END) AS orders,
            COALESCE(SUM(CASE WHEN event_type = 'conversion' THEN revenue ELSE 0 END), 0) AS revenue
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?${f.clause}`,
  ).bind(siteId, from, to, ...f.bind).first();
}

// Current window plus the immediately-preceding window of the same length, so
// the dashboard can show period-over-period change without a second round-trip.
async function overview(env: Env, w: Window): Promise<Response> {
  const f = channelFilter(w);
  const span = w.to - w.from;
  const [cur, prev] = await Promise.all([
    overviewRow(env, w.siteId, w.from, w.to, f),
    overviewRow(env, w.siteId, w.from - span, w.from - 1, f),
  ]);
  return json({ overview: cur, previous: prev });
}

// "Sources" is the headline social-media view: prefer the explicit utm_source
// when the link was tagged, otherwise fall back to the classified referrer
// (so untagged Instagram/TikTok/email traffic still gets bucketed correctly).
// Per-site totals for the multi-site overview. Not scoped to one site, so it
// runs before parseWindow's site-required check.
async function portfolio(env: Env, url: URL): Promise<Response> {
  const nowSec = Math.floor(Date.now() / 1000);
  const from = Math.floor(asNumber(url.searchParams.get('from')) ?? nowSec - 60 * 60 * 24 * 7);
  const to = Math.floor(asNumber(url.searchParams.get('to')) ?? nowSec);
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name,
            SUM(CASE WHEN e.event_type = 'pageview' THEN 1 ELSE 0 END) AS pageviews,
            COUNT(DISTINCT CASE WHEN e.event_type = 'pageview' THEN e.visitor_hash END) AS uniques,
            SUM(CASE WHEN e.event_type = 'conversion' THEN 1 ELSE 0 END) AS orders,
            COALESCE(SUM(CASE WHEN e.event_type = 'conversion' THEN e.revenue ELSE 0 END), 0) AS revenue
     FROM sites s
     LEFT JOIN events e ON e.site_id = s.id AND e.ts BETWEEN ? AND ?
     GROUP BY s.id, s.name
     ORDER BY revenue DESC`,
  ).bind(from, to).all();
  return json({ rows: rows.results });
}

async function sources(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(utm_source, ''), referrer_source) AS source,
            COUNT(*)                          AS pageviews,
            COUNT(DISTINCT visitor_hash)      AS uniques,
            SUM(CASE WHEN utm_source IS NOT NULL AND utm_source <> '' THEN 1 ELSE 0 END) AS tagged
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'
     GROUP BY source
     ORDER BY pageviews DESC
     LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ sources: rows.results });
}

async function utm(env: Env, w: Window, url: URL): Promise<Response> {
  const dim = asString(url.searchParams.get('dimension')) ?? 'source';
  const allowed: Record<string, string> = {
    source: 'utm_source', medium: 'utm_medium', campaign: 'utm_campaign',
    term: 'utm_term', content: 'utm_content',
  };
  const column = allowed[dim];
  if (!column) return json({ error: 'invalid dimension' }, 400);
  // `column` is whitelisted above, so the interpolation is safe.
  const f = channelFilter(w);
  const group = (from: number, to: number) => env.DB.prepare(
    `SELECT COALESCE(NULLIF(${column}, ''), '(none)') AS value,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'${f.clause}
     GROUP BY value
     ORDER BY pageviews DESC
     LIMIT 50`,
  ).bind(w.siteId, from, to, ...f.bind).all();
  const span = w.to - w.from;
  const [cur, prev] = await Promise.all([group(w.from, w.to), group(w.from - span, w.from - 1)]);
  const prevMap: Record<string, number> = {};
  for (const r of prev.results as Array<{ value: string; pageviews: number }>) prevMap[r.value] = Number(r.pageviews);
  const rows = (cur.results as Array<{ value: string; pageviews: number; uniques: number }>)
    .map((r) => ({ ...r, prev_pageviews: prevMap[r.value] ?? 0 }));
  return json({ dimension: dim, rows });
}

// Revenue, orders, and pageview-visitors per channel — the money view. Channel
// is the tagged utm_source, else the classified referrer (same definition the
// sources/timeline use), so conversions roll up exactly where the traffic did.
async function revenueByChannel(env: Env, w: Window): Promise<Response> {
  const f = channelFilter(w);
  const group = (from: number, to: number) => env.DB.prepare(
    `SELECT source,
            COALESCE(SUM(CASE WHEN event_type = 'conversion' THEN revenue ELSE 0 END), 0) AS revenue,
            SUM(CASE WHEN event_type = 'conversion' THEN 1 ELSE 0 END) AS orders,
            COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS visitors
     FROM (
       SELECT COALESCE(NULLIF(utm_source, ''), referrer_source, '(direct)') AS source,
              event_type, revenue, visitor_hash
       FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?${f.clause}
     )
     GROUP BY source
     ORDER BY revenue DESC
     LIMIT 50`,
  ).bind(w.siteId, from, to, ...f.bind).all();
  const span = w.to - w.from;
  const [cur, prev] = await Promise.all([group(w.from, w.to), group(w.from - span, w.from - 1)]);
  const prevMap: Record<string, number> = {};
  for (const r of prev.results as Array<{ source: string; revenue: number }>) prevMap[r.source] = Number(r.revenue);
  const rows = (cur.results as Array<{ source: string; revenue: number; orders: number; visitors: number }>)
    .filter((r) => Number(r.orders) > 0)
    .map((r) => ({ ...r, prev_revenue: prevMap[r.source] ?? 0 }));
  return json({ rows });
}

async function referrers(env: Env, w: Window): Promise<Response> {
  const f = channelFilter(w);
  const rows = await env.DB.prepare(
    `SELECT COALESCE(referrer_host, '(direct)') AS host,
            referrer_source                     AS source,
            COUNT(*)                            AS pageviews,
            COUNT(DISTINCT visitor_hash)        AS uniques
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'${f.clause}
     GROUP BY host, source
     ORDER BY pageviews DESC
     LIMIT 50`,
  ).bind(w.siteId, w.from, w.to, ...f.bind).all();
  return json({ referrers: rows.results });
}

async function countries(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(country, '(unknown)') AS country,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'
     GROUP BY country ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ countries: rows.results });
}

async function languages(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(language, '(unknown)') AS language,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'
     GROUP BY language ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ languages: rows.results });
}

async function pages(env: Env, w: Window): Promise<Response> {
  const f = channelFilter(w);
  const rows = await env.DB.prepare(
    `SELECT path,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'${f.clause}
     GROUP BY path ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to, ...f.bind).all();
  return json({ pages: rows.results });
}

// Bucket events into time slices for the line chart. SQLite's strftime works
// directly on unix seconds, so we floor each ts to the bucket boundary and
// group on that. Day buckets are calendar-aligned in UTC; hour buckets sit on
// the hour. The dashboard re-renders timestamps in the viewer's local tz.
async function timeline(env: Env, w: Window, url: URL): Promise<Response> {
  const bucket = asString(url.searchParams.get('bucket')) === 'hour' ? 'hour' : 'day';
  const seconds = bucket === 'hour' ? 3600 : 86400;
  const f = channelFilter(w);
  // Bucket size is inlined as an integer literal (only ever 3600 or 86400) so
  // SQLite floors via integer division; binding it makes D1 use real division,
  // which never floors and gives one bucket per event.
  const rows = await env.DB.prepare(
    `SELECT (ts / ${seconds}) * ${seconds} AS bucket_ts,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'${f.clause}
     GROUP BY bucket_ts
     ORDER BY bucket_ts ASC`,
  ).bind(w.siteId, w.from, w.to, ...f.bind).all();

  // Per-source-per-bucket counts, using the same source definition as /sources
  // (tagged utm_source, else classified referrer). Pivoted server-side into a
  // stacked dataset: top 5 sources kept, the rest folded into "Other".
  const bySource = await env.DB.prepare(
    `SELECT (ts / ${seconds}) * ${seconds} AS bucket_ts,
            COALESCE(NULLIF(utm_source, ''), referrer_source, '(direct)') AS source,
            COUNT(*) AS pageviews
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ? AND event_type = 'pageview'${f.clause}
     GROUP BY bucket_ts, source`,
  ).bind(w.siteId, w.from, w.to, ...f.bind).all();

  const buckets = (rows.results as Array<{ bucket_ts: number }>).map((r) => r.bucket_ts);
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const rawRows = bySource.results as Array<{ bucket_ts: number; source: string; pageviews: number }>;

  const sourceTotals: Record<string, number> = {};
  for (const r of rawRows) sourceTotals[r.source] = (sourceTotals[r.source] ?? 0) + Number(r.pageviews);
  const ranked = Object.keys(sourceTotals).sort((a, b) => sourceTotals[b] - sourceTotals[a]);
  const TOP = 4;
  const topSources = ranked.slice(0, TOP);
  const hasOther = ranked.length > TOP;
  const names = hasOther ? [...topSources, 'Other'] : topSources;

  const stacks: Record<string, number[]> = {};
  for (const n of names) stacks[n] = new Array(buckets.length).fill(0);
  for (const r of rawRows) {
    const i = idx.get(r.bucket_ts);
    if (i === undefined) continue;
    const key = topSources.includes(r.source) ? r.source : (hasOther ? 'Other' : r.source);
    if (stacks[key]) stacks[key][i] += Number(r.pageviews);
  }

  return json({ bucket, series: rows.results, stacked: { buckets, sources: names, stacks } });
}
