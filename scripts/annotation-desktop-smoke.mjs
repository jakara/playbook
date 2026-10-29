import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.cwd(), output = await mkdtemp('/private/tmp/playbook-annotation-desktop-');
const evidence = path.join(root, 'artifacts', `annotation-desktop-${Date.now()}`); await mkdir(evidence, { recursive: true });
const project = path.join(output, 'project'), data = path.join(output, 'data');
await mkdir(project); await mkdir(data);
await writeFile(path.join(project, '.playbook.json'), JSON.stringify({ schemaVersion: 1, title: '批注桌面样本',
  profiles: [{ id: 'local', title: '本地样本', file: 'local.profile.ts', dataMode: 'fixture', parameters: {} }],
  scripts: [{ file: 'annotation.playbook.ts', profile: 'local' }],
  books: [{ id: 'annotation-book', title: '批注样本', sections: [{ id: 'one', title: '样本', scripts: ['annotation-flow'] }] }],
}));
await writeFile(path.join(project, 'local.profile.ts'), `
import {defineProfile} from '@playbook/core';
import {appendFile} from 'node:fs/promises';import path from 'node:path';
export default defineProfile({schemaVersion:1,id:'local',title:'本地样本',roles:[],dataMode:'fixture',
async prepare({page,workspaceDir}){
  await page.route('http://annotation.fixture/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="zh"><head><meta charset="utf-8"><title>课程发布</title></head><body style="font:20px system-ui;padding:70px"><main><h1>课程管理</h1><button id="publish" onclick="window.businessClicks=(window.businessClicks||0)+1" style="padding:18px 30px">发布课程</button></main></body></html>'}));
  await page.goto('http://annotation.fixture/');
  return {context:{page},release:async()=>appendFile(path.join(workspaceDir,'events.jsonl'),'release\\n')};
}});`);
await writeFile(path.join(project, 'annotation.playbook.ts'), `
import {definePlaybook} from '@playbook/core';
export default definePlaybook({schemaVersion:1,id:'annotation-flow',title:'批注样本',summary:'本地页面',playback:{browser:'embedded'},
requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},presentation:{openingMs:0,cursorMoveMs:150},
steps:[{id:'inspect',title:'查看发布按钮',explain:'查看当前按钮',presentation:{holdMs:60000},target:({page})=>page.locator('#publish'),
async run(){},async verify(){} }]});`);
const env = { ...process.env, PLAYBOOK_USER_DATA: data, PLAYBOOK_WORKSPACE: project, PLAYBOOK_TEST_PACE: '.5' };
delete env.ELECTRON_RUN_AS_NODE;
let app; const result = { output, evidence };
try {
  app = await electron.launch({ args: [root], env, timeout: 25000 });
  let main;
  for (let i = 0; i < 100 && !main; i++) { for (const candidate of app.windows()) if (await candidate.evaluate(() => Boolean(window.playbook)).catch(() => false)) { main = candidate; break; } if (!main) await sleep(100); }
  assert.ok(main);
  const state = () => main.evaluate(() => window.playbook.getState());
  const until = async predicate => {
    const deadline = Date.now() + 20000; let value;
    while (Date.now() < deadline) { value = await state(); if (predicate(value)) return value; await sleep(60); }
    result.failureState = value?.activeRun;
    throw new Error(`等待批注状态超时：${JSON.stringify({ state: value?.activeRun?.state, annotationMode: value?.annotationMode, annotations: value?.activeRun?.annotations?.length })}`);
  };
  const workspace = (await state()).workspaces.find(item => item.path === project); assert.ok(workspace);
  await main.evaluate(input => window.playbook.play(input), { workspaceId: workspace.id, entryId: 'annotation-flow', kind: 'script', profileId: 'local', browser: 'embedded' });
  await until(value => value.activeRun?.stepId === 'inspect' && value.activeRun.state === 'playing');
  await assert.rejects(main.evaluate(() => window.playbook.annotate()), /请先暂停/);
  await main.evaluate(() => window.playbook.control('pause'));
  await until(value => value.activeRun?.state === 'paused');
  const business = app.windows().find(item => item.url() === 'http://annotation.fixture/'); assert.ok(business);
  await main.evaluate(() => window.playbook.annotate());
  await until(value => value.annotationMode);
  await business.waitForFunction(() => window.playbookAnnotations?.inspect().picking);
  const button = await business.locator('#publish').boundingBox();
  await business.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await business.screenshot({ path: path.join(evidence, '01-select-element.png') });
  await business.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  assert.equal(await business.evaluate(() => window.businessClicks || 0), 0);
  assert.equal((await business.evaluate(() => window.playbookAnnotations.inspect())).formVisible, true);
  await business.screenshot({ path: path.join(evidence, '02-write-annotation.png') });
  await business.keyboard.type('发布前应显示课程名称与确认操作。');
  const saveButton = (await business.evaluate(() => window.playbookAnnotations.inspect())).saveRect;
  await business.mouse.click(saveButton.x + saveButton.width / 2, saveButton.y + saveButton.height / 2);
  await sleep(300); result.afterSubmit = { state: (await state()).activeRun, annotationUI: await business.evaluate(() => window.playbookAnnotations.inspect()) };
  const saved = await until(value => value.activeRun?.annotations?.length === 1);
  const annotation = saved.activeRun.annotations[0];
  assert.equal(annotation.schema, 'playbook.annotation.v1');
  assert.equal(annotation.element.selector, '#publish');
  assert.equal(annotation.playbook.stepId, 'inspect');
  assert.equal(annotation.page.title, '课程发布');
  await business.waitForFunction(() => window.playbookAnnotations.inspect().pins[0]?.rect.x > 20);
  await business.screenshot({ path: path.join(evidence, '03-annotation-pin.png') });
  const pin = (await business.evaluate(() => window.playbookAnnotations.inspect())).pins[0].rect;
  await business.mouse.click(pin.x + pin.width / 2, pin.y + pin.height / 2);
  const open = await business.evaluate(() => window.playbookAnnotations.inspect()); assert.equal(open.detailVisible, true);
  await business.screenshot({ path: path.join(evidence, '04-open-annotation.png') });
  await business.mouse.click(open.copyRect.x + open.copyRect.width / 2, open.copyRect.y + open.copyRect.height / 2);
  await business.waitForFunction(() => window.playbookAnnotations.inspect().copyStatus.includes('已复制'));
  const iconCopy = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.match(iconCopy, /playbook.annotation.v1/);
  await main.evaluate(value => window.playbook.copyAnnotation(value), { runId: saved.activeRun.id, annotationId: annotation.id });
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.match(copied, /playbook.annotation.v1/); assert.match(copied, /发布前应显示课程名称/); assert.match(copied, /#publish/);
  const detail = await business.evaluate(() => window.playbookAnnotations.inspect());
  await business.mouse.click(detail.deleteRect.x + detail.deleteRect.width / 2, detail.deleteRect.y + detail.deleteRect.height / 2);
  await until(value => value.activeRun?.annotations?.length === 0);
  await business.waitForFunction(() => window.playbookAnnotations.inspect().pinCount === 0 && !window.playbookAnnotations.inspect().detailVisible);
  await assert.rejects(main.evaluate(value => window.playbook.copyAnnotation(value), { runId: saved.activeRun.id, annotationId: annotation.id }), /批注不存在/);
  await business.screenshot({ path: path.join(evidence, '05-deleted-pin.png') });
  await main.evaluate(() => window.playbook.annotate());
  await business.waitForFunction(() => window.playbookAnnotations.inspect().picking);
  await business.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  const secondForm = await business.evaluate(() => window.playbookAnnotations.inspect());
  assert.equal(secondForm.formVisible, true);
  assert.equal(secondForm.saveDisabled, false, '再次添加批注必须重新启用保存按钮');
  await business.keyboard.type('这条批注从运行记录删除。');
  const secondSave = (await business.evaluate(() => window.playbookAnnotations.inspect())).saveRect;
  await business.mouse.click(secondSave.x + secondSave.width / 2, secondSave.y + secondSave.height / 2);
  await until(value => value.activeRun?.annotations?.length === 1);
  await main.evaluate(() => window.playbook.control('resume'));
  await until(value => value.activeRun?.state === 'playing' && !value.annotationMode);
  await assert.rejects(main.evaluate(() => window.playbook.annotate()), /请先暂停/);
  await main.evaluate(() => window.playbook.control('stop'));
  const stopped = await until(value => ['stopped', 'failed'].includes(value.activeRun?.state));
  assert.equal(stopped.activeRun.state, 'stopped'); assert.equal(stopped.activeRun.cleanup.status, 'succeeded');
  assert.equal(stopped.activeRun.annotations?.length, 1);
  assert.equal((await readFile(path.join(project, 'events.jsonl'), 'utf8')).trim(), 'release');
  await main.evaluate(() => window.playbook.showEmbedded(false));
  await main.getByRole('button', { name: '运行记录', exact: true }).click();
  await main.getByRole('button', { name: '删除批注：这条批注从运行记录删除。' }).click();
  await until(value => value.runs.find(run => run.id === saved.activeRun.id)?.annotations?.length === 0);
  await main.screenshot({ path: path.join(evidence, '06-history-deleted.png') });
  await app.close(); app = null;
  const persisted = JSON.parse(await readFile(path.join(data, 'runs.json'), 'utf8'));
  assert.equal(persisted.find(run => run.id === saved.activeRun.id).annotations.length, 0);
  result.passed = true; result.runId = saved.activeRun.id; result.annotation = annotation; result.copiedPrompt = copied;
} catch (error) { result.passed = false; result.error = error.stack; process.exitCode = 1; }
finally { await app?.close().catch(() => {}); await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: result.passed, output, evidence, error: result.error })); }
