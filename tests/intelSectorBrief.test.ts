/**
 * 앱 Intel 섹터 «관찰 문장» — src/lib/app/intelSectorBrief.ts · src/lib/app/intelStockBrief.ts (2026-10-07, 앱 강화 정확성 3차)
 *
 * 출발점(10/7 운영 실측 · 대표 «정보는 빠르고 정확해야 … 조금의 버그 조금의 실수 없도록»):
 *   퀀텀 엣지 카드(칩 IONQ·RGTI·QBTS · W/L 3/0 · PCR 0.97 1/3)의 «AI 종합 판정»이 «세션 결과: 4↑ 3↓. 주도주 DELL(+3.93%), 약세 TWLO(-6.81%). 6/7 Long Gamma.
 *   PCR 평균 0.67 … 관전 포인트: AI Call Wall $11.5 근접», «핵심 촉매»가 «AI Put Floor $11 근접, 하방 지지 예상»·«TWLO Put Floor $272.5 근접, 하방 지지 예상» 이었다
 *   (서버 스냅샷 = 마감 시각에 «엔진 목록»(알파·웹 공용) 종목으로 만든 규칙 문장). 두 가지를 못 박는다:
 *   ① 글 속 종목 ⊂ 카드 종목 · 글 속 숫자 = 화면 행의 숫자  ② 앞일·전망·권유 표현 0건(trustLayer 예측어 사전 + 더 엄격한 템플릿 사전, 한·일·영 모든 분기).
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/intelSectorBrief.test.ts
 */
import assert from 'node:assert/strict';
import {
  applySectorBrief, buildSectorBrief, fmtChg1, fmtChg2, fmtGex, fmtLevel, fmtPrice, newsItemInConfig,
  MAX_CATALYSTS, NEAR_LEVEL_PCT, type BriefLocale, type BriefRow, type SectorBrief,
} from '../src/lib/app/intelSectorBrief';
import { getStockAnalyticalBrief, type StockBriefRow } from '../src/lib/app/intelStockBrief';
import { forecastHits } from '../src/lib/ai/trustLayer';
import { numbersInText, ungroundedNumbers } from '../src/lib/ai/factGrounding';
import { formatLevelPrice } from '../src/lib/optionLevelGate';
import { APP_SECTOR_STOCKS } from '../src/lib/app/intelSectorLists';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const LOCALES: BriefLocale[] = ['ko', 'en', 'ja'];

// 예측어 사전(trustLayer)보다 «엄격한» 템플릿 전용 사전 — 템플릿은 우리가 쓰는 글이라 «가능·예상·기대·해야» 류도 쓰지 않는다
const STRICT: Record<BriefLocale, RegExp> = {
  ko: /예상|전망|기대|가능성|가능하|가능한|가능$|수 있|것이다|할 것|될 것|예정|임박|반등|돌파 시|돌파시|확대될|이어질|지속될|해야 합니다|확인해야|필요합니다|권장|추천|매수|매도|비중|아직|곧/,
  en: /\b(?:expect(?:ed|s|ing)?|anticipat\w*|forecast\w*|predict\w*|likely|unlikely|possible|possibly|potential(?:ly)?|may|might|could|should|will|would|shall|going to|upside|downside|outlook|recommend\w*|buy|sell|yet|soon|next)\b/i,
  ja: /予想|予測|見込|期待|可能性|可能|でしょう|だろう|べき|見通し|今後|恐れ|推奨|買い|売り|まだ|次の/,
};
const textsOf = (b: SectorBrief): string[] => [b.headline, b.summary, b.outlook, ...b.bullets, ...b.catalysts];
function assertObservational(label: string, texts: string[], loc: BriefLocale) {
  for (const x of texts) {
    assert.equal(forecastHits(x, loc).length, 0, `${label} [${loc}] 예측어(trustLayer): ${x}`);
    assert.ok(!STRICT[loc].test(x), `${label} [${loc}] 예측어(엄격): ${x}`);
  }
}

// ── 운영 실측 10/7 15:2x KST(퀀텀 엣지 카드): 행 = 화면에 그려진 값 ──
const QUANTUM: BriefRow[] = [
  { sym: 'IONQ', changePct: 0.74, price: 43.29, gex: 5_730_000, pcr: 0.97, callWall: 45, putFloor: 42, rsi: 73, rvol: 1.0 },
  { sym: 'RGTI', changePct: 0.13, price: 15.17, gex: null, pcr: null, callWall: 16, putFloor: 14, rsi: 50, rvol: 0.9 },
  { sym: 'QBTS', changePct: 0.96, price: 15.79, gex: null, pcr: null, callWall: 17, putFloor: 15.5, rsi: 55, rvol: 1.1 },
];
const ENGINE_ONLY = ['DELL', 'TWLO', 'SMCI', 'AI', 'PATH', 'SNOW'];   // 엔진 목록에만 있는 퀀텀 종목 — 설정 목록 카드에는 없다

