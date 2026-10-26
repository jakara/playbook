import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.cwd());
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts', `text-spotlight-${Date.now()}`));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const findings = {};
const inspect = () => page.evaluate(() => window.playbookGuide.inspect());
const waitLayout = () => page.waitForTimeout(90);
try {
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><style>
    body { margin: 0; padding: 36px; font: 22px/1.65 system-ui; }
    #wide { width: 1112px; margin: 0; }
    #multi { width: 460px; margin-top: 80px; }
    #summary { width: 1112px; margin-top: 80px; }
    #spacer { height: 1000px; }
    #after { width: 620px; }
  </style><p id="wide">生成服务尚未配置，可继续手工编写；已有内容已保留。</p>
  <p id="multi">候选正文包含多行实际文字。第一行需要聚光，第二行也需要聚光，直到主要正文都得到突出。</p>
  <details open><summary id="summary">评价历史：已完成本轮评价，可展开查看具体记录。</summary><p>实际记录</p></details>
  <div id="spacer"></div><p id="after">滚动后仍应照亮这段真实文字。</p><div style="height:900px"></div></html>`);
  await page.addStyleTag({ content: await readFile(path.join(root, 'node_modules/driver.js/dist/driver.css'), 'utf8') });
  await page.addStyleTag({ content: await readFile(path.join(root, 'desktop/presentation/guide.css'), 'utf8') });
  await page.addScriptTag({ content: await readFile(path.join(root, 'node_modules/driver.js/dist/driver.js.iife.js'), 'utf8') });
  await page.addScriptTag({ content: await readFile(path.join(root, 'desktop/presentation/guide.js'), 'utf8') });
  await page.evaluate(() => window.playbookGuide.configure({ overlayOpacity: .56, spotlightRadius: 105, spotlightFeather: 24 }));
  const show = async (id, mode = 'text') => {
    await page.locator(id).scrollIntoViewIfNeeded();
    await page.evaluate(({ id, mode }) => window.playbookGuide.highlight(document.querySelector(id), {
      title: '阅读真实内容', description: '观察真实文字所在位置', index: 1, total: 1, side: 'bottom', spotlight: mode,
    }), { id, mode });
  };
  await show('#wide', 'element');
  findings.before = await inspect();
  await page.screenshot({ path: path.join(output, '01-before-wide-element.png') });
  await show('#wide');
  findings.wide = await inspect();
  const first = findings.wide.textLines[0];
  assert.equal(findings.wide.textLines.length, 1);
  assert.ok(first.right < 800, 'wide paragraph text must end before the element midpoint');
  assert.ok((first.left + first.right) / 2 < 500);
  assert.ok(findings.wide.textPopover.top >= first.bottom || findings.wide.textPopover.bottom <= first.top);
  await page.screenshot({ path: path.join(output, '02-after-wide-text.png') });
  await show('#multi');
  findings.multi = await inspect();
  assert.ok(findings.multi.textLines.length >= 2, 'all visible text lines must be exposed');
  assert.equal(await page.locator('#ygd-text-holes rect').count(), findings.multi.textLines.length);
  await page.screenshot({ path: path.join(output, '03-multiline.png') });
  await show('#summary');
  findings.summary = await inspect();
  assert.ok(findings.summary.textLines[0].right < 800);
  await page.screenshot({ path: path.join(output, '04-summary.png') });
  await page.locator('#after').scrollIntoViewIfNeeded();
  await page.locator('#after').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await show('#after');
  findings.scrollStart = await inspect();
  await page.evaluate(() => scrollBy(0, -80)); await waitLayout();
  findings.scrolled = await inspect();
  assert.ok(Math.abs(findings.scrolled.textLines[0].top - findings.scrollStart.textLines[0].top) > 50);
  await page.screenshot({ path: path.join(output, '05-scroll.png') });
  await page.setViewportSize({ width: 720, height: 900 }); await waitLayout();
  await page.locator('#after').evaluate(element => element.scrollIntoView({ block: 'center' })); await waitLayout();
  findings.resized = await inspect();
  assert.ok(findings.resized.textLines.length >= 1);
  assert.ok(findings.resized.textLines[0].bottom < 850);
  await page.screenshot({ path: path.join(output, '06-resize.png') });
  await show('#multi');
  await page.locator('#multi').evaluate(element => { element.style.width = '230px'; element.scrollIntoView(); }); await waitLayout();
  findings.reflow = await inspect();
  assert.ok(findings.reflow.textLines.length >= 3);
  await page.screenshot({ path: path.join(output, '07-reflow.png') });
  await page.evaluate(() => { document.body.style.zoom = '125%'; });
  await page.locator('#multi').evaluate(element => element.scrollIntoView({ block: 'center' })); await waitLayout();
  findings.zoomed = await inspect();
  assert.ok(findings.zoomed.textLines.length >= 3);
  assert.ok(findings.zoomed.textLines.every(line => line.top >= 0 && line.bottom <= 900));
  await page.screenshot({ path: path.join(output, '08-zoom.png') });
  await page.locator('#multi').evaluate(element => { element.style.display = 'none'; }); await waitLayout();
  findings.hidden = await inspect();
  assert.equal(findings.hidden.textVisible, false);
  assert.equal(await page.locator('#ygd-text-holes rect').count(), 0);
  await page.locator('#multi').evaluate(element => { element.style.display = ''; });
  await show('#multi');
  await page.locator('#multi').evaluate(element => element.remove()); await waitLayout();
  findings.removed = await inspect();
  assert.equal(findings.removed.textVisible, false);
  assert.equal(await page.locator('#ygd-text-holes rect').count(), 0);
  await page.evaluate(() => window.playbookGuide.detach());
  findings.detached = await inspect();
  assert.equal(findings.detached.textVisible, false);
  await page.evaluate(() => window.playbookGuide.cancel());
  await show('#summary');
  findings.cancelled = await inspect();
  assert.equal(findings.cancelled.textVisible, false, 'late highlights cannot return after stop');
  await writeFile(path.join(output, 'checks.json'), JSON.stringify(findings, null, 2));
  console.log(JSON.stringify({ output, passed: Object.keys(findings) }));
} finally { await browser.close(); }
