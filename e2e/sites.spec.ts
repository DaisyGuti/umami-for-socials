import { test, expect } from '@playwright/test';

// Site management through the UI on /sites: create, see it listed, delete it.
// Runs authenticated (the project's default storage state).
test.describe('sites', () => {
  test('creates a site, lists it, then deletes it @smoke', async ({ page }) => {
    // Unique name so a failed run's leftover row can't make this pass falsely.
    const name = `UI Site ${Date.now()}`;

    await page.goto('/sites');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create site' }).click();

    const table = page.locator('#sites-table');
    const row = table.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    // Each created site exposes its 16-hex ID in a <code> cell.
    await expect(row.locator('code')).toHaveText(/^[0-9a-f]{16}$/);

    // Delete goes through a window.confirm — auto-accept it.
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(table.locator('tr', { hasText: name })).toHaveCount(0);
  });

  test('shows the embed snippet for a site', async ({ page }) => {
    const name = `Snippet Site ${Date.now()}`;
    await page.goto('/sites');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create site' }).click();

    const row = page.locator('#sites-table tr', { hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Embed' }).click();

    const snippet = page.locator('#snippet');
    await expect(snippet).toBeVisible();
    await expect(snippet).toContainText('tracker.js');
    await expect(snippet).toContainText('data-site=');

    // Clean up.
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#sites-table tr', { hasText: name })).toHaveCount(0);
  });
});
