// Run: node scripts/test-fullscreen-ads.cjs [--regressions | --ui-parity | --reload-parity | --entry=tests/x.test.ts] [--baseline]
// --entry bundles a test file; if tests/<name>.capacitor.ts exists it replaces the AdMob module
// (real @capacitor/core registerPlugin proxy). --baseline then loads origin/main's ad services.
// Bundles real managers/components against a local mock; never invokes a native SDK.
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-ad-session-'));
const shim = path.join(root, 'scripts/test-fullscreen-ads.shim.ts');
const entryArg = process.argv.find(arg => arg.startsWith('--entry='));
const entry = entryArg ? entryArg.slice('--entry='.length) : null;
const entryAdMob = entry && fs.existsSync(path.join(root, entry.replace(/\.test\.ts$/, '.capacitor.ts')))
  ? path.join(root, entry.replace(/\.test\.ts$/, '.capacitor.ts')) : null;
const aliases = ['react', 'react/jsx-runtime', '@capacitor/core', '@capacitor/app', '@capacitor-community/admob',
  '@/hooks/useProStatus', '@/hooks/useBannerSuppression', '@/components/app/AdFreeIcon'];
(async () => {
  try {
    await esbuild.build({
      absWorkingDir: root, entryPoints: [entry ? entry : process.argv.includes('--reload-parity')
        ? 'scripts/test-rewarded-reload-parity.ts' : process.argv.includes('--ui-parity')
        ? 'scripts/test-value-wall-parity.ts' : process.argv.includes('--regressions')
        ? 'scripts/test-fullscreen-ads-regressions.ts' : 'scripts/test-fullscreen-ads.ts'], outfile: path.join(tmp, 'test.cjs'),
      bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'warning',
      alias: Object.fromEntries(aliases.map(name => [name,
        name === '@capacitor-community/admob' && entryAdMob ? entryAdMob : shim])), loader: { '.css': 'empty' },
      plugins: [{ name: 'local-test-fixtures', setup(build) {
        build.onResolve({ filter: /^\.\/(ProPaywall|RedeemCodeLink)$/ }, () => ({ path: shim }));
        if (process.argv.includes('--baseline')) {
          // UI parity swaps only the two components, keeping the repaired manager
          // so native outcomes settle identically on both sides of the comparison.
          const filter = entry
            ? /src\/(services\/(adManager|fullScreenAdSession)\.ts|hooks\/useInterstitialAd\.ts|app\/\[locale\]\/(undercurrent|wim)\/ads\.ts)$/
            : process.argv.includes('--ui-parity')
            ? /src\/components\/(app|native)\/ValueWall\.tsx$/
            : /src\/(services\/(adManager|fullScreenAdSession)\.ts|components\/(app|native)\/ValueWall\.tsx)$/;
          build.onLoad({ filter }, args => ({
            contents: execFileSync('git', ['show', `origin/main:${path.relative(root, args.path)}`], { cwd: root, encoding: 'utf8' }),
            loader: args.path.endsWith('tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path),
          }));
        }
      } }],
    });
    const args = (entry || process.argv.includes('--ui-parity') || process.argv.includes('--reload-parity'))
      && process.argv.includes('--baseline') ? ['--baseline'] : [];
    const result = spawnSync(process.execPath, [path.join(tmp, 'test.cjs'), ...args], { cwd: root, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
