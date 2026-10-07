/**
 * 앱 Intel 섹터 카드의 «감마 펄스»·«관찰 한 줄» — src/lib/app/intelSectorFacts.ts (2026-10-07)
 *
 * 출발점(10/7 운영 실측): 카드의 «감마 펄스 +88»은 SECTOR_CONFIGS 에 박아 둔 상수였고(power_matrix +12 인데 실제 섹터 GEX 는 음수·7종목 중 6종목 숏 감마),
 *   «퀀트 코맨더 일지»는 섹터마다 고정된 문장이었다(원본 영어는 «Engine recommends 15% cash reservation»·«Maintain overweight stance. Momentum score hits 92»류 권유).
 *   → 둘 다 시세 행(GEX·순 프리미엄)에서 계산한다. 계산 근거가 없으면 null / 빈 줄(화면 «—»).
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/intelSectorFacts.test.ts
 */
import assert from 'node:assert/strict';
import {
  GAMMA_PULSE_MIN_NAMES, buildSectorObservation, formatGammaPulse, formatUsdCompact, gammaPulseTone, isMeasuredGex, sectorGammaPulse,
  type FactsLocale, type GammaPulse,
} from '../src/lib/app/intelSectorFacts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

// 운영 실측 2026-10-07 11:5x KST — GET /api/intel/fast-all (phase 2026-10-06:night) 의 섹터별 [ticker, gex, netPremium]
const LIVE_1007: Record<string, Array<[string, number, number]>> = {
  m7: [['AMZN', 86512440, 21819021], ['MSFT', -50699693.88, 12014338], ['TSLA', 96240521, 125465586], ['GOOGL', -55033450.69, 28186950], ['AAPL', 170328493, 10443267], ['NVDA', 486316180, 40330560], ['META', 76351737, 69221341]],
  physical_ai: [['PL', -2050942.55, 376023], ['SYM', -401608.87, 66010], ['RKLB', -7774857.35, 4414317], ['PLTR', -38472626.48, 16153187], ['ISRG', -365849.92, 254366], ['SERV', -1726122.18, 67978], ['TER', -1558105.26, -267692]],
  silicon_core: [['MRVL', 29655006, 43079383], ['AVGO', 35449480, 24054423], ['AMD', 33787510, 48060565], ['ARM', -4036200.07, 11642489], ['TSM', 49479692, 21261838], ['ASML', -1116592.06, -266031], ['MU', 11721084, 48574726]],
  power_matrix: [['CEG', -1324103.53, -12262], ['VST', -2316527.98, 12733897], ['CCJ', 61541.43, 1023075], ['PWR', -886100.1, 5346237], ['SMR', -2500585.97, 99647], ['GEV', -1542774.68, 7571107], ['ETN', -480671.15, 154505]],
  bio_pulse: [['REGN', 23188.55, 97895], ['LLY', 16603.76, 40065360], ['NVO', 94148.84, 57861], ['AMGN', -148463.85, 242919], ['VRTX', 460794.08, 24310], ['GILD', 1071069.12, 71948], ['VKTX', 895479.62, -191378]],
  cyber_shield: [['ZS', -4171111.13, 4646995], ['FTNT', -1318721.81, 1073142], ['PANW', 8985304, 70333035], ['CRWD', -6798603.51, 10726917], ['S', -4214523.72, 207153], ['OKTA', 2690343, 616224], ['NET', -766962.45, 3657842]],
  orbit_defense: [['ASTS', -2668670.69, 3665453], ['LUNR', -329176.65, 102255], ['AXON', 61428.45, 322327], ['LMT', -207231.08, 236567], ['SPCX', 109835968, 21298890], ['RTX', 152122.16, 6985], ['LDOS', 582251, -8874.0]],
  quantum_edge: [['DELL', 5339456, 9165710], ['AI', -62031519.3, 83236], ['IONQ', -2604698.42, 439571], ['SMCI', -45547197.26, 2663646], ['PATH', -2259844.67, 171274], ['SNOW', 6004683, 420342], ['TWLO', 2104020.58, -362767]],
  fintech_pulse: [['XYZ', 3172451, 83858.0], ['PYPL', -11432260.32, 158212], ['AFRM', -1340090.43, 467871], ['SOFI', -262962.86, -222831], ['COIN', 24222104, 5974638], ['HOOD', -17742581.29, 2446032], ['UPST', 1050897, 318304.0]],
  cloud_fortress: [['NOW', -5300760.04, 1681261], ['DDOG', 2918411, 2680842], ['MDB', -1900357.73, 761739], ['WDAY', -1335225.84, -102007], ['TEAM', 282715.45, 194518], ['HUBS', -532283, -115504], ['CRM', 2000123.48, 624066]],
};
const liveQuotes = (id: string) => LIVE_1007[id].map(([ticker, gex]) => ({ ticker, gex }));
const liveNetPremium = (id: string) => LIVE_1007[id].reduce((s, [, , np]) => s + np, 0);

