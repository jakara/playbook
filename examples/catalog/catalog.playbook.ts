import { expect } from '@playwright/test';
import { definePlaybook, type PlaybookContext } from '@playbook/core';

export default definePlaybook<PlaybookContext>({
  schemaVersion: 1,
  id: 'catalog.task-preview', title: '查找课程并预览任务',
  summary: '教师通过课程搜索定位任务，核对学生将看到的创作要求。',
  source: { testFile: 'original.spec.ts', testTitle: 'search a course and preview its task' },
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  steps: [
    {
      id: 'query', title: '输入课程关键词', explain: '输入 poster，查找相关课程。',
      presentation: { chapter: '从课程查找到任务预览', side: 'bottom', holdMs: 2500 },
      target: ({ page }) => page.getByLabel('Search courses', { exact: true }),
      run: async ({ page }) => { await page.getByLabel('Search courses', { exact: true }).fill('poster'); },
      verify: async ({ page }) => {
        await expect(page.getByLabel('Search courses', { exact: true })).toHaveValue('poster');
      },
    },
    {
      id: 'search', title: '筛选课程', explain: '列表只显示符合关键词的课程。',
      target: ({ page }) => page.getByRole('button', { name: 'Search', exact: true }),
      run: async ({ page }) => { await page.getByRole('button', { name: 'Search', exact: true }).click(); },
      verify: async ({ page }) => {
        await expect(page.getByRole('table', { name: 'Courses' }).getByRole('row')).toHaveCount(2);
      },
    },
    {
      id: 'preview', title: '预览课堂任务', explain: '打开任务卡，核对创作要求。',
      target: ({ page }) => page.getByRole('row').filter({ hasText: 'Poster design' })
        .getByRole('button', { name: 'Preview', exact: true }),
      run: async ({ page }) => {
        await page.getByRole('row').filter({ hasText: 'Poster design' })
          .getByRole('button', { name: 'Preview', exact: true }).click();
      },
      verify: async ({ page }) => {
        await expect(page.getByRole('dialog', { name: 'Task preview', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Poster brief', exact: true })).toBeVisible();
      },
    },
  ],
});
