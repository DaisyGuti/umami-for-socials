// Lightweight input validation. Keeps the worker dependency-free and the
// surface area small enough that a junior dev can audit it end to end.

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Trim arbitrary user input down to a safe max length before storing.
// Bounds are conservative: long enough for real values, short enough that one
// abusive site can't blow up the database.
export function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export const LIMITS = {
  siteName: 64,
  path: 512,
  referrer: 1024,
  utm: 128,
  language: 35, // BCP-47 language tags don't exceed this in practice
  country: 2,
} as const;
