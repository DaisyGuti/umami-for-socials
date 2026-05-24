export function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

// CORS for the public /api/collect endpoint only. The tracker has to POST from
// arbitrary origins (every site that embeds tracker.js), so we open it wide.
// Every OTHER /api/* route is admin-only and intentionally does NOT set these.
export const COLLECT_CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: COLLECT_CORS });
}
