import { _electron as electron } from 'playwright/test';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Runs a trusted local workspace with a fresh app session. Never captures login.
const workspace = await realpath(process.argv[2]);
const output = path.resolve(process.argv[3] || 'artifacts/workspace-smoke');
const userData = await mkdtemp(path.join(tmpdir(), 'playbook-workspace-'));
await mkdir(output, { recursive: true });
const app = await electron.launch({
  ...(process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? { executablePath: process.env.PLAYBOOK_PACKAGED_EXECUTABLE, args: [] } : { args: ['.'] }),
  env: { ...process.env, PLAYBOOK_USER_DATA: userData, PLAYBOOK_WORKSPACE: workspace, PLAYBOOK_TEST_PACE: process.env.PLAYBOOK_TEST_PACE || '1', PLAYBOOK_TEST_CAPTURE: '1' },
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.playbook));
  const state = () => page.evaluate(() => window.playbook.getState());
  const data = await state();
  const project = data.workspaces.find(item => item.path === workspace);
  if (!project || project.error || !project.items.length) throw new Error(project?.error || '工作区未就绪');
  await page.getByLabel('筛选项目', { exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: `查看脚本 ${project.items[0].title}`, exact: true }).click();
  await page.screenshot({ path: path.join(output, 'library.png') });
  await page.getByRole('button', { name: '播放脚本', exact: true }).click();
  let result;
  for (let attempt = 0; attempt < 480; attempt++) {
    result = (await state()).activeRun;
    if (['completed', 'failed', 'stopped'].includes(result?.state)) break;
    await sleep(500);
  }
  await page.screenshot({ path: path.join(output, 'result.png') });
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), userData, workspace, result }, null, 2));
  console.log(JSON.stringify({ state: result?.state, steps: result?.completed, total: result?.total, error: result?.error, evidence: path.join(userData, 'evidence', result?.id || '') }));
  if (result?.state !== 'completed') process.exitCode = 1;
} finally { await app.close(); }
