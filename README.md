# Umami for Socials

Self-hosted web analytics for sites that get most of their traffic from social media, built specifically for Cloudflare's free tier. Much simpler to set up and read than Google Analytics (GA), focused on what matters for social-driven sites: UTM tags, social referrers, and visitor language.

## Why this instead of GA or paid tools

- **Cost.** Free on Cloudflare's tier for typical small to mid-sized sites.
- **Privacy.** Self-hosted, no cookies, no stored IPs. Most sites running it should not need a cookie banner under EU rules.
- **Simplicity.** A small dashboard focused on what actually matters for social-driven traffic, instead of dozens of charts you will never open.
- **You own the data.** Visitor data stays on your infrastructure, so no vendor can sell it, use it to train AI models, or take it away when their policies change.

## What it covers

- Pageviews and unique visitors per site, per time range.
- UTM tags: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`.
- Social referrer labels for Instagram, TikTok, X/Twitter, Facebook, LinkedIn, YouTube, Reddit, Pinterest, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Discord, Slack, email providers, and search engines.
- Country and visitor language.
- Top pages.
- A UTM link builder so the tags in your bio/post/email match your dashboard.
- Doesn't duplicate what your hosting provider already reports for free (pageviews, devices, browsers, performance).

## Quickstart

Cloudflare account + Node 22+.

```bash
git clone https://github.com/DaisyGuti/umami-for-socials.git
cd umami-for-socials
npm install

# Create the D1 database. Paste the printed ID into wrangler.jsonc.
npx wrangler d1 create umami-for-socials

# Apply the schema (local + remote).
npm run db:apply:local
npm run db:apply:remote

# Set production secrets.
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET

# Deploy.
npm run deploy
```

Then visit `https://umami-for-socials.<your-subdomain>.workers.dev`, log in, create a site, and copy the embed snippet onto your site.

Production reads secrets from Cloudflare's secret store. Local dev reads them from `.dev.vars`.

## Local development

```bash
cp .dev.vars.example .dev.vars        # edit the two values
npm run db:apply:local
npm run dev                           # http://localhost:8787
```

## Embedding the tracker

Add to the `<head>` of the site you want to track:

```html
<script async defer
  src="https://YOUR-WORKER.workers.dev/tracker.js"
  data-site="YOUR_SITE_ID"></script>
```

Optional attributes:

- `data-track-localhost="true"` — include localhost. Off by default so production data only includes real visitors.
- `data-respect-dnt="true"` — skip when the browser sends `DNT: 1`.

Single-page apps work automatically (React Router, Vue Router, Astro view transitions).

## UTM conventions

The dashboard prefers `utm_source` when present and falls back to the social referrer label. Using the same value for both keeps your buckets aligned.

| Where you're posting | `utm_source` | `utm_medium` |
| --- | --- | --- |
| Instagram bio link | `instagram` | `bio` |
| Instagram story sticker | `instagram` | `story` |
| TikTok bio | `tiktok` | `bio` |
| X / Twitter post | `twitter` | `post` |
| Facebook post | `facebook` | `post` |
| LinkedIn post | `linkedin` | `post` |
| YouTube description | `youtube` | `description` |
| Newsletter | `newsletter` | `email` |
| WhatsApp / Telegram / Discord | `whatsapp` / `telegram` / `discord` | `chat` |

The `/utm-builder` page has these as one-click presets.

## Not included

**Could be added later:**

- Sessions, bounce rate, session duration
- Custom events (newsletter signup, button clicks)
- Real-time live view
- Comparison periods (this 30d vs prev 30d)
- Multi-user / RBAC

**Already covered by your host:**

- Browser, OS, device type
- Page load time, Core Web Vitals

For sessions, custom events, real-time, or multi-user, run [Umami](https://umami.is/) on a small VPS or use [Umami Cloud](https://cloud.umami.is/).

## Project layout

```text
src/
  worker.ts              # Routes /api/* to handlers; static files fall through to /public.
  lib/                   # auth, hash, referrer labels, response helpers, validation
  routes/                # auth, collect, sites, stats
public/                  # tracker.js + dashboard HTML/CSS/JS
tests/                   # vitest unit tests for the pure helpers
schema.sql               # D1 schema (safe to re-run)
wrangler.jsonc           # Cloudflare Workers + D1 + Static Assets config
```

## Built with

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Static hosting:** Cloudflare Static Assets
- **Server code:** TypeScript
- **Dashboard:** plain HTML, CSS, and JavaScript
- **Charts:** Chart.js (loaded from a CDN)
- **Tests:** Vitest

## Privacy

- IPs are not stored. Each event gets a 16-char hash that rotates daily, so daily uniques are accurate but cross-day tracking is not possible.
- The tracker sets no cookies.
- Bot user-agents are filtered at write time.
- Country comes from Cloudflare's edge.
- Self-hosted on your own account — visitor data never goes to a third party.

The combination of these — self-hosted, no cookies, no stored IPs, no persistent visitor IDs — means most sites can run this without a cookie banner under EU privacy rules (GDPR, ePrivacy). Not legal advice; confirm with your own counsel for your specific situation.

## License

MIT.
