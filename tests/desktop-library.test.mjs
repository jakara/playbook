import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, cp } from 'node:fs/promises';
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

async function hierarchyWorkspace(change = () => {}) {
  const appRoot = fileURLToPath(new URL('../', import.meta.url));
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-hierarchy-'));
  await cp(path.join(appRoot, 'examples/starter'), root, { recursive: true });
  const filename = path.join(root, '.playbook.json');
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  delete manifest.demos;
  manifest.books = [{ id: 'training', title: '教师培训', profile: 'local-sample', sections: [
    { id: 'orientation', title: '认识工作台', scripts: ['starter.overview'] },
    { id: 'courses', title: '课程与任务', scripts: ['starter.catalog'] },
  ] }];
  change(manifest);
  await writeFile(filename, JSON.stringify(manifest, null, 2));
  return { workspace: await readWorkspace(root), filename, manifest };
}

test('Book and Section selection retain manifest order and inherited profile', async () => {
  const { workspace } = await hierarchyWorkspace(manifest => {
    manifest.profiles.push({ ...manifest.profiles[0], id: 'training-environment' });
    manifest.books[0].profile = 'training-environment';
    // The script declaration order is deliberately different from execution order.
    manifest.books[0].sections.reverse();
  });
  assert.equal(workspace.error, undefined);
  assert.equal(workspace.books.length, 1);
  const book = workspace.books[0];
  assert.equal(book.defaultProfileId, 'training-environment');
  assert.deepEqual(book.sections.map(section => section.key), ['training/courses', 'training/orientation']);
  assert.ok(book.sections.every(section => section.defaultProfileId === 'training-environment'));
  const whole = selection(workspace, 'training', 'book');
  assert.deepEqual(whole.items.map(item => item.id), ['starter.catalog', 'starter.overview']);
  assert.equal(whole.title, '教师培训');
  assert.equal(whole.profile.id, 'training-environment');
  assert.equal(whole.items.reduce((total, item) => total + item.steps.length, 0), 7);
  const chapter = selection(workspace, 'training/courses', 'section');
  assert.deepEqual(chapter.items.map(item => item.id), ['starter.catalog']);
  assert.equal(chapter.items.reduce((total, item) => total + item.steps.length, 0), 5);
  assert.equal(chapter.profile.id, 'training-environment');
});

test('Section playback retains the script order inside its own section', async () => {
  const { workspace } = await hierarchyWorkspace(manifest => {
    manifest.books[0].sections = [{ id: 'combined', title: '完整流程', scripts: ['starter.catalog', 'starter.overview'] }];
  });
  assert.equal(workspace.error, undefined);
  assert.deepEqual(selection(workspace, 'training/combined', 'section').items.map(item => item.id), ['starter.catalog', 'starter.overview']);
});

test('unknown containers are rejected instead of falling back to a same-named script', async () => {
  const { workspace } = await hierarchyWorkspace();
  for (const [id, kind] of [['missing', 'book'], ['training/missing', 'section'], ['starter.catalog', 'book'], ['starter.catalog', 'section'], ['starter.catalog', 'unknown']]) {
    assert.throws(() => selection(workspace, id, kind), undefined, `${kind}:${id} must not select a script`);
  }
});

test('invalid hierarchy references and duplicate identities cannot be played', async t => {
  const cases = [
    ['duplicate book', manifest => manifest.books.push(structuredClone(manifest.books[0]))],
    ['duplicate section', manifest => manifest.books[0].sections.push(structuredClone(manifest.books[0].sections[0]))],
    ['duplicate script in section', manifest => manifest.books[0].sections[0].scripts.push('starter.overview')],
    ['missing script', manifest => manifest.books[0].sections[0].scripts.push('missing-script')],
    ['missing profile', manifest => { manifest.books[0].profile = 'missing-profile'; }],
    ['empty book', manifest => { manifest.books[0].sections = []; }],
    ['empty section', manifest => { manifest.books[0].sections[0].scripts = []; }],
  ];
  for (const [name, change] of cases) await t.test(name, async () => {
    const { workspace } = await hierarchyWorkspace(change);
    assert.ok(workspace.error, `${name} must invalidate the project`);
    assert.throws(() => selection(workspace, 'training', 'book'));
  });
});

test('legacy demos normalize to a Book and a Section without losing playback order', async () => {
  const { workspace } = await hierarchyWorkspace(manifest => {
    delete manifest.books;
    manifest.demos = [{ id: 'legacy-training', title: '旧版培训', profile: 'local-sample', scripts: ['starter.overview', 'starter.catalog'] }];
  });
  assert.equal(workspace.error, undefined);
  assert.equal(workspace.books.length, 1);
  const book = workspace.books[0];
  assert.equal(book.id, 'legacy-training');
  assert.equal(book.sections.length, 1);
  assert.deepEqual(book.sections[0].scripts, ['starter.overview', 'starter.catalog']);
  assert.deepEqual(selection(workspace, book.id, 'book').items.map(item => item.id), ['starter.overview', 'starter.catalog']);
  assert.deepEqual(selection(workspace, book.sections[0].key, 'section').items.map(item => item.id), ['starter.overview', 'starter.catalog']);
});
