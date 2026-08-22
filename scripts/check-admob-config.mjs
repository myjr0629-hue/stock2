#!/usr/bin/env node
// ============================================================================
// check-admob-config — 코드의 게시자 ID 와 public/app-ads.txt 가 어긋나지 않았는지
// ----------------------------------------------------------------------------
// 애드몹 계정을 갈아탈 때 app-ads.txt 를 같이 안 고치면 «광고가 안 나온다».
// 증상이 조용해서(에러 없음) 며칠을 날린다. 그래서 기계가 대신 본다.
//   node scripts/check-admob-config.mjs
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const cfg = fs.readFileSync(path.join(ROOT, 'src/config/admob.ts'), 'utf8');
const pub = (cfg.match(/export const PUBLISHER = '([^']+)'/) || [])[1];
if (!pub) { console.error('✗ config/admob.ts 에서 PUBLISHER 를 못 찾았다'); process.exit(1); }

const txt = fs.readFileSync(path.join(ROOT, 'public/app-ads.txt'), 'utf8');
const bare = pub.replace('ca-app-', '');
const ok = new RegExp(`google\\.com,\\s*${bare},\\s*DIRECT`, 'i').test(txt);

console.log(`  코드 PUBLISHER   ${pub}`);
console.log(`  app-ads.txt      ${ok ? '일치 ✓' : '⚠️ 불일치'}`);

// 코드 어디에도 하드코딩된 pub 이 남아 있으면 안 된다
const strays = [];
for (const f of ['src/services/adManager.ts', 'src/app/[locale]/undercurrent/ads.ts', 'src/app/[locale]/wim/ads.ts']) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/ca-app-pub-\d+/.test(s)) strays.push(f);
}
console.log(`  하드코딩 잔재     ${strays.length ? '⚠️ ' + strays.join(', ') : '없음 ✓'}`);

for (const [name, f, key] of [
  ['UC', 'src/app/[locale]/undercurrent/ads.ts', 'ADS_LIVE'],
  ['WIM', 'src/app/[locale]/wim/ads.ts', 'WIM_ADS_LIVE'],
]) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = new RegExp(`export const ${key} = (true|false)`).exec(s);
  console.log(`  ${name.padEnd(6)} ${key.padEnd(13)} ${m ? m[1] : '?'}`);
}

// ── SIGNUM 은 마스터 스위치가 «없어서» 사고가 났다 (2026-08-18) ──────────────
// 유닛이 전부 null 인데 테스트 유닛으로 폴백해 라이브 앱에 "Test mode" 배너가
// 나갔다. 이제 adsAllowed() 가 그 자리를 메우므로, 그 관문이 init() 에 «실제로»
// 걸려 있는지 기계가 본다. 누가 지우면 여기서 걸린다.
const am = fs.readFileSync(path.join(ROOT, 'src/services/adManager.ts'), 'utf8');
const gated = /if \(!adsAllowed\('signum'\)\)/.test(am);
console.log(`  SIGNUM adsAllowed 관문  ${gated ? '있음 ✓' : '⚠️ 없음 — 테스트 광고가 프로덕션에 나갈 수 있다'}`);

// 실유닛 상태 — null 이면 «광고 없음»이 정상이고, 그게 의도인지 눈으로 확인시킨다
const nulls = ['signum', 'uc', 'wim'].filter((k) => new RegExp(`^\\s*${k}: null,`, 'm').test(cfg));
console.log(`  실유닛 미발급     ${nulls.length ? nulls.join(', ') + ' → 광고 요청 안 함' : '없음 (전부 발급됨)'}`);

// ── ★ 바이너리 안의 «앱 ID» 가 현재 게시자와 같은가 (2026-08-18) ─────────────
// 유닛 ID 만 보고 「웹 배포면 끝」이라고 적어뒀다가, 스토어의 바이너리 6개가
// 폐쇄된 계정의 앱 ID 를 들고 있는 걸 뒤늦게 발견했다. 기계가 대신 본다.
const APP_ID_FILES = [
  ['SIGNUM  android', 'android/app/build.gradle'],
  ['SIGNUM  ios    ', 'ios/App/App/Info.plist'],
  ['UC      android', 'uc-app/android/app/src/main/AndroidManifest.xml'],
  ['UC      ios    ', 'uc-app/ios/App/App/Info.plist'],
  ['WIM     android', 'wim-app/android/app/src/main/AndroidManifest.xml'],
  ['WIM     ios    ', 'wim-app/ios/App/App/Info.plist'],
];
let appIdBad = 0;
console.log('  ── 바이너리 앱 ID ──');
for (const [name, f] of APP_ID_FILES) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) { console.log(`  ${name}  ⚠️ 파일 없음 (${f})`); appIdBad++; continue; }
  const m = /ca-app-pub-\d+~\d+/.exec(fs.readFileSync(full, 'utf8'));
  const val = m ? m[0] : null;
  const good = val && val.startsWith(pub + '~');
  if (!good) appIdBad++;
  console.log(`  ${name}  ${val ?? '없음'} ${good ? '✓' : '⚠️ 게시자 불일치'}`);
}

if (!ok || strays.length || !gated || appIdBad) process.exit(1);
