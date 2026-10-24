import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { targetFor, inspectSkillBundle, installSkillBundle } from './skill-installer.mjs';

async function main() {
  const input = {};
  const values = new Map([['--framework', 'framework'], ['--scope', 'scope'], ['--project-root', 'projectRoot'], ['--source-dir', 'sourceDir']]);
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--replace') { input.replace = true; continue; }
    if (argv[i] === '--preview') { input.preview = true; continue; }
    const key = values.get(argv[i]);
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--') || input[key] !== undefined) throw new Error(`无效或重复的参数：${argv[i]}`);
    input[key] = argv[++i];
  }
  if (!input.sourceDir || !path.isAbsolute(input.sourceDir)) throw new Error('--source-dir 必须是包含完整 Skill 包的绝对路径。');
  const targetDir = targetFor(input);
  if (input.scope === 'project' && !(await fs.stat(input.projectRoot)).isDirectory()) throw new Error('项目目录不存在或不是文件夹。');
  const source = await fs.readFile(path.join(input.sourceDir, 'SKILL.md'), 'utf8');
  const version = source.match(/Skill 版本(?:为)?\s+\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/)?.[1];
  if (!version) throw new Error('无法识别来源 Skill 的版本。');
  const compatibility = await fs.readFile(path.join(input.sourceDir, '../playbook-playwright/SKILL.md'), 'utf8');
  if (!compatibility.includes(`Skill 版本 **${version}**`)) throw new Error('主 Skill 与兼容入口的版本不一致。');
  const options = { sourceDir: input.sourceDir, targetDir, version,
    backupRoot: path.join(process.env.PLAYBOOK_USER_DATA || path.join(homedir(), 'Library/Application Support/Playbook'), 'backups/skills') };
  const preview = await inspectSkillBundle(options);
  if (input.preview) { process.stdout.write(JSON.stringify({ ok: true, ...preview }) + '\n'); return; }
  // Unchanged managed installations can update with a verified backup. Local edits require --replace.
  const replace = Boolean(input.replace || preview.targets.every(target => ['new', 'installed', 'update'].includes(target.status)));
  const result = await installSkillBundle({ ...options, replace });
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ ok: false, code: error.code || 'INSTALL_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
});