// 같은 정의를 시험 안에서 «다시 한 번» 독립 구현(분모·부호 규칙 검산용)
function referencePct(gex: Array<number | null | undefined>): number | null {
  const m = gex.filter((g): g is number => typeof g === 'number' && Number.isFinite(g) && g !== 0);
  if (m.length < 3 || m.length * 2 < gex.length) return null;
  const sum = m.reduce((a, b) => a + b, 0);
  const abs = m.reduce((a, b) => a + Math.abs(b), 0);
  let p = Math.round((100 * sum) / abs);
  if (m.some((g) => g > 0) && m.some((g) => g < 0)) p = Math.max(-99, Math.min(99, p));
  return p === 0 ? 0 : p;
}

// 권유·매매·비중 조절 표현 — 앱 Intel 화면에 0개여야 하는 말(운영 세션 지정 목록 + 일본어·한글 변형)
const BANNED = /매수|매도|비중|권장|추천|권유|trigger|\bbuy|\bsell|overweight|underweight|allocation|recommend|accumulat|\bhold\b|買い|売り|推奨|オーバーウェイト|アンダーウェイト/i;

// ── 감마 펄스 ──────────────────────────────────────────────────────────────

t('운영 실측(10/7) 10개 섹터의 감마 펄스 — 박아 둔 상수(+88·+62·+12·−35·+45·−15·+5·−75·−42·+28)가 아니라 GEX 에서 계산된 값', () => {
  const expected: Record<string, number> = {
    m7: 79, physical_ai: -100, silicon_core: 94, power_matrix: -99, bio_pulse: 89,
    cyber_shield: -19, orbit_defense: 94, quantum_edge: -79, fintech_pulse: -4, cloud_fortress: -27,
  };
  for (const id of Object.keys(LIVE_1007)) {
    const p = sectorGammaPulse(liveQuotes(id));
    assert.ok(p, id);
    assert.equal(p!.pct, expected[id], `${id}: ${p!.pct}`);
    assert.equal(p!.pct, referencePct(liveQuotes(id).map((q) => q.gex)), `${id} 독립 계산과 일치`);
  }
});

t('옛 상수와 달리 power_matrix 는 음수다(실제 섹터 GEX −9.0M · 7종목 중 6종목 숏 감마) — 박아 둔 값은 +12 였다', () => {
  const p = sectorGammaPulse(liveQuotes('power_matrix'))!;
  assert.ok(p.pct < 0);
  assert.equal(p.long, 1);
  assert.equal(p.short, 6);
  assert.equal(p.measured, 7);
  assert.equal(p.tone, 'negative');
});

