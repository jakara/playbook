import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Runs in the controlled Chrome page. Decode/resample with its built-in codecs;
// the exported deck needs neither the source recording nor an external converter.
async function decodeAudio(source) {
  const context = new OfflineAudioContext(1, 1, 22050);
  const bytes = Uint8Array.from(atob(source.dataUrl.split(',')[1]), value => value.charCodeAt(0));
  const audio = await context.decodeAudioData(bytes.buffer);
  if (!audio.length || !Number.isFinite(audio.duration)) throw new Error('旁白音频无法解码');
  const buffer = new ArrayBuffer(44 + audio.length * 2), view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, audio.length * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
  for (let index = 0; index < audio.length; index++) {
    const sample = Math.max(-1, Math.min(1, channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  const wave = new Uint8Array(buffer); let binary = '';
  for (let index = 0; index < wave.length; index += 32768) binary += String.fromCharCode(...wave.subarray(index, index + 32768));
  return { base64: btoa(binary), durationMs: Math.ceil(audio.duration * 1000) };
}

export async function capturePptxScene({ page, dir, index, title, notes, durationMs, source, clean = false }) {
  await mkdir(dir, { recursive: true });
  const image = path.join(dir, `${index}.png`), audio = source ? path.join(dir, `${index}.wav`) : null;
  let voice;
  if (source) {
    try { voice = await page.evaluate(decodeAudio, source); }
    catch { throw new Error('PPTX 旁白解码失败，请检查本轮录音或本机语音'); }
    await writeFile(audio, Buffer.from(voice.base64, 'base64'), { mode: 0o600 });
  }
  // Hide only the guide for result pages. The independent privacy layer remains.
  const previous = clean ? await page.evaluate(() => {
    const root = document.getElementById('ygd-root');
    if (!root) return null;
    const previous = root.style.visibility; root.style.visibility = 'hidden'; return previous;
  }) : null;
  try { await page.screenshot({ path: image, animations: 'disabled' }); }
  finally {
    if (clean && previous !== null && !page.isClosed()) await page.evaluate(value => { const root = document.getElementById('ygd-root'); if (root) root.style.visibility = value; }, previous);
  }
  return { image, audio, title, notes, durationMs: Math.max(1, Math.ceil(durationMs), voice?.durationMs || 0), audioMs: voice?.durationMs || 0 };
}

export async function writePptx({ scenes, title, output, checkpoint = async () => {} }) {
  if (!scenes.length) throw new Error('没有可导出的演示画面');
  const deck = new PptxGenJS();
  deck.author = 'Playbook'; deck.subject = 'Playbook 页面回放'; deck.title = title;
  deck.company = 'Playbook'; deck.lang = 'zh-CN';
  const first = await readFile(scenes[0].image);
  const width = 13.333333, height = width * first.readUInt32BE(20) / first.readUInt32BE(16);
  deck.defineLayout({ name: 'PLAYBOOK', width, height }); deck.layout = 'PLAYBOOK';
  for (const scene of scenes) {
    await checkpoint();
    if (!Number.isSafeInteger(scene.durationMs) || scene.durationMs < 1 || scene.durationMs > 4294967295 || scene.durationMs < scene.audioMs) throw new Error('PPTX 换页时间无效');
    const slide = deck.addSlide(); slide.background = { color: 'FFFFFF' };
    const png = await readFile(scene.image), pixelsX = png.readUInt32BE(16), pixelsY = png.readUInt32BE(20);
    const scale = Math.min(width / pixelsX, height / pixelsY), w = pixelsX * scale, h = pixelsY * scale;
    slide.addImage({ data: `image/png;base64,${png.toString('base64')}`, x: (width - w) / 2, y: (height - h) / 2, w, h, altText: scene.title });
    slide.addNotes(scene.notes || scene.title);
  }
  const zip = await JSZip.loadAsync(await deck.write({ outputType: 'nodebuffer' }));
  for (const [index, scene] of scenes.entries()) {
    await checkpoint();
    const name = `ppt/slides/slide${index + 1}.xml`;
    let sound = '<p:endSnd/>';
    if (scene.audio) {
      const rels = `ppt/slides/_rels/slide${index + 1}.xml.rels`;
      const audioName = `playbook-${index + 1}.wav`;
      zip.file(`ppt/media/${audioName}`, await readFile(scene.audio));
      const xml = await zip.file(rels).async('string');
      zip.file(rels, xml.replace('</Relationships>', `<Relationship Id="rIdPlaybookAudio" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/${audioName}"/></Relationships>`));
      sound = `<p:stSnd loop="0"><p:snd r:embed="rIdPlaybookAudio" name="Playbook ${index + 1}"/></p:stSnd>`;
    }
    // ISO 29500 slide transition sound starts on entry without a click/animation.
    // Explicit endSnd on silent frames prevents a previous clip leaking across slides.
    const xml = await zip.file(name).async('string');
    zip.file(name, xml.replace('</p:clrMapOvr>', `</p:clrMapOvr><p:transition advClick="0" advTm="${scene.durationMs}"><p:cut/><p:sndAc>${sound}</p:sndAc></p:transition>`));
  }
  const types = await zip.file('[Content_Types].xml').async('string');
  if (!/Extension="wav"/.test(types)) zip.file('[Content_Types].xml', types.replace('</Types>', '<Default Extension="wav" ContentType="audio/wav"/></Types>'));
  const properties = await zip.file('ppt/presProps.xml').async('string');
  zip.file('ppt/presProps.xml', properties.replace('/>', '><p:showPr loop="0" showNarration="1" useTimings="1"><p:present/><p:sldAll/></p:showPr></p:presentationPr>'));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await checkpoint(); await writeFile(output, bytes, { mode: 0o600 }); await checkpoint();
  return { slides: scenes.length, durationMs: scenes.reduce((sum, scene) => sum + scene.durationMs, 0), audioSlides: scenes.filter(scene => scene.audio).length };
}

// Stage beside the chosen destination, then replace in one synchronous commit.
// Cancellation or copy failure leaves an existing file intact.
export async function commitPptx(staged, destination, cancelled = () => false, onCommit = () => {}) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    await copyFile(staged, temporary);
    if (cancelled()) return false;
    renameSync(temporary, destination); onCommit(); return true;
  } finally { await rm(temporary, { force: true }); }
}
