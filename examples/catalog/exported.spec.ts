import { expect, test } from '@playwright/test';
import { mountCatalog } from './fixture.js';

// Standalone reverse conversion: no Playbook runtime dependency.
// Source: catalog.playbook.ts; regenerate or review when that workflow changes.
test.beforeEach(async ({ page }) => { await mountCatalog(page); });

test('exported course search and task preview', async ({ page }) => {
  await test.step('输入课程关键词', async () => {
    await page.getByLabel('Search courses', { exact: true }).fill('poster');
    await expect(page.getByLabel('Search courses', { exact: true })).toHaveValue('poster');
  });
  await test.step('筛选课程', async () => {
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Courses' }).getByRole('row')).toHaveCount(2);
  });
  await test.step('预览课堂任务', async () => {
    await page.getByRole('row').filter({ hasText: 'Poster design' })
      .getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Task preview', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Poster brief', exact: true })).toBeVisible();
  });
});