t('퀀텀 카드 — 글 속 종목은 카드 종목(IONQ·RGTI·QBTS)뿐, 엔진 목록 종목(DELL·TWLO …)은 0', () => {
  for (const loc of LOCALES) {
    const b = buildSectorBrief({ rows: QUANTUM, total: 3, avgChange: 0.61 }, loc)!;
    assert.ok(b);
    const all = textsOf(b).join('\n');
    for (const bad of ENGINE_ONLY) assert.ok(!new RegExp(`(?:^|[^A-Za-z])${bad}(?![A-Za-z])`).test(all), `${loc}: 엔진 목록 종목 ${bad} 노출`);
    for (const ok of ['IONQ', 'QBTS']) assert.ok(all.includes(ok), `${loc}: 카드 종목 ${ok} 없음`);
  }
});

t('퀀텀 카드 — 숫자 = 화면 값(W/L 3·0 · 평균 +0.6% · 종목 +0.96%·+0.13% · GEX +5.73M(1/3) · P/C 0.97(1/3))', () => {
  const ko = buildSectorBrief({ rows: QUANTUM, total: 3, avgChange: 0.61 }, 'ko')!;
  assert.equal(ko.headline, '3종목 전부 상승 — 평균 +0.6%, 최고 QBTS +0.96%');
  assert.equal(ko.summary, '상승 3·하락 0, 평균 +0.6%. 최고 QBTS +0.96%, 최저 RGTI +0.13%. GEX +5.73M(롱 감마 1·숏 감마 0, 1/3종목), P/C 0.97(균형, 1/3종목).');
  const en = buildSectorBrief({ rows: QUANTUM, total: 3, avgChange: 0.61 }, 'en')!;
  assert.equal(en.summary, '3 up, 0 down, average +0.6%. Highest QBTS +0.96%, lowest RGTI +0.13%. GEX +5.73M (long gamma 1 · short gamma 0, 1/3 names), P/C 0.97 (balanced, 1/3 names).');
  const ja = buildSectorBrief({ rows: QUANTUM, total: 3, avgChange: 0.61 }, 'ja')!;
  assert.equal(ja.summary, '上昇3・下落0、平均 +0.6%。最高 QBTS +0.96%、最低 RGTI +0.13%。GEX +5.73M(ロングガンマ 1・ショートガンマ 0、1/3銘柄)、P/C 0.97(均衡、1/3銘柄)。');
  // 옛 서버 문장의 숫자·말이 하나도 없다
  for (const loc of LOCALES) {
    const all = textsOf(buildSectorBrief({ rows: QUANTUM, total: 3, avgChange: 0.61 }, loc)!).join('\n');
    for (const old of ['4↑', '3↓', '3.93', '6.81', '6/7', '0.67', '11.5', '272.5']) assert.ok(!all.includes(old), `${loc}: 옛 숫자 ${old}`);
  }
});

t('센티먼트 — 같은 행에서 앱의 app-live 점수식(상승−하락 + 순 프리미엄 + GEX + P/C)', () => {
  // 퀀텀: (3−0)=3 + 순 프리미엄 0 + GEX 합 +1 + PCR 0.97(0.9~1.15 사이 0) = 4 → BULLISH
  assert.equal(buildSectorBrief({ rows: QUANTUM, total: 3 }, 'en')!.sentiment, 'BULLISH');
  const down: BriefRow[] = [{ sym: 'A', changePct: -1, price: 10, gex: -1e6, pcr: 1.3 }, { sym: 'B', changePct: -2, price: 10, gex: -2e6, pcr: 1.4 }];
  assert.equal(buildSectorBrief({ rows: down, total: 2 }, 'en')!.sentiment, 'BEARISH');
  const mixed: BriefRow[] = [{ sym: 'A', changePct: 1, price: 10 }, { sym: 'B', changePct: -1, price: 10 }];
  assert.equal(buildSectorBrief({ rows: mixed, total: 2 }, 'en')!.sentiment, 'NEUTRAL');
});

t('화면의 W/L 규칙과 같다 — 변동률 0 은 상승(≥0), 음수는 하락', () => {
  const rows: BriefRow[] = [{ sym: 'A', changePct: 0, price: 1 }, { sym: 'B', changePct: -0.5, price: 1 }, { sym: 'C', changePct: 0.2, price: 1 }];
  const b = buildSectorBrief({ rows, total: 3 }, 'ko')!;
  assert.ok(b.summary.startsWith('상승 2·하락 1'), b.summary);
});

