import { expect, test } from '@playwright/test';
import { mountCatalog } from './fixture.js';

test.beforeEach(async ({ page }) => { await mountCatalog(page); });

test('search a course and preview its task', async ({ page }) => {
  await page.getByLabel('Search courses', { exact: true }).fill('poster');
  await expect(page.getByLabel('Search courses', { exact: true })).toHaveValue('poster');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Courses' }).getByRole('row')).toHaveCount(2);
  await page.getByRole('row').filter({ hasText: 'Poster design' })
    .getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task preview', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Poster brief', exact: true })).toBeVisible();
});
