/**
 * 13F «기관 보유» 패널 — «제출 기관 N곳 기준 · 기준일» 표기 + summary 없는 응답 보정 (2026-10-07, 앱 강화 0단계 T7 표기)
 *
 * 진단(Lambda 로그 실측): signum-13f 주간 실행 9/20 = 3,831쪽·NVDA 5,937곳($1,804.6B) → 9/27 = 5쪽·22곳($0.4B) → 10/4 = 5쪽·24곳($0.7B).
 *   9/27·10/4 은 피드 호출이 5번만 성공해 «7/1~7/13 제출 초반 행»만으로 색인을 덮어썼다. 패널의 «Holders 24 · Total Value $743.6M · 1위 38%» 는 그 표본이다.
 *   또 원천이 Intrinio 인 종목(CUSIP 표에 없는 종목)은 응답에 summary 가 없어 패널이 «Holders 0 · $0 · Period —»(비중 0.0%)로 보였다.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/holdersBasis.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deriveHoldersSummary, holdersBasisLabel } from '../src/lib/app/holdersBasis';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

t('표기 문구(대표 지정): ko «제출 기관 N곳 기준 · 기준일 YYYY-MM-DD» · en · ja', () => {
  assert.equal(holdersBasisLabel('ko', 24, '2026-06-30'), '제출 기관 24곳 기준 · 기준일 2026-06-30');
  assert.equal(holdersBasisLabel('en', 24, '2026-06-30'), 'Based on 24 filing institutions · as of 2026-06-30');
  assert.equal(holdersBasisLabel('ja', 24, '2026-06-30'), '提出機関 24 社ベース · 基準日 2026-06-30');
  assert.equal(holdersBasisLabel('en', 1, '2026-06-30'), 'Based on 1 filing institution · as of 2026-06-30');
  assert.equal(holdersBasisLabel('ko', 5937, '2026-06-30'), '제출 기관 5,937곳 기준 · 기준일 2026-06-30');   // 완전한 색인이어도 같은 문장이 참이다
  assert.equal(holdersBasisLabel('fr', 3, '2025-12-31'), 'Based on 3 filing institutions · as of 2025-12-31');   // 모르는 언어는 영어
});

t('기준일을 모르면 앞부분만(날짜를 지어내지 않는다)', () => {
  assert.equal(holdersBasisLabel('ko', 24, null), '제출 기관 24곳 기준');
  assert.equal(holdersBasisLabel('ko', 24, ''), '제출 기관 24곳 기준');
  assert.equal(holdersBasisLabel('ko', 24, 'Q2 2026'), '제출 기관 24곳 기준');
  assert.equal(holdersBasisLabel('ja', 24, undefined), '提出機関 24 社ベース');
});

t('summary 가 있으면(Redis 색인 원천) 그대로 — 10/7 운영 NVDA: 24곳 · $743.6M · 2026-06-30', () => {
  const holders = [{ marketValue: 282_627_089, period: '2026-06-30' }, { marketValue: 120_000_000, period: '2026-06-30' }];
  const s = deriveHoldersSummary({ totalHolders: 24, totalValue: 743_600_000, period: '2026-06-30' }, holders);
  assert.deepEqual(s, { totalHolders: 24, totalValue: 743_600_000, period: '2026-06-30' });
});

t('summary 가 없으면(Intrinio 원천) «0곳 · $0 · —» 대신 목록 기준 합계로 보정한다', () => {
  const holders = [
    { marketValue: 13_260_000_000, period: '2025-12-31' },
    { marketValue: 8_180_000_000, period: '2025-12-31' },
    { marketValue: 8_040_000_000, period: '2025-12-31' },
  ];
  const s = deriveHoldersSummary(null, holders, { totalHolders: 109, period: '2025-12-31' });
  assert.equal(s.totalHolders, 3, '분모는 목록에 실린 기관(응답의 totalHolders 는 요청 상한에 걸린 수)');
  assert.equal(s.totalValue, 29_480_000_000);
  assert.equal(s.period, '2025-12-31');
  // 비중 합계가 100% 가 된다(옛 화면은 전부 0.0%)
  const w = holders.map((h) => (h.marketValue / s.totalValue) * 100);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.equal(holdersBasisLabel('ko', s.totalHolders, s.period), '제출 기관 3곳 기준 · 기준일 2025-12-31');
});

t('summary 의 기준일이 없으면 목록 첫 행 → 응답 최상위 period 순으로 채운다', () => {
  assert.equal(deriveHoldersSummary({ totalHolders: 5, totalValue: 10, period: null }, [{ marketValue: 1, period: '2026-03-31' }]).period, '2026-03-31');
  assert.equal(deriveHoldersSummary(null, [{ marketValue: 1 }], { period: '2025-09-30' }).period, '2025-09-30');
  assert.equal(deriveHoldersSummary(null, [], undefined).period, null);
  assert.deepEqual(deriveHoldersSummary(undefined, [], undefined), { totalHolders: 0, totalValue: 0, period: null });
});

t('MobileCmd13F: 표기·보정은 «앱»(locale 을 넘길 때)만 — 웹 MobileCmd13FOnly 는 locale 이 없어 화면 불변', () => {
  const src = read('src/components/intel/mobile/MobileCmd13F.tsx');
  assert.ok(src.includes('const appMode = locale !== undefined;'));
  assert.ok(src.includes('appMode ? deriveHoldersSummary(summary, holders, top ?? undefined) : summary'), '웹은 옛 summary 그대로');
  assert.ok(src.includes('{appMode && ('), '표기 줄은 앱에서만');
  assert.ok(src.includes('holdersBasisLabel(locale, sum?.totalHolders ?? 0, sum?.period)'));
  // 앱 래퍼(MobileCmd13F)는 locale 을 넘기고, 웹용 단독 내보내기(MobileCmd13FOnly)는 넘기지 않는다
  assert.ok(src.includes('<Mobile13FContent ticker={ticker} locale={locale} />'));
  assert.ok(/export function MobileCmd13FOnly\(\{ ticker \}: \{ ticker: string \}\) \{\s*return <Mobile13FContent ticker=\{ticker\} \/>;/.test(src));
});

t('앱 cmd 화면은 locale 을 넘기는 MobileCmd13F 를 쓰고, 웹 MobileCommandPage 는 locale 없는 MobileCmd13FOnly 를 쓴다', () => {
  assert.ok(read('src/app/[locale]/app-view/cmd/page.tsx').includes('<MobileCmd13F ticker={data.ticker} locale={locale} />'));
  assert.ok(read('src/components/intel/mobile/MobileCommandPage.tsx').includes('<MobileCmd13FOnly ticker={effectiveQuote.ticker} />'));
});

console.log(`\n✅ holdersBasis: ${n}건 통과`);