t('«전부 상승/하락» 은 모든 행의 변동률이 측정되어 전부 양/음일 때만 — 변동률 0 이 섞이면 «상승 n · 하락 m»(화면 W/L 규칙은 ≥0 을 상승으로 센다)', () => {
  const flat: BriefRow[] = [{ sym: 'A', changePct: 0, price: 1 }, { sym: 'B', changePct: 0.4, price: 1 }];
  assert.equal(buildSectorBrief({ rows: flat, total: 2 }, 'ko')!.headline.startsWith('상승 2 · 하락 0'), true);
  assert.equal(buildSectorBrief({ rows: flat, total: 2 }, 'en')!.headline.startsWith('2 up · 0 down'), true);
  const allUp: BriefRow[] = [{ sym: 'A', changePct: 0.1, price: 1 }, { sym: 'B', changePct: 0.4, price: 1 }];
  assert.equal(buildSectorBrief({ rows: allUp, total: 2 }, 'ko')!.headline.startsWith('2종목 전부 상승'), true);
  const unmeasured: BriefRow[] = [{ sym: 'A', changePct: null, price: 1 }, { sym: 'B', changePct: 0.4, price: 1 }];
  assert.equal(buildSectorBrief({ rows: unmeasured, total: 2 }, 'ja')!.headline.startsWith('上昇2 · 下落0'), true);
  const allDown: BriefRow[] = [{ sym: 'A', changePct: -0.1, price: 1 }, { sym: 'B', changePct: -0.4, price: 1 }];
  assert.equal(buildSectorBrief({ rows: allDown, total: 2 }, 'en')!.headline.startsWith('All 2 down'), true);
});

t('표기 함수 = 화면 표기(종목 행 소수 둘째 · 헤더 평균 소수 첫째 · GEX B/M/K · 레벨 formatLevelPrice)', () => {
  assert.equal(fmtChg2(0.74), '+0.74%'); assert.equal(fmtChg2(-3.1), '-3.10%'); assert.equal(fmtChg2(0), '+0.00%');
  assert.equal(fmtChg1(0.61), '+0.6%'); assert.equal(fmtChg1(-0.94), '-0.9%');
  assert.equal(fmtGex(5_730_000), '+5.73M'); assert.equal(fmtGex(-25_140_000), '-25.14M'); assert.equal(fmtGex(1_460_000_000), '+1.46B'); assert.equal(fmtGex(-4500), '-4.50K');
  assert.equal(fmtPrice(43.29), '$43.29');
  for (const v of [42, 272.5, 11.5, 1062.5, 1234.567, 0.5, 100]) assert.equal(fmtLevel(v), `$${formatLevelPrice(v)}`, String(v));
});

