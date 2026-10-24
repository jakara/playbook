import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { metadata, inside, readWorkspace, selection, snapshot, removeBookFromManifest, hash } from '../desktop/library.mjs';

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

test('static metadata retains narration, redactions and flow presentation without evaluating callbacks', () => {
  const source = `throw new Error('do not execute'); export default definePlaybook({schemaVersion:1,id:'flow',title:'A',
    presentation:{spotlightFeather:24}, redactions:[{selector:'.logo',mode:'cover',label:'隐藏'}],
    narration:{enabled:true,voice:'Tingting',rate:180,opening:{audio:'audio/opening.mp3'}},
    requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},
    steps:[{id:'one',title:'One',explain:'Explain',narration:{text:'步骤讲解'},run:()=>{throw new Error('do not execute')},verify:()=>{}}]});`;
  const result = metadata(source, 'sample.ts');
  assert.deepEqual(result.presentation, { spotlightFeather: 24 });
  assert.deepEqual(result.redactions, [{ selector: '.logo', mode: 'cover', label: '隐藏' }]);
  assert.deepEqual(result.narration, { enabled: true, voice: 'Tingting', rate: 180, opening: { audio: 'audio/opening.mp3' } });
  assert.deepEqual(result.steps[0].narration, { text: '步骤讲解' });
  assert.throws(() => metadata(source.replace('spotlightFeather:24', 'spotlightFeather:-1'), 'bad.ts'), /spotlightFeather/);
  assert.throws(() => metadata(source.replace("audio:'audio/opening.mp3'", 'audio:process.env.SECRET'), 'dynamic.ts'), /静态/);
  assert.throws(() => metadata(source.replace("audio:'audio/opening.mp3'", '...getAudio()'), 'spread.ts'), /静态/);
});

test('static metadata preserves embedded/manual options and rejects dynamic values before execution', () => {
  const source = `throw new Error('must never execute'); export default definePlaybook({schemaVersion:1,id:'manual',title:'Manual',
    playback:{browser:'embedded'}, requirements:{dataMode:'fixture',effects:'writes',replay:'safe',roles:[]},
    steps:[{id:'one',title:'Install',explain:'Try it now',interaction:{mode:'manual',prompt:'You may install or continue',timeoutMs:10000,onTimeout:'continue'},run:()=>{throw new Error('must never execute')},verify:()=>{}}]});`;
  const result = metadata(source, 'manual.playbook.ts');
  assert.deepEqual(result.playback, { browser: 'embedded' });
  assert.deepEqual(result.steps[0].interaction, { mode: 'manual', prompt: 'You may install or continue', timeoutMs: 10000, onTimeout: 'continue' });
  const cases = [
    ["playback:{browser:'embedded'}", 'playback'],
    ["playback:{browser:'embedded'}", '[getKey()]:{browser:\'embedded\'}'],
    ["interaction:{mode:'manual',prompt:'You may install or continue',timeoutMs:10000,onTimeout:'continue'}", 'interaction'],
    ["browser:'embedded'", 'browser:getBrowser()'],
    ["browser:'embedded'", '...getPlayback()'],
    ["browser:'embedded'", "[getKey()]:'embedded'"],
    ['timeoutMs:10000', 'timeoutMs:settings.timeout'],
    ['timeoutMs:10000', 'timeoutMs:10*1000'],
    ['timeoutMs:10000', '...getInteraction()'],
    ["prompt:'You may install or continue'", 'prompt:`Install ${secret}`'],
  ];
  for (const [before, after] of cases) assert.throws(() => metadata(source.replace(before, after), 'dynamic.ts'), /静态|动态/);
  for (const [before, after] of [["browser:'embedded'", "browser:'popup'"], ['timeoutMs:10000', 'timeoutMs:-1'], ['timeoutMs:10000', 'timeoutMs:1.5'], ["mode:'manual'", "mode:'automatic'"]]) {
    assert.throws(() => metadata(source.replace(before, after), 'invalid.ts'), /playback|interaction/);
  }
});

