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

if (!ok || strays.length) process.exit(1);
