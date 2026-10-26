import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = fileURLToPath(new URL('..', import.meta.url))
const project = fileURLToPath(new URL('../../../', import.meta.url))
const runtime = path.join(plugin, 'runtime')
const product = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(path.join(plugin, 'package.json'), 'utf8'))
const skill = await readFile(path.join(project, 'skills/playbook-wright/SKILL.md'), 'utf8')
const compatibilitySkill = await readFile(path.join(project, 'skills/playbook-playwright/SKILL.md'), 'utf8')
const installer = await readFile(path.join(project, 'skills/playbook-wright/scripts/install.sh'), 'utf8')
if (manifest.version !== product.version || !skill.includes(`Skill 版本为 **${product.version}**`)
  || !compatibilitySkill.includes(`Skill 版本 **${product.version}**`)
  || !installer.includes(`DSH_PLUGIN_VERSION='${product.version}'`)) throw new Error('应用、Skill、DSH 插件或安装器版本不一致')
const required = [
  'dist/index.js', 'build/ui/index.html', 'desktop/library.mjs', 'desktop/runner.mjs',
  'desktop/lifecycle.mjs', 'desktop/narration.mjs', 'desktop/pptx.mjs',
  'desktop/interaction.mjs', 'desktop/annotation-format.mjs', 'desktop/skill-installer.mjs',
  'skills/playbook-wright/SKILL.md', 'skills/playbook-playwright/SKILL.md', 'examples/tutorial/.playbook.json',
]
for (const item of required) await readFile(path.join(project, item))
await rm(runtime, { recursive: true, force: true })
for (const directory of ['dist', 'build/ui', 'desktop/presentation', 'skills/playbook-wright', 'skills/playbook-playwright', 'examples/tutorial']) {
  const destination = path.join(runtime, directory)
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(path.join(project, directory), destination, { recursive: true })
}
for (const filename of ['library.mjs', 'runner.mjs', 'lifecycle.mjs', 'narration.mjs', 'pptx.mjs', 'interaction.mjs', 'annotation-format.mjs', 'skill-installer.mjs']) {
  await cp(path.join(project, 'desktop', filename), path.join(runtime, 'desktop', filename))
}
await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: '@playbook/core', version: product.version, private: true, type: 'module' }, null, 2) + '\n')
console.log(`Playbook ${product.version} runtime copied to ${runtime}`)
