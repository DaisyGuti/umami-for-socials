import type { Env } from '../types';
import { json } from '../lib/response';
import { requireAuth } from '../lib/auth';
import { randomHexId } from '../lib/hash';
import { asString, clip, LIMITS } from '../lib/validate';

export async function handleSites(request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/sites\/?([^/]+)?$/);
  const idParam = match?.[1];

  if (!idParam) {
    if (request.method === 'GET') return listSites(env);
    if (request.method === 'POST') return createSite(request, env);
  } else {
    if (request.method === 'DELETE') return deleteSite(env, idParam);
  }
  return json({ error: 'not found' }, 404);
}

async function listSites(env: Env): Promise<Response> {
  // Pull each site with its pageview count over the last 24h. Done in a single
  // round trip via LEFT JOIN so the dashboard's site list shows live activity
  // without a chatty per-site query.
  const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
  const result = await env.DB.prepare(
    `SELECT s.id, s.name, s.created_at,
            COUNT(e.id)            AS pageviews_24h,
            COUNT(DISTINCT e.visitor_hash) AS uniques_24h
     FROM sites s
     LEFT JOIN events e ON e.site_id = s.id AND e.ts >= ?
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
  ).bind(since).all();
  return json({ sites: result.results });
}

async function createSite(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const rawName = asString((body as Record<string, unknown>)?.name);
  const name = clip(rawName, LIMITS.siteName);
  if (!name) return json({ error: 'name required' }, 400);

  const id = randomHexId(8); // 16 hex chars
  const createdAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`INSERT INTO sites (id, name, created_at) VALUES (?, ?, ?)`)
    .bind(id, name, createdAt).run();

  return json({ site: { id, name, created_at: createdAt } }, 201);
}

async function deleteSite(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`DELETE FROM sites WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
