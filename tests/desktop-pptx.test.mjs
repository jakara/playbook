import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { writePptx, commitPptx } from '../desktop/pptx.mjs';

function voiceWave(milliseconds) {
  const bytes = Buffer.alloc(44 + milliseconds * 44100 / 1000);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(22050, 24); bytes.writeUInt32LE(44100, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return bytes;
}

test('narration has its own automatic audio timeline and safe readable slide intervals', async t => {
  const { image, audio, output } = await fixture(t);
  await writeFile(audio, voiceWave(3328));
  await writePptx({ scenes: [{ image, audio, title: '讲解', notes: '完整讲解', kind: 'step', durationMs: 3328, audioMs: 3328 },
    { image, title: '结果', kind: 'result', durationMs: 550 }], title: '同步复现', output });
  const zip = await JSZip.loadAsync(await readFile(output));
  const first = await zip.file('ppt/slides/slide1.xml').async('string');
  const second = await zip.file('ppt/slides/slide2.xml').async('string');
  assert.match(first, /advTm="5000"/); // 3.328 s audio + startup/tail margin, rounded upward.
  assert.match(second, /advTm="2000"/); // No half-second result flash.
  assert.doesNotMatch(first, /<p:stSnd|<a:videoFile/);
  assert.match(first, /<a:audioFile/); assert.match(first, /<p:audio isNarration="1">/);
  assert.match(first, /cmd="playFrom\(0\.0\)"/);
  assert.match(first, /showWhenStopped="0"/); assert.doesNotMatch(first, /numSld=/);
  assert.match(first, /nodeType="afterEffect"/);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-pptx-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'page.png'), audio = path.join(root, 'voice.wav');
  await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64'));
  await writeFile(audio, voiceWave(4000));
  return { root, image, audio, output: path.join(root, 'deck.pptx') };
}

test('deck embeds screenshots and audio, notes preserve narration, slides advance in order', async t => {
  const { image, audio, output } = await fixture(t);
  const scenes = [{ image, audio, title: '介绍', notes: '中文讲解 <界面> & 操作\n下一行', durationMs: 4210, audioMs: 4000 },
    { image, audio: null, title: '结果', kind: 'result', notes: '结果已核验', durationMs: 550, audioMs: 0 }];
  assert.deepEqual(await writePptx({ scenes, title: '截图演示', output }), { slides: 2, audioSlides: 1, durationMs: 7000 });
  const zip = await JSZip.loadAsync(await readFile(output));
  const slide1 = await zip.file('ppt/slides/slide1.xml').async('string'), slide2 = await zip.file('ppt/slides/slide2.xml').async('string');
  assert.match(slide1, /<p:transition advClick="0" advTm="5000">/);
  assert.match(slide1, /<a:audioFile r:link="rIdPlaybookAudio"/);
  assert.match(slide2, /<p:transition advClick="0" advTm="2000"><p:cut\/><\/p:transition>/);
  assert.ok(slide1.indexOf('<p:transition ') > slide1.indexOf('</p:clrMapOvr>'));
  assert.match(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'), /relationships\/audio" Target="\.\.\/media\/playbook-1.wav"/);
  assert.deepEqual(await zip.file('ppt/media/playbook-1.wav').async('nodebuffer'), await readFile(audio));
  const embeddedImage = Object.keys(zip.files).find(name => name.startsWith('ppt/media/') && name.endsWith('.png'));
  assert.deepEqual(await zip.file(embeddedImage).async('nodebuffer'), await readFile(image));
  assert.match(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'), /中文讲解 &lt;界面&gt; &amp; 操作/);
  assert.match(await zip.file('ppt/presProps.xml').async('string'), /useTimings="1"/);
  assert.match(await zip.file('[Content_Types].xml').async('string'), /Extension="wav" ContentType="audio\/wav"/);
  for (const name of Object.keys(zip.files).filter(name => name.endsWith('.rels'))) assert.doesNotMatch(await zip.file(name).async('string'), /TargetMode="External"/);
});

test('invalid timings and cancellation cannot publish a partially generated deck', async t => {
  const { image, output } = await fixture(t);
  for (const durationMs of [NaN, -1, 1.5, 500]) await assert.rejects(writePptx({ scenes: [{ image, durationMs, audioMs: 1000 }], title: 'invalid', output }), /换页时间无效/);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
  await assert.rejects(writePptx({ scenes: [{ image, durationMs: 1000 }], title: 'stop', output, checkpoint: async () => { throw new Error('stopped'); } }), /stopped/);
  await assert.rejects(readFile(output), { code: 'ENOENT' });
});

test('export measures the embedded waveform instead of trusting a shorter duration hint', async t => {
  const { image, audio, output } = await fixture(t);
  await writeFile(audio, voiceWave(8000));
  const result = await writePptx({ scenes: [{ image, audio, title: 'long', durationMs: 1000, audioMs: 0 }], output });
  assert.equal(result.durationMs, 9000);
  await writeFile(audio, 'broken');
  await assert.rejects(writePptx({ scenes: [{ image, audio, title: 'broken', durationMs: 1000 }], output }), /完整的 PCM WAV/);
  assert.equal((await JSZip.loadAsync(await readFile(output))).file('ppt/media/playbook-1.wav') !== null, true);
});

test('commit preserves an existing destination on stop or copy failure, replaces only on success', async t => {
  const { root, output } = await fixture(t), staged = path.join(root, 'staged.pptx');
  await writeFile(output, 'existing'); await writeFile(staged, 'new'); let completed = false;
  assert.equal(await commitPptx(staged, output, () => true, () => { completed = true; }), false);
  assert.equal(completed, false); assert.equal(await readFile(output, 'utf8'), 'existing');
  await assert.rejects(commitPptx(path.join(root, 'missing'), output));
  assert.equal(await readFile(output, 'utf8'), 'existing');
  assert.equal(await commitPptx(staged, output, () => false, () => { completed = true; }), true);
  assert.equal(completed, true); assert.equal(await readFile(output, 'utf8'), 'new');
  assert.ok((await readdir(root)).every(name => !name.endsWith('.tmp')));
});