t('부호는 같은 카드의 GEX 합계 칸과 «항상» 같다 — 운영 10개 섹터 + 무작위 2,000 표본', () => {
  for (const id of Object.keys(LIVE_1007)) {
    const q = liveQuotes(id);
    const sum = q.reduce((s, x) => s + x.gex, 0);
    const p = sectorGammaPulse(q)!;
    assert.equal(Math.sign(p.pct), Math.sign(sum), id);
  }
  // 시드 고정 난수 — 반올림이 0 이 되는 경계는 부호 비교에서 제외(0 은 어느 쪽도 아니다)
  let x = 12345;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  for (let i = 0; i < 2000; i += 1) {
    const len = 3 + Math.floor(rnd() * 6);
    const q = Array.from({ length: len }, (_, k) => ({ ticker: `T${k}`, gex: (rnd() - 0.5) * 10 ** (3 + Math.floor(rnd() * 6)) }));
    const p = sectorGammaPulse(q);
    assert.ok(p);
    assert.ok(p!.pct >= -100 && p!.pct <= 100);
    const sum = q.reduce((s, y) => s + y.gex, 0);
    if (p!.pct !== 0) assert.equal(Math.sign(p!.pct), Math.sign(sum));
    assert.equal(p!.pct, referencePct(q.map((y) => y.gex)));
  }
});

t('못 잰 값(null·undefined·NaN·0·문자열)은 «측정 안 됨» — 0 으로 세지 않는다', () => {
  assert.equal(isMeasuredGex(null), false);
  assert.equal(isMeasuredGex(undefined), false);
  assert.equal(isMeasuredGex(NaN), false);
  assert.equal(isMeasuredGex(0), false);
  assert.equal(isMeasuredGex('5' as unknown as number), false);
  assert.equal(isMeasuredGex(-1), true);
  const q = [{ ticker: 'A', gex: 5 }, { ticker: 'B', gex: 7 }, { ticker: 'C', gex: 9 }, { ticker: 'D', gex: null }, { ticker: 'E', gex: 0 }, { ticker: 'F', gex: undefined }];
  // 6종목 중 3종목만 잼 → 3 ≥ 최소 3 이고 3×2 ≥ 6 → 계산됨, 못 잰 3종목은 분모에 들어가지 않는다(전부 롱 → +100)
  const p = sectorGammaPulse(q)!;
  assert.equal(p.measured, 3);
  assert.equal(p.pct, 100);
  // 7종목 중 3종목만 잼 → 절반 미만 → null
  assert.equal(sectorGammaPulse([...q, { ticker: 'G', gex: null }]), null);
});

t('표본이 모자라면 null(→ «—») — 3종목 미만 · 섹터 종목의 절반 미만 · 전부 못 잼 · 빈 입력', () => {
  assert.equal(GAMMA_PULSE_MIN_NAMES, 3);
  assert.equal(sectorGammaPulse([]), null);
  assert.equal(sectorGammaPulse(null), null);
  assert.equal(sectorGammaPulse(undefined), null);
  assert.equal(sectorGammaPulse([{ ticker: 'A', gex: 5 }, { ticker: 'B', gex: -5 }]), null, '2종목 → 최소 미달');
  assert.equal(sectorGammaPulse([{ ticker: 'A', gex: 5 }]), null);
  assert.equal(sectorGammaPulse(Array.from({ length: 7 }, (_, i) => ({ ticker: `T${i}`, gex: null }))), null);
  assert.equal(sectorGammaPulse(Array.from({ length: 7 }, (_, i) => ({ ticker: `T${i}`, gex: i < 3 ? 1e6 : null }))), null, '7종목 중 3종목 = 절반 미만');
  assert.ok(sectorGammaPulse(Array.from({ length: 7 }, (_, i) => ({ ticker: `T${i}`, gex: i < 4 ? 1e6 : null }))), '7종목 중 4종목 = 절반 이상');
});

t('롱·숏이 섞이면 ±100 으로 반올림돼도 ±99 로 묶는다 — «전부»라고 말하지 않는다 / 전부 같은 쪽이면 ±100', () => {
  const mixedUp = sectorGammaPulse([{ ticker: 'A', gex: 1e9 }, { ticker: 'B', gex: 1e9 }, { ticker: 'C', gex: -1 }])!;
  assert.equal(mixedUp.pct, 99);
  const mixedDown = sectorGammaPulse([{ ticker: 'A', gex: -1e9 }, { ticker: 'B', gex: -1e9 }, { ticker: 'C', gex: 1 }])!;
  assert.equal(mixedDown.pct, -99);
  assert.equal(sectorGammaPulse([{ ticker: 'A', gex: 3 }, { ticker: 'B', gex: 2 }, { ticker: 'C', gex: 1 }])!.pct, 100);
  assert.equal(sectorGammaPulse([{ ticker: 'A', gex: -3 }, { ticker: 'B', gex: -2 }, { ticker: 'C', gex: -1 }])!.pct, -100);
});

