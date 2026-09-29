/**
 * 웹 watchlist 레벨 숫자 — 공용 formatLevelPrice(lib/optionLevelGate) · 2026-09-30
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/webWatchlistLevels.test.ts
 *
 * 지키는 것:
 *   1. 행사가·레벨을 반올림하지 않는다 — 337.5 는 «$337.5»(예전 toFixed(0) 은 «$338», 없는 행사가)
 *   2. 웹 watchlist 두 화면(MobileWatchlistTabs · WatchlistClientPage)의 감마 플립·맥스 페인 칸·말풍선·신호 문장이 공용 함수를 쓴다(소스)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatLevelPrice } from '../src/lib/optionLevelGate';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('━━━ 1. 숫자 — 반올림하지 않는다 ━━━');
t('★ 337.5 → «337.5»(예전 «338») · 437.5(TSM 맥스 페인 9/29) · 0.5 · 230.42(감마 플립) · 1100 · 2.25', () => {
  assert.deepEqual([337.5, 437.5, 0.5, 230.42, 1100, 2.25].map(formatLevelPrice), ['337.5', '437.5', '0.5', '230.42', '1100', '2.25']);
  assert.notEqual(formatLevelPrice(337.5), (337.5).toFixed(0), '예전 표기와 다르다');
});
t('값이 없으면 «—»(NaN) — 신호 문장·말풍선이 «$undefined» 를 쓰지 않는다', () => {
  assert.equal(formatLevelPrice(Number(undefined)), '—');
  assert.equal(formatLevelPrice(NaN), '—');
});

console.log('━━━ 2. 웹 watchlist 가 공용 함수를 쓴다(소스) ━━━');
t('★ MobileWatchlistTabs · WatchlistClientPage — 감마 플립·맥스 페인에 toFixed(0) 이 남지 않았다 · formatLevelPrice 를 가져다 쓴다', () => {
  const root = path.join(__dirname, '..');
  const files = ['src/app/[locale]/watchlist/MobileWatchlistTabs.tsx', 'src/app/[locale]/watchlist/WatchlistClientPage.tsx'];
  const banned = [
    /gammaFlipLevel\??\.toFixed\(0\)/,
    /maxPain\??\.toFixed\(0\)/,
    /\$\$\{value\.toFixed\(0\)\}/,          // 감마 플립 말풍선 «$${value.toFixed(0)}»
    />\$\{value\.toFixed\(0\)\}</,          // 감마 플립 칸 «${value.toFixed(0)}»
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(src.includes("import { formatLevelPrice } from '@/lib/optionLevelGate'"), `${f}: 공용 함수를 가져온다`);
    for (const re of banned) assert.equal(re.test(src), false, `${f}: ${re} 이 남아 있다`);
  }
});

console.log(`\n${n}/${n} 통과`);
