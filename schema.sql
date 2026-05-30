-- Umami for Socials schema. Single events table keeps queries simple and
-- D1's free tier comfortable. Run with:
--   wrangler d1 execute umami-for-socials --local  --file=./schema.sql
--   wrangler d1 execute umami-for-socials --remote --file=./schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sites (
  id          TEXT    PRIMARY KEY,         -- 16-hex public ID embedded in tracker
  name        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL              -- unix seconds, UTC
);

CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id          TEXT    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ts               INTEGER NOT NULL,        -- unix seconds, UTC
  path             TEXT    NOT NULL,        -- e.g. "/landing"
  referrer         TEXT,                    -- raw Referer header value
  referrer_host    TEXT,                    -- denormalized hostname for fast grouping
  referrer_source  TEXT,                    -- classified bucket: "instagram", "email", "direct", ...
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_term         TEXT,
  utm_content      TEXT,
  country          TEXT,                    -- ISO 3166-1 alpha-2 from Cloudflare cf-ipcountry
  language         TEXT,                    -- navigator.language, e.g. "en-US"
  visitor_hash     TEXT    NOT NULL,        -- daily-rotating hash, lets us count uniques without IPs
  event_type       TEXT    NOT NULL DEFAULT 'pageview',  -- 'pageview' | 'conversion'
  revenue          REAL                     -- order value for conversion events, in major units
);

-- Indexes target the dashboard's hot queries: time-range scans per site,
-- and grouping by UTM source or referrer source within a window.
CREATE INDEX IF NOT EXISTS idx_events_site_ts          ON events(site_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_site_src_ts      ON events(site_id, utm_source, ts);
CREATE INDEX IF NOT EXISTS idx_events_site_refsrc_ts   ON events(site_id, referrer_source, ts);
CREATE INDEX IF NOT EXISTS idx_events_site_path_ts     ON events(site_id, path, ts);
CREATE INDEX IF NOT EXISTS idx_events_site_country_ts  ON events(site_id, country, ts);
CREATE INDEX IF NOT EXISTS idx_events_site_type_ts     ON events(site_id, event_type, ts);

-- Timeline markers: launch dates, ad pushes, price changes — drawn as vertical
-- lines on the dashboard's channel-mix chart.
CREATE TABLE IF NOT EXISTS annotations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ts          INTEGER NOT NULL,        -- unix seconds, UTC (the date being marked)
  label       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anno_site ON annotations(site_id, ts);
