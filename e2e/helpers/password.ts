import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve the admin password the running `wrangler dev` will accept.
//
// `wrangler dev` reads ADMIN_PASSWORD from the gitignored .dev.vars file, which
// Playwright can't see directly. To keep the tests zero-config, we mirror that:
// prefer an explicit E2E_ADMIN_PASSWORD env var, otherwise parse .dev.vars so we
// always match whatever the dev server is actually using.
export function adminPassword(): string {
  const fromEnv = process.env.E2E_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;

  const fromVars = readDevVar('ADMIN_PASSWORD');
  if (fromVars) return fromVars;

  throw new Error(
    'No admin password found. Set E2E_ADMIN_PASSWORD or add ADMIN_PASSWORD to .dev.vars.',
  );
}

// Minimal .dev.vars reader: KEY=VALUE per line, optional surrounding quotes,
// `#` comment lines ignored. Mirrors the subset of dotenv wrangler supports.
function readDevVar(key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), '.dev.vars'), 'utf8');
  } catch {
    return undefined;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    return trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return undefined;
}
