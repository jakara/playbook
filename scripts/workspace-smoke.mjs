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
  await app.firstWindow();
  let page;
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    for (const candidate of app.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { page = candidate; break; }
    if (!page) await sleep(50);
  }
  if (!page) throw new Error('项目主窗口未打开');
  await page.waitForFunction(() => Boolean(window.playbook));
  const state = () => page.evaluate(() => window.playbook.getState());
  const data = await state();
  const project = data.workspaces.find(item => item.path === workspace);
  if (!project || project.error || !project.items.length) throw new Error(project?.error || '工作区未就绪');
  const kind = process.argv[4] || 'script';
  const entry = kind === 'book' ? project.books[0] : project.items[0];
  await page.getByLabel('筛选项目', { exact: true }).selectOption(project.id);
  await page.getByRole('button', { name: `查看${kind === 'book' ? ' Book' : '脚本'} ${entry.title}`, exact: true }).click();
  await page.screenshot({ path: path.join(output, 'library.png') });
  await page.getByRole('button', { name: kind === 'book' ? `播放全部 Book ${entry.title}` : '播放脚本', exact: true }).click();
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
