import type { Env } from '../types';
import { constantTimeEqual, toHex } from './hash';
import { json } from './response';

const COOKIE_NAME = 'ufs_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Sign a fixed message with SESSION_SECRET. The cookie value is just this
// signature — if someone can produce it, they hold the secret, so they're in.
// Rotating SESSION_SECRET invalidates every existing session.
async function expectedSignature(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('v1'));
  return toHex(sig);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

export function buildSessionCookie(value: string, request: Request): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function buildLogoutCookie(request: Request): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export async function verifyPassword(submitted: string, env: Env): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  return constantTimeEqual(submitted, env.ADMIN_PASSWORD);
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const cookie = readCookie(request, COOKIE_NAME);
  if (!cookie) return false;
  const expected = await expectedSignature(env.SESSION_SECRET);
  return constantTimeEqual(cookie, expected);
}

// Returns null when the request is authenticated, or a 401 Response otherwise.
// Use as a guard at the top of admin route handlers.
export async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  return (await isAuthenticated(request, env)) ? null : json({ error: 'unauthorized' }, 401);
}

export async function newSessionSignature(env: Env): Promise<string> {
  return expectedSignature(env.SESSION_SECRET);
}
