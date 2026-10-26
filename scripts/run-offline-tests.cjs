// 실행: /usr/bin/lockf -k /tmp/signum-heavy.lock node scripts/run-offline-tests.cjs
// 개별 재검사: 같은 명령 뒤에 시험 파일 이름을 나열한다. 네트워크·운영 쓰기 없음.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, '.logs/ux-gate');
fs.mkdirSync(dir, { recursive: true });
const all = fs.readdirSync(path.join(root, 'tests')).filter(p => /\.test\.(?:ts|tsx|js|cjs|mjs)$/.test(p)).sort();
const selected = process.argv.slice(2);
const entries = selected.length ? all.filter(f => selected.includes(f)) : all;
if (selected.some(f => !all.includes(f))) throw new Error('존재하지 않는 시험');
const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'ko_KR.UTF-8', TZ: 'Asia/Seoul',
  NODE_OPTIONS: `--require=${path.join(__dirname, 'offline-test-preload.cjs')}` };
const results = [];
const recheckFile = path.join(dir, 'recheck.json');
const previous = selected.length && fs.existsSync(recheckFile) ? JSON.parse(fs.readFileSync(recheckFile, 'utf8')) : [];
const updates = new Map(previous.map(r => [r.file, r]));
for (const entry of entries) {
  const bundled = ['adPrepareOverlap.test.ts', 'adShowRestore.test.ts', 'androidInterstitial.test.ts', 'bannerRetry.test.ts', 'interstitialFrequency.test.ts'].includes(entry);
  const args = bundled ? ['scripts/test-fullscreen-ads.cjs', `--entry=tests/${entry}`]
    : [...(/\.tsx?$/.test(entry) ? ['-r', './scripts/offline-test-typescript.cjs'] : []), `tests/${entry}`];
  if (entry === 'optionsEodCollector.flow.test.js') args.push('--offline');
  if (entry === 'guruLensReplay.test.ts') args.push('/Users/eunhoon/Documents/signum-work/growth/guru-rank-1019/proto');
  const r = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: selected.length ? 900000 : 180000, maxBuffer: 4 * 1024 * 1024 });
  fs.writeFileSync(path.join(dir, entry + '.log'), (r.stdout || '') + (r.stderr || ''));
  results.push({ file: entry, code: r.status, error: r.error?.code });
  updates.set(entry, results.at(-1));
  fs.writeFileSync(path.join(dir, selected.length ? 'recheck.json' : 'results.json'), JSON.stringify(selected.length ? [...updates.values()] : results, null, 2) + '\n');
  console.log(`${results.length}/${entries.length} ${r.status === 0 ? '통과' : '실패'} ${entry}`);
}
console.log(`전체 ${entries.length}개 · 통과 ${results.filter(r => r.code === 0).length}개 · 실패 ${results.filter(r => r.code !== 0).length}개`);
if (selected.length && fs.existsSync(path.join(dir, 'results.json'))) {
  const initial = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
  const final = initial.map(r => updates.get(r.file) || r);
  fs.writeFileSync(path.join(dir, 'final.json'), JSON.stringify(final, null, 2) + '\n');
  console.log(`최종 ${final.length}개 · 통과 ${final.filter(r => r.code === 0).length}개 · 실패 ${final.filter(r => r.code !== 0).length}개`);
}
process.exitCode = results.some(r => r.code !== 0) ? 1 : 0;
