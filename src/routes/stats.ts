import type { Env } from '../types';
import { json } from '../lib/response';
import { requireAuth } from '../lib/auth';
import { asNumber, asString } from '../lib/validate';

interface Window {
  siteId: string;
  from: number;
  to: number;
}

function parseWindow(url: URL): Window | { error: Response } {
  const siteId = asString(url.searchParams.get('site'));
  if (!siteId) return { error: json({ error: 'site param required' }, 400) };
  const nowSec = Math.floor(Date.now() / 1000);
  const from = asNumber(url.searchParams.get('from')) ?? nowSec - 60 * 60 * 24 * 7;
  const to = asNumber(url.searchParams.get('to')) ?? nowSec;
  return { siteId, from: Math.floor(from), to: Math.floor(to) };
}

export async function handleStats(request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const w = parseWindow(url);
  if ('error' in w) return w.error;

  const sub = url.pathname.replace(/^\/api\/stats\//, '');
  switch (sub) {
    case 'overview':   return overview(env, w);
    case 'sources':    return sources(env, w);
    case 'utm':        return utm(env, w, url);
    case 'referrers':  return referrers(env, w);
    case 'countries':  return countries(env, w);
    case 'languages':  return languages(env, w);
    case 'pages':      return pages(env, w);
    case 'timeline':   return timeline(env, w, url);
    default:           return json({ error: 'not found' }, 404);
  }
}

async function overview(env: Env, w: Window): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?`,
  ).bind(w.siteId, w.from, w.to).first();
  return json({ overview: row });
}

// "Sources" is the headline social-media view: prefer the explicit utm_source
// when the link was tagged, otherwise fall back to the classified referrer
// (so untagged Instagram/TikTok/email traffic still gets bucketed correctly).
async function sources(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(utm_source, ''), referrer_source) AS source,
            COUNT(*)                          AS pageviews,
            COUNT(DISTINCT visitor_hash)      AS uniques,
            SUM(CASE WHEN utm_source IS NOT NULL AND utm_source <> '' THEN 1 ELSE 0 END) AS tagged
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ?
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
  const rows = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(${column}, ''), '(none)') AS value,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY value
     ORDER BY pageviews DESC
     LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ dimension: dim, rows: rows.results });
}

async function referrers(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(referrer_host, '(direct)') AS host,
            referrer_source                     AS source,
            COUNT(*)                            AS pageviews,
            COUNT(DISTINCT visitor_hash)        AS uniques
     FROM events
     WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY host, source
     ORDER BY pageviews DESC
     LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ referrers: rows.results });
}

async function countries(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(country, '(unknown)') AS country,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY country ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ countries: rows.results });
}

async function languages(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(language, '(unknown)') AS language,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY language ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ languages: rows.results });
}

async function pages(env: Env, w: Window): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT path,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY path ORDER BY pageviews DESC LIMIT 50`,
  ).bind(w.siteId, w.from, w.to).all();
  return json({ pages: rows.results });
}

// Bucket events into time slices for the line chart. SQLite's strftime works
// directly on unix seconds, so we floor each ts to the bucket boundary and
// group on that. Day buckets are calendar-aligned in UTC; hour buckets sit on
// the hour. The dashboard re-renders timestamps in the viewer's local tz.
async function timeline(env: Env, w: Window, url: URL): Promise<Response> {
  const bucket = asString(url.searchParams.get('bucket')) === 'hour' ? 'hour' : 'day';
  const seconds = bucket === 'hour' ? 3600 : 86400;
  const rows = await env.DB.prepare(
    `SELECT (ts / ?) * ? AS bucket_ts,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor_hash) AS uniques
     FROM events WHERE site_id = ? AND ts BETWEEN ? AND ?
     GROUP BY bucket_ts
     ORDER BY bucket_ts ASC`,
  ).bind(seconds, seconds, w.siteId, w.from, w.to).all();
  return json({ bucket, series: rows.results });
}
