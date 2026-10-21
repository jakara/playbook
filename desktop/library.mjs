import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';

export const hash = value => createHash('sha256').update(value).digest('hex');
export async function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('资产路径必须是工作区内的相对路径');
  const base = await realpath(root), target = await realpath(path.resolve(base, relative));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('资产路径越出工作区');
  if (!(await stat(target)).isFile()) throw new Error('资产不是可读取文件');
  return target;
}

function literal(node) {
  if (!node) return undefined;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.flatMap(property => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = property.name.getText().replace(/^['"]|['"]$/g, '');
    return [[name, literal(property.initializer)]];
  }));
  return undefined;
}

// Metadata is parsed, never imported/executed while browsing a workspace.
export function metadata(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const exported = tree.statements.find(ts.isExportAssignment);
  const expression = exported?.expression;
  const value = literal(expression && ts.isCallExpression(expression) ? expression.arguments[0] : expression);
  if (!value || value.schemaVersion !== 1 || !value.id || !value.title || !Array.isArray(value.steps) || !value.steps.length) {
    throw new Error('需要静态 default definePlaybook 对象与非空 steps；请让智能体按当前契约导出');
  }
  const ids = new Set();
  for (const step of value.steps) {
    if (!step?.id || !step.title || !step.explain || ids.has(step.id)) throw new Error('步骤标识重复或说明缺失');
    ids.add(step.id);
  }
  const req = value.requirements;
  if (!req || !['real', 'fixture', 'mock'].includes(req.dataMode) || !['read-only', 'writes'].includes(req.effects)
    || !['safe', 'reset-required', 'single-run'].includes(req.replay) || !Array.isArray(req.roles)) throw new Error('环境、数据副作用或重播声明不完整');
  return { id: value.id, title: value.title, summary: value.summary || '', source: value.source,
    requirements: req, steps: value.steps.map(({ id, title, explain, presentation }) => ({ id, title, explain, presentation })) };
}

