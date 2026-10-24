import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('build', { recursive: true });
await build({ entryPoints: { main: 'desktop/main.mjs', runner: 'desktop/runner.mjs', 'install-skill': 'desktop/install-skill.mjs' }, outdir: 'build', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', sourcemap: true });
await copyFile('desktop/preload.cjs', 'build/preload.cjs');
await copyFile('desktop/control-preload.cjs', 'build/control-preload.cjs');
await copyFile('desktop/tutorial-preload.cjs', 'build/tutorial-preload.cjs');
await viteBuild({ root: path.resolve('ui'), base: './', build: { outDir: path.resolve('build/ui'), emptyOutDir: true } });
