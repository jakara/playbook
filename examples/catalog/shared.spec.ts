import { test } from '@playwright/test';
import { runPlaybook } from '@playbook/core';
import flow from './catalog.playbook.js';
import { mountCatalog } from './fixture.js';

test.beforeEach(async ({ page }) => { await mountCatalog(page); });

test('shared Playbook workflow remains a normal Playwright TC', async ({ page }) => {
  await runPlaybook(flow, { page }, {
    aroundStep: (step, execute) => test.step(step.title, execute),
  });
});
