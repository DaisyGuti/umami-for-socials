export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(buf);
}

// Daily-rotating visitor hash. We mix today's UTC date into the salt so the
// same person browsing tomorrow gets a different hash — uniques per day are
// accurate, but cross-day fingerprinting is impossible. Raw IP never lands in
// the database.
export async function visitorHash(
  secret: string,
  ip: string,
  userAgent: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const today = new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const material = `${secret}|${today}|${ip}|${userAgent}`;
  const hex = await sha256Hex(material);
  return hex.slice(0, 16);
}

// Constant-time string compare. Web Crypto doesn't expose timingSafeEqual, so
// we roll our own — important for password checks to defeat timing attacks.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function randomHexId(byteLength = 8): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
