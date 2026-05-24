// Classify a referrer URL into a coarse traffic source bucket. The dashboard
// uses this to surface where traffic is coming from when the visitor hit the
// site WITHOUT a UTM tag — common for organic shares, app browsers, and chats.
// Patterns favor mobile/in-app browser hostnames (l.instagram.com, lm.facebook,
// out.reddit) which are what most social shares actually send.

interface Rule {
  source: string;
  hosts: string[]; // matched as suffix on the referrer hostname
}

const RULES: Rule[] = [
  { source: 'instagram', hosts: ['instagram.com', 'l.instagram.com'] },
  { source: 'tiktok',    hosts: ['tiktok.com', 'vm.tiktok.com'] },
  { source: 'twitter',   hosts: ['twitter.com', 'x.com', 't.co'] },
  { source: 'facebook',  hosts: ['facebook.com', 'l.facebook.com', 'lm.facebook.com', 'm.facebook.com', 'fb.me'] },
  { source: 'linkedin',  hosts: ['linkedin.com', 'lnkd.in'] },
  { source: 'youtube',   hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
  { source: 'reddit',    hosts: ['reddit.com', 'old.reddit.com', 'out.reddit.com'] },
  { source: 'pinterest', hosts: ['pinterest.com', 'pin.it'] },
  { source: 'snapchat',  hosts: ['snapchat.com'] },
  { source: 'threads',   hosts: ['threads.net'] },
  { source: 'bluesky',   hosts: ['bsky.app'] },
  { source: 'mastodon',  hosts: ['mastodon.social', 'mas.to'] },
  { source: 'whatsapp',  hosts: ['whatsapp.com', 'web.whatsapp.com', 'api.whatsapp.com', 'wa.me'] },
  { source: 'telegram',  hosts: ['t.me', 'telegram.org'] },
  { source: 'discord',   hosts: ['discord.com', 'discord.gg'] },
  { source: 'slack',     hosts: ['slack.com'] },
  { source: 'email',     hosts: ['mail.google.com', 'gmail.com', 'outlook.com', 'outlook.live.com', 'mail.yahoo.com', 'protonmail.com', 'fastmail.com', 'mail.ru'] },
  { source: 'google',    hosts: ['google.com', 'news.google.com', 'translate.google.com'] },
  { source: 'bing',      hosts: ['bing.com'] },
  { source: 'duckduckgo',hosts: ['duckduckgo.com'] },
  { source: 'yandex',    hosts: ['yandex.com', 'yandex.ru'] },
];

export interface ReferrerInfo {
  host: string | null;
  source: string;
}

export function classifyReferrer(referrer: string | null | undefined, selfHost?: string): ReferrerInfo {
  if (!referrer) return { host: null, source: 'direct' };
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return { host: null, source: 'other' };
  }
  const host = url.hostname.toLowerCase();
  if (selfHost && (host === selfHost || host.endsWith(`.${selfHost}`))) {
    return { host, source: 'internal' };
  }
  for (const rule of RULES) {
    if (rule.hosts.some(h => host === h || host.endsWith(`.${h}`))) {
      return { host, source: rule.source };
    }
  }
  return { host, source: 'other' };
}

// Tight regex catches the bulk of crawlers without a heavy ua-parser dep. We
// drop these silently rather than storing flagged events — keeps the dashboard
// numbers honest for a personal-scale tool.
const BOT_PATTERN = /bot|crawler|spider|preview|monitor|headless|wget|curl|python-requests|axios|node-fetch/i;

export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}