t('롱·숏 금액이 같으면 0 — «-0» 이 아니다', () => {
  const p = sectorGammaPulse([{ ticker: 'A', gex: 10 }, { ticker: 'B', gex: -10 }, { ticker: 'C', gex: 5 }, { ticker: 'D', gex: -5 }])!;
  assert.equal(p.pct, 0);
  assert.equal(Object.is(p.pct, -0), false);
  assert.equal(formatGammaPulse(p), '0');
  assert.equal(p.tone, 'neutral');
});

t('색 구간: +33 이상 positive · −33 이하 negative · 사이 neutral', () => {
  assert.equal(gammaPulseTone(100), 'positive');
  assert.equal(gammaPulseTone(33), 'positive');
  assert.equal(gammaPulseTone(32), 'neutral');
  assert.equal(gammaPulseTone(0), 'neutral');
  assert.equal(gammaPulseTone(-32), 'neutral');
  assert.equal(gammaPulseTone(-33), 'negative');
  assert.equal(gammaPulseTone(-100), 'negative');
});

t('카드 글자: 양수 «+79» · 음수 «-19» · 0 «0» · 못 잼 «—»', () => {
  assert.equal(formatGammaPulse(sectorGammaPulse(liveQuotes('m7'))), '+79');
  assert.equal(formatGammaPulse(sectorGammaPulse(liveQuotes('cyber_shield'))), '-19');
  assert.equal(formatGammaPulse(null), '—');
  assert.equal(formatGammaPulse(undefined), '—');
});

// ── 관찰 한 줄 ──────────────────────────────────────────────────────────────

const m7 = () => ({ netPremium: liveNetPremium('m7'), gamma: sectorGammaPulse(liveQuotes('m7')), leadTicker: 'NVDA' });

t('운영 m7 실측 → 세 언어 한 줄(순 프리미엄 · 콜 우위 · 롱 감마 5/7 · 주도 종목)', () => {
  assert.equal(buildSectorObservation(m7(), 'ko'), '순 프리미엄 +$307.5M · 콜 우위 · 롱 감마 5/7종목 · 주도 종목 NVDA');
  assert.equal(buildSectorObservation(m7(), 'en'), 'Net premium +$307.5M · call-side tilt · Long gamma 5/7 names · Lead name NVDA');
  assert.equal(buildSectorObservation(m7(), 'ja'), 'ネットプレミアム +$307.5M · コール優勢 · ロングガンマ 5/7銘柄 · 主導銘柄 NVDA');
});

t('운영 power_matrix 실측 → 숏 감마 6/7 (옛 고정 문장은 «Neutral positioning…wait for breakout»)', () => {
  assert.equal(buildSectorObservation({ netPremium: liveNetPremium('power_matrix'), gamma: sectorGammaPulse(liveQuotes('power_matrix')), leadTicker: 'CEG' }, 'ko'),
    '순 프리미엄 +$26.9M · 콜 우위 · 숏 감마 6/7종목 · 주도 종목 CEG');
});

t('순 프리미엄이 음수면 «풋 우위» / put-side / プット優勢', () => {
  assert.equal(buildSectorObservation({ netPremium: -1.25e9, gamma: null, leadTicker: null }, 'ko'), '순 프리미엄 -$1.3B · 풋 우위');
  assert.equal(buildSectorObservation({ netPremium: -450000, gamma: null, leadTicker: null }, 'en'), 'Net premium -$450K · put-side tilt');
  assert.equal(buildSectorObservation({ netPremium: -450000, gamma: null, leadTicker: null }, 'ja'), 'ネットプレミアム -$450K · プット優勢');
});

