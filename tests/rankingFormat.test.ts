/**
 * 랭킹 행 «오늘 vs 기준» 서식 — 지표별 유효숫자·단위 (2026-10-07, 앱 강화 0단계 T3)
 *
 * 옛 결함(운영 실측): `/api/ranking` 의 풋콜 비율 기준값은 1.52 인데 화면이 Math.round 로 «2» → 「SPY 풋콜 비율(미결제약정) · 0.85 vs 2 → 0.56×」
 *   (0.85÷2 = 0.43 이라 배수와 안 맞는다). 금액은 「50,698,303 vs 8,765,333」 단위·통화 없는 8자리.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/rankingFormat.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fmtCompact, fmtRankPair, fmtRankValue, fmtMoney, rankUnitOf } from '../src/lib/app/rankingFormat';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/** 옛 서식 그대로(회귀 증명용) */
const oldPair = (today: number, baseline: number) => `${Number(today).toLocaleString()} vs ${Math.round(baseline).toLocaleString()}`;

t('옛 서식은 기준값 1.52 를 «2» 로, 금액을 단위 없는 8자리로 보였다(시험이 결함을 잡는다는 증명)', () => {
  assert.equal(oldPair(0.85, 1.52), '0.85 vs 2');
  assert.equal(oldPair(50_698_303, 8_765_333), '50,698,303 vs 8,765,333');
});

t('풋콜 비율(pcr): 소수 둘째 자리 — «0.85 vs 1.52»', () => {
  assert.equal(fmtRankPair('pcr', 0.85, 1.52), '0.85 vs 1.52');
  assert.equal(fmtRankPair('pcr', 1.2, 1), '1.20 vs 1.00');
});

t('금액(totalPremium): $·K·M·B + 유효숫자 3자리 — «$50.7M vs $8.77M»', () => {
  assert.equal(fmtRankPair('totalPremium', 50_698_303, 8_765_333), '$50.7M vs $8.77M');
  assert.equal(fmtRankPair('totalPremium', 45_766_146, 9_950_310), '$45.8M vs $9.95M');   // 운영 CAT 행(10/6 마감)
  assert.equal(fmtRankPair('totalPremium', 1_250_000_000, 980_000_000), '$1.25B vs $980M');
  assert.equal(fmtRankPair('totalPremium', 512_711, 8_000), '$513K vs $8.00K');
});

t('수량(콜·풋 미결제약정·다크풀 체결량): K·M·B 압축, 통화 기호 없음', () => {
  assert.equal(fmtRankPair('totalCallOI', 2_650_000, 1_320_000), '2.65M vs 1.32M');
  assert.equal(fmtRankPair('totalPutOI', 62_060, 7_039), '62.1K vs 7.04K');
  assert.equal(fmtRankPair('shares', 29_952_908, 1_829_744), '30.0M vs 1.83M');   // 다크풀 체결량(운영 OPCH 행)
  assert.equal(fmtRankPair('mystery', 512, 40), '512 vs 40');                   // 모르는 지표는 수량 서식
});

t('단위 판정: pcr=비율 · totalPremium=금액 · 그 밖=수량 (서버 DEV_AXES 와 같은 키)', () => {
  assert.equal(rankUnitOf('pcr'), 'ratio');
  assert.equal(rankUnitOf('totalPremium'), 'money');
  for (const k of ['totalCallOI', 'totalPutOI', 'shares', undefined, null, '']) assert.equal(rankUnitOf(k as any), 'count');
});

t('압축 경계: 999.6K → «1.00M», 1,000 → «1.00K», 999 → «999», 음수·0·비유한 값', () => {
  assert.equal(fmtCompact(999_600), '1.00M');
  assert.equal(fmtCompact(1_000), '1.00K');
  assert.equal(fmtCompact(999), '999');
  assert.equal(fmtCompact(0), '0');
  assert.equal(fmtCompact(-45_766_146, '$'), '-$45.8M');
  assert.equal(fmtCompact(NaN), '—');
  assert.equal(fmtCompact(Infinity), '—');
  assert.equal(fmtCompact(1.5e12, '$'), '$1.50T');
});

