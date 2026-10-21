import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { narrationSource, renderSpeech } from '../desktop/narration.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-narration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function wave() {
  const bytes = Buffer.alloc(48);
  bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(22050, 24); bytes.writeUInt32LE(44100, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(1024, 44);
  return bytes;
}

test('explicit false skips narration without requiring a platform or cache', async () => {
  assert.equal(await narrationSource({ clip: false }), null);
});

test('audio reads only the declared snapshot and produces the matching MIME type', async t => {
  const root = await fixture(t);
  for (const [extension, mime] of [['wav', 'audio/wav'], ['mp3', 'audio/mpeg'], ['m4a', 'audio/mp4'], ['ogg', 'audio/ogg']]) {
    const file = path.join(root, `snapshot.${extension}`), bytes = Buffer.from(`snapshot-${extension}`);
    await writeFile(file, bytes);
    assert.deepEqual(await narrationSource({ clip: { audio: 'narration/intro' }, audioAssets: { 'narration/intro': file } }), { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, kind: 'file' });
  }
  await assert.rejects(narrationSource({ clip: { audio: path.join(root, 'snapshot.wav') } }), /不在本轮脚本快照/);
  await assert.rejects(narrationSource({ clip: { audio: 'toString' } }), /不在本轮脚本快照/);
});

test('audio reports missing, empty, unsupported and oversized snapshot files', async t => {
  const root = await fixture(t), file = path.join(root, 'clip.wav');
  const request = () => narrationSource({ clip: { audio: 'clip' }, audioAssets: { clip: file } });
  await assert.rejects(request(), /快照缺少旁白音频/);
  await writeFile(file, ''); await assert.rejects(request(), /非空文件/);
  await truncate(file, 20 * 1024 * 1024 + 1); await assert.rejects(request(), /20 MB/);
  await assert.rejects(narrationSource({ clip: { audio: 'clip' }, audioAssets: { clip: path.join(root, 'clip.txt') } }), /只支持 wav/);
});

test('narration rejects ambiguous sources and invalid text, voice or rate', async () => {
  for (const clip of [true, null, 'text', []]) await assert.rejects(narrationSource({ clip }), /旁白必须是/);
  await assert.rejects(narrationSource({ clip: { text: 'text', audio: 'clip' } }), /不能同时设置/);
  await assert.rejects(narrationSource({ clip: { audio: '' } }), /audio 必须指定/);
  for (const text of ['', '  ', 42]) await assert.rejects(narrationSource({ clip: { text } }), /文本不能为空/);
  for (const voice of ['', '-f', 'Tingting\n', 42]) await assert.rejects(narrationSource({ fallback: '你好', options: { voice } }), /voice 必须是/);
  for (const rate of [79, 401, 185.5, '185', NaN]) await assert.rejects(narrationSource({ fallback: '你好', options: { rate } }), /rate 必须是/);
});

test('cached TTS matches voice, rate and text and never needs to synthesize again', { skip: process.platform !== 'darwin' }, async t => {
  const cacheDir = await fixture(t), text = '已经缓存的中文旁白', voice = 'Tingting', rate = 185, bytes = wave();
  const key = createHash('sha256').update(JSON.stringify([voice, rate, text])).digest('hex');
  await writeFile(path.join(cacheDir, `${key}.wav`), bytes);
  const source = await narrationSource({ fallback: text, cacheDir });
  assert.deepEqual(source, { dataUrl: `data:audio/wav;base64,${bytes.toString('base64')}`, kind: 'tts' });
  assert.deepEqual(await narrationSource({ clip: { text }, cacheDir }), source);
});

test('TTS fails clearly outside macOS rather than silently skipping narration', { skip: process.platform === 'darwin' }, async () => {
  await assert.rejects(narrationSource({ fallback: 'Hello', cacheDir: '/unused' }), /仅支持 macOS.*本地录音/);
});

test('an uninstalled voice cannot silently fall back to a different system voice', { skip: process.platform !== 'darwin' }, async t => {
  const cacheDir = await fixture(t);
  await assert.rejects(narrationSource({ fallback: '此旁白不应以其他声音生成', options: { voice: 'PlaybookUnavailableVoice' }, cacheDir }), /PlaybookUnavailableVoice.*无法生成旁白/);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new EventEmitter(); child.stdin.end = text => { child.input = text; };
  child.stderr = { resume() {} };
  child.kill = signal => { child.killed = signal; queueMicrotask(() => child.emit('close', null)); };
  return child;
}

test('speech passes narration through stdin and supplies command arguments without a shell', async () => {
  const child = fakeChild(), text = '你好；$(touch unexpected)';
  let invocation;
  const result = renderSpeech({ text, voice: 'Tingting', rate: 185, output: '/cache/clip.wav' }, (...args) => { invocation = args; return child; });
  child.emit('close', 0); await result;
  assert.equal(invocation[0], '/usr/bin/say');
  assert.deepEqual(invocation[1], ['-v', 'Tingting', '-r', '185', '-o', '/cache/clip.wav', '--file-format=WAVE', '--data-format=LEI16@22050', '-f', '-']);
  assert.equal(invocation[2].shell, undefined); assert.equal(child.input, text);
});

test('speech failures identify the unavailable local voice without including narration', async () => {
  const child = fakeChild(), text = 'private narration';
  const result = renderSpeech({ text, voice: 'Missing Voice', rate: 185, output: '/cache/clip.wav' }, () => child);
  child.emit('close', 1);
  await assert.rejects(result, error => /Missing Voice.*无法生成旁白/.test(error.message) && !error.message.includes(text));
  const broken = renderSpeech({ text, voice: 'Missing Voice', rate: 185, output: '/cache/clip.wav' }, () => { throw new Error('not available'); });
  await assert.rejects(broken, /请确认此 voice 已安装/);
});

test('cancellation terminates the active synthesizer and rejects with AbortError', async () => {
  const child = fakeChild(), controller = new AbortController();
  const result = renderSpeech({ text: '取消这段旁白', voice: 'Tingting', rate: 185, output: '/cache/clip.wav', signal: controller.signal }, () => child);
  controller.abort(); await assert.rejects(result, { name: 'AbortError' });
  assert.equal(child.killed, 'SIGTERM');
  await assert.rejects(narrationSource({ clip: { audio: 'clip' }, signal: controller.signal }), { name: 'AbortError' });
});
