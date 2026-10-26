import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const text = file => readFile(path.join(root, file), 'utf8');
const app = JSON.parse(await text('package.json'));
const lock = JSON.parse(await text('package-lock.json'));
const plugin = JSON.parse(await text('integrations/dsh/package.json'));
const skill = await text('skills/playbook-wright/SKILL.md');
const compatibilitySkill = await text('skills/playbook-playwright/SKILL.md');
const installer = await text('skills/playbook-wright/scripts/install.sh');
const version = app.version;

if (lock.version !== version || lock.packages[''].version !== version || plugin.version !== version
  || !skill.includes(`Skill 版本为 **${version}**`)
  || !compatibilitySkill.includes(`Skill 版本 **${version}**`)
  || !installer.includes(`DSH_PLUGIN_VERSION='${version}'`)
  || !installer.includes(`DSH_PLUGIN_SPEC="playbook-dsh@$DSH_PLUGIN_VERSION"`)) {
  throw new Error(`应用、Skill、DSH 插件与 npm 安装目标版本不一致：${version}`);
}
console.log(`Playbook app, Skill, and npm plugin versions match: ${version}`);