t('롱·숏 종목 수가 같으면 «3:3» 꼴로 — 어느 쪽 우위라고 말하지 않는다', () => {
  const g = sectorGammaPulse([{ ticker: 'A', gex: 4 }, { ticker: 'B', gex: -3 }, { ticker: 'C', gex: 2 }, { ticker: 'D', gex: -1 }, { ticker: 'E', gex: 5 }, { ticker: 'F', gex: -6 }])!;
  assert.equal(g.long, 3);
  assert.equal(g.short, 3);
  assert.equal(buildSectorObservation({ netPremium: null, gamma: g, leadTicker: null }, 'ko'), '롱·숏 감마 3:3');
  assert.equal(buildSectorObservation({ netPremium: null, gamma: g, leadTicker: null }, 'en'), 'Long/short gamma 3:3');
  assert.equal(buildSectorObservation({ netPremium: null, gamma: g, leadTicker: null }, 'ja'), 'ロング・ショートガンマ 3:3');
});

t('재료가 없으면 빈 문자열 — 지어낸 문장을 만들지 않는다(null·0·NaN·공백 종목명)', () => {
  for (const loc of ['ko', 'en', 'ja'] as FactsLocale[]) {
    assert.equal(buildSectorObservation({ netPremium: null, gamma: null, leadTicker: null }, loc), '');
    assert.equal(buildSectorObservation({ netPremium: 0, gamma: null, leadTicker: '' }, loc), '');
    assert.equal(buildSectorObservation({ netPremium: NaN, gamma: null, leadTicker: '   ' }, loc), '');
    assert.equal(buildSectorObservation({ netPremium: Infinity, gamma: null, leadTicker: null }, loc), '');
  }
});

t('있는 재료만 잇는다 — 주도 종목만 / 감마만 / 순 프리미엄만', () => {
  assert.equal(buildSectorObservation({ netPremium: null, gamma: null, leadTicker: 'NVDA' }, 'ko'), '주도 종목 NVDA');
  assert.equal(buildSectorObservation({ netPremium: 5e6, gamma: null, leadTicker: null }, 'en'), 'Net premium +$5.0M · call-side tilt');
  const g = sectorGammaPulse(liveQuotes('bio_pulse'))!;
  assert.equal(buildSectorObservation({ netPremium: null, gamma: g, leadTicker: null }, 'ko'), '롱 감마 6/7종목');
});

t('금액 약식은 카드 NET PREM 칸과 같은 글자 — +$307.5M · -$1.2B · +$12K · +$500', () => {
  assert.equal(formatUsdCompact(307481063), '+$307.5M');
  assert.equal(formatUsdCompact(-1.2e9), '-$1.2B');
  assert.equal(formatUsdCompact(12345), '+$12K');
  assert.equal(formatUsdCompact(500), '+$500');
  assert.equal(formatUsdCompact(0), '—');
  assert.equal(formatUsdCompact(NaN), '—');
});

t('출력 어디에도 권유·매매·비중 조절 표현이 없다 — 세 언어 × 운영 10개 섹터 × 부호·표본 조합 전수', () => {
  const lines: string[] = [];
  for (const loc of ['ko', 'en', 'ja'] as FactsLocale[]) {
    for (const id of Object.keys(LIVE_1007)) {
      for (const np of [liveNetPremium(id), -liveNetPremium(id), 0, null]) {
        for (const g of [sectorGammaPulse(liveQuotes(id)), null] as Array<GammaPulse | null>) {
          for (const lead of ['NVDA', null]) lines.push(buildSectorObservation({ netPremium: np, gamma: g, leadTicker: lead }, loc));
        }
      }
    }
    // 알 수 없는 로케일은 영어로
    lines.push(buildSectorObservation(m7(), 'xx' as FactsLocale));
  }
  assert.ok(lines.filter(Boolean).length > 400);
  for (const line of lines) assert.equal(BANNED.test(line), false, `금지어: ${line}`);
  // 숫자는 입력에서만 나온다 — 박아 둔 «92»·«15%»·«5%»·«2%» 같은 값이 새지 않는다
  for (const line of lines) assert.equal(/\b(92|15%|5%|2%)\b/.test(line), false, line);
});

console.log(`\n✅ intelSectorFacts: ${n}건 통과`);
