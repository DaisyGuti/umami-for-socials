import { describe, it, expect } from 'vitest';
import { asString, asNumber, clip, LIMITS } from '../src/lib/validate';

describe('asString', () => {
  it('returns strings unchanged', () => {
    expect(asString('hello')).toBe('hello');
  });
  it('rejects non-strings', () => {
    expect(asString(42)).toBeNull();
    expect(asString(null)).toBeNull();
    expect(asString(undefined)).toBeNull();
    expect(asString({})).toBeNull();
  });
});

describe('asNumber', () => {
  it('passes finite numbers', () => {
    expect(asNumber(0)).toBe(0);
    expect(asNumber(42.5)).toBe(42.5);
  });
  it('parses numeric strings', () => {
    expect(asNumber('123')).toBe(123);
  });
  it('rejects junk and infinities', () => {
    expect(asNumber('abc')).toBeNull();
    expect(asNumber(NaN)).toBeNull();
    expect(asNumber(Infinity)).toBeNull();
    expect(asNumber(null)).toBeNull();
  });
});

describe('clip', () => {
  it('returns null for empty input', () => {
    expect(clip(null, 10)).toBeNull();
    expect(clip(undefined, 10)).toBeNull();
    expect(clip('', 10)).toBeNull();
  });
  it('passes short strings through', () => {
    expect(clip('hi', 10)).toBe('hi');
  });
  it('truncates long strings', () => {
    expect(clip('abcdefghij', 4)).toBe('abcd');
  });
});

describe('LIMITS', () => {
  it('exposes the documented field caps', () => {
    expect(LIMITS.utm).toBe(128);
    expect(LIMITS.path).toBe(512);
    expect(LIMITS.country).toBe(2);
  });
});
