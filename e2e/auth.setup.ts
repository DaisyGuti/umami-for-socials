import { test as setup } from '@playwright/test';
import { login } from './helpers/api';

const AUTH_STATE = 'playwright/.auth/admin.json';

// Runs once before the main test project (declared as a dependency in
// playwright.config.ts). Logs in via the API and saves the resulting session
// cookie so every authed spec starts signed in, with no per-test login cost.
setup('authenticate', async ({ request }) => {
  await login(request);
  await request.storageState({ path: AUTH_STATE });
});
