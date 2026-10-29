import { spawn as spawnProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const maxAudioBytes = 20 * 1024 * 1024;
const audioMime = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };
const speechFailure = voice => new Error(`本机语音“${voice}”无法生成旁白。请确认此 voice 已安装且支持语音导出，或改用本地录音。`);
const aborted = () => new DOMException('旁白生成已取消', 'AbortError');
let voices;

export function narrationEnabled(flow, clip, enabled = true) {
  return enabled && clip !== false && (Boolean(clip) || flow.narration?.enabled !== false);
}

function checkSignal(signal) {
  if (signal?.aborted) throw aborted();
}

function validWave(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return false;
  let pcm = false, data = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end > bytes.length) return false;
    const kind = bytes.toString('ascii', offset, offset + 4);
    if (kind === 'fmt ') pcm = size >= 16 && bytes.readUInt16LE(offset + 8) === 1 && bytes.readUInt32LE(offset + 12) === 22050 && bytes.readUInt16LE(offset + 22) === 16;
    if (kind === 'data') data = size > 0 && bytes.subarray(offset + 8, end).some(value => value !== 0);
    offset = end + (size % 2);
  }
  return pcm && data;
}

function runSay(args, { text = '', voice, signal, capture = false }, spawn = spawnProcess) {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    let child, settled = false, output = '';
    const finish = error => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      error ? reject(error) : resolve(output);
    };
    const cancel = () => child?.kill('SIGTERM');
    try {
      child = spawn('/usr/bin/say', args, { stdio: ['pipe', capture ? 'pipe' : 'ignore', 'pipe'] });
      child.once('error', () => finish(signal?.aborted ? aborted() : speechFailure(voice)));
      child.once('close', code => finish(signal?.aborted ? aborted() : code === 0 ? null : speechFailure(voice)));
      child.stderr.resume();
      if (capture) child.stdout.on('data', chunk => {
        output += chunk;
        if (output.length > 512 * 1024) { child.kill('SIGTERM'); finish(speechFailure(voice)); }
      });
      child.stdin.on('error', () => { child.kill('SIGTERM'); finish(signal?.aborted ? aborted() : speechFailure(voice)); });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      child.stdin.end(text);
    } catch { finish(signal?.aborted ? aborted() : speechFailure(voice)); }
  });
}

// The spawn argument is a small test seam; production always invokes the local system synthesizer.
export function renderSpeech({ text, voice, rate, output, signal }, spawn = spawnProcess) {
  return runSay(['-v', voice, '-r', String(rate), '-o', output, '--file-format=WAVE', '--data-format=LEI16@22050', '-f', '-'], { text, voice, signal }, spawn);
}

async function checkVoice(voice, signal) {
  if (!voices) {
    const listing = await runSay(['-v', '?'], { voice, signal, capture: true });
    voices = new Set(listing.split(/\r?\n/u).flatMap(line => {
      const match = line.match(/^(.+?)\s+[a-z]{2,3}[_-][\w-]+\s+#/u);
      return match ? [match[1].trim()] : [];
    }));
  }
  // say silently falls back to a different voice when an unknown name is supplied.
  if (!voices.has(voice)) throw speechFailure(voice);
}

async function audioBytes(file, signal) {
  checkSignal(signal);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0 || info.size > maxAudioBytes) throw new Error('旁白音频必须是非空文件，且不超过 20 MB。');
  const bytes = await readFile(file, { signal });
  if (bytes.length > maxAudioBytes) throw new Error('旁白音频不能超过 20 MB。');
  checkSignal(signal);
  return bytes;
}

export async function narrationSource({ clip, fallback, options = {}, audioAssets = {}, cacheDir, signal }) {
  if (clip === false) return null;
  checkSignal(signal);
  if (clip !== undefined && (!clip || typeof clip !== 'object' || Array.isArray(clip))) throw new Error('旁白必须是 false 或包含 text/audio 的对象。');
  if (clip && Object.hasOwn(clip, 'text') && Object.hasOwn(clip, 'audio')) throw new Error('旁白 text 与 audio 不能同时设置。');
  if (clip && Object.hasOwn(clip, 'audio')) {
    if (typeof clip.audio !== 'string' || !clip.audio.trim()) throw new Error('旁白 audio 必须指定本地音频资源。');
    const file = Object.hasOwn(audioAssets, clip.audio) ? audioAssets[clip.audio] : null;
    if (typeof file !== 'string' || !file) throw new Error(`旁白音频“${clip.audio}”不在本轮脚本快照中。`);
    const mime = audioMime[path.extname(file).toLowerCase()];
    if (!mime) throw new Error('旁白音频只支持 wav、mp3、m4a 或 ogg。');
    let bytes;
    try { bytes = await audioBytes(file, signal); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`本轮快照缺少旁白音频“${clip.audio}”。`);
      throw error;
    }
    return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, kind: 'file' };
  }
  const text = clip && Object.hasOwn(clip, 'text') ? clip.text : fallback;
  if (typeof text !== 'string' || !text.trim()) throw new Error('旁白文本不能为空。');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('旁白 options 必须是对象。');
  const voice = options.voice ?? 'Tingting', rate = options.rate ?? 185;
  if (typeof voice !== 'string' || !voice.trim() || voice.length > 120 || /^[\s-]|[\u0000-\u001f\u007f]/u.test(voice)) throw new Error('旁白 voice 必须是有效的本机语音名称。');
  if (!Number.isInteger(rate) || rate < 80 || rate > 400) throw new Error('旁白 rate 必须是 80–400 的整数。');
  if (process.platform !== 'darwin') throw new Error('自动语音目前仅支持 macOS 本机语音；请为此系统提供本地录音 audio。');
  if (typeof cacheDir !== 'string' || !cacheDir) throw new Error('缺少本轮旁白缓存目录。');
  await checkVoice(voice, signal);
  await mkdir(cacheDir, { recursive: true });
  const key = createHash('sha256').update(JSON.stringify([voice, rate, text])).digest('hex');
  const file = path.join(cacheDir, `${key}.wav`);
  let bytes;
  try { bytes = await audioBytes(file, signal); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes || !validWave(bytes)) {
    const temporary = path.join(cacheDir, `${key}-${randomUUID()}.wav`);
    try {
      await renderSpeech({ text, voice, rate, output: temporary, signal });
      bytes = await audioBytes(temporary, signal);
      if (!validWave(bytes)) throw speechFailure(voice);
      await rename(temporary, file);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw speechFailure(voice);
    } finally { await rm(temporary, { force: true }); }
  }
  checkSignal(signal);
  return { dataUrl: `data:audio/wav;base64,${bytes.toString('base64')}`, kind: 'tts' };
}
