import { expect } from '@playwright/test';
import { definePlaybook } from '@playbook/core';

export default definePlaybook({
  schemaVersion: 1, id: 'starter.catalog', title: '查找课程并预览课堂任务',
  summary: '跟随一次教师操作，学习课程搜索、任务入口和创作要求的查看方式。',
  presentation: { spotlightRadius: 105, overlayOpacity: .56, cursorMoveMs: 900, openingMs: 2600 },
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  steps: [
    { id: 'query', title: '输入课程关键词', explain: '输入“海报”，查找相关课程。输入后，我们再执行搜索。',
      presentation: { chapter: '找到课程', side: 'bottom', holdMs: 2700 },
      target: ({ page }) => page.getByLabel('搜索课程', { exact: true }),
      run: async ({ page }) => { await page.getByLabel('搜索课程', { exact: true }).fill('海报'); },
      verify: async ({ page }) => { await expect(page.getByLabel('搜索课程', { exact: true })).toHaveValue('海报'); } },
    { id: 'search', title: '筛选相关课程', explain: '点击搜索，列表只显示与关键词匹配的课程。',
      target: ({ page }) => page.getByRole('button', { name: '搜索', exact: true }),
      run: async ({ page }) => { await page.getByRole('button', { name: '搜索', exact: true }).click(); },
      verify: async ({ page }) => { await expect(page.getByRole('table').getByRole('row')).toHaveCount(2); } },
    { id: 'preview', title: '打开课堂任务', explain: '预览任务可以直接看到课堂情境、创作要求和评价依据。现在打开已有的任务。',
      target: ({ page }) => page.getByRole('button', { name: '预览任务', exact: true }),
      run: async ({ page }) => { await page.getByRole('button', { name: '预览任务', exact: true }).click(); },
      verify: async ({ page }) => { await expect(page.getByRole('heading', { name: '校园海报创作任务', exact: true })).toBeVisible(); } },
    { id: 'requirements', title: '核对创作要求', explain: '学生要完成什么、需要提交什么，在同一份任务中清楚呈现。这里留出一点时间查看具体要求。',
      presentation: { chapter: '理解课堂任务', side: 'right', holdMs: 3500, afterMs: 900 },
      target: ({ page }) => page.getByRole('heading', { name: '创作要求', exact: true }),
      run: async () => {}, verify: async ({ page }) => { await expect(page.getByRole('dialog')).toContainText('冷暖色对比'); } },
    { id: 'close', title: '回到课程列表', explain: '预览结束后回到课程。刚才的操作没有创建、发布或删除任何业务内容。',
      presentation: { side: 'left', holdMs: 2400 }, target: ({ page }) => page.getByRole('button', { name: '关闭预览', exact: true }),
      run: async ({ page }) => { await page.getByRole('button', { name: '关闭预览', exact: true }).click(); },
      verify: async ({ page }) => { await expect(page.getByRole('dialog')).toBeHidden(); } },
  ],
});
