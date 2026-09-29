/**
 * «내 종목» 행 판정 시험 — src/lib/app/watchlistInsights.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistInsights.test.ts
 *
 * 출발점: 9/28 운영 watchlist/batch?mode=price 실측(9/29 KST 조회)
 *   MU  S=1053.98 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530 · 맥스페인 970
 *   TSLA S=357.45 풋플로어 200·감마플립 300 · NVDA S=228.86 콜월 220(현재가 아래)
 *   AAPL S=338.4 콜월 345·풋플로어 330·감마플립 337.5·맥스페인 330 (정상)
 *   NKE  S=36.39 풋플로어 38.5(현재가 위)
 * 정의: 콜월 (S, 1.2S] · 풋플로어 [0.8S, S) · 감마플립 ±15% · 맥스페인 ±20%
 */
import assert from 'node:assert/strict';
import {
  checkLevels, levelViolations, expectedChainDate, lastCompletedSession, isStaleDate, mapGeometry,
  maxPainLabelFits, selectInsights, segText, fmtLevel, fmtPrice, fmtSignedPct, fmtUsdCompact,
  priceBasis, priceBasisLabel, tradingDaysUntil, daysBetween, etDateOf, chipsForPlan, chipKindLabel,
  type InsightInput, type LevelsVerdict,
} from '../src/lib/app/watchlistInsights';
import { WATCHLIST_CHIP_TIERING } from '../src/lib/app/watchlistFlags';
import { WL_COPY } from '../src/components/app/watchlist/copy';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const sorted = (xs: string[]) => [...xs].sort();
// ET = UTC-4 (9월 서머타임)
const et = (ymd: string, hh: number, mm = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-04:00`);

console.log('━━━ 1. 정의 검사 — 9/28 운영 실측값 ━━━');
t('MU: 콜월·풋플로어·감마플립 셋 다 위반(맥스페인 970 은 ±20% 안)', () => {
  assert.deepEqual(sorted(levelViolations({ callWall: 1000, putFloor: 60, gammaFlipLevel: 530, maxPain: 970 }, 1053.98)),
    ['callWall', 'gammaFlipLevel', 'putFloor']);
});
t('TSLA: 풋플로어 200·감마플립 300 위반 → 지도 숨김(정의)', () => {
  const v = checkLevels({ price: 357.45, callWall: 400, putFloor: 200, gammaFlipLevel: 300, maxPain: 370 }, et('2026-09-28', 20));
  assert.equal(v.ok, false);
  assert.equal((v as any).reason, 'definition');
  assert.deepEqual(sorted((v as any).bad), ['gammaFlipLevel', 'putFloor']);
});
t('NVDA: 콜월 220 이 현재가 228.86 아래 → 위반(한 값이라도 어기면 한 벌 전부 버린다)', () => {
  const v = checkLevels({ price: 228.86, callWall: 220, putFloor: 200, gammaFlipLevel: 210, maxPain: 215 }, et('2026-09-28', 20));
  assert.equal(v.ok, false);
  assert.deepEqual((v as any).bad, ['callWall']);
});
t('NKE: 풋플로어 38.5 가 현재가 36.39 위 → 위반', () => {
  const v = checkLevels({ price: 36.39, callWall: 40, putFloor: 38.5, gammaFlipLevel: 41, maxPain: 39.5 }, et('2026-09-28', 20));
  assert.equal(v.ok, false);
});
t('AAPL: 정상 → 지도를 그린다', () => {
  const v = checkLevels({ price: 338.4, callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 }, et('2026-09-28', 20));
  assert.deepEqual(v, { ok: true, S: 338.4, pf: 330, mp: 330, cw: 345, gf: 337.5, chainDate: null });
});
t('경계: 콜월 정확히 1.2S · 풋플로어 정확히 0.8S 는 통과, 콜월 = S 는 위반', () => {
  assert.deepEqual(levelViolations({ callWall: 120, putFloor: 80 }, 100), []);
  assert.deepEqual(levelViolations({ callWall: 100 }, 100), ['callWall']);
  assert.deepEqual(levelViolations({ putFloor: 100 }, 100), ['putFloor']);
  assert.deepEqual(levelViolations({ callWall: 120.01 }, 100), ['callWall']);
});
t('맥스페인 ±20%(서버 35% 보다 엄격): 121 위반 · 119 통과', () => {
  assert.deepEqual(levelViolations({ maxPain: 121 }, 100), ['maxPain']);
  assert.deepEqual(levelViolations({ maxPain: 119 }, 100), []);
});
t('감마플립 ±15%: 116 위반 · 85 통과 · 없으면 판단하지 않는다(지도는 그린다)', () => {
  assert.deepEqual(levelViolations({ gammaFlipLevel: 116 }, 100), ['gammaFlipLevel']);
  assert.deepEqual(levelViolations({ gammaFlipLevel: 85 }, 100), []);
  const v = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, gammaFlipLevel: null }, et('2026-09-28', 20));
  assert.equal(v.ok, true);
  assert.equal((v as any).gf, null);
});
t('값이 비면 missing · 가격이 없으면 no-price · 0·음수·문자열은 «없음»', () => {
  assert.equal((checkLevels({ price: 100, callWall: 110, putFloor: null, maxPain: 100 }, 0) as any).reason, 'missing');
  assert.equal((checkLevels({ price: 0, callWall: 110, putFloor: 90, maxPain: 100 }, 0) as any).reason, 'no-price');
  assert.equal((checkLevels({ price: 100, callWall: -1, putFloor: 90, maxPain: 100 }, 0) as any).reason, 'missing');
});
t('서버 수리 이후 응답: levelsSource 가 structure 가 아니면 쓰지 않는다', () => {
  const base = { price: 100, callWall: 110, putFloor: 90, maxPain: 100, hasLevelsMeta: true };
  assert.equal((checkLevels({ ...base, levelsSource: null }, 0) as any).reason, 'source');
  assert.equal(checkLevels({ ...base, levelsSource: 'structure' }, 0).ok, true);
});

console.log('━━━ 2. 신선도(체인 판본 날짜) ━━━');
t('화 10:00 ET → 월 판본 필요 · 금 판본은 오래됨', () => {
  const now = et('2026-09-29', 10);
  assert.equal(expectedChainDate(now), '2026-09-28');
  assert.equal(isStaleDate('2026-09-25', now), true);
  assert.equal(isStaleDate('2026-09-28', now), false);
  const v = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, levelsChainDate: '2026-09-25' }, now);
  assert.equal((v as any).reason, 'stale');
});
t('장 마감 직후(한국 아침)엔 직전 판본을 허용 — 매일 저녁 지도가 사라지지 않게', () => {
  assert.equal(expectedChainDate(et('2026-09-29', 17)), '2026-09-28');
  assert.equal(expectedChainDate(et('2026-09-29', 23, 50)), '2026-09-28');
  assert.equal(expectedChainDate(et('2026-09-30', 1)), '2026-09-28', 'ET 06:00 전은 전날로 본다(벌크 적재 03:30)');
  assert.equal(expectedChainDate(et('2026-09-30', 7)), '2026-09-29');
});
t('월 07:00 → 금 판본 · 목 판본은 오래됨(«월요일 오전 57시간» 사례)', () => {
  const now = et('2026-09-28', 7);
  assert.equal(expectedChainDate(now), '2026-09-25');
  assert.equal(isStaleDate('2026-09-24', now), true);
});
t('주말·휴장: 토요일 → 금 · 노동절(9/7 월) → 9/4 금', () => {
  assert.equal(expectedChainDate(et('2026-10-03', 12)), '2026-10-02');
  assert.equal(expectedChainDate(et('2026-09-07', 12)), '2026-09-04');
});
t('마지막으로 끝난 세션: 월 17:00 → 월 · 월 15:00 → 금 · 토 → 금', () => {
  assert.equal(lastCompletedSession(et('2026-09-28', 17)), '2026-09-28');
  assert.equal(lastCompletedSession(et('2026-09-28', 15)), '2026-09-25');
  assert.equal(lastCompletedSession(et('2026-10-03', 10)), '2026-10-02');
});
t('ET 자정 경계(24시 표기 함정) — 00:30 ET 는 그날 날짜', () => {
  assert.equal(etDateOf(et('2026-09-30', 0, 30)), '2026-09-30');
});
t('가격 기준 라벨: 장중 → «장중» · 장 마감 뒤 → «9/28(월) 종가» · 짧은 꼴 «9/28 종가»', () => {
  const b = priceBasis('closed', et('2026-09-28', 20));
  assert.deepEqual(b, { kind: 'close', date: '2026-09-28' });
  assert.equal(priceBasisLabel(b, 'ko'), '9/28(월) 종가');
  assert.equal(priceBasisLabel(b, 'ko', true), '9/28 종가');
  assert.equal(priceBasisLabel(b, 'ja'), '9/28(月) 終値');
  assert.equal(priceBasisLabel(b, 'en'), 'Mon 9/28 close');
  const pre = priceBasis('pre', et('2026-09-29', 7));
  assert.equal(pre.date, '2026-09-28', '프리마켓 가격은 직전 세션 종가다');
  assert.equal(priceBasis('reg', et('2026-09-29', 11)).kind, 'live');
});

console.log('━━━ 3. 지도 기하 · 맥스페인 숫자 겹침 ━━━');
t('MU 시안 값: 풋플로어 900 · 맥스페인 970 · 종가 1053.98 · 콜월 1100 → 35% · 77%', () => {
  const g = mapGeometry({ S: 1053.98, pf: 900, mp: 970, cw: 1100 });
  assert.equal(g.mp.toFixed(4), '0.3500');
  assert.equal(g.px.toFixed(4), '0.7699');
  assert.equal(g.segFrom, 'left');
  assert.equal(g.mpClamped, false);
});
t('META: 가격이 맥스페인 왼쪽 → 금색 띠는 오른쪽(맥스페인)에서 짙다', () => {
  const g = mapGeometry({ S: 718.11, pf: 700, mp: 740, cw: 780 });
  assert.equal(g.segFrom, 'right');
  assert.equal(g.px.toFixed(4), '0.2264');
});
t('맥스페인이 [풋플로어, 콜월] 밖이면 끝에 붙이고 표시한다', () => {
  const g = mapGeometry({ S: 100, pf: 95, mp: 90, cw: 110 });
  assert.equal(g.mp, 0);
  assert.equal(g.mpClamped, true);
});
t('겹침: 375폭(지도 99px)에서도 AAPL 335 는 들어가고, 끝 숫자에 붙으면 숨긴다', () => {
  assert.equal(maxPainLabelFits(99, 0.6, '320', '335', '345'), true);
  assert.equal(maxPainLabelFits(126, 0.35, '900', '970', '1,100'), true);
  assert.equal(maxPainLabelFits(99, 0.12, '320', '325', '345'), false);
  assert.equal(maxPainLabelFits(99, 0.9, '320', '342', '345'), false);
});

console.log('━━━ 4. 인사이트 칩 — 순서·무료 1·PRO 2·지어내지 않기 ━━━');
const NOW = et('2026-09-28', 20);                 // 9/29 KST 09:00
const good = (S: number, lv: { pf: number; mp: number; cw: number; gf?: number | null }): LevelsVerdict =>
  checkLevels({ price: S, putFloor: lv.pf, maxPain: lv.mp, callWall: lv.cw, gammaFlipLevel: lv.gf ?? null }, NOW);
const base = (over: Partial<InsightInput>): InsightInput => ({
  price: 100, changePct: 0, levels: { ok: false, reason: 'missing' },
  todayLocal: '2026-09-29', nowMs: NOW, ...over,
});
t('실적 D-1 → 1순위 · 날짜·발표 시각만(옵션 ± 없음) · 긴 문장/짧은 문장', () => {
  const chips = selectInsights(base({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 1);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, 'earnings');
  assert.equal(segText(chips[0].long), '실적 D-1 · 9/30 장 마감 후');
  assert.equal(segText(chips[0].short), '실적 D-1 · 9/30');
  const en = selectInsights(base({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'en', 1);
  assert.equal(segText(en[0].long), 'Earnings D-1 · 9/30 after close');
  const ja = selectInsights(base({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ja', 1);
  assert.equal(segText(ja[0].long), '決算 D-1 · 9/30 引け後');
  const today = selectInsights(base({ earnings: { date: '2026-09-29', hour: 'bmo' } }), 'ko', 1);
  assert.equal(segText(today[0].long), '실적 오늘 · 9/29 장 시작 전');
});
t('★ 묶음 API 의 impliedMovePct(= 벽 사이 폭)는 입력에 넣어도 칩에 «옵션 ±»로 나오지 않는다', () => {
  // 9/28 실측 MU: 묶음 값 9.0(= (콜월 − 풋플로어) ÷ 가격) vs 실제 10/2 만기 스트래들 ±7.9%
  const c = selectInsights({ ...base({ earnings: { date: '2026-09-30', hour: 'amc' } }), impliedMovePct: 9.0 } as InsightInput, 'ko', 2);
  for (const x of c) {
    assert.ok(!segText(x.long).includes('±'), segText(x.long));
    assert.ok(!segText(x.short).includes('±'), segText(x.short));
    assert.ok(!segText(x.long).includes('옵션'), segText(x.long));
  }
});
t('실적 D-3 이상·지난 실적은 칩이 아니다', () => {
  assert.equal(selectInsights(base({ earnings: { date: '2026-10-02' } }), 'ko', 2).length, 0);
  assert.equal(selectInsights(base({ earnings: { date: '2026-09-28' } }), 'ko', 2).length, 0);
});
t('감마 플립 2% 이내(아래) → «감마 플립 230 아래 −0.5% · 변동 확대 구간»', () => {
  const lv = good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 });
  const c = selectInsights(base({ price: 228.86, changePct: -0.2, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'gammaNear');
  assert.equal(segText(c[0].long), '감마 플립 230 아래 −0.5% · 변동 확대 구간');
});
t('오늘 감마 플립을 건넜으면 «하향 이탈»(전일 종가 = S/(1+등락률))', () => {
  const lv = good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 });
  const c = selectInsights(base({ price: 228.86, changePct: -1.5, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'gammaCross');
  assert.equal(segText(c[0].short), '감마 플립 230 하향 이탈');
});
t('콜월 2% 이내 → «콜월 345까지 +1.9%» (AAPL 시안)', () => {
  const lv = good(338.6, { pf: 320, mp: 335, cw: 345 });
  const c = selectInsights(base({ price: 338.6, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'callNear');
  assert.equal(segText(c[0].long), '콜월 345까지 +1.9%');
  assert.equal(segText(selectInsights(base({ price: 338.6, levels: lv }), 'en', 1)[0].long), '+1.9% to call wall 345');
});
t('PRO 2개: 실적 + 고래 신규 풋(MU 시안) — 같은 무리는 한 번만', () => {
  const c = selectInsights(base({
    price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' },
    whale: { contracts: 3477, notional: 208_620_000, side: 'put', date: '2026-09-25' },
  }), 'ko', 2);
  assert.deepEqual(c.map((x) => x.kind), ['earnings', 'whale']);
  assert.equal(segText(c[1].short), '고래 신규 풋 +3,477');
  assert.equal(segText(c[1].long), '고래 신규 풋 +3,477계약 · $209M');
});
t('무료는 1개 — 같은 입력에서 1순위만', () => {
  const c = selectInsights(base({
    earnings: { date: '2026-09-30' }, whale: { contracts: 3477, notional: 208_620_000, side: 'put', date: '2026-09-25' },
  }), 'ko', 1);
  assert.deepEqual(c.map((x) => x.kind), ['earnings']);
});
t('고래: 판본이 오래됐거나(목 → 월 저녁 기대 금) 작으면 버린다', () => {
  const stale = selectInsights(base({ whale: { contracts: 5000, notional: 5e8, side: 'call', date: '2026-09-24' } }), 'ko', 2);
  assert.equal(stale.length, 0);
  const small = selectInsights(base({ whale: { contracts: 500, notional: 5e8, side: 'call', date: '2026-09-25' } }), 'ko', 2);
  assert.equal(small.length, 0);
});
t('장외 비중: 물량이 20일 평균의 1.25배 이상일 때만 · 판본 날짜 확인', () => {
  const on = selectInsights(base({ darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'ko', 1);
  assert.equal(segText(on[0].long), '장외 비중 58% · 물량 20일 평균의 1.3배');
  assert.equal(selectInsights(base({ darkPool: { pct: 58, volRatio: 1.1, date: '2026-09-28' } }), 'ko', 1).length, 0);
  assert.equal(selectInsights(base({ darkPool: { pct: 58, volRatio: 2, date: '2026-09-20' } }), 'ko', 1).length, 0);
});
t('만기 주간 맥스페인 괴리: 남은 정규장 3회 이내 + 괴리 2% 이상(만기를 알 때만)', () => {
  const lv = good(338.6, { pf: 320, mp: 330, cw: 350 });
  // 월 20:00 ET(장 마감 뒤) → 목 만기 = 화·수·목 3회
  const c = selectInsights(base({ price: 338.6, levels: lv, levelsExpiration: '2026-10-01' }), 'ko', 2);
  assert.ok(c.some((x) => x.kind === 'mpDiverge'));
  assert.equal(segText(c.find((x) => x.kind === 'mpDiverge')!.long), '만기 주간 맥스페인 330 · 괴리 +2.6%');
  // 금 만기는 4회 남음 → 아직 만기 주간 칩이 아니다
  const fri = selectInsights(base({ price: 338.6, levels: lv, levelsExpiration: '2026-10-02' }), 'ko', 2);
  assert.ok(!fri.some((x) => x.kind === 'mpDiverge'));
  const noExp = selectInsights(base({ price: 338.6, levels: lv }), 'ko', 2);
  assert.ok(!noExp.some((x) => x.kind === 'mpDiverge'));
});
t('기본값: 가장 가까운 벽까지 거리(META 시안 «풋플로어 700까지 −2.5%»)', () => {
  const lv = good(718.11, { pf: 700, mp: 740, cw: 780 });
  const c = selectInsights(base({ price: 718.11, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'nearest');
  assert.equal(segText(c[0].long), '풋플로어 700까지 −2.5%');
});
t('★ 지어내지 않기: 레벨이 정의를 어겼고 다른 사실도 없으면 칩 0개(칩 줄을 숨긴다)', () => {
  const bad = checkLevels({ price: 1053.98, callWall: 1000, putFloor: 60, gammaFlipLevel: 530, maxPain: 970 }, NOW);
  assert.equal(selectInsights(base({ price: 1053.98, changePct: -2.6, levels: bad }), 'ko', 2).length, 0);
});
t('레벨이 숨겨져도 다른 출처(실적) 칩은 남긴다(NKE 시안)', () => {
  const bad = checkLevels({ price: 36.39, callWall: 40, putFloor: 38.5, maxPain: 39.5 }, NOW);
  const c = selectInsights(base({ price: 36.39, levels: bad, earnings: { date: '2026-10-01', hour: 'amc' } }), 'ko', 2);
  assert.deepEqual(c.map((x) => x.kind), ['earnings']);
  assert.equal(segText(c[0].long), '실적 D-2 · 10/1 장 마감 후');
});

console.log('━━━ 5. 숫자 모양 ━━━');
t('레벨·가격·퍼센트·금액', () => {
  assert.equal(fmtLevel(1100), '1,100');
  assert.equal(fmtLevel(337.5), '337.5');
  assert.equal(fmtLevel(39.5), '39.5');
  assert.equal(fmtPrice(1053.98), '$1,053.98');
  assert.equal(fmtPrice(36.39), '$36.39');
  assert.equal(fmtSignedPct(-2.614), '−2.6%');
  assert.equal(fmtSignedPct(1.68, 2), '+1.68%');
  assert.equal(fmtSignedPct(0), '0.0%');
  assert.equal(fmtUsdCompact(208_620_000), '$209M');
  assert.equal(fmtUsdCompact(2_567_872_500), '$2.6B');
});
t('날짜 차이·거래일 수', () => {
  assert.equal(daysBetween('2026-09-29', '2026-10-01'), 2);
  assert.equal(tradingDaysUntil('2026-10-02', et('2026-09-30', 10)), 3, '수 10:00 → 수·목·금');
  assert.equal(tradingDaysUntil('2026-10-02', et('2026-09-30', 17)), 2, '수 17:00(마감 뒤) → 목·금');
  assert.equal(tradingDaysUntil('2026-09-25', et('2026-09-28', 10)), -1);
});

console.log('━━━ 6. 잠긴 두 번째 칩(무료) — 칩 차등 켜짐일 때 · 두 번째가 «있을 때만» · 종류 이름만 ━━━');
const HAS_DIGIT = /\d/;
const ON_FREE = { isPro: false, tiering: true };
const ON_PRO = { isPro: true, tiering: true };
t('무료 + 두 번째 칩 있음(MU 시안: 실적 + 고래) → 첫 칩만 · 잠금 칩은 «고래 신규 포지션» 이름만', () => {
  const input = base({
    price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' },
    whale: { contracts: 3477, notional: 208_620_000, side: 'put', date: '2026-09-25' },
  });
  const r = chipsForPlan(selectInsights(input, 'ko', 2), ON_FREE, 'ko');
  assert.deepEqual(r.chips.map((x) => x.kind), ['earnings']);
  assert.deepEqual(r.locked, { kind: 'whale', label: '고래 신규 포지션' });
  // 내용(숫자·문장)은 싣지 않는다 — 계약 수·금액·풋/콜 방향 모두 없음
  assert.equal(Object.keys(r.locked!).sort().join(','), 'kind,label');
  assert.ok(!HAS_DIGIT.test(r.locked!.label));
  assert.ok(!r.locked!.label.includes('풋') && !r.locked!.label.includes('$'));
  assert.equal(chipsForPlan(selectInsights(input, 'en', 2), ON_FREE, 'en').locked!.label, 'Whale positions');
  assert.equal(chipsForPlan(selectInsights(input, 'ja', 2), ON_FREE, 'ja').locked!.label, '大口新規');
});
t('무료 + 두 번째 칩 없음 → 잠금 칩 없음(가짜 희소성 금지)', () => {
  const one = selectInsights(base({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 2);
  assert.equal(one.length, 1);
  assert.equal(chipsForPlan(one, ON_FREE, 'ko').locked, null);
  assert.deepEqual(chipsForPlan([], ON_FREE, 'ko'), { chips: [], locked: null });
  // 기본값(가장 가까운 벽) 하나뿐인 행도 잠금 없음
  const lv = good(718.11, { pf: 700, mp: 740, cw: 780 });
  const onlyWall = selectInsights(base({ price: 718.11, levels: lv }), 'ko', 2);
  assert.deepEqual(onlyWall.map((x) => x.kind), ['nearest']);
  assert.equal(chipsForPlan(onlyWall, ON_FREE, 'ko').locked, null);
});
t('PRO → 지금처럼 두 칩 · 잠금 없음(회귀 금지)', () => {
  const input = base({
    earnings: { date: '2026-09-30' }, whale: { contracts: 3477, notional: 208_620_000, side: 'put', date: '2026-09-25' },
  });
  const all = selectInsights(input, 'ko', 2);
  const r = chipsForPlan(all, ON_PRO, 'ko');
  assert.deepEqual(r.chips.map((x) => x.kind), ['earnings', 'whale']);
  assert.deepEqual(r.chips, all);
  assert.equal(r.locked, null);
});
t('무료의 첫 칩 = 예전 selectInsights(…, 1) 과 같다(순서·문장 그대로)', () => {
  const cases: InsightInput[] = [
    base({ earnings: { date: '2026-09-30', hour: 'amc' }, darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }),
    base({ price: 228.86, changePct: -0.2, levels: good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 }) }),
    base({ price: 338.6, levels: good(338.6, { pf: 320, mp: 330, cw: 350 }), levelsExpiration: '2026-10-01' }),
  ];
  for (const c of cases) {
    for (const loc of ['ko', 'en', 'ja'] as const) {
      assert.deepEqual(chipsForPlan(selectInsights(c, loc, 2), ON_FREE, loc).chips, selectInsights(c, loc, 1));
    }
  }
});
t('두 번째 칩 종류별 이름 — 벽은 아이콘으로(지도에 이미 보이는 사실) · 이름엔 숫자 없음', () => {
  // 감마 근접 + 가장 가까운 벽(콜월 쪽: 250 까지 +9.2% < 풋플로어 200 까지 −12.6%)
  const gam = selectInsights(base({ price: 228.86, changePct: -0.2, levels: good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 }) }), 'ko', 2);
  assert.deepEqual(gam.map((x) => x.kind), ['gammaNear', 'nearest']);
  assert.deepEqual(chipsForPlan(gam, ON_FREE, 'ko').locked, { kind: 'nearest', label: '콜월' });
  // 실적 + 장외 비중
  const dp = selectInsights(base({ earnings: { date: '2026-09-30' }, darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'ja', 2);
  assert.deepEqual(chipsForPlan(dp, ON_FREE, 'ja').locked, { kind: 'darkpool', label: '場外比率' });
  // 실적 + 감마 플립(오늘 교차)
  const gx = selectInsights(base({ price: 228.86, changePct: -1.5, earnings: { date: '2026-09-30' }, levels: good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 }) }), 'en', 2);
  assert.deepEqual(chipsForPlan(gx, ON_FREE, 'en').locked, { kind: 'gammaCross', label: 'Gamma flip' });
  const names: Array<[Parameters<typeof chipKindLabel>[0], string, string, string]> = [
    [{ kind: 'earnings', icon: 'cal' }, '실적 일정', 'Earnings date', '決算日程'],
    [{ kind: 'gammaNear', icon: 'gamma' }, '감마 플립', 'Gamma flip', 'ガンマフリップ'],
    [{ kind: 'callNear', icon: 'ceil' }, '콜월', 'Call wall', 'コールウォール'],
    [{ kind: 'putNear', icon: 'floor' }, '풋플로어', 'Put floor', 'プットフロア'],
    [{ kind: 'nearest', icon: 'floor' }, '풋플로어', 'Put floor', 'プットフロア'],
    [{ kind: 'nearest', icon: 'ceil' }, '콜월', 'Call wall', 'コールウォール'],
    [{ kind: 'whale', icon: 'bolt' }, '고래 신규 포지션', 'Whale positions', '大口新規'],
    [{ kind: 'darkpool', icon: 'layers' }, '장외 비중', 'Off-exchange', '場外比率'],
    [{ kind: 'mpDiverge', icon: 'diamond' }, '맥스페인', 'Max pain', 'マックスペイン'],
  ];
  for (const [c, ko, en, ja] of names) {
    assert.equal(chipKindLabel(c, 'ko'), ko);
    assert.equal(chipKindLabel(c, 'en'), en);
    assert.equal(chipKindLabel(c, 'ja'), ja);
    for (const x of [ko, en, ja]) assert.ok(!HAS_DIGIT.test(x), x);
  }
});

console.log('━━━ 7. 칩 차등 스위치(WATCHLIST_CHIP_TIERING) — 기본 꺼짐 · 꺼지면 정보 차등 없음 ━━━');
t('기본값은 꺼짐(false) — 대표 결정 전까지 정보 차등을 운영에 내보내지 않는다', () => {
  assert.equal(WATCHLIST_CHIP_TIERING, false, '칩 차등을 켜는 것은 대표 결정 사항 — 켤 때 이 기대값도 같은 커밋에서 바꾼다(실수로 켜지지 않게)');
});
t('꺼짐: 무료·PRO 모두 행당 두 칩(= 예전 PRO 화면) · 잠긴 칩 없음', () => {
  const input = base({
    price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' },
    whale: { contracts: 3477, notional: 208_620_000, side: 'put', date: '2026-09-25' },
  });
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const all = selectInsights(input, loc, 2);
    const free = chipsForPlan(all, { isPro: false, tiering: false }, loc);
    const pro = chipsForPlan(all, { isPro: true, tiering: false }, loc);
    assert.deepEqual(free, { chips: all, locked: null });
    assert.deepEqual(pro, { chips: all, locked: null });
    assert.equal(free.chips.length, 2);
  }
  // 두 번째 칩이 없는 행도 그대로(잠금 없음)
  const one = selectInsights(base({ earnings: { date: '2026-09-30' } }), 'ko', 2);
  assert.deepEqual(chipsForPlan(one, { isPro: false, tiering: false }, 'ko'), { chips: one, locked: null });
});
t('켜짐/꺼짐 차이는 «무료»에만 — PRO 는 두 경우 모두 같다(회귀 없음)', () => {
  const all = selectInsights(base({ earnings: { date: '2026-09-30' }, darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'ko', 2);
  assert.deepEqual(chipsForPlan(all, ON_PRO, 'ko'), chipsForPlan(all, { isPro: true, tiering: false }, 'ko'));
  assert.equal(chipsForPlan(all, ON_FREE, 'ko').chips.length, 1);
  assert.equal(chipsForPlan(all, { isPro: false, tiering: false }, 'ko').chips.length, 2);
});
t('꺼짐: PRO 권유 문구에 칩이 없다(«내 종목 무제한 · 광고 없음»만) · 켜짐이면 칩을 말한다 — 3개 언어', () => {
  const CHIP = /칩|chip|チップ/i;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = WL_COPY[loc];
    assert.ok(!CHIP.test(c.genLede(5, false)), c.genLede(5, false));
    assert.ok(!CHIP.test(c.incl(false)), c.incl(false));
    assert.ok(CHIP.test(c.genLede(5, true)), c.genLede(5, true));
    assert.ok(CHIP.test(c.incl(true)), c.incl(true));
    assert.ok(c.genLede(5, false).includes('5'));
  }
  assert.equal(WL_COPY.ko.incl(false), '내 종목 무제한 · 광고 없음');
  assert.equal(WL_COPY.en.incl(false), 'Unlimited watchlist · no ads');
  assert.equal(WL_COPY.ja.incl(false), 'マイ銘柄上限なし · 広告なし');
});

console.log(`\n${n}/${n} 통과`);