export async function readWorkspace(directory) {
  const root = await realpath(directory);
  const id = hash(root).slice(0, 16);
  const output = { id, path: root, name: path.basename(root), items: [], profiles: [], demos: [], token: '' };
  try {
    const manifestText = await readFile(await inside(root, '.playbook.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.scripts) || !Array.isArray(manifest.profiles)) throw new Error('清单需要 schemaVersion: 1、scripts 和 profiles');
    output.name = manifest.title || output.name;
    const parts = [manifestText];
    const profileIds = new Set();
    for (const profile of manifest.profiles) {
      if (!profile.id || profileIds.has(profile.id) || !['real', 'fixture', 'mock'].includes(profile.dataMode)) throw new Error('环境标识重复或环境类别不完整');
      profileIds.add(profile.id);
      await inside(root, profile.file);
      output.profiles.push({ id: profile.id, title: profile.title || profile.id, dataMode: profile.dataMode, file: profile.file, parameters: profile.parameters || {} });
    }
    const scriptIds = new Set();
    for (const entry of manifest.scripts) {
      try {
        const filename = await inside(root, entry.file), source = await readFile(filename, 'utf8');
        const meta = metadata(source, filename);
        if (scriptIds.has(meta.id)) throw new Error('流程 ID 重复');
        scriptIds.add(meta.id);
        if (!profileIds.has(entry.profile)) throw new Error('流程引用的环境不存在');
        if (output.profiles.find(p => p.id === entry.profile).dataMode !== meta.requirements.dataMode) throw new Error('脚本与环境的数据类别不一致');
        output.items.push({ ...meta, file: entry.file, tags: Array.isArray(entry.tags) ? entry.tags : [], hash: hash(source), valid: true, defaultProfileId: entry.profile });
        parts.push(source);
      } catch (error) {
        output.items.push({ id: `invalid:${entry.file}`, title: path.basename(entry.file || '未命名脚本'), file: entry.file, summary: '', tags: [], steps: [], valid: false, error: error.message });
        parts.push(String(error.message));
      }
    }
    const demoIds = new Set();
    for (const demo of manifest.demos || []) {
      if (!demo.id || demoIds.has(demo.id) || !Array.isArray(demo.scripts) || !demo.scripts.length || demo.scripts.some(id => !scriptIds.has(id))) throw new Error('演示标识重复或引用了不可用脚本');
      demoIds.add(demo.id);
      const defaultProfileId = demo.profile || output.items.find(item => item.id === demo.scripts[0]).defaultProfileId;
      if (!profileIds.has(defaultProfileId)) throw new Error('演示环境不存在');
      output.demos.push({ ...demo, defaultProfileId });
    }
    // Watch imported helpers and profiles too; only read files, with bounded traversal.
    const roots = [...manifest.scripts, ...manifest.profiles].map(item => item.file);
    const visited = new Set();
    async function readImports(relative) {
      const filename = await inside(root, relative);
      if (visited.has(filename) || visited.size > 200) return;
      visited.add(filename); const content = await readFile(filename, 'utf8'); parts.push(content);
      const tree = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
      for (const statement of tree.statements) {
        const spec = statement.moduleSpecifier?.text;
        if (!spec?.startsWith('.')) continue;
        const base = path.resolve(path.dirname(filename), spec);
        const candidates = [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '.js', path.join(base, 'index.ts')];
        for (const candidate of candidates) {
          try { await stat(candidate); await readImports(path.relative(root, candidate)); break; } catch {}
        }
      }
    }
    for (const file of roots) await readImports(file);
    output.token = hash(parts.join('\n'));
  } catch (error) { output.error = error.message; output.token = hash(String(error.message)); }
  return output;
}

export function selection(workspace, entryId, kind, profileId) {
  if (workspace.error) throw new Error(workspace.error);
  const demo = kind === 'demo' ? workspace.demos.find(item => item.id === entryId) : null;
  const items = demo ? demo.scripts.map(id => workspace.items.find(item => item.id === id)) : [workspace.items.find(item => item.id === entryId)];
  if (!items.length || items.some(item => !item?.valid)) throw new Error('脚本不存在或尚未就绪');
  const profile = workspace.profiles.find(item => item.id === (profileId || demo?.defaultProfileId || items[0].defaultProfileId));
  if (!profile || items.some(item => item.requirements.dataMode !== profile.dataMode)) throw new Error('环境与所选脚本不匹配');
  return { title: demo?.title || items[0].title, items, profile };
}

export async function snapshot({ workspace, items, profile, outputDir, appRoot }) {
  await mkdir(outputDir, { recursive: true });
  const entries = [];
  for (const item of items) entries.push(await inside(workspace.path, item.file));
  const profilePath = await inside(workspace.path, profile.file);
  const req = createRequire(path.join(appRoot, 'package.json'));
  // Absolute ESM entry points retain named exports in external workspace bundles.
  const externalPackages = new Map(['@playwright/test', 'playwright'].map(name => [name, req.resolve(name).replace(/\.js$/, '.mjs')]));
  const result = await build({
    stdin: { contents: `${entries.map((file, i) => `import flow${i} from ${JSON.stringify(file)};`).join('\n')}\nimport profile from ${JSON.stringify(profilePath)};\nexport const flows=[${entries.map((_, i) => `flow${i}`).join(',')}]; export { profile };`, resolveDir: workspace.path, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false, metafile: true,
    absWorkingDir: workspace.path, nodePaths: [path.join(appRoot, 'node_modules')],
    plugins: [{ name: 'playbook-runtime', setup(builder) {
      builder.onResolve({ filter: /^@playbook\/core$/ }, () => ({ path: path.join(appRoot, 'dist/index.js') }));
      builder.onResolve({ filter: /^(@playwright\/test|playwright)$/ }, ({ path: name }) => ({ path: externalPackages.get(name), external: true }));
    } }],
  });
  const code = result.outputFiles[0].text;
  const snapshotHash = hash(code + JSON.stringify(profile.parameters));
  const bundle = path.join(outputDir, 'flow.mjs'); await writeFile(bundle, code, { mode: 0o600 });
  const files = Object.keys(result.metafile.inputs).filter(name => name !== '<stdin>');
  return { bundle, snapshotHash, inputs: files, sourceToken: workspace.token };
}
