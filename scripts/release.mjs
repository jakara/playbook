import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVersion, compareVersions, validateDistribution, sha256 } from './stage-release.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
function recognized(release) { try { return parseVersion(release.tag_name); } catch { return null; } }

export function olderSeriesReleases(releases, version) {
  return releases.filter(release => {
    const other = recognized(release);
    return other && !release.draft && !release.prerelease && other.series === version.series && other.patch < version.patch;
  });
}

function runGh(args, body) {
  try { return execFileSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body), maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (failure) {
    const error = new Error(`GitHub request failed: ${String(failure.stderr || failure.message).trim().slice(0, 2000)}`);
    if (/HTTP 404|\b404\b/.test(String(failure.stderr))) error.status = 404;
    throw error;
  }
}

export function githubClient(repository, execute = runGh) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
  const endpoint = `repos/${repository}`;
  const api = (resource, method = 'GET', body) => {
    const text = execute(['api', `${endpoint}/${resource}`, '--method', method, ...(body === undefined ? [] : ['--input', '-'])], body);
    return text.trim() ? JSON.parse(text) : null;
  };
  return {
    async listReleases() {
      const output = [];
      for (let page = 1; ; page++) {
        const releases = api(`releases?per_page=100&page=${page}`);
        if (!Array.isArray(releases)) throw new Error('Invalid GitHub releases response');
        output.push(...releases); if (releases.length < 100) return output;
      }
    },
    async tagCommit(tag) {
      let object;
      try { object = api(`git/ref/tags/${tag}`).object; } catch (error) { if (error.status === 404) return null; throw error; }
      for (let depth = 0; depth < 5; depth++) {
        if (object?.type === 'commit') return object.sha;
        if (object?.type !== 'tag') break;
        object = api(`git/tags/${object.sha}`).object;
      }
      throw new Error('Release tag does not resolve to a commit');
    },
    async createDraft(body) { return api('releases', 'POST', body); },
    async getRelease(id) { return api(`releases/${id}`); },
    async uploadAssets(tag, files) { execute(['release', 'upload', tag, ...files.map(file => file.filename), '--clobber', '--repo', repository]); },
    async publishDraft(id, body) { return api(`releases/${id}`, 'PATCH', body); },
    async deleteRelease(id) { return api(`releases/${id}`, 'DELETE'); },
    async assetHash(tag, asset) {
      const directory = await mkdtemp(path.join(tmpdir(), 'playbook-verify-release-'));
      try {
        const filename = path.join(directory, 'asset');
        execute(['release', 'download', tag, '--pattern', asset.name, '--output', filename, '--repo', repository]);
        return await sha256(filename);
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}

export async function verifyUploadedAssets(release, files, github) {
  if (!Array.isArray(release.assets) || release.assets.length !== files.length
    || release.assets.some(asset => !files.some(file => file.name === asset.name))) throw new Error('Uploaded release has missing or unexpected assets');
  for (const file of files) {
    const matches = release.assets.filter(asset => asset.name === file.name);
    if (matches.length !== 1 || matches[0].size !== file.size) throw new Error(`Uploaded asset size mismatch: ${file.name}`);
    const asset = matches[0];
    const digest = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '')?.[1].toLowerCase() || await github.assetHash(release.tag_name, asset);
    if (digest !== file.sha256) throw new Error(`Uploaded asset checksum mismatch: ${file.name}`);
  }
}

/** Publish a complete immutable patch before retiring only lower patches in its release series. */
export async function publishRelease({ root = projectRoot, repository = process.env.GITHUB_REPOSITORY || 'jakara/playbook', github = githubClient(repository), commit } = {}) {
  const version = parseVersion(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version);
  const releases = await github.listReleases();
  const existing = releases.find(release => release.tag_name === version.tag);
  // An ordinary documentation/code push must never move an already published version tag.
  if (existing && !existing.draft) return { status: 'skipped', tag: version.tag, reason: 'Version already published', deleted: [] };
  const published = releases.filter(release => !release.draft && !release.prerelease && recognized(release));
  if (published.some(release => { const other = recognized(release); return other.series === version.series && other.patch > version.patch; })) {
    return { status: 'superseded', tag: version.tag, reason: 'A newer patch in this series is already published', deleted: [] };
  }
  const built = await validateDistribution(path.join(root, 'distribution'), { version: version.version, ...(commit ? { commit } : {}) });
  const targetCommit = built.manifest.commit;
  const tagCommit = await github.tagCommit(version.tag);
  if (tagCommit && tagCommit !== targetCommit) throw new Error('Immutable release tag already points to a different commit; increase the package version');
  if (existing && existing.target_commitish !== targetCommit) throw new Error('Existing draft belongs to another commit; increase the package version');
  const body = `macOS Apple Silicon · Playbook ${version.version}\n\nDownload the DMG or ZIP. This build is unsigned. Verify downloads with SHA256SUMS.\n\nThe client, SDK and complete authoring Skill are open source under MIT. The Skill bundle includes the authoring, maintenance, lifecycle and Playwright conversion guides, with a separate installer. See the [installation guide](https://github.com/${repository}/blob/${version.tag}/README.md).`;
  const draft = existing || await github.createDraft({ tag_name: version.tag, name: `Playbook ${version.version}`, target_commitish: targetCommit,
    draft: true, prerelease: false, make_latest: 'false', body });
  if (!draft?.draft || draft.tag_name !== version.tag || !Number.isSafeInteger(draft.id)) throw new Error('GitHub did not return the expected draft release');
  await github.uploadAssets(version.tag, built.files);
  const uploaded = await github.getRelease(draft.id);
  if (!uploaded.draft || uploaded.tag_name !== version.tag) throw new Error('Release changed while assets were uploading');
  await verifyUploadedAssets(uploaded, built.files, github);
  const latest = !published.some(release => compareVersions(recognized(release), version) > 0);
  const released = await github.publishDraft(draft.id, { draft: false, make_latest: latest ? 'true' : 'false' });
  if (released?.draft !== false || released.tag_name !== version.tag) throw new Error('New release has not been published; older releases were retained');
  if (await github.tagCommit(version.tag) !== targetCommit) throw new Error('Published tag commit could not be verified; older releases were retained');
  // Delete release objects/assets, never Git tags. A failure above cannot reach this block.
  const deleted = [];
  for (const old of olderSeriesReleases(await github.listReleases(), version)) {
    await github.deleteRelease(old.id); deleted.push(old.tag_name);
  }
  return { status: 'published', tag: version.tag, latest, deleted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  publishRelease({ commit }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