// ── 모든 분기 전수(한·일·영) ───────────────────────────────────────────────────────────────
interface Scenario { name: string; rows: BriefRow[]; total: number; avg?: number | null }
const mk = (sym: string, over: Partial<BriefRow> = {}): BriefRow => ({ sym, changePct: 0.5, price: 100, gex: 1e6, pcr: 0.8, callWall: null, putFloor: null, rsi: 50, rvol: 1, netPremium: 0, ...over });
const SCENARIOS: Scenario[] = [
  { name: '전부 상승', rows: [mk('AAA', { changePct: 2.5 }), mk('BBB', { changePct: 0.4 }), mk('CCC', { changePct: 1.1 })], total: 3, avg: 1.33 },
  { name: '전부 하락', rows: [mk('AAA', { changePct: -2.5 }), mk('BBB', { changePct: -0.4 })], total: 2, avg: -1.45 },
  { name: '혼조', rows: [mk('AAA', { changePct: 2.5 }), mk('BBB', { changePct: -0.4 }), mk('CCC', { changePct: 0 })], total: 5, avg: 0.7 },
  { name: '한 종목', rows: [mk('AAA', { changePct: 1.2 })], total: 1, avg: 1.2 },
  { name: '옵션 지표 없음', rows: [mk('AAA', { gex: null, pcr: null }), mk('BBB', { gex: 0, pcr: 0 })], total: 2 },
  { name: 'GEX 만', rows: [mk('AAA', { pcr: null }), mk('BBB', { pcr: null, gex: -3e6 })], total: 2 },
  { name: 'PCR 만', rows: [mk('AAA', { gex: null, pcr: 1.5 }), mk('BBB', { gex: null, pcr: 1.1 })], total: 2 },
  { name: '풋 우위 PCR', rows: [mk('AAA', { pcr: 1.5 }), mk('BBB', { pcr: 1.4 })], total: 2 },
  { name: '콜 우위 PCR', rows: [mk('AAA', { pcr: 0.4 }), mk('BBB', { pcr: 0.5 })], total: 2 },
  { name: '일부 종목만 측정(2/4)', rows: [mk('AAA'), mk('BBB'), mk('CCC', { gex: null, pcr: null }), mk('DDD', { gex: null, pcr: null })], total: 4 },
  { name: '롱 숏 혼합', rows: [mk('AAA', { gex: 2e9 }), mk('BBB', { gex: -3e3 }), mk('CCC', { gex: 5e5 })], total: 3 },
  { name: '콜 월 근접', rows: [mk('AAA', { price: 100, callWall: 102 }), mk('BBB', { price: 50, callWall: 80 })], total: 2 },
  { name: '콜 월 위', rows: [mk('AAA', { price: 105, callWall: 100 })], total: 1 },
  { name: '풋 플로어 근접', rows: [mk('AAA', { price: 100, putFloor: 98 }), mk('BBB', { price: 100, putFloor: 60 })], total: 2 },
  { name: '풋 플로어 아래', rows: [mk('AAA', { price: 90, putFloor: 100 })], total: 1 },
  { name: '레벨 있으나 근접 없음', rows: [mk('AAA', { price: 100, callWall: 130, putFloor: 70 })], total: 1 },
  { name: 'RSI 과열·과매도', rows: [mk('AAA', { rsi: 74.6 }), mk('BBB', { rsi: 28.2 }), mk('CCC', { rsi: 69.9 })], total: 3 },
  { name: 'RVOL 높음·낮음', rows: [mk('AAA', { rvol: 2.34 }), mk('BBB', { rvol: 0.31 }), mk('CCC', { rvol: 1.2 })], total: 3 },
  { name: '촉매 4개 초과', rows: [mk('AAA', { price: 100, callWall: 101, putFloor: 99, rsi: 80, rvol: 3 }), mk('BBB', { price: 100, callWall: 101, putFloor: 99, rsi: 20, rvol: 0.2 })], total: 2 },
  { name: '큰 숫자(천 단위 레벨)', rows: [mk('AAA', { price: 1060, callWall: 1062.5, putFloor: 1000, gex: -9e9 })], total: 1 },
  { name: '변동률 일부 없음', rows: [mk('AAA', { changePct: null }), mk('BBB', { changePct: 1 })], total: 2 },
];

t(`모든 분기 × 한·일·영(${SCENARIOS.length}×3) — 예측어 0 · 엄격 사전 0 · 글 속 종목 ⊂ 입력 행`, () => {
  for (const sc of SCENARIOS) for (const loc of LOCALES) {
    const b = buildSectorBrief({ rows: sc.rows, total: sc.total, avgChange: sc.avg }, loc);
    assert.ok(b, `${sc.name} ${loc}: 문장 없음`);
    assertObservational(sc.name, textsOf(b!), loc);
    const syms = new Set(sc.rows.map((r) => r.sym));
    const all = textsOf(b!).join('\n');
    for (const m of all.matchAll(/(?:^|[^A-Za-z])([A-Z]{3,5})(?![A-Za-z])/g)) {
      if (['GEX', 'RSI', 'RVOL'].includes(m[1])) continue;
      assert.ok(syms.has(m[1]), `${sc.name} ${loc}: 행에 없는 종목 ${m[1]}`);
    }
    assert.ok(b!.catalysts.length >= 1 && b!.catalysts.length <= MAX_CATALYSTS, `${sc.name} ${loc}: 촉매 ${b!.catalysts.length}개`);
    assert.ok(b!.catalysts.every((c) => c.length > 0));
  }
});

