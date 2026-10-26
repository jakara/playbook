import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { hash, metadata, saveStepText } from '../desktop/library.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workspace = await mkdtemp(path.join(os.tmpdir(), 'playbook-text-edit-'));
const evidence = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'playbook-text-edit-evidence'));
await mkdir(evidence, { recursive: true });
const filename = path.join(workspace, 'steps.playbook.ts');
const source = `import { definePlaybook } from '@playbook/core';
export default definePlaybook({ schemaVersion: 1, id: 'editable', title: '测试脚本',
  requirements: { dataMode: 'fixture', effects: 'read-only', replay: 'safe', roles: [] },
  steps: [{ id: 'first', title: '旧标题', explain: '旧说明', target: () => null }],
});`;
let browser;
try {
  await writeFile(filename, source);
  const backupDir = path.join(workspace, 'backups');
  let expectedHash = hash(source);
  let previousSource = source, lastBackup;
  const save = async value => {
    const result = await saveStepText({ workspaceDir: workspace, file: 'steps.playbook.ts', expectedHash,
      flowId: 'editable', stepId: 'first', title: value.title, explain: value.explain, backupDir });
    lastBackup = result.backupPath;
    assert.equal(await readFile(lastBackup, 'utf8'), previousSource);
    previousSource = await readFile(filename, 'utf8');
    expectedHash = result.hash;
    return { title: value.title, explain: value.explain };
  };
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  await page.exposeFunction('__playbookSaveStepText', save);
  await page.setContent('<!doctype html><html><body><p id="target">可见的目标文字</p></body></html>');
  for (const relative of ['node_modules/driver.js/dist/driver.css', 'desktop/presentation/guide.css'])
    await page.addStyleTag({ content: await readFile(path.join(root, relative), 'utf8') });
  for (const relative of ['node_modules/driver.js/dist/driver.js.iife.js', 'desktop/presentation/guide.js'])
    await page.addScriptTag({ content: await readFile(path.join(root, relative), 'utf8') });
  for (const mode of ['element', 'text']) {
    await page.evaluate(mode => window.playbookGuide.highlight(document.querySelector('#target'),
      { title: '旧标题', description: '旧说明', index: 1, total: 1, spotlight: mode }), mode);
    assert.equal(await page.locator('.ygd-edit-button:visible').count(), 0);
    await page.evaluate(() => window.playbookGuide.state({ phase: 'paused' }));
    const edit = page.locator('.ygd-edit-button:visible');
    await edit.click();
    const form = page.locator('.ygd-text-editor form:visible');
    await form.locator('input').fill(`${mode} 标题`);
    await form.locator('textarea').fill(`${mode} 说明\n第二行`);
    const bounds = await page.locator('.ygd-popover:visible').boundingBox();
    assert.ok(bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= 1016 && bounds.y + bounds.height <= 792,
      `${mode} edit form must fit inside the viewport: ${JSON.stringify(bounds)}`);
    await page.screenshot({ path: path.join(evidence, `${mode}-paused-edit.png`) });
    await form.locator('button[type="submit"]').click();
    await page.locator('.driver-popover-title:visible').waitFor();
    assert.equal(await page.locator('.driver-popover-title:visible').textContent(), `${mode} 标题`);
    const saved = metadata(await readFile(filename, 'utf8'), filename).steps[0];
    assert.equal(saved.title, `${mode} 标题`);
    assert.equal(saved.explain, `${mode} 说明\n第二行`);
    await page.evaluate(() => window.playbookGuide.state({ phase: 'playing' }));
    assert.equal(await page.locator('.ygd-edit-button:visible').count(), 0);
  }
  await assert.rejects(() => saveStepText({ workspaceDir: workspace, file: 'steps.playbook.ts', expectedHash: hash(source),
    flowId: 'editable', stepId: 'first', title: '冲突', explain: '不能覆盖', backupDir }), /更新/);
  assert.ok(previousSource.includes('target: () => null'), '业务动作必须保持原样');
  console.log(`text-edit smoke: element and text popup, disk save, stale source guard passed; evidence: ${evidence}`);
} finally {
  await browser?.close();
  await rm(workspace, { recursive: true, force: true });
}
