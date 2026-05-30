import type { Env } from '../types';
import { json } from '../lib/response';
import { requireAuth } from '../lib/auth';
import { asNumber, asString, clip } from '../lib/validate';

// Timeline markers (launch dates, ad pushes, price changes) shown as vertical
// lines on the channel-mix chart. CRUD mirrors the sites route.
export async function handleAnnotations(request: Request, env: Env): Promise<Response> {
  const authError = await requireAuth(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/annotations\/?([^/]+)?$/);
  const idParam = match?.[1];

  if (!idParam) {
    if (request.method === 'GET') return listAnnotations(env, url);
    if (request.method === 'POST') return createAnnotation(request, env);
  } else if (request.method === 'DELETE') {
    return deleteAnnotation(env, idParam);
  }
  return json({ error: 'not found' }, 404);
}

async function listAnnotations(env: Env, url: URL): Promise<Response> {
  const siteId = asString(url.searchParams.get('site'));
  if (!siteId) return json({ error: 'site param required' }, 400);
  const rows = await env.DB.prepare(
    `SELECT id, ts, label FROM annotations WHERE site_id = ? ORDER BY ts ASC`,
  ).bind(siteId).all();
  return json({ rows: rows.results });
}

async function createAnnotation(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const siteId = asString(body.site_id);
  const ts = asNumber(body.ts);
  const label = clip(asString(body.label), 60);
  if (!siteId || !ts || !label) return json({ error: 'site_id, ts, label required' }, 400);

  const siteRow = await env.DB.prepare(`SELECT id FROM sites WHERE id = ?`).bind(siteId).first();
  if (!siteRow) return json({ error: 'unknown site' }, 404);

  const res = await env.DB.prepare(`INSERT INTO annotations (site_id, ts, label) VALUES (?, ?, ?)`)
    .bind(siteId, Math.floor(ts), label).run();
  return json({ id: res.meta.last_row_id, ts: Math.floor(ts), label }, 201);
}

async function deleteAnnotation(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`DELETE FROM annotations WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}