test('deleting a Book preserves scripts, profiles, other books and an exact original backup', async t => {
  const { workspace, filename, manifest } = await hierarchyWorkspace(manifest => {
    manifest.books.push({ ...structuredClone(manifest.books[0]), id: 'other', title: 'Other Book' });
    manifest.extension = { userOwned: true };
  });
  t.after(() => rm(workspace.path, { recursive: true, force: true }));
  const before = await readFile(filename);
  const scriptFile = await inside(workspace.path, manifest.scripts[0].file), scriptBefore = await readFile(scriptFile);
  const result = await removeBookFromManifest({ workspaceDir: workspace.path, bookId: 'training', expectedHash: workspace.manifestHash, backupDir: path.join(workspace.path, 'backups') });
  assert.deepEqual(await readFile(result.backupPath), before);
  const next = JSON.parse(await readFile(filename, 'utf8'));
  assert.deepEqual(next.books.map(book => book.id), ['other']);
  for (const key of ['scripts', 'profiles', 'extension']) assert.deepEqual(next[key], manifest[key]);
  assert.deepEqual(await readFile(scriptFile), scriptBefore);
  assert.deepEqual((await readWorkspace(workspace.path)).books.map(book => book.id), ['other']);
  const newHash = (await readWorkspace(workspace.path)).manifestHash;
  await assert.rejects(removeBookFromManifest({ workspaceDir: workspace.path, bookId: 'training', expectedHash: newHash, backupDir: path.join(workspace.path, 'backups') }), /不存在/);
});

test('deleting legacy and shadowed legacy Books does not resurrect them on the next disk refresh', async t => {
  for (const shadowed of [false, true]) await t.test(String(shadowed), async t => {
    const { workspace, filename } = await hierarchyWorkspace(manifest => {
      manifest.demos = [{ id: 'training', title: 'Legacy', profile: 'local-sample', scripts: ['starter.overview'] }];
      if (!shadowed) delete manifest.books;
    });
    t.after(() => rm(workspace.path, { recursive: true, force: true }));
    await removeBookFromManifest({ workspaceDir: workspace.path, bookId: 'training', expectedHash: workspace.manifestHash, backupDir: path.join(workspace.path, 'backups') });
    assert.equal((await readWorkspace(workspace.path)).books.length, 0);
    const next = JSON.parse(await readFile(filename, 'utf8'));
    assert.deepEqual(next.demos, []);
    assert.equal(next.scripts.length, 2);
  });
});

test('stale, missing and invalid Book deletion targets never overwrite the disk manifest', async t => {
  const { workspace, filename } = await hierarchyWorkspace();
  t.after(() => rm(workspace.path, { recursive: true, force: true }));
  const backupDir = path.join(workspace.path, 'backups');
  const input = { workspaceDir: workspace.path, bookId: 'training', expectedHash: workspace.manifestHash, backupDir };
  await writeFile(filename, (await readFile(filename, 'utf8')) + '\n');
  const changed = await readFile(filename);
  await assert.rejects(removeBookFromManifest(input), /清单已更新/);
  await assert.rejects(removeBookFromManifest({ ...input, bookId: '../escape' }), /目标无效/);
  await assert.rejects(removeBookFromManifest({ ...input, expectedHash: undefined }), /目标无效/);
  await assert.rejects(removeBookFromManifest({ ...input, expectedHash: hash(changed), bookId: 'missing' }), /不存在/);
  assert.deepEqual(await readFile(filename), changed);
  await assert.rejects(readFile(backupDir), { code: 'ENOENT' });
});

test('Book deletion refuses linked manifests and a failed backup leaves originals intact', async t => {
  const { workspace, filename } = await hierarchyWorkspace();
  t.after(() => rm(workspace.path, { recursive: true, force: true }));
  const original = await readFile(filename), blockedBackup = path.join(workspace.path, 'not-a-directory');
  await writeFile(blockedBackup, 'keep me');
  const input = { workspaceDir: workspace.path, bookId: 'training', expectedHash: workspace.manifestHash, backupDir: blockedBackup };
  await assert.rejects(removeBookFromManifest(input));
  assert.deepEqual(await readFile(filename), original);
  const linkedFile = path.join(workspace.path, 'actual-manifest.json');
  await writeFile(linkedFile, original); await rm(filename); await symlink(linkedFile, filename);
  await assert.rejects(removeBookFromManifest({ ...input, backupDir: path.join(workspace.path, 'backups') }), /软链接/);
  assert.deepEqual(await readFile(linkedFile), original);
});
