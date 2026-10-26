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
delete manifest.demos;
manifest.books = [{ id: 'teacher-training', title: '教师首次使用培训', summary: '先认识工作台，再完成课程搜索与任务预览。', profile: 'local-sample', sections: [
  { id: 'orientation', title: '认识工作台', scripts: ['starter.overview'] },
  { id: 'courses', title: '课程与任务', scripts: ['starter.catalog'] },
] }];
await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
const output = path.join(root, 'artifacts', `${process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? 'v03-packaged-smoke' : 'v03-desktop-smoke'}-${Date.now()}`); await mkdir(output, { recursive: true });
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
const activityVerification = { source: 'Simulated system idle and pointer signals drive the real native window polling.', shortcut: 'The real Electron globalShortcut registry is checked; no actual system keypress is claimed.' };
const state = () => page.evaluate(() => window.playbook.getState());
async function until(predicate, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const current = await state(); if (predicate(current)) return current; await sleep(80); }
  throw new Error(`Desktop state timeout: ${JSON.stringify((await state()).activeRun)}`);
}
async function call(method, input) { return page.evaluate(({ method, input }) => window.playbook[method](input), { method, input }); }
async function nativeControlPage() {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    for (const candidate of launched.windows()) if (await candidate.title() === 'Playbook 播放控制') return candidate;
    await sleep(100);
  }
  throw new Error('Independent native playback control window was not created');
}
async function setIdle(seconds) { await launched.evaluate((_, value) => { globalThis.__playbookSmokeIdle = value; }, seconds); }
try {
  await launched.firstWindow();
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    for (const candidate of launched.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { page = candidate; break; }
    if (!page) await sleep(50);
  }
  assert.ok(page, 'Main project window must exist'); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: 'Book', exact: true }).waitFor();
  const initial = await state(), workspace = initial.workspaces.find(item => item.path === project);
  assert.ok(workspace && workspace.items.every(item => item.valid));
  assert.equal(workspace.items.length, 2); assert.equal(workspace.books.length, 1);
  assert.equal(workspace.books[0].sections.length, 2); checks.discovery = true;
  const shortcut = initial.playbackControl?.shortcut || initial.playbackShortcut;
  assert.equal(shortcut?.registered, true, shortcut?.error || 'Global play/pause shortcut must register');
  assert.equal(await launched.evaluate(({ globalShortcut }, accelerator) => globalShortcut.isRegistered(accelerator), shortcut.accelerator), true);
  checks.globalShortcutRegistered = true;
  await page.getByLabel('筛选项目').selectOption(workspace.id);
  const search = page.getByRole('textbox', { name: '搜索 Book、Section、脚本、标签或角色' });
  await search.fill('找不到的内容'); await expect(page.getByText('没有匹配的内容', { exact: true })).toBeVisible();
  for (const query of ['任务预览', '课程与任务', '创作要求的查看方式']) {
    await search.fill(query);
    await expect(page.locator('.book-list-card')).toHaveCount(1);
  }
  await expect(page.locator('.section-group')).toHaveCount(0); checks.search = true;
  await search.fill('');
  await expect(page.locator('.book-detail-page')).toHaveCount(0);
  await page.screenshot({ path: path.join(output, '00-book-list.png') }); checks.listFirst = true;
  await page.getByRole('button', { name: '查看 Book 教师首次使用培训', exact: true }).click();
  await expect(page.getByRole('tab', { name: '认识工作台', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '课程与任务', exact: true }).click();
  await expect(page.getByRole('tab', { name: '课程与任务', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '课程与任务', exact: true }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '认识工作台', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '认识工作台', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: '课程与任务', exact: true })).toHaveAttribute('aria-selected', 'true'); checks.sectionTabs = true;
  const detailBounds = await page.locator('.book-detail-page').boundingBox(), contentBounds = await page.locator('.main-shell').boundingBox();
  assert.ok(detailBounds.width / contentBounds.width > .85);
  const sidebarBounds = await page.locator('.sidebar').boundingBox(); assert.ok(sidebarBounds.width <= 200);
  await expect(page.locator('[role=tree] [role=group] [role=group]')).toHaveCount(0);
  await expect(page.locator('.library-split')).toHaveCount(0); checks.folderBookTree = true;
  await page.screenshot({ path: path.join(output, '01-book-tabs.png') });
  await page.getByRole('button', { name: '返回 Book 列表', exact: true }).click();
  await expect(page.locator('.book-detail-page')).toHaveCount(0); checks.returnToList = true;
  await page.getByRole('button', { name: '查看 Book 教师首次使用培训', exact: true }).click();
  await page.getByRole('tab', { name: '课程与任务', exact: true }).click();
  await page.getByRole('button', { name: '查看脚本 查找课程并预览课堂任务', exact: true }).click();
  await page.screenshot({ path: path.join(output, '01-library.png') });
  await page.getByRole('button', { name: '播放脚本', exact: true }).click();
  await until(value => value.activeRun?.state === 'playing');
  await launched.evaluate(({ powerMonitor, screen }) => {
    globalThis.__playbookSmokeOriginalIdle = powerMonitor.getSystemIdleTime;
    globalThis.__playbookSmokeOriginalPointer = screen.getCursorScreenPoint;
    globalThis.__playbookSmokeIdle = 0;
    powerMonitor.getSystemIdleTime = () => globalThis.__playbookSmokeIdle;
    screen.getCursorScreenPoint = () => ({ x: 100, y: 100 });
  });
  await until(value => value.playbackControl?.visible === true);
  const native = await nativeControlPage(); native.on('pageerror', error => errors.push(error.message));
  assert.equal(await native.evaluate(() => typeof window.playbookControl?.getState), 'function');
  assert.equal(await native.evaluate(() => typeof window.playbook), 'undefined');
  await expect(native.locator('#playbook-playback-progress')).toHaveAttribute('role', 'progressbar');
  await native.getByRole('button', { name: '暂停播放', exact: true }).click();
  const paused = await until(value => value.activeRun?.state === 'paused');
  await sleep(350); assert.equal((await state()).activeRun.completed, paused.activeRun.completed); checks.pause = true;
  await native.getByRole('button', { name: '最小化播放栏', exact: true }).click();
  await until(value => value.playbackControl?.collapsed === true);
  const collapsedBounds = await launched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制').getBounds());
  assert.ok(collapsedBounds.width <= 320);
  await launched.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制'); const bounds = win.getBounds(); win.setPosition(Math.max(20, bounds.x - 100), Math.max(40, bounds.y - 150)); });
  await sleep(350);
  const movedBounds = await launched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制').getBounds());
  await sleep(450);
  assert.deepEqual(await launched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制').getBounds()), movedBounds); checks.controlPositionPreserved = true;
  await native.screenshot({ path: path.join(output, '02-minimized-control.png') }); checks.minimizedControl = true;
  await setIdle(10);
  await until(value => value.playbackControl?.visible === false, 8000);
  assert.equal(await launched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制')?.isVisible()), false);
  await setIdle(0);
  await until(value => value.playbackControl?.visible === true, 8000);
  assert.equal(await launched.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Playbook 播放控制')?.isVisible()), true);
  assert.equal((await state()).playbackControl.collapsed, true);
  await native.getByRole('button', { name: '展开播放栏', exact: true }).click();
  await until(value => value.playbackControl?.collapsed === false);
  await native.screenshot({ path: path.join(output, '02-native-playback-control.png') });
  checks.nativeOverlayActivity = true;
  const flowFile = path.join(project, 'flows/catalog.playbook.ts'), originalFlow = await readFile(flowFile, 'utf8');
  await writeFile(flowFile, originalFlow.replace('查找课程并预览课堂任务', '已更新的课程演示').replace('输入课程关键词', '更新后的步骤标题'));
  await until(value => value.activeRun?.sourceChanged === true);
  assert.equal((await state()).activeRun.title, '查找课程并预览课堂任务');
  assert.equal((await state()).activeRun.steps[0].title, '输入课程关键词');
  await expect(page.getByText('更新后的步骤标题', { exact: true })).toHaveCount(0); checks.frozenRevision = true;
  await page.screenshot({ path: path.join(output, '02-paused.png') });
  await native.getByRole('button', { name: '继续播放', exact: true }).click();
  const first = await until(value => ['completed', 'failed'].includes(value.activeRun?.state), 45000);
  assert.equal(first.activeRun.state, 'completed', first.activeRun.error); assert.equal(first.activeRun.completed, 5); checks.play = true;
  const capturePath = path.join(userData, 'evidence', first.activeRun.id);
  const visuals = JSON.parse(await readFile(path.join(capturePath, 'visual-checks.json'), 'utf8'));
  const targets = visuals.filter(item => item.name.startsWith('step-'));
  assert.equal(targets.length, 5);
  assert.ok(targets.every(item => item.arrow && item.popoverVisible && item.x === item.apertureX && item.y === item.apertureY));
  assert.ok(targets.some(item => item.rootParent === 'DIALOG')); checks.guideLayers = true;
  assert.ok(visuals.every(item => item.toolbarPresent === false), 'The controlled browser must not contain the playback toolbar');
  checks.noInjectedPlaybackControls = true;
  await cp(capturePath, path.join(output, 'guide'), { recursive: true });
  await page.screenshot({ path: path.join(output, '03-complete.png') });
  await until(value => value.playbackControl?.visible === false); checks.terminalControlHidden = true;
  await writeFile(flowFile, originalFlow);
  await until(value => value.workspaces.find(item => item.id === workspace.id).items.some(item => item.title === '查找课程并预览课堂任务'));
  await page.getByRole('button', { name: '从头再播', exact: true }).click();
  await until(value => value.activeRun?.id !== first.activeRun.id && value.activeRun?.state === 'playing');
  await until(value => value.playbackControl?.visible === true);
  await native.getByRole('button', { name: '停止播放', exact: true }).click();
  await until(value => value.activeRun?.state === 'stopped'); checks.stopReplay = true;
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '查看 Book 教师首次使用培训', exact: true }).click();
  await page.getByRole('tab', { name: '课程与任务', exact: true }).click();
  await page.getByRole('button', { name: '播放整个 Section 课程与任务', exact: true }).click();
  const section = await until(value => ['completed', 'failed'].includes(value.activeRun?.state) && value.activeRun?.kind === 'section', 45000);
  assert.equal(section.activeRun.state, 'completed', section.activeRun.error); assert.equal(section.activeRun.completed, 5);
  assert.deepEqual(section.activeRun.flowIds, ['starter.catalog']);
  const sectionVisuals = JSON.parse(await readFile(path.join(userData, 'evidence', section.activeRun.id, 'visual-checks.json'), 'utf8'));
  assert.deepEqual(sectionVisuals.filter(item => item.name.startsWith('opening-')).map(item => item.name), ['opening-starter.catalog']); checks.sectionPlayback = true;
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '播放整个 Book 教师首次使用培训', exact: true }).click();
  const book = await until(value => ['completed', 'failed'].includes(value.activeRun?.state) && value.activeRun?.kind === 'book', 45000);
  assert.equal(book.activeRun.state, 'completed', book.activeRun.error); assert.equal(book.activeRun.completed, 7);
  assert.deepEqual(book.activeRun.flowIds, ['starter.overview', 'starter.catalog']);
  const bookEvidence = path.join(userData, 'evidence', book.activeRun.id);
  const bookVisuals = JSON.parse(await readFile(path.join(bookEvidence, 'visual-checks.json'), 'utf8'));
  assert.deepEqual(bookVisuals.filter(item => item.name.startsWith('opening-')).map(item => item.name), ['opening-starter.overview', 'opening-starter.catalog']);
  await cp(bookEvidence, path.join(output, 'book'), { recursive: true }); checks.bookPlaybackOrder = true;
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
  await expect(page.getByLabel('项目文件夹', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '安装 Skill', exact: true })).toBeDisabled();
  await assert.rejects(call('skillPreview', { framework: 'codex', scope: 'project', projectRoot: project }), /请先选择/);
  const installProject = path.join(temp, '业务项目 with spaces');
  await mkdir(installProject);
  assert.ok(!(await state()).workspaces.some(item => item.path === installProject));
  async function chooseProject(directory) {
    await launched.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async (_owner, options) => {
        globalThis.__playbookSkillDialogOptions = options;
        return directory ? { canceled: false, filePaths: [directory] } : { canceled: true, filePaths: [] };
      };
    }, directory);
    await page.getByRole('button', { name: /^(选择文件夹|更换文件夹)$/ }).click();
    assert.deepEqual(await launched.evaluate(() => globalThis.__playbookSkillDialogOptions.properties), ['openDirectory']);
  }
  await chooseProject(null);
  await expect(page.getByLabel('项目文件夹', { exact: true })).toHaveValue('');
  await chooseProject(installProject);
  const codexTarget = path.join(installProject, '.agents/skills/playbook-wright');
  await expect(page.getByLabel('项目文件夹', { exact: true })).toHaveValue(installProject);
  await expect(page.locator('.target-path').first()).toHaveText(codexTarget);
  await expect(page.getByRole('button', { name: '安装 Skill', exact: true })).toBeEnabled();
  assert.deepEqual(await readdir(installProject), []); checks.skillProjectPreviewReadOnly = true;
  await chooseProject(null);
  await expect(page.getByLabel('项目文件夹', { exact: true })).toHaveValue(installProject);
  await expect(page.locator('.target-path').first()).toHaveText(codexTarget); checks.skillProjectCancel = true;
  await page.screenshot({ path: path.join(output, '04-project-folder-preview.png') });
  await page.getByLabel('使用的框架', { exact: true }).selectOption('claude-code');
  await expect(page.locator('.target-path').first()).toHaveText(path.join(installProject, '.claude/skills/playbook-wright'));
  await page.getByLabel('使用的框架', { exact: true }).selectOption('codex');
  await expect(page.locator('.target-path').first()).toHaveText(codexTarget); checks.skillFrameworkTargets = true;
  await page.getByRole('button', { name: '安装 Skill', exact: true }).click();
  await expect(page.getByRole('button', { name: '已安装当前版本', exact: true })).toBeVisible();
  const installed = path.join(codexTarget, 'SKILL.md');
  const installedText = await readFile(installed, 'utf8');
  const bundledSkills = process.env.PLAYBOOK_PACKAGED_EXECUTABLE
    ? path.resolve(path.dirname(process.env.PLAYBOOK_PACKAGED_EXECUTABLE), '../Resources/app/skills')
    : path.join(root, 'skills');
  assert.equal(installedText, await readFile(path.join(bundledSkills, 'playbook-wright/SKILL.md'), 'utf8')); checks.skillInstall = true;
  const compatibility = path.join(installProject, '.agents/skills/playbook-playwright/SKILL.md');
  assert.equal(await readFile(compatibility, 'utf8'), await readFile(path.join(bundledSkills, 'playbook-playwright/SKILL.md'), 'utf8'));
  await expect(page.getByText(/兼容入口 \$playbook-playwright/)).toBeVisible(); checks.skillCompatibilityEntry = true;
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
  const otherProject = path.join(temp, '另一个项目'); await mkdir(otherProject);
  await chooseProject(otherProject);
  await expect(page.getByLabel('项目文件夹', { exact: true })).toHaveValue(otherProject);
  await expect(page.locator('.target-path').first()).toHaveText(path.join(otherProject, '.agents/skills/playbook-wright'));
  await expect(page.getByText('文件已安装，智能体加载状态待验证', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '安装 Skill', exact: true })).toBeEnabled();
  assert.deepEqual(await readdir(otherProject), []);
  await chooseProject(installProject);
  await expect(page.getByRole('button', { name: '已安装当前版本', exact: true })).toBeDisabled();
  assert.deepEqual(await files(project), before);
  assert.ok(!(await state()).workspaces.some(item => item.path === installProject)); checks.skillIndependentProjectFolder = true;
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), executable: process.env.PLAYBOOK_PACKAGED_EXECUTABLE ? 'packaged-app' : 'development-electron', checks, activityVerification, pageErrors: errors, userData, report: 'Synthetic workspace only; no real agent directory or business service changed.' }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks, evidence: output }));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.message, checks, state: page ? await state().catch(() => null) : null }, null, 2));
  throw error;
} finally {
  await launched.evaluate(({ powerMonitor, screen }) => {
    if (globalThis.__playbookSmokeOriginalIdle) powerMonitor.getSystemIdleTime = globalThis.__playbookSmokeOriginalIdle;
    if (globalThis.__playbookSmokeOriginalPointer) screen.getCursorScreenPoint = globalThis.__playbookSmokeOriginalPointer;
  }).catch(() => {});
  await launched.close();
}