t('모든 분기 × 한·일·영 — 글 속 숫자는 전부 입력 행에서 나온 값 + 규칙 상수(근접 3% · RSI 70/30 · RVOL 1.5/0.5)', () => {
  for (const sc of SCENARIOS) for (const loc of LOCALES) {
    const b = buildSectorBrief({ rows: sc.rows, total: sc.total, avgChange: sc.avg }, loc)!;
    const allowed: number[] = [NEAR_LEVEL_PCT, 70, 30, 1.5, 0.5, sc.total, sc.rows.length];
    const up = sc.rows.filter((r) => (r.changePct || 0) >= 0).length;
    allowed.push(up, sc.rows.length - up);
    for (let k = 0; k <= sc.rows.length; k++) allowed.push(k);   // 개수·n/N 표기
    if (sc.avg != null) allowed.push(Number(sc.avg.toFixed(1)));
    const meas = sc.rows.filter((r) => typeof r.changePct === 'number');
    if (sc.avg == null && meas.length) allowed.push(Number((meas.reduce((s, r) => s + (r.changePct as number), 0) / meas.length).toFixed(1)));
    for (const r of sc.rows) {
      if (typeof r.changePct === 'number') allowed.push(Number(r.changePct.toFixed(2)));
      if (r.price) allowed.push(Number(r.price.toFixed(2)));
      if (r.callWall) allowed.push(Number(r.callWall.toFixed(2)));
      if (r.putFloor) allowed.push(Number(r.putFloor.toFixed(2)));
      if (r.rsi) allowed.push(Math.round(r.rsi));
      if (r.rvol) allowed.push(Number(r.rvol.toFixed(1)));
      if (r.pcr && r.pcr > 0) allowed.push(Number(r.pcr.toFixed(2)));
    }
    const gexRows = sc.rows.filter((r) => typeof r.gex === 'number' && r.gex !== 0);
    if (gexRows.length) {
      const sum = gexRows.reduce((s, r) => s + (r.gex as number), 0);
      allowed.push(Number(fmtGex(sum).replace(/[^\d.]/g, '')));
    }
    const pcrRows = sc.rows.filter((r) => typeof r.pcr === 'number' && r.pcr > 0);
    if (pcrRows.length) allowed.push(Number((pcrRows.reduce((s, r) => s + (r.pcr as number), 0) / pcrRows.length).toFixed(2)));
    for (const x of textsOf(b)) {
      const bad = ungroundedNumbers(x, allowed);
      assert.deepEqual(bad, [], `${sc.name} ${loc}: 근거 없는 숫자 ${bad.join(',')} ← ${x}`);
    }
  }
});

t('다이제스트 줄 — 리포트 탭 렌더러(^[A-Z][A-Z0-9.-]{1,5} 를 종목 칸으로 떼고 앞 «-» 를 지운다)에서 부호가 지워지지 않는다', () => {
  const lead = /^([A-Z][A-Z0-9.-]{1,5})(?=\s|[:/|-])/;
  for (const sc of SCENARIOS) for (const loc of LOCALES) {
    const b = buildSectorBrief({ rows: sc.rows, total: sc.total, avgChange: sc.avg }, loc)!;
    for (const line of b.bullets) {
      const m = line.match(lead);
      if (!m) continue;
      const detail = line.slice(m[1].length).replace(/^[\s:/|-]+/, '');
      assert.ok(/^\d/.test(detail) || !/^[+-]/.test(line.slice(m[1].length).trim()), `${sc.name} ${loc}: 종목 뒤 부호가 지워진다 — ${line}`);
    }
  }
  // 음수 GEX 줄이 «GEX» 로 시작하지 않는다
  const neg = buildSectorBrief({ rows: [mk('AAA', { gex: -2.6e6 })], total: 1 }, 'ko')!;
  assert.ok(neg.bullets.some((x) => x.startsWith('감마 GEX -2.60M')), neg.bullets.join(' | '));
  assert.ok(buildSectorBrief({ rows: [mk('AAA', { gex: -2.6e6 })], total: 1 }, 'en')!.bullets.some((x) => x.startsWith('Gamma: GEX -2.60M')));
});

t('촉매 줄은 종목 하나로 시작한다(칩 표시) — 레벨 문장에서 현재가·레벨은 행의 값', () => {
  const b = buildSectorBrief({ rows: [mk('AAA', { price: 100, callWall: 102, putFloor: 98 })], total: 1 }, 'ko')!;
  assert.deepEqual(b.catalysts.slice(0, 2), ['AAA 콜 월 $102 근접 (현재가 $100.00, 3% 이내)', 'AAA 풋 플로어 $98 근접 (현재가 $100.00, 3% 이내)']);
  const en = buildSectorBrief({ rows: [mk('AAA', { price: 105, callWall: 100 })], total: 1 }, 'en')!;
  assert.equal(en.catalysts[0], 'AAA price $105.00 is above Call Wall $100');
  const ja = buildSectorBrief({ rows: [mk('AAA', { price: 90, putFloor: 100 })], total: 1 }, 'ja')!;
  assert.equal(ja.catalysts[0], 'AAA 現在値 $90.00 がプットフロア $100 の下');
  for (const loc of LOCALES) {
    const b2 = buildSectorBrief({ rows: SCENARIOS[18].rows, total: 2 }, loc)!;
    for (const c of b2.catalysts) assert.ok(/^[A-Z]{3,5}\b/.test(c) || c === '' , `${loc}: 종목으로 시작하지 않음: ${c}`);
  }
});

