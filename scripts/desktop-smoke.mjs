import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd();
const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'playbook-desktop-')));
const project = path.join(temp, 'project'), userData = path.join(temp, 'app-data');
await cp(path.join(root, 'examples/starter'), project, { recursive: true });
const manifestFile = path.join(project, '.playbook.json');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8')); manifest.title = '验收工作区';
await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
const output = path.join(root, 'artifacts', process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? 'packaged-smoke' : 'desktop-smoke'); await mkdir(output, { recursive: true });
await mkdir(userData, { recursive: true });
// The single-run record must survive beyond the UI's recent 100 rows.
await writeFile(path.join(userData, 'runs.json'), JSON.stringify([
  ...Array.from({ length: 100 }, (_, i) => ({ id: `older-${i}`, state: 'completed', flowIds: [] })),
  { id: 'consumed', workspaceId: createHash('sha256').update(project).digest('hex').slice(0, 16), profileId: 'local-sample', executing: true, state: 'completed', flowIds: ['starter.catalog'] },
]));
async function files(directory, prefix = '') {
  const result = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) Object.assign(result, await files(path.join(directory, item.name), relative));
    else result[relative] = createHash('sha256').update(await readFile(path.join(directory, item.name))).digest('hex');
  }
  return result;
}
const before = await files(project);
const env = { ...process.env, PLAYBOOK_USER_DATA: userData, PLAYBOOK_WORKSPACE: project, PLAYBOOK_TEST_PACE: '.12', PLAYBOOK_TEST_HEADLESS: '1', PLAYBOOK_TEST_CAPTURE: '1' };
if (process.env.PLAYBOOK_PACKAGED_EXECUTABLE) env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
delete env.ELECTRON_RUN_AS_NODE;
const launched = await electron.launch({ ...(process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? { executablePath: process.env.PLAYBOOK_PACKAGED_EXECUTABLE, args: [] } : { args: [root] }), env, timeout: 25000 });
let page;
const errors = [], checks = {};
const state = () => page.evaluate(() => window.playbook.getState());
async function until(predicate, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const current = await state(); if (predicate(current)) return current; await sleep(80); }
  throw new Error(`Desktop state timeout: ${JSON.stringify((await state()).activeRun)}`);
}
async function call(method, input) { return page.evaluate(({ method, input }) => window.playbook[method](input), { method, input }); }
try {
  page = await launched.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '资料库', exact: true }).waitFor();
  const initial = await state(), workspace = initial.workspaces.find(item => item.path === project);
  assert.ok(workspace && workspace.items.every(item => item.valid));
  assert.equal(workspace.items.length, 2); assert.equal(workspace.demos.length, 1); checks.discovery = true;
  await page.getByLabel('筛选项目').selectOption(workspace.id);
  const search = page.getByRole('textbox', { name: '搜索脚本、演示、标签或角色' });
  await search.fill('找不到的内容'); await expect(page.getByText('没有匹配的内容', { exact: true })).toBeVisible();
  await search.fill('任务预览'); await expect(page.locator('.entry-card')).toHaveCount(2); checks.search = true;
  await search.fill('');
  await page.getByRole('button', { name: '查看脚本 查找课程并预览课堂任务', exact: true }).click();
  await page.screenshot({ path: path.join(output, '01-library.png') });
  await page.getByRole('button', { name: '播放脚本', exact: true }).click();
  await until(value => value.activeRun?.state === 'playing');
  await page.getByRole('button', { name: '暂停播放', exact: true }).click();
  const paused = await until(value => value.activeRun?.state === 'paused');
  await sleep(350); assert.equal((await state()).activeRun.completed, paused.activeRun.completed); checks.pause = true;
  const flowFile = path.join(project, 'flows/catalog.playbook.ts'), originalFlow = await readFile(flowFile, 'utf8');
  await writeFile(flowFile, originalFlow.replace('查找课程并预览课堂任务', '已更新的课程演示').replace('输入课程关键词', '更新后的步骤标题'));
  await until(value => value.activeRun?.sourceChanged === true);
  assert.equal((await state()).activeRun.title, '查找课程并预览课堂任务');
  assert.equal((await state()).activeRun.steps[0].title, '输入课程关键词');
  await expect(page.getByText('更新后的步骤标题', { exact: true })).toHaveCount(0); checks.frozenRevision = true;
  await page.screenshot({ path: path.join(output, '02-paused.png') });
  await page.getByRole('button', { name: '继续播放', exact: true }).click();
  const first = await until(value => ['completed', 'failed'].includes(value.activeRun?.state), 45000);
  assert.equal(first.activeRun.state, 'completed', first.activeRun.error); assert.equal(first.activeRun.completed, 5); checks.play = true;
  const capturePath = path.join(userData, 'evidence', first.activeRun.id);
  const visuals = JSON.parse(await readFile(path.join(capturePath, 'visual-checks.json'), 'utf8'));
  const targets = visuals.filter(item => item.name.startsWith('step-'));
  assert.equal(targets.length, 5);
  assert.ok(targets.every(item => item.arrow && item.popoverVisible && item.x === item.apertureX && item.y === item.apertureY));
  assert.ok(targets.some(item => item.rootParent === 'DIALOG')); checks.guideLayers = true;
  await cp(capturePath, path.join(output, 'guide'), { recursive: true });
  await page.screenshot({ path: path.join(output, '03-complete.png') });
  await writeFile(flowFile, originalFlow);
  await until(value => value.workspaces.find(item => item.id === workspace.id).items.some(item => item.title === '查找课程并预览课堂任务'));
  await page.getByRole('button', { name: '从头再播', exact: true }).click();
  await until(value => value.activeRun?.id !== first.activeRun.id && value.activeRun?.state === 'playing');
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await until(value => value.activeRun?.state === 'stopped'); checks.stopReplay = true;
  await call('play', { workspaceId: workspace.id, entryId: 'teacher-training', kind: 'demo', profileId: 'local-sample' });
  const demo = await until(value => ['completed', 'failed'].includes(value.activeRun?.state), 45000);
  assert.equal(demo.activeRun.state, 'completed', demo.activeRun.error); assert.equal(demo.activeRun.completed, 7); checks.composition = true;
  const broken = structuredClone(manifest); broken.profiles[0].parameters.brokenExpectation = true;
  await writeFile(manifestFile, JSON.stringify(broken)); await sleep(1600);
  await call('play', { workspaceId: workspace.id, entryId: 'starter.catalog', kind: 'script', profileId: 'local-sample' });
  const failure = await until(value => value.activeRun?.state === 'failed', 30000);
  assert.equal(failure.activeRun.completed, 2); assert.equal(failure.activeRun.stepId, 'preview'); checks.assertionFailure = true;
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2)); await sleep(1600);
  await writeFile(flowFile, originalFlow.replace("replay: 'safe'", "replay: 'single-run'")); await sleep(1600);
  await assert.rejects(call('play', { workspaceId: workspace.id, entryId: 'starter.catalog', kind: 'script', profileId: 'local-sample' }), /未声明可重播/);
  await writeFile(flowFile, originalFlow); await sleep(1600); checks.singleRunRetention = true;
  // Browsing and playback must not modify any original business asset.
  assert.deepEqual(await files(project), before); checks.readOnly = true;
  await page.getByRole('button', { name: 'Skill 安装', exact: true }).click();
  await page.getByRole('radio', { name: /指定项目/ }).check();
  await page.getByLabel('工作项目', { exact: true }).selectOption(workspace.id);
  await page.getByRole('button', { name: '安装 Skill', exact: true }).click();
  await expect(page.getByRole('button', { name: '已安装当前版本', exact: true })).toBeVisible();
  const installed = path.join(project, '.agents/skills/playbook-playwright/SKILL.md');
  const installedText = await readFile(installed, 'utf8');
  assert.equal(installedText, await readFile(path.join(root, 'skills/playbook-playwright/SKILL.md'), 'utf8')); checks.skillInstall = true;
  await writeFile(installed, installedText + '\n本地自定义内容\n');
  await page.getByRole('button', { name: '重新查看目标', exact: true }).click();
  await expect(page.getByRole('button', { name: '备份并替换 Skill', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /先备份再替换已有内容/ }).check();
  await page.getByRole('button', { name: '备份并替换 Skill', exact: true }).click();
  await expect(page.getByRole('button', { name: '已安装当前版本', exact: true })).toBeVisible();
  assert.equal(await readFile(installed, 'utf8'), installedText);
  const backupNames = await readdir(path.join(userData, 'backups/skills'));
  const backup = await readFile(path.join(userData, 'backups/skills', backupNames[0], 'original/SKILL.md'), 'utf8');
  assert.ok(backup.includes('本地自定义内容')); checks.modifiedSkillBackup = true;
  await page.screenshot({ path: path.join(output, '04-skill-install.png') });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), executable: process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? 'packaged-app' : 'development-electron', checks, pageErrors: errors, userData, report: 'Synthetic workspace only; no real agent directory or business service changed.' }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks, evidence: output }));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.message, checks, state: page ? await state().catch(() => null) : null }, null, 2));
  throw error;
} finally { await launched.close(); }
