import { test, expect } from './fixtures';

// The dashboard, exercised against a freshly seeded site (see fixtures.ts). The
// seed includes tagged pageviews across channels plus two conversions, so KPIs,
// the revenue-by-channel table, and the UTM cards all have data to render.
test.describe('dashboard', () => {
  test('renders KPIs, revenue, and channel breakdowns for a seeded site @smoke', async ({
    page,
    seededSite,
  }) => {
    await page.goto('/');

    // Point the dashboard at our seeded site; selecting it triggers a refresh.
    await page.locator('#site-select').selectOption(seededSite.id);

    // Traffic KPIs populate (7 pageviews were seeded).
    await expect(page.locator('#kpi-pageviews')).toHaveText(/[1-9]/);
    await expect(page.locator('#kpi-uniques')).toHaveText(/[1-9]/);

    // Money KPIs reflect the two conversions ($121.50 total), not the empty state.
    await expect(page.locator('#kpi-revenue')).not.toHaveText('$0');
    await expect(page.locator('#kpi-orders')).toHaveText('2');

    // The branded UTM source card and the revenue table both name our channels.
    await expect(page.locator('#utm-source-table')).toContainText('instagram');
    await expect(page.locator('#revenue-table')).toContainText('Instagram');
  });

  test('the range selector re-queries the data', async ({ page, seededSite }) => {
    await page.goto('/');
    await page.locator('#site-select').selectOption(seededSite.id);
    await expect(page.locator('#kpi-pageviews')).toHaveText(/[1-9]/);

    // Switch to last 24h — seeded events are "now", so they still show.
    await page.locator('#range-select').selectOption('86400');
    await expect(page.locator('#kpi-pageviews')).toHaveText(/[1-9]/);
    await expect(page.locator('#kpi-orders')).toHaveText('2');
  });

  test('clicking a channel drills the dashboard down to it', async ({ page, seededSite }) => {
    await page.goto('/');
    await page.locator('#site-select').selectOption(seededSite.id);
    await expect(page.locator('#revenue-table')).toContainText('Instagram');

    // Revenue rows are drillable; clicking one opens the filter bar.
    await page.locator('#revenue-table tr.drillable').first().click();

    const filterBar = page.locator('#filter-bar');
    await expect(filterBar).toBeVisible();
    await expect(page.locator('#filter-chip')).not.toBeEmpty();

    // Clearing the filter hides the bar again.
    await page.locator('#filter-clear').click();
    await expect(filterBar).toBeHidden();
  });

  test('exporting CSV downloads a file', async ({ page, seededSite }) => {
    await page.goto('/');
    await page.locator('#site-select').selectOption(seededSite.id);
    await expect(page.locator('#kpi-pageviews')).toHaveText(/[1-9]/);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('the theme toggle flips and persists across reloads', async ({ page, seededSite }) => {
    await page.goto('/');
    await page.locator('#site-select').selectOption(seededSite.id);

    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    const expected = before === 'dark' ? 'light' : 'dark';

    await page.locator('#theme-toggle').click();
    await expect(html).toHaveAttribute('data-theme', expected);

    // The choice is saved to localStorage and applied before first paint.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  });
});
