import { describe, it, expect } from 'vitest';
import { constantTimeEqual, randomHexId, sha256Hex, visitorHash } from '../src/lib/hash';

describe('sha256Hex', () => {
  it('produces a 64-char hex digest', async () => {
    const out = await sha256Hex('hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    // Known SHA-256 of "hello"
    expect(out).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('visitorHash', () => {
  const secret = 'test-secret';
  const ip = '203.0.113.42';
  const ua = 'Mozilla/5.0';

  it('is deterministic within the same UTC day', async () => {
    const t = Date.UTC(2026, 4, 24, 10, 0, 0); // 2026-05-24 10:00 UTC
    const a = await visitorHash(secret, ip, ua, t);
    const b = await visitorHash(secret, ip, ua, t + 60_000);
    expect(a).toBe(b);
  });

  it('rotates across UTC day boundaries', async () => {
    const day1 = Date.UTC(2026, 4, 24, 23, 59, 0);
    const day2 = Date.UTC(2026, 4, 25, 0, 1, 0);
    const a = await visitorHash(secret, ip, ua, day1);
    const b = await visitorHash(secret, ip, ua, day2);
    expect(a).not.toBe(b);
  });

  it('differs when IP differs', async () => {
    const t = Date.UTC(2026, 4, 24, 12, 0, 0);
    const a = await visitorHash(secret, '203.0.113.1', ua, t);
    const b = await visitorHash(secret, '203.0.113.2', ua, t);
    expect(a).not.toBe(b);
  });

  it('truncates to 16 hex chars', async () => {
    const h = await visitorHash(secret, ip, ua, Date.now());
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });
  it('returns false for different strings', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('randomHexId', () => {
  it('produces hex of the expected length', () => {
    expect(randomHexId(8)).toMatch(/^[0-9a-f]{16}$/);
    expect(randomHexId(4)).toMatch(/^[0-9a-f]{8}$/);
  });
  it('produces different IDs on consecutive calls', () => {
    const a = randomHexId(8);
    const b = randomHexId(8);
    expect(a).not.toBe(b);
  });
});
