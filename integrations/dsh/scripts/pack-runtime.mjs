import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const plugin = fileURLToPath(new URL('..', import.meta.url))
const project = fileURLToPath(new URL('../../../', import.meta.url))
const runtime = path.join(plugin, 'runtime')
const product = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'))
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
// A tarball cannot embed its own final digest. The bundled Skill directs DSH
// updates to the separately published installer, which pins this tarball.
const bundledInstaller = path.join(runtime, 'skills/playbook-wright/scripts/install.sh')
const installer = await readFile(bundledInstaller, 'utf8')
const pinnedDigest = /^DSH_PLUGIN_SHA256='[a-f0-9]{64}'$/m
if (!pinnedDigest.test(installer)) throw new Error('独立安装器缺少固定的 DSH 插件校验值')
await writeFile(bundledInstaller, installer.replace(pinnedDigest, "DSH_PLUGIN_SHA256='STANDALONE_INSTALLER_ONLY'"))
await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ name: '@playbook/core', version: product.version, private: true, type: 'module' }, null, 2) + '\n')
console.log(`Playbook ${product.version} runtime copied to ${runtime}`)
