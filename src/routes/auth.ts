import type { Env } from '../types';
import { json } from '../lib/response';
import {
  buildLogoutCookie,
  buildSessionCookie,
  isAuthenticated,
  newSessionSignature,
  verifyPassword,
} from '../lib/auth';
import { asString } from '../lib/validate';

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/api\/auth\//, '');

  if (sub === 'login' && request.method === 'POST') return login(request, env);
  if (sub === 'logout' && request.method === 'POST') return logout(request);
  if (sub === 'check' && request.method === 'GET') return check(request, env);

  return json({ error: 'not found' }, 404);
}

async function login(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const password = asString((body as Record<string, unknown>)?.password);
  if (!password) return json({ error: 'password required' }, 400);

  if (!(await verifyPassword(password, env))) {
    return json({ error: 'invalid password' }, 401);
  }

  const signature = await newSessionSignature(env);
  return json({ ok: true }, 200, { 'Set-Cookie': buildSessionCookie(signature, request) });
}

async function logout(request: Request): Promise<Response> {
  return json({ ok: true }, 200, { 'Set-Cookie': buildLogoutCookie(request) });
}

async function check(request: Request, env: Env): Promise<Response> {
  return (await isAuthenticated(request, env))
    ? json({ ok: true })
    : json({ error: 'unauthorized' }, 401);
}
