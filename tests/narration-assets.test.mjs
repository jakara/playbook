import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkspace, selection, snapshot } from '../desktop/library.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const script = (opening = 'audio/opening.wav', step = 'audio/step.mp3') => `
import {definePlaybook} from '@playbook/core';
export default definePlaybook({schemaVersion:1,id:'narrated',title:'Narrated',summary:'Audio assets',
  requirements:{dataMode:'fixture',effects:'read-only',replay:'safe',roles:[]},
  narration:{enabled:true,opening:{audio:${JSON.stringify(opening)}}},
  steps:[{id:'one',title:'One',explain:'Explain',narration:{audio:${JSON.stringify(step)}},run:async()=>{},verify:async()=>{}}]});`;

async function fixture(t) {
  const parent = await mkdtemp(path.join(tmpdir(), 'playbook-audio-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'project'); await mkdir(path.join(root, 'audio'), { recursive: true });
  await writeFile(path.join(root, 'flow.ts'), script());
  await writeFile(path.join(root, 'profile.ts'), `import {defineProfile} from '@playbook/core'; export default defineProfile({schemaVersion:1,id:'fixture',title:'Fixture',dataMode:'fixture',roles:[],prepare:async({page})=>({context:{page}})});`);
  await writeFile(path.join(root, '.playbook.json'), JSON.stringify({schemaVersion:1,scripts:[{file:'flow.ts',profile:'fixture'}],profiles:[{id:'fixture',file:'profile.ts',dataMode:'fixture'}]}));
  await writeFile(path.join(root, 'audio/opening.wav'), 'opening-v1');
  await writeFile(path.join(root, 'audio/step.mp3'), 'step-v1');
  return { root, parent };
}

test('opening and step audio bytes participate in workspace change detection', async t => {
  const { root } = await fixture(t);
  const first = await readWorkspace(root);
  assert.equal(first.items[0].valid, true);
  assert.equal(first.token, (await readWorkspace(root)).token);
  await writeFile(path.join(root, 'audio/opening.wav'), 'opening-v2');
  const second = await readWorkspace(root);
  assert.notEqual(second.token, first.token);
  assert.equal(second.items[0].hash, first.items[0].hash, 'business script source has not changed');
  await writeFile(path.join(root, 'audio/step.mp3'), 'step-v2');
  assert.notEqual((await readWorkspace(root)).token, second.token);
});

test('missing, escaping, unsupported and oversized audio cannot be selected for playback', async t => {
  const { root, parent } = await fixture(t);
  await writeFile(path.join(parent, 'outside.wav'), 'outside');
  await symlink(path.join(parent, 'outside.wav'), path.join(root, 'audio/outside.wav'));
  await writeFile(path.join(root, 'audio/large.wav'), Buffer.alloc(20 * 1024 * 1024 + 1));
  const cases = [
    ['audio/missing.wav', /ENOENT/], ['../outside.wav', /audio path/],
    ['audio/outside.wav', /越出/], ['audio/movie.mp4', /audio path/], ['audio/large.wav', /20 MB/],
  ];
  for (const [relative, reason] of cases) await t.test(relative, async () => {
    await writeFile(path.join(root, 'flow.ts'), script(relative));
    const workspace = await readWorkspace(root);
    assert.equal(workspace.items[0].valid, false);
    assert.match(workspace.items[0].error, reason);
    assert.throws(() => selection(workspace, 'narrated', 'script'));
  });
});

test('audio snapshot freezes all referenced assets and includes their bytes in its identity', async t => {
  const { root, parent } = await fixture(t);
  const workspace = await readWorkspace(root);
  const selected = selection(workspace, 'narrated', 'script');
  const first = await snapshot({ workspace, ...selected, outputDir: path.join(parent, 'snapshot-1'), appRoot });
  assert.deepEqual(Object.keys(first.audioAssets).sort(), ['audio/opening.wav', 'audio/step.mp3']);
  for (const filename of Object.values(first.audioAssets)) assert.ok(filename.startsWith(path.join(parent, 'snapshot-1/audio/')));
  await writeFile(path.join(root, 'audio/opening.wav'), 'opening-v2');
  await writeFile(path.join(root, 'audio/step.mp3'), 'step-v2');
  assert.equal(await readFile(first.audioAssets['audio/opening.wav'], 'utf8'), 'opening-v1');
  assert.equal(await readFile(first.audioAssets['audio/step.mp3'], 'utf8'), 'step-v1');
  const second = await snapshot({ workspace, ...selected, outputDir: path.join(parent, 'snapshot-2'), appRoot });
  assert.notEqual(second.snapshotHash, first.snapshotHash);
  assert.equal(await readFile(second.audioAssets['audio/opening.wav'], 'utf8'), 'opening-v2');
  assert.equal(await readFile(second.audioAssets['audio/step.mp3'], 'utf8'), 'step-v2');
});

test('snapshot uses current bundled source references rather than stale browse metadata', async t => {
  const { root, parent } = await fixture(t);
  const workspace = await readWorkspace(root);
  await writeFile(path.join(root, 'audio/new.m4a'), 'new-reference');
  await writeFile(path.join(root, 'flow.ts'), script('audio/new.m4a'));
  const built = await snapshot({ workspace, ...selection(workspace, 'narrated', 'script'), outputDir: path.join(parent, 'snapshot'), appRoot });
  assert.deepEqual(Object.keys(built.audioAssets).sort(), ['audio/new.m4a', 'audio/step.mp3']);
  assert.equal(await readFile(built.audioAssets['audio/new.m4a'], 'utf8'), 'new-reference');
});

test('snapshot rejects an audio symlink moved outside the workspace after browsing', async t => {
  const { root, parent } = await fixture(t);
  const workspace = await readWorkspace(root);
  await writeFile(path.join(parent, 'outside.wav'), 'outside');
  await rm(path.join(root, 'audio/opening.wav'));
  await symlink(path.join(parent, 'outside.wav'), path.join(root, 'audio/opening.wav'));
  await assert.rejects(snapshot({ workspace, ...selection(workspace, 'narrated', 'script'), outputDir: path.join(parent, 'snapshot'), appRoot }), /越出/);
});
