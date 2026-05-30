import { handleAnnotations } from './routes/annotations';
import { handleAuth } from './routes/auth';
import { handleCollect } from './routes/collect';
import { handleSites } from './routes/sites';
import { handleStats } from './routes/stats';
import { json } from './lib/response';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/healthz') {
      return new Response('ok\n', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    if (path === '/api/collect') return handleCollect(request, env);
    if (path.startsWith('/api/auth/')) return handleAuth(request, env);
    if (path === '/api/sites' || path.startsWith('/api/sites/')) return handleSites(request, env);
    if (path === '/api/annotations' || path.startsWith('/api/annotations/')) return handleAnnotations(request, env);
    if (path.startsWith('/api/stats/')) return handleStats(request, env);

    if (path.startsWith('/api/')) return json({ error: 'not found' }, 404);

    // Everything else is dashboard HTML/CSS/JS or the tracker.js snippet —
    // served straight from /public via the Static Assets binding.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
