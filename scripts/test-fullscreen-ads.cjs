// Run: node scripts/test-fullscreen-ads.cjs [--baseline]
// Bundles real managers/components against a local mock; never invokes a native SDK.
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-ad-session-'));
const shim = path.join(root, 'scripts/test-fullscreen-ads.shim.ts');
const aliases = ['react', 'react/jsx-runtime', '@capacitor/core', '@capacitor/app', '@capacitor-community/admob',
  '@/hooks/useProStatus', '@/hooks/useBannerSuppression', '@/components/app/AdFreeIcon'];
(async () => {
  try {
    await esbuild.build({
      absWorkingDir: root, entryPoints: [process.argv.includes('--regressions')
        ? 'scripts/test-fullscreen-ads-regressions.ts' : 'scripts/test-fullscreen-ads.ts'], outfile: path.join(tmp, 'test.cjs'),
      bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'warning',
      alias: Object.fromEntries(aliases.map(name => [name, shim])), loader: { '.css': 'empty' },
      plugins: [{ name: 'local-test-fixtures', setup(build) {
        build.onResolve({ filter: /^\.\/(ProPaywall|RedeemCodeLink)$/ }, () => ({ path: shim }));
        if (process.argv.includes('--baseline')) {
          build.onLoad({ filter: /src\/(services\/adManager\.ts|components\/(app|native)\/ValueWall\.tsx)$/ }, args => ({
            contents: execFileSync('git', ['show', `origin/main:${path.relative(root, args.path)}`], { cwd: root, encoding: 'utf8' }),
            loader: args.path.endsWith('tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path),
          }));
        }
      } }],
    });
    const result = spawnSync(process.execPath, [path.join(tmp, 'test.cjs')], { cwd: root, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
