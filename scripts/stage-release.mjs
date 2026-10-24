import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, writeFile, mkdir, mkdtemp, copyFile, chmod, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseFiles = ['Playbook-macos-arm64.dmg', 'Playbook-macos-arm64.zip', 'playbook-skills.tar.gz', 'install.sh', 'release.json', 'SHA256SUMS'];
const appFiles = releaseFiles.slice(0, 2);
const skillNames = ['playbook-wright', 'playbook-playwright'];
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function parseVersion(value) {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match || !match.slice(1).every(part => Number.isSafeInteger(Number(part)))) throw new Error(`Expected a stable major.minor.patch version: ${value}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  const version = `${major}.${minor}.${patch}`;
  return { version, tag: `v${version}`, series: `${major}.${minor}`, major, minor, patch };
}
export function compareVersions(a, b) { return a.major - b.major || a.minor - b.minor || a.patch - b.patch; }
export async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function regularFile(filename) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || !info.size) throw new Error(`Release input must be a non-empty regular file: ${filename}`);
  return info;
}
async function copySkillTree(source, destination, limits, depth = 0) {
  if (depth > 12 || ++limits.entries > 8192) throw new Error('Skill bundle exceeds the directory depth or entry limit');
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error('Skill bundle must not contain symbolic links');
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') throw new Error('Unsafe filename in Skill bundle');
      await copySkillTree(path.join(source, name), path.join(destination, name), limits, depth + 1);
    }
  } else if (info.isFile() && info.nlink === 1) {
    if (++limits.files > 4096 || info.size > 8 * 1024 * 1024 || (limits.bytes += info.size) > 32 * 1024 * 1024) throw new Error('Skill bundle exceeds its file or size limit');
    await copyFile(source, destination);
    await chmod(destination, info.mode & 0o111 ? 0o755 : 0o644);
  } else throw new Error('Skill bundle contains an unsupported file type');
}

export async function stageRelease({ root = projectRoot, commit } = {}) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const version = parseVersion(pkg.version);
  commit ||= process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(commit)) throw new Error('Release commit must be a complete Git object ID');
  const output = path.join(root, 'distribution');
  const temporary = await mkdtemp(path.join(root, '.distribution-'));
  const bundleRoot = await mkdtemp(path.join(tmpdir(), 'playbook-release-skills-'));
  try {
    for (const name of appFiles) {
      const source = path.join(root, 'release', name); await regularFile(source);
      await copyFile(source, path.join(temporary, name));
    }
    const limits = { files: 0, bytes: 0, entries: 0 };
    for (const name of skillNames) await copySkillTree(path.join(root, 'skills', name), path.join(bundleRoot, 'skills', name), limits);
    for (const name of skillNames) await regularFile(path.join(bundleRoot, 'skills', name, 'SKILL.md'));
    await copySkillTree(path.join(root, 'build/install-skill.cjs'), path.join(bundleRoot, 'install-skill.cjs'), limits);
    execFileSync('tar', ['-czf', path.join(temporary, 'playbook-skills.tar.gz'), '-C', bundleRoot, ...skillNames.map(name => `skills/${name}`), 'install-skill.cjs'], { stdio: 'pipe', env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const installer = path.join(root, 'skills/playbook-wright/scripts/install.sh'); await regularFile(installer);
    await copyFile(installer, path.join(temporary, 'install.sh')); await chmod(path.join(temporary, 'install.sh'), 0o755);
    const assets = [];
    for (const name of releaseFiles.slice(0, 4)) assets.push({ name, size: (await regularFile(path.join(temporary, name))).size, sha256: await sha256(path.join(temporary, name)) });
    const manifest = { schemaVersion: 1, version: version.version, tag: version.tag, commit, platform: 'darwin', arch: 'arm64', unsigned: true, assets };
    await writeFile(path.join(temporary, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
    const checksums = [];
    for (const name of releaseFiles.slice(0, -1)) checksums.push(`${await sha256(path.join(temporary, name))}  ${name}`);
    await writeFile(path.join(temporary, 'SHA256SUMS'), checksums.join('\n') + '\n');
    await validateDistribution(temporary, { version: version.version, commit });
    // Only replace our bounded generated output, never an arbitrary existing directory.
    try {
      const info = await lstat(output);
      if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(output)).some(name => !releaseFiles.includes(name))) throw new Error('distribution contains unrecognized files; refusing to replace it');
      for (const name of await readdir(output)) await regularFile(path.join(output, name));
      await rm(output, { recursive: true });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(temporary, output);
    return { directory: output, manifest, files: releaseFiles.map(name => path.join(output, name)) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(bundleRoot, { recursive: true, force: true });
  }
}

export async function validateDistribution(directory, expected = {}) {
  if ((await readdir(directory)).sort().join('\n') !== [...releaseFiles].sort().join('\n')) throw new Error('Release distribution has missing or unexpected files');
  const checksums = new Map();
  for (const line of (await readFile(path.join(directory, 'SHA256SUMS'), 'utf8')).trim().split('\n')) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match || checksums.has(match[2])) throw new Error('Invalid SHA256SUMS');
    checksums.set(match[2], match[1]);
  }
  if (checksums.size !== releaseFiles.length - 1 || [...checksums.keys()].some(name => !releaseFiles.slice(0, -1).includes(name))) throw new Error('SHA256SUMS does not cover all release assets');
  const files = [];
  for (const name of releaseFiles) {
    const filename = path.join(directory, name), info = await regularFile(filename), digest = await sha256(filename);
    if (name !== 'SHA256SUMS' && checksums.get(name) !== digest) throw new Error(`Release checksum mismatch: ${name}`);
    files.push({ name, filename, size: info.size, sha256: digest });
  }
  const manifest = JSON.parse(await readFile(path.join(directory, 'release.json'), 'utf8'));
  const parsed = parseVersion(manifest.version);
  if (manifest.schemaVersion !== 1 || manifest.tag !== parsed.tag || manifest.platform !== 'darwin' || manifest.arch !== 'arm64' || manifest.unsigned !== true
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(manifest.commit) || !Array.isArray(manifest.assets) || manifest.assets.length !== 4
    || (expected.version && manifest.version !== expected.version) || (expected.commit && manifest.commit !== expected.commit)) throw new Error('Release manifest does not match this build');
  for (const file of files.slice(0, 4)) {
    if (manifest.assets.filter(asset => asset.name === file.name && asset.size === file.size && asset.sha256 === file.sha256).length !== 1) throw new Error(`Release manifest asset mismatch: ${file.name}`);
  }
  return { manifest, files, version: parsed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: projectRoot, encoding: 'utf8' }).trim()) throw new Error('Commit the intended public source before staging a release; generated build/release files must remain ignored');
  stageRelease().then(result => console.log(`Staged ${result.manifest.tag}: ${result.directory}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
