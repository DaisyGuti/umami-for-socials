import { test, expect } from '@playwright/test';
import { adminPassword } from './helpers/password';

// Auth flow: the login form, the cookie gate that protects every other page,
// and logout. These run in a clean (signed-out) context, overriding the shared
// authenticated storage state the rest of the suite uses.
test.describe('authentication', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rejects a wrong password and stays on the login page @smoke', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Admin password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const error = page.locator('#login-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Incorrect password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in with the correct password and lands on the dashboard @smoke', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Admin password').fill(adminPassword());
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The form redirects to '/' on success.
    await expect(page).toHaveURL(`${new URL(page.url()).origin}/`);
    await expect(page.getByRole('heading', { name: /traffic worth repeating/i })).toBeVisible();
  });

  test('redirects to login when visiting a protected page without a session', async ({ page }) => {
    await page.goto('/');
    // app.js gate() bounces unauthenticated requests to /login.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Admin password')).toBeVisible();
  });
});

test.describe('logout', () => {
  // Starts from the shared authenticated state (default for the chromium project).
  test('logging out clears the session and re-gates protected pages', async ({ page }) => {
    await page.goto('/sites');
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Cookie is gone, so a fresh navigation to a protected page bounces again.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
