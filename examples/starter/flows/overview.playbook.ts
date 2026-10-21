import { expect } from '@playwright/test';
import { definePlaybook } from '@playbook/core';

export default definePlaybook({
  schemaVersion: 1, id: 'starter.overview', title: '认识课程工作台',
  summary: '先了解课程工作台如何组织课程和课堂任务，再开始实际操作。',
  presentation: { spotlightFeather: 28 },
  narration: { enabled: true, voice: 'Tingting', rate: 185, opening: { text: '这是一段自动演示。' } },
  redactions: [{ selector: 'header strong', mode: 'cover', label: '演示品牌' }],
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  steps: [
    { id: 'welcome', title: '先了解本次要学什么', explain: '我们将认识课程入口，然后查找一门课程，查看学生要完成的课堂任务。所有操作由系统自动完成。',
      narration: { text: '先认识课程工作台。' },
      presentation: { chapter: '从认识工作台开始', holdMs: 2600 }, run: async () => {},
      verify: async ({ page }) => { await expect(page.getByRole('heading', { name: '让课程准备更从容' })).toBeVisible(); } },
    { id: 'courses', title: '课程集中在这里', explain: '我的课程集中显示课程名称、发布状态和任务入口。教师可以从这里继续教学准备。',
      narration: { text: '课程和任务集中显示在这里。' },
      target: ({ page }) => page.getByRole('heading', { name: '我的课程', exact: true }),
      run: async () => {}, verify: async ({ page }) => { await expect(page.getByRole('table', { name: '我的课程' })).toBeVisible(); } },
  ],
});
