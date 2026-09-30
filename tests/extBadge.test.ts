/**
 * 시간외 배지 공용 규칙 — src/utils/calcPriceDisplay.ts extBadgeFromQuote (2026-09-30 배포 점검 · 대표 «같은 지표는 같이 사용»)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extBadge.test.ts
 *
 * 지키는 것:
 *   1. 정규장: 그날 프리 종가는 «PRE CLOSE» — 운영 실측 행(9/29 ET 15:54 정규장 · /api/intel/fast ARM · /api/live/quotes AAPL) 그대로
 *   2. 프리장 «PRE»(등락 기준 = 시세 price = D-1 종가 — previousClose(D-2) 아님) · 애프터 «POST»(기준 = 오늘 종가) · 마감 POST
 *   3. 세션을 모르거나 시간외 가격이 없으면 null(라벨로 추측하지 않는다)
 *   4. Command(calcPriceDisplay 를 직접 부르는 곳)와 같은 라벨·값
 *   5. 라벨로 그리던 3곳(앱 Intel 펼친 종목 · 웹 SectorCommanderLog · 웹 MobileTickerDetail)이 공용 함수를 거친다(소스 확인)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calcPriceDisplay, extBadgeFromQuote } from '../src/utils/calcPriceDisplay';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 운영 실측(9/29 ET 15:54, 정규장) — 원문 그대로
const ARM_INTEL = { ticker: 'ARM', price: 295.23, changePct: 4.1118, prevClose: 283.33, extendedPrice: 288.645, extendedChangePct: 1.8759044224049688, extendedLabel: 'PRE', session: 'REG' };
const AAPL_QUOTE = { price: 329.78, previousClose: 338.4, prevClose: 338.4, changePercent: -2.55, extendedPrice: 337.075, extendedLabel: 'PRE', session: 'regular' };

console.log('━━━ 1. 정규장 — 프리 종가는 «PRE CLOSE» ━━━');
t('★ 인텔 행(ARM · session REG · 라벨 PRE) → «PRE CLOSE $288.645 +1.88%» — 예전 3곳은 «PRE» 로 그렸다', () => {
  const b = extBadgeFromQuote(ARM_INTEL, ARM_INTEL.session)!;
  assert.equal(b.label, 'PRE CLOSE');
  assert.equal(b.type, 'PRE_CLOSE');
  assert.equal(b.price, 288.645);
  near(b.pct, (288.645 / 283.33 - 1) * 100);
  assert.equal(b.pctKnown, true);
});
t('시세 행(AAPL · session regular · 라벨 PRE) → «PRE CLOSE» · 등락은 전일 종가(338.4) 대비 −0.39%', () => {
  const b = extBadgeFromQuote(AAPL_QUOTE, AAPL_QUOTE.session)!;
  assert.equal(b.label, 'PRE CLOSE');
  near(b.pct, (337.075 / 338.4 - 1) * 100);
});
t('실시간 갱신 뒤 행(원파이프가 이미 «PRE CLOSE» 로 바꾼 라벨)도 같은 배지', () => {
  assert.equal(extBadgeFromQuote({ ...ARM_INTEL, extendedLabel: 'PRE CLOSE' }, 'REG')!.label, 'PRE CLOSE');
});

console.log('━━━ 2. 프리·애프터·마감 ━━━');
t('★ 프리장 «PRE» — 등락 기준은 시세 price(D-1 종가 338.4) · previousClose(D-2 335)가 아니다(프리마켓 기준선 함정)', () => {
  const b = extBadgeFromQuote({ price: 338.4, previousClose: 335, extendedPrice: 340, extendedLabel: 'PRE' }, 'pre')!;
  assert.equal(b.label, 'PRE');
  assert.equal(b.type, 'PRE');
  near(b.pct, (340 / 338.4 - 1) * 100);
});
t('애프터 «POST» — 기준은 오늘 정규장 종가(시세 price 329.78) · 오늘 종가가 따로 있으면 그것', () => {
  const b = extBadgeFromQuote({ price: 329.78, previousClose: 338.4, extendedPrice: 331, extendedLabel: 'POST' }, 'post')!;
  assert.equal(b.label, 'POST');
  near(b.pct, (331 / 329.78 - 1) * 100);
  const c = extBadgeFromQuote({ price: 330.5, previousClose: 338.4, regularCloseToday: 329.78, extendedPrice: 331, extendedLabel: 'POST' }, 'POST')!;
  near(c.pct, (331 / 329.78 - 1) * 100);
});
t('장 마감(closed) 뒤의 애프터 종가 → «POST»', () => {
  assert.equal(extBadgeFromQuote({ price: 329.78, previousClose: 338.4, extendedPrice: 331, extendedLabel: 'POST' }, 'closed')!.label, 'POST');
});

console.log('━━━ 3. 그리지 않는 경우 ━━━');
t('세션을 모르면 null — 라벨로 추측하지 않는다', () => {
  assert.equal(extBadgeFromQuote(ARM_INTEL, null), null);
  assert.equal(extBadgeFromQuote(ARM_INTEL, ''), null);
  assert.equal(extBadgeFromQuote(ARM_INTEL, 'someday'), null);
});
t('시간외 가격·라벨이 없으면 null · 행이 없으면 null', () => {
  assert.equal(extBadgeFromQuote({ ...ARM_INTEL, extendedPrice: 0 }, 'REG'), null);
  assert.equal(extBadgeFromQuote({ ...ARM_INTEL, extendedLabel: '' }, 'REG'), null);
  assert.equal(extBadgeFromQuote(null, 'REG'), null);
  assert.equal(extBadgeFromQuote(undefined, 'REG'), null);
});
t('기준 종가를 모르면 등락은 «모름»(pctKnown false) — 화면은 등락을 그리지 않는다', () => {
  const b = extBadgeFromQuote({ extendedPrice: 288.645, extendedLabel: 'PRE' }, 'REG')!;
  assert.equal(b.label, 'PRE CLOSE');
  assert.equal(b.pctKnown, false);
});

console.log('━━━ 4. Command 와 같은 규칙 ━━━');
t('★ Command(calcPriceDisplay 직접 — 같은 입력)와 라벨·가격·등락이 같다', () => {
  const cmd = calcPriceDisplay({ session: 'REG', livePrice: 295.23, liveExtPrice: 288.645, liveExtLabel: 'PRE', prevRegularClose: 283.33 });
  const b = extBadgeFromQuote(ARM_INTEL, 'REG')!;
  assert.equal(b.label, cmd.activeExtLabel);
  assert.equal(b.price, cmd.activeExtPrice);
  near(b.pct, cmd.activeExtPct);
});

console.log('━━━ 5. 라벨로 그리던 3곳 — 공용 함수를 거친다(소스) ━━━');
t('★ 앱 Intel 펼친 종목 · 웹 SectorCommanderLog · 웹 MobileTickerDetail 이 extBadgeFromQuote 를 부르고, extendedLabel 을 그대로 그리지 않는다', () => {
  const root = path.join(__dirname, '..');
  const files: Array<[string, RegExp[]]> = [
    ['src/app/[locale]/app-view/intel/page.tsx', [/lq!?\.extendedLabel/, /tagText = isPre \? 'PRE' : 'POST'/]],
    ['src/components/intel/SectorCommanderLog.tsx', [/\{b\.extendedLabel\}/, /b\.extendedPrice > 0 &&/]],
    ['src/components/intel/mobile/MobileTickerDetail.tsx', [/\{q\.extendedLabel\}/, /hasExt = q\.extendedPrice > 0 && q\.extendedLabel/]],
  ];
  for (const [f, banned] of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(src.includes('extBadgeFromQuote('), `${f}: 공용 배지 함수를 부른다`);
    for (const re of banned) assert.equal(re.test(src), false, `${f}: 라벨로 고르던 줄(${re}) 이 남아 있다`);
  }
});

console.log(`\n${n}/${n} 통과`);