t('촉매가 비지 않는다(칸을 숨기지 않는다) — 근접·RSI·RVOL 이 없으면 주도 종목 한 줄 · 레벨이 있으나 근접이 없으면 «근접 종목 없음» 사실 한 줄', () => {
  const plain = buildSectorBrief({ rows: [mk('AAA', { changePct: 1.2 }), mk('BBB', { changePct: -0.3 })], total: 2 }, 'ko')!;
  assert.deepEqual(plain.catalysts, ['AAA +1.20% — 섹터 내 변동률 1위']);
  const far = buildSectorBrief({ rows: [mk('AAA', { price: 100, callWall: 130, putFloor: 70 })], total: 1 }, 'en')!;
  assert.deepEqual(far.catalysts, ['No name within 3% of a key option level (Call Wall, Put Floor)']);
});

t('행이 없거나 변동률이 하나도 없으면 null(서버 문장으로 메우지 않는다)', () => {
  for (const loc of LOCALES) {
    assert.equal(buildSectorBrief({ rows: [], total: 3 }, loc), null);
    assert.equal(buildSectorBrief({ rows: [mk('AAA', { changePct: null })], total: 1 }, loc), null);
  }
});

// ── applySectorBrief — 서버 스냅샷 리포트(엔진 목록)에 입히기 ───────────────────────────────
const ENGINE_REPORT = () => ({
  sentiment: 'BULLISH',
  verdict: '세션 결과: 4↑ 3↓. 주도주 DELL(+3.93%), 약세 TWLO(-6.81%). 감마 환경: 6/7 Long Gamma (변동성 억제). PCR 평균 0.67 → 강세 편향. 관전 포인트: AI Call Wall $11.5 근접.',
  catalysts: ['AI Call Wall $11.5 근접 (2.3%), 돌파 시 감마 스퀴즈 가능', 'AI Put Floor $11 근접 (2.1%), 하방 지지 예상', 'TWLO Put Floor $272.5 근접 (2.8%), 하방 지지 예상'],
  bullets: ['📈 주도주: DELL +3.93% 외 3종 상승', '🟢 PCR 평균 0.67 → 강세 편향. 콜 우위 — 상방 기대'],
  keyStocksData: QUANTUM.map((r) => ({ sym: r.sym, changePct: r.changePct, closePrice: r.price, gex: r.gex, pcr: r.pcr, callWall: r.callWall, putFloor: r.putFloor, rsi: r.rsi, rvol: r.rvol, netPremium: 0 })),
  reportHeadline: '4종 상승 vs 3종 하락 — 강세 편향 장세, 혼조 환경 관측',
  reportSummary: '세션 결과: 4↑ 3↓ …',
  dayOutlook: 'AI Call Wall $11.5 근접',
  newsDigest: ['SMCI 60B backlog'],
  briefingBullets: ['📈 주도주: DELL +3.93% 외 3종 상승'],
  riskNotes: ['TWLO Put Floor $272.5 근접 (2.8%), 하방 지지 예상'],
  newsItems: [{ tickers: ['SMCI'] }, { tickers: ['SNOW'] }, { tickers: ['IONQ'] }, { tickers: ['IONQ', 'DELL'] }, { tickers: [] }, {}],
  gainers: 4, losers: 3,
});

t('applySectorBrief — 서버 글(엔진 목록·옛 숫자·예측어)을 설정 목록 행에서 만든 글로 바꾼다 · 센티먼트 재계산 · 뉴스는 카드 종목만', () => {
  for (const loc of LOCALES) {
    const out = applySectorBrief(ENGINE_REPORT(), APP_SECTOR_STOCKS.quantum_edge, loc, 0.61);
    const all = [out.verdict, ...out.catalysts, ...out.bullets, out.reportHeadline, out.reportSummary, out.dayOutlook, ...(out.newsDigest || []), ...(out.briefingBullets || []), ...(out.riskNotes || [])].join('\n');
    for (const bad of [...ENGINE_ONLY, '4↑', '0.67', '11.5', '272.5', '하방 지지', '상방 기대', '돌파 시 감마']) assert.ok(!all.includes(bad), `${loc}: ${bad}`);
    assert.equal(out.verdict, out.reportSummary);
    assert.equal(out.sentiment, 'BULLISH');
    assert.deepEqual(out.newsItems, [{ tickers: ['IONQ'] }], `${loc}: 카드 종목 뉴스만`);
    assert.deepEqual(out.riskNotes, out.catalysts.slice(0, 3));
    assert.equal(out.dayOutlook, out.catalysts[0]);
    assertObservational('apply', [out.verdict, out.reportHeadline || '', out.dayOutlook || '', ...out.bullets, ...out.catalysts], loc);
  }
});

