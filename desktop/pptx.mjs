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
  const still = await page.addStyleTag({ content: '#ygd-root #ygd-card{animation:none!important;opacity:1!important;translate:0 0!important}#ygd-root .ygd-popover{animation:none!important;transition:none!important;opacity:1!important}' });
  try { await page.screenshot({ path: image, animations: 'disabled' }); }
  finally {
    await still.evaluate(element => element.remove()).catch(() => {});
    if (clean && previous !== null && !page.isClosed()) await page.evaluate(value => { const root = document.getElementById('ygd-root'); if (root) root.style.visibility = value; }, previous);
  }
  return { image, audio, title, notes, durationMs: Math.max(1, Math.ceil(durationMs), voice?.durationMs || 0), audioMs: voice?.durationMs || 0 };
}

function narrationTiming(shapeId, durationMs) {
  // Automatic, current-slide media playback, matching the native WPS/PowerPoint timeline.
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>
    <p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>
      <p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>
        <p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
          <p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
            <p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr additive="base"><p:cTn id="6" dur="${durationMs}" fill="hold"/><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cBhvr></p:cmd>
          </p:childTnLst></p:cTn></p:par>
        </p:childTnLst></p:cTn></p:par>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>
    <p:audio isNarration="1"><p:cMediaNode vol="100000" showWhenStopped="0"><p:cTn id="7" fill="hold" display="1"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:endCondLst><p:cond evt="onStopAudio"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn><p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl></p:cMediaNode></p:audio>
  </p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
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
  const durations = [];
  for (const [index, scene] of scenes.entries()) {
    await checkpoint();
    const name = `ppt/slides/slide${index + 1}.xml`;
    let xml = await zip.file(name).async('string'), audioMs = 0, timing = '';
    if (scene.audio) {
      const rels = `ppt/slides/_rels/slide${index + 1}.xml.rels`;
      const audioName = `playbook-${index + 1}.wav`;
      const wave = await readFile(scene.audio);
      // capturePptxScene owns this fixed PCM format; reject mismatches before publishing.
      if (wave.length <= 44 || wave.length % 2 || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 16) !== 'WAVEfmt ' || wave.readUInt16LE(20) !== 1 || wave.readUInt16LE(22) !== 1 || wave.readUInt16LE(34) !== 16 || wave.readUInt32LE(24) !== 22050 || wave.readUInt32LE(28) !== 44100 || wave.toString('ascii', 36, 40) !== 'data' || wave.readUInt32LE(40) !== wave.length - 44) throw new Error('PPTX 内嵌旁白不是完整的 PCM WAV');
      audioMs = Math.ceil((wave.length - 44) / 44100 * 1000);
      zip.file(`ppt/media/${audioName}`, wave);
      const relationships = await zip.file(rels).async('string');
      zip.file(rels, relationships.replace('</Relationships>', `<Relationship Id="rIdPlaybookAudio" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/${audioName}"/><Relationship Id="rIdPlaybookMedia" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/${audioName}"/></Relationships>`));
      const shapeId = Math.max(...[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(match => Number(match[1]))) + 1;
      const poster = xml.match(/<a:blip r:embed="([^"]+)"/)[1];
      // An audioFile (not videoFile or transition sound) gives each page its own playback lifecycle.
      const media = `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="Playbook narration"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr/><p:nvPr><a:audioFile r:link="rIdPlaybookAudio"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rIdPlaybookMedia"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${poster}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="-914400" y="-914400"/><a:ext cx="91440" cy="91440"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
      xml = xml.replace('</p:spTree>', `${media}</p:spTree>`);
      timing = narrationTiming(shapeId, audioMs);
    }
    // Whole-second, upward rounding avoids truncation in compatible viewers; leave startup/tail room.
    const minimum = ['chapter', 'result'].includes(scene.kind) ? 2000 : 3000;
    const durationMs = Math.ceil(Math.max(minimum, scene.durationMs, audioMs ? audioMs + 1000 : 0) / 1000) * 1000;
    if (durationMs > 4294967295) throw new Error('PPTX 换页时间无效');
    durations.push(durationMs);
    xml = xml.replace('</p:clrMapOvr>', `</p:clrMapOvr><p:transition advClick="0" advTm="${durationMs}"><p:cut/></p:transition>`);
    zip.file(name, xml.replace('</p:sld>', `${timing}</p:sld>`));
  }
  const types = await zip.file('[Content_Types].xml').async('string');
  if (!/Extension="wav"/.test(types)) zip.file('[Content_Types].xml', types.replace('</Types>', '<Default Extension="wav" ContentType="audio/wav"/></Types>'));
  const properties = await zip.file('ppt/presProps.xml').async('string');
  zip.file('ppt/presProps.xml', properties.replace('/>', '><p:showPr loop="0" showNarration="1" useTimings="1"><p:present/><p:sldAll/></p:showPr></p:presentationPr>'));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await checkpoint(); await writeFile(output, bytes, { mode: 0o600 }); await checkpoint();
  return { slides: scenes.length, durationMs: durations.reduce((sum, value) => sum + value, 0), audioSlides: scenes.filter(scene => scene.audio).length };
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
