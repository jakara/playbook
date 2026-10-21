import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { metadata, inside, readWorkspace, selection, snapshot } from '../desktop/library.mjs';

test('metadata browsing never executes top-level business code', () => {
  const source = `throw new Error('must never execute'); export default definePlaybook({schemaVersion:1,id:'flow',title:'A',requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},steps:[{id:'one',title:'One',explain:'Explain',run:()=>{},verify:()=>{}}]});`;
  assert.equal(metadata(source, 'sample.ts').title, 'A');
  assert.throws(() => metadata('export default getDynamicFlow()', 'dynamic.ts'), /静态/);
});

test('workspace rejects escaping symlinks and preserves business files', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'playbook-library-'));
  const root = path.join(parent, 'project'); await mkdir(root);
  const secret = path.join(parent, 'outside.txt'); await writeFile(secret, 'outside');
  await symlink(secret, path.join(root, 'link.txt'));
  await assert.rejects(inside(root, 'link.txt'), /越出/);
  await writeFile(path.join(root, '.playbook.json'), JSON.stringify({ schemaVersion: 1, profiles: [], scripts: [] }));
  const before = await readFile(path.join(root, '.playbook.json'), 'utf8');
  assert.equal((await readWorkspace(root)).items.length, 0);
  assert.equal(await readFile(path.join(root, '.playbook.json'), 'utf8'), before);
});

test('workspace snapshot imports native Playwright assertions from an external directory', async () => {
  const appRoot = fileURLToPath(new URL('../', import.meta.url));
  const workspace = await readWorkspace(path.join(appRoot, 'examples/starter'));
  const outputDir = await mkdtemp(path.join(tmpdir(), 'playbook-snapshot-'));
  const built = await snapshot({ workspace, ...selection(workspace, 'starter.catalog', 'script'), outputDir, appRoot });
  const loaded = await import(pathToFileURL(built.bundle).href);
  assert.equal(loaded.flows[0].steps.length, 5);
  assert.equal(typeof loaded.flows[0].steps[0].verify, 'function');
  assert.equal(typeof loaded.profile.prepare, 'function');
});