t('applySectorBrief — 행이 없으면 서버 글을 비운다(엔진 목록 종목을 말하는 글을 내보내지 않는다)', () => {
  const rep = { ...ENGINE_REPORT(), keyStocksData: [] as any[] };
  const out = applySectorBrief(rep, APP_SECTOR_STOCKS.quantum_edge, 'ko');
  assert.equal(out.verdict, ''); assert.deepEqual(out.catalysts, []); assert.equal(out.reportHeadline, ''); assert.equal(out.reportSummary, '');
  assert.deepEqual(out.bullets, []); assert.deepEqual(out.newsDigest, []); assert.deepEqual(out.riskNotes, []);
});

t('newsItemInConfig — 태그가 하나 이상이고 전부 카드 종목일 때만', () => {
  const cfg = new Set(['IONQ', 'RGTI']);
  assert.equal(newsItemInConfig({ tickers: ['IONQ'] }, cfg), true);
  assert.equal(newsItemInConfig({ tickers: ['ionq', 'RGTI'] }, cfg), true);
  assert.equal(newsItemInConfig({ tickers: ['IONQ', 'DELL'] }, cfg), false);
  assert.equal(newsItemInConfig({ tickers: [] }, cfg), false);
  assert.equal(newsItemInConfig(undefined, cfg), false);
});

t('10개 섹터 설정 목록 전체 — 각 섹터의 모든 종목 행 조합에서 글 속 종목 ⊂ 그 섹터 설정 목록', () => {
  for (const [id, list] of Object.entries(APP_SECTOR_STOCKS)) {
    const rows: BriefRow[] = list.map((sym, i) => mk(sym, { changePct: i % 2 ? -1.1 - i * 0.1 : 0.9 + i * 0.1, price: 50 + i, callWall: 51 + i, putFloor: 49 + i, rsi: i % 3 === 0 ? 75 : 45, rvol: i % 2 ? 0.4 : 1.8, gex: i % 2 ? -1e6 : 2e6 }));
    for (const loc of LOCALES) {
      const b = buildSectorBrief({ rows, total: list.length }, loc)!;
      const all = textsOf(b).join('\n');
      const found = [...all.matchAll(/(?:^|[^A-Za-z])([A-Z]{1,5})(?![A-Za-z])/g)].map((m) => m[1]).filter((x) => !['GEX', 'RSI', 'RVOL'].includes(x) && !/^[A-Z]$/.test(x) || list.includes(x));
      for (const s of found) assert.ok(list.includes(s), `${id} ${loc}: 목록 밖 종목 ${s}`);
      assertObservational(id, textsOf(b), loc);
    }
  }
});

// ── 종목 구조 해석(STRUCTURAL READ) 전 분기 ─────────────────────────────────────────────────
const stockVariants = (): StockBriefRow[] => {
  const base: StockBriefRow = { sym: 'IONQ', changePct: 0.74, closePrice: 43.29, gex: 5.7e6, pcr: 0.97, gammaRegime: 'LONG', maxPain: 43, callWall: 45, putFloor: 42, rsi: 73, rvol: 1.2, netPremium: 440_000, squeezeScore: 22, ivSkew: 1.05, impliedMovePct: 5.2, impliedMoveBasis: 'eod', impliedMoveSession: '2026-10-06', whaleIndex: 56, darkPoolPct: 12, liquidityScore: 45 };
  const out: StockBriefRow[] = [];
  for (const regime of ['LONG', 'SHORT', 'NEUTRAL', null, 'UNKNOWN']) {
    for (const gex of [5.7e6, -2e6, 0, null]) {
      for (const strong of [true, false]) {
        for (const lv of [true, false]) {
          for (const liq of [45, null]) {
            out.push({
              ...base, gammaRegime: regime, gex, netPremium: strong ? 440_000 : 0, whaleIndex: strong ? 70 : 10, liquidityScore: strong ? liq : (liq == null ? null : 20),
              callWall: lv ? 45 : 0, putFloor: lv ? 42 : 0, maxPain: lv ? 43 : 0,
              impliedMovePct: lv ? 5.2 : 0, impliedMoveBasis: lv ? 'eod' : null, squeezeScore: lv ? 22 : 0, ivSkew: lv ? 1.05 : 0, rsi: lv ? 73 : 0, rvol: lv ? 1.2 : 0,
            });
          }
        }
      }
    }
  }
  return out;
};

