import type { APIRequestContext } from '@playwright/test';
import { adminPassword } from './password';

// Thin wrappers over the app's real HTTP API. Tests use these to set up state
// (log in, create a site, seed events) far faster and more reliably than
// driving the UI for every precondition. Each request goes through the same
// endpoints a browser would, so seeding still exercises real validation.

export interface SeededEvent {
  path?: string;
  referrer?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  type?: 'pageview' | 'conversion';
  revenue?: number;
}

// Log in with the admin password and return the Set-Cookie session value, so
// callers (e.g. auth.setup.ts) can persist it as storage state.
export async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { password: adminPassword() },
  });
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  }
}

export async function createSite(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post('/api/sites', { data: { name } });
  if (res.status() !== 201) {
    throw new Error(`createSite failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { site: { id: string } };
  return body.site.id;
}

export async function deleteSite(request: APIRequestContext, id: string): Promise<void> {
  // Best-effort cleanup — don't fail a teardown if the site is already gone.
  await request.delete(`/api/sites/${encodeURIComponent(id)}`).catch(() => {});
}

// Send one collect event. The collect endpoint is public (no auth) and keys off
// site_id, exactly like the real tracker.js snippet.
export async function collect(
  request: APIRequestContext,
  siteId: string,
  event: SeededEvent,
): Promise<void> {
  const res = await request.post('/api/collect', {
    data: {
      site_id: siteId,
      path: event.path ?? '/',
      referrer: event.referrer ?? null,
      utm: event.utm ?? {},
      type: event.type ?? 'pageview',
      ...(event.type === 'conversion' ? { revenue: event.revenue ?? 0 } : {}),
    },
  });
  if (!res.ok()) {
    throw new Error(`collect failed: ${res.status()} ${await res.text()}`);
  }
}

export async function seedEvents(
  request: APIRequestContext,
  siteId: string,
  events: SeededEvent[],
): Promise<void> {
  // Sequential keeps D1 writes from racing and makes failures easy to read.
  for (const event of events) {
    await collect(request, siteId, event);
  }
}

// A small but realistic spread of traffic so the dashboard has something to
// render: tagged pageviews across a few channels plus two conversions with
// revenue, so the money KPIs and revenue-by-channel table populate.
export function sampleTraffic(): SeededEvent[] {
  return [
    { path: '/', utm: { source: 'instagram', medium: 'social', campaign: 'spring-launch' } },
    { path: '/', utm: { source: 'instagram', medium: 'social', campaign: 'spring-launch' } },
    { path: '/pricing', utm: { source: 'instagram', medium: 'social', campaign: 'spring-launch' } },
    { path: '/', utm: { source: 'tiktok', medium: 'social', campaign: 'creator-drop' } },
    { path: '/blog', utm: { source: 'email', medium: 'newsletter', campaign: 'weekly' } },
    { path: '/', referrer: 'https://www.google.com/' },
    { path: '/', referrer: null }, // direct
    {
      path: '/checkout',
      utm: { source: 'instagram', medium: 'social', campaign: 'spring-launch' },
      type: 'conversion',
      revenue: 79.0,
    },
    {
      path: '/checkout',
      utm: { source: 'email', medium: 'newsletter', campaign: 'weekly' },
      type: 'conversion',
      revenue: 42.5,
    },
  ];
}