t('값이 없으면 줄을 지어내지 않는다 — null / 숫자가 아닌 값', () => {
  assert.equal(fmtRankPair('pcr', null, 1.52), null);
  assert.equal(fmtRankPair('pcr', 0.85, undefined), null);
  assert.equal(fmtRankPair('pcr', 'abc', 1.52), null);
  assert.equal(fmtMoney(null), null);
  assert.equal(fmtMoney(undefined), null);
  assert.equal(fmtMoney(''), null);
  assert.equal(fmtMoney('x'), null);
  assert.equal(fmtRankValue('ratio', NaN), '—');
});

t('«오늘 ÷ 기준 = 배수» 가 눈으로 맞는다 — 표시된 두 값의 비가 API 배수와 ±0.02 이내(풋콜·금액·수량)', () => {
  const parse = (s: string): number => {
    const m = /^(-?)\$?([\d.]+)([KMBT]?)$/.exec(s)!;
    const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[3] as '' | 'K' | 'M' | 'B' | 'T'];
    return Number(m[2]) * mult * (m[1] ? -1 : 1);
  };
  const rows: Array<{ metric: string; today: number; baseline: number; ratio: number }> = [
    { metric: 'pcr', today: 0.85, baseline: 1.52, ratio: 0.56 },
    { metric: 'totalPremium', today: 45_766_146, baseline: 9_950_310, ratio: 4.599 },
    { metric: 'totalPremium', today: 62_823_240, baseline: 20_875_107, ratio: 3.009 },
    { metric: 'totalPremium', today: 166_572_045, baseline: 59_794_219, ratio: 2.786 },
    { metric: 'totalPremium', today: 353_218_120, baseline: 176_633_803.5, ratio: 2.0 },
    { metric: 'totalCallOI', today: 2_650_000, baseline: 1_320_000, ratio: 2.008 },
  ];
  for (const r of rows) {
    const [a, b] = fmtRankPair(r.metric, r.today, r.baseline)!.split(' vs ');
    const shown = parse(a) / parse(b);
    assert.ok(Math.abs(shown - r.ratio) <= Math.max(0.02, r.ratio * 0.01), `${r.metric} ${a} vs ${b} → ${shown.toFixed(3)} ≠ ${r.ratio}`);
  }
  // 옛 서식은 pcr 행에서 어긋났다: 0.85 ÷ 2 = 0.425
  assert.ok(Math.abs(0.85 / 2 - 0.56) > 0.1);
});

t('돈과 미결제 행: 콜·풋 프리미엄 — 옛 «$0.5M»(풋 $512,711)은 콜 $32.9M 과의 배수 64.11× 와 안 맞았다 → «$513K»', () => {
  assert.equal(fmtMoney(32_871_255), '$32.9M');
  assert.equal(fmtMoney(512_711), '$513K');
  const shown = 32.9e6 / 513e3;
  assert.ok(Math.abs(shown - 64.11) < 0.5, String(shown));
});

t('rankings/page.tsx: 옛 Math.round(baseline) 서식이 남아 있지 않다 · deviation 행은 지표(metric)를 넘긴다', () => {
  const src = read('src/app/[locale]/app-view/rankings/page.tsx');
  assert.equal(/Math\.round\(it\.baseline\)/.test(src), false);
  assert.equal(/Number\(it\.today\)\.toLocaleString\(\)/.test(src), false);
  assert.ok(src.includes('fmtRankPair(it.metric, it.today, it.baseline)'));
  assert.ok(src.includes("fmtRankPair('shares', it.today, it.baseline)"));
  assert.ok(src.includes("from '@/lib/app/rankingFormat'"));
});

console.log(`\n✅ rankingFormat: ${n}건 통과`);
