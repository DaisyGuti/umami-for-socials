import type { Env } from '../types';
import { COLLECT_CORS, corsPreflight, json } from '../lib/response';
import { visitorHash } from '../lib/hash';
import { classifyReferrer, isBotUserAgent } from '../lib/referrer';
import { asNumber, asString, clip, LIMITS } from '../lib/validate';

export async function handleCollect(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return corsPreflight();
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, COLLECT_CORS);
  }

  const ua = request.headers.get('user-agent');
  if (isBotUserAgent(ua)) {
    // Quietly drop bot traffic so dashboard counts reflect real humans.
    // We still 200 OK so misconfigured scrapers don't retry-loop.
    return json({ ok: true, ignored: 'bot' }, 200, COLLECT_CORS);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json' }, 400, COLLECT_CORS);
  }

  const siteId = asString(body.site_id);
  const path = clip(asString(body.path) ?? '/', LIMITS.path) ?? '/';
  if (!siteId) return json({ error: 'site_id required' }, 400, COLLECT_CORS);

  // Reject events for sites we don't know about. The 16-hex ID is unguessable
  // enough to act as a soft API key — a random POST can't fake events.
  const siteRow = await env.DB.prepare(`SELECT id FROM sites WHERE id = ?`).bind(siteId).first();
  if (!siteRow) return json({ error: 'unknown site' }, 404, COLLECT_CORS);

  const referrerRaw = clip(asString(body.referrer), LIMITS.referrer);
  const utm = (body.utm ?? {}) as Record<string, unknown>;
  const language = clip(asString(body.language), LIMITS.language);

  // Country comes from Cloudflare's edge — no IP geolookup needed.
  // https://developers.cloudflare.com/workers/runtime-apis/request/
  const country = clip(request.headers.get('cf-ipcountry'), LIMITS.country);

  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const hash = await visitorHash(env.SESSION_SECRET, ip, ua ?? '');

  // Self-host detection: if the referrer is the page's own origin, the tracker
  // already sends `referrer: null` for in-app SPA nav. The classifier still
  // guards against double-tagging when sites embed the tracker on subdomains.
  const selfHost = asString(body.host)?.toLowerCase();
  const referrer = classifyReferrer(referrerRaw, selfHost ?? undefined);

  // A "conversion" event carries an order value and is attributed to whatever
  // channel the visitor arrived on (same utm/referrer fields as a pageview), so
  // revenue rolls up per channel exactly like traffic does.
  const isConversion = asString(body.type) === 'conversion';
  const revenue = isConversion ? Math.max(0, asNumber(body.revenue) ?? 0) : null;

  await env.DB.prepare(
    `INSERT INTO events (
       site_id, ts, path, referrer, referrer_host, referrer_source,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       country, language, visitor_hash, event_type, revenue
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    siteId,
    Math.floor(Date.now() / 1000),
    path,
    referrerRaw,
    referrer.host,
    referrer.source,
    clip(asString(utm.source), LIMITS.utm),
    clip(asString(utm.medium), LIMITS.utm),
    clip(asString(utm.campaign), LIMITS.utm),
    clip(asString(utm.term), LIMITS.utm),
    clip(asString(utm.content), LIMITS.utm),
    country,
    language,
    hash,
    isConversion ? 'conversion' : 'pageview',
    revenue,
  ).run();

  return json({ ok: true }, 200, COLLECT_CORS);
}
