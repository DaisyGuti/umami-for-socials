import { defineConfig, devices } from '@playwright/test';

// E2E config for Umami for Socials. Playwright drives the real app served by
// `wrangler dev` (a genuine Workers + D1 runtime), so these tests exercise the
// same code path production does — auth cookies, the collect endpoint, D1
// queries, and the dashboard's client JS.
//
// Auth is set up once (e2e/auth.setup.ts logs in via the API and saves a cookie
// to storage state); every other test reuses it instead of clicking through the
// login form. Specs that need a clean unauthenticated context opt out by
// setting `storageState: { cookies: [], origins: [] }` themselves.

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8787';

// The collect endpoint drops any User-Agent matching /headless/ as a bot
// (src/lib/referrer.ts), and default headless Chromium reports "HeadlessChrome".
// A realistic UA keeps our seeded pageviews from being silently discarded.
const REAL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AUTH_STATE = 'playwright/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  // Fail the build on CI if someone leaves test.only in a spec.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // wrangler dev + local D1 is a single shared server, so keep DB-touching
  // tests serial-friendly. Workers self-isolate by creating their own site.
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: true,
  reporter: process.env.CI ? [['html'], ['github']] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    userAgent: REAL_UA,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Logs in once and writes the session cookie to AUTH_STATE.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], userAgent: REAL_UA, storageState: AUTH_STATE },
      dependencies: ['setup'],
    },

    // Cross-browser runs are opt-in (`npx playwright test --project=firefox`) so
    // the default local run stays fast. Uncomment to wire them into every run.
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'], storageState: AUTH_STATE },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'], storageState: AUTH_STATE },
    //   dependencies: ['setup'],
    // },
  ],

  // Auto-start the app and wait until /healthz answers. Reuses an already-running
  // `npm run dev` locally so you can keep your own dev server up.
  webServer: {
    command: 'npm run dev',
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
