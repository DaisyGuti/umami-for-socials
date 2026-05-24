import { describe, it, expect } from 'vitest';
import { classifyReferrer, isBotUserAgent } from '../src/lib/referrer';

describe('classifyReferrer', () => {
  it('returns direct for missing referrer', () => {
    expect(classifyReferrer(null)).toEqual({ host: null, source: 'direct' });
    expect(classifyReferrer('')).toEqual({ host: null, source: 'direct' });
  });

  it('classifies Instagram (incl. mobile link wrapper)', () => {
    expect(classifyReferrer('https://www.instagram.com/').source).toBe('instagram');
    expect(classifyReferrer('https://l.instagram.com/?u=...').source).toBe('instagram');
  });

  it('classifies TikTok, Twitter/X, Facebook mobile wrappers', () => {
    expect(classifyReferrer('https://www.tiktok.com/@me').source).toBe('tiktok');
    expect(classifyReferrer('https://x.com/me').source).toBe('twitter');
    expect(classifyReferrer('https://t.co/abc').source).toBe('twitter');
    expect(classifyReferrer('https://lm.facebook.com/l.php?u=...').source).toBe('facebook');
  });

  it('classifies email providers as "email"', () => {
    expect(classifyReferrer('https://mail.google.com/mail/u/0/').source).toBe('email');
    expect(classifyReferrer('https://outlook.live.com/').source).toBe('email');
  });

  it('classifies search engines distinctly', () => {
    expect(classifyReferrer('https://www.google.com/search?q=x').source).toBe('google');
    expect(classifyReferrer('https://duckduckgo.com/?q=x').source).toBe('duckduckgo');
  });

  it('flags internal referrers when selfHost is provided', () => {
    expect(classifyReferrer('https://example.com/page', 'example.com').source).toBe('internal');
    expect(classifyReferrer('https://blog.example.com/post', 'example.com').source).toBe('internal');
  });

  it('falls back to "other" for unknown hosts', () => {
    const r = classifyReferrer('https://random-blog.xyz/post');
    expect(r.source).toBe('other');
    expect(r.host).toBe('random-blog.xyz');
  });

  it('returns "other" with null host for invalid URLs', () => {
    expect(classifyReferrer('not-a-url')).toEqual({ host: null, source: 'other' });
  });
});

describe('isBotUserAgent', () => {
  it('flags common crawlers', () => {
    expect(isBotUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0;)')).toBe(true);
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(false); // doesn't match — Facebook preview hits get classified later
    expect(isBotUserAgent('curl/8.6.0')).toBe(true);
    expect(isBotUserAgent('HeadlessChrome/120.0.0.0')).toBe(true);
  });
  it('lets real browsers through', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(false);
  });
  it('treats missing UA as bot (safer default)', () => {
    expect(isBotUserAgent(null)).toBe(true);
  });
});
