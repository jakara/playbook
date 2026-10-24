import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

if (process.platform !== 'darwin') throw new Error('macOS icon generation requires sips and iconutil');
const root = fileURLToPath(new URL('../', import.meta.url)), assets = path.join(root, 'assets');
const source = await readFile(path.join(assets, 'playbook-mark.svg'), 'utf8');
const mark = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b8a75"/><stop offset="1" stop-color="#16594e"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#102d27" flood-opacity=".2"/></filter>
</defs>
<rect x="96" y="96" width="832" height="832" rx="186" fill="url(#tile)" filter="url(#shadow)"/>
<rect x="97" y="97" width="830" height="830" rx="185" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="2"/>
<g color="#f4f7ec" transform="translate(164 164) scale(29)">${mark}</g>
</svg>\n`;
await writeFile(path.join(assets, 'playbook-icon.svg'), svg);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  await page.screenshot({ path: path.join(assets, 'playbook-icon.png'), omitBackground: true });
} finally { await browser.close(); }
const temporary = await mkdtemp(path.join(tmpdir(), 'playbook-icon-')), iconset = path.join(temporary, 'Playbook.iconset');
const exec = promisify(execFile);
try {
  await mkdir(iconset);
  await Promise.all([16, 32, 128, 256, 512].flatMap(size => [1, 2].map(async scale => {
    await exec('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(assets, 'playbook-icon.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
  })));
  await exec('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'playbook.icns')]);
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('Generated Playbook SVG, 1024px PNG and macOS ICNS from assets/playbook-mark.svg');
