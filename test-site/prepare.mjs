import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const studio = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node test-site/prepare.mjs /absolute/path/to/studio');
const generated = join(root, '.generated');
await mkdir(generated, { recursive: true });
const widgetRequire = createRequire(join(studio, 'apps/widget/package.json'));
const viteRequire = createRequire(widgetRequire.resolve('vite/package.json'));
const { build } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const controller = await build({
  stdin: {
    contents: `import { initJoinStoriesController } from ${JSON.stringify(join(studio, 'apps/widget/src/controllers/join-global-controller/JoinStories.controller.ts'))}; initJoinStoriesController();`,
    resolveDir: studio,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  minify: true,
  define: { 'import.meta.env': '{}' },
});
const globalScript = await readFile(join(studio, 'apps/widget/dist/global-script/index.js'));
const fixed = await readFile(join(root, '../template.tpl'));
const originalRef = 'df28d03dce3fef90db977db3109d2035957de750';
const original = execFileSync('git', ['show', `${originalRef}:template.tpl`], { cwd: root });
const assets = { 'global.js': globalScript, 'controller.js': controller.outputFiles[0].contents, 'fixed.tpl': fixed, 'original.tpl': original };
for (const [name, content] of Object.entries(assets)) await writeFile(join(generated, name), content);
const revision = cwd => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
const provenance = {
  studioRevision: revision(studio),
  templateRevision: revision(root),
  originalRef,
  hashes: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')])),
};
await writeFile(join(generated, 'provenance.json'), JSON.stringify(provenance, null, 2));
console.log('Prepared actual JOIN bundles and both GTM templates. No merchant script or config is included.');