t(`종목 구조 해석 전 분기 × 한·일·영(${stockVariants().length}×3) — 예측어 0 · 엄격 사전 0 · 값이 없을 때 깨진 문장(NaN·undefined) 0`, () => {
  for (const row of stockVariants()) for (const loc of LOCALES) {
    const text = getStockAnalyticalBrief(row, loc);
    assert.ok(text.length > 20);
    assert.ok(!/NaN|undefined|null|\[object/.test(text), `${loc}: 깨진 값 ${text}`);
    assert.equal(forecastHits(text, loc).length, 0, `${loc} 예측어(trustLayer): ${text}`);
    assert.ok(!STRICT[loc].test(text), `${loc} 예측어(엄격): ${text}`);
  }
});

t('종목 구조 해석 — 옛 서버 문장(analysis_kr)의 앞일 서술은 어디에도 없다', () => {
  for (const row of stockVariants()) for (const loc of LOCALES) {
    const text = getStockAnalyticalBrief(row, loc);
    for (const bad of ['하방 지지', '감마스퀴즈 가능', '해석됩니다', '확대될 수', '확인하는 보조 신호', 'next volatility expansion', 'absorbing structure', '補助シグナル']) assert.ok(!text.includes(bad), `${loc}: ${bad}`);
  }
});

t('종목 구조 해석 — 값(현재가·변동·RSI·레벨)은 행에서 그대로', () => {
  const row = stockVariants()[0];
  const ko = getStockAnalyticalBrief({ ...row, gammaRegime: 'LONG', callWall: 45, putFloor: 42, maxPain: 43 }, 'ko');
  assert.ok(ko.startsWith('IONQ는 +0.74%, RSI 73, RVOL 1.2x 흐름입니다. Long Gamma 구조(딜러 헤지가 변동을 누르는 쪽)입니다.'), ko);
  assert.ok(ko.includes('풋플로어 $42와 콜월 $45') && ko.includes('현재가 $43.29는 맥스페인 $43 대비 +0.7% 위치입니다'), ko);
});

t('applySectorBrief 는 멱등 — 화면용 리포트를 다시 입혀도 같다(시세 병합 effect 가 화면용 리포트를 원본 상태에 되써도 흔들리지 않는다)', () => {
  for (const loc of LOCALES) {
    const once = applySectorBrief(ENGINE_REPORT(), APP_SECTOR_STOCKS.quantum_edge, loc, 0.61);
    const twice = applySectorBrief(once, APP_SECTOR_STOCKS.quantum_edge, loc, 0.61);
    assert.deepEqual(twice, once);
  }
});

t('페이지: reportData 는 «값 지문»(selectedQuotesSig)으로만 새로 만든다 — sharedData 객체를 의존성에 두지 않는다(요청 폭주 방지: 미리보기 실측 ERR_INSUFFICIENT_RESOURCES 14,807건)', () => {
  const page = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/app/[locale]/app-view/intel/page.tsx'), 'utf8') as string;
  assert.ok(/const selectedQuotesSig = selectedSectorQuotes\.map\(quoteValueSignature\)\.join\('\|'\);/.test(page));
  assert.ok(/viewReportForApp\(reportRaw, selectedSector, selectedSectorQuotes, appLocale\);[\s\S]{0,120}\}, \[reportRaw, selectedSector, selectedQuotesSig, appLocale\]\);/.test(page));
  assert.ok(!/\}, \[reportRaw, selectedSector, sharedData[,\]]/.test(page), 'reportData 메모가 sharedData 객체에 의존하면 매 렌더 새 객체가 된다');
  // 리포트 행에는 지금 시세를 입힌다(장마감 리포트 탭 카드의 GEX·P/C 가 스냅샷 시각의 다른 만기 범위 값으로 남지 않게)
  assert.ok(/const merged: SectorReportData = \{ \.\.\.report, keyStocksData: report\.keyStocksData\.map\(stock => mergeStockWithQuote\(stock, quoteMap\.get\(stock\.sym\)\)\) \};\s+const aligned = alignReportToConfig\(merged, sectorId, quotes\);/.test(page));
  // 서버 스냅샷 글·analysis_kr 은 앱 화면에 쓰지 않는다
  assert.ok(/const structuralBrief = getStockAnalyticalBrief\(stock, appLocale\);/.test(page));
  assert.ok(!/stock\.analysisKr \|\| getStockAnalyticalBrief/.test(page));
  assert.ok(/const cached = viewReportForApp\(reportCache\[sec\.id\] \|\| buildSectorReportFromQuotes\(sec\.id\), sec\.id, getSectorQuotes\(sec\.id\), appLocale\);/.test(page));
  assert.ok(/const cached = cachedRaw \? viewReportForApp\(cachedRaw, sec\.id, quotes, appLocale\) : undefined;/.test(page));
});

console.log(`\n${n} tests passed`);
