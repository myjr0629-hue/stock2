/**
 * «내 종목» 행 판정 시험 — src/lib/app/watchlistInsights.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/watchlistInsights.test.ts
 *
 * 출발점: 9/28 운영 watchlist/batch?mode=price 실측(9/29 KST 조회)
 *   MU  S=1053.98 콜월 1000(현재가 아래)·풋플로어 60·감마플립 530 · 맥스페인 970
 *   TSLA S=357.45 풋플로어 200·감마플립 300 · NVDA S=228.86 콜월 220(현재가 아래)
 *   AAPL S=338.4 콜월 345·풋플로어 330·감마플립 337.5·맥스페인 330 — ★ 정상이 아니다: 337.5 = (345+330)/2,
 *        수집 Lambda 행(getLatestGex 폴백)의 «벽 중간값» 감마플립이다. 정의(±15%) 안이라 검사를 늘 통과했다 → 출처로 거른다(A1)
 *   NKE  S=36.39 풋플로어 38.5(현재가 위)
 * 정의: 콜월 (S, 1.2S] · 풋플로어 [0.8S, S) · 감마플립 ±15% · 맥스페인 ±35% — 공용 LEVEL_BANDS(9/30 · 예전 내 종목만 ±20%)
 * 출처(72 응답 모양 — watchlistBatchService 출구의 applyLevelsToRealtime): 행마다 levelsSource('structure'|null)·
 *   levelsChainDate·levelsExpiration(+ 게이트가 지운 칸 levelsDropped). 지도는 structure + 체인 날짜일 때만.
 */
import assert from 'node:assert/strict';
import {
  checkLevels, levelViolations, levelsNotice, expectedChainDate, lastCompletedSession, isStaleDate, isTooStaleLevels, isTradingDay, mapGeometry,
  maxPainLabelFits, mapBandBackground, selectInsights, segText, fmtLevel, fmtPrice, fmtSignedPct, fmtUsdCompact, earningsPending,
  priceBasis, priceBasisLabel, tradingDaysUntil, daysBetween, etDateOf, chipsForPlan, chipKindLabel, EARLY_CLOSE_DATES,
  sessionCloseMinutes, LEVEL_RULES, type InsightInput, type LevelInput, type LevelsVerdict,
} from '../src/lib/app/watchlistInsights';
import { WATCHLIST_CHIP_TIERING } from '../src/lib/app/watchlistFlags';
import { FREE_LIMIT, MAX_ITEMS } from '../src/lib/app/watchlist';
import { WL_COPY } from '../src/components/app/watchlist/copy';
import { LEVEL_BANDS, levelCellState, levelOutOfRangeText } from '../src/lib/optionLevelGate';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const sorted = (xs: string[]) => [...xs].sort();
const hh = (x: number) => String(x).padStart(2, '0');
// ET = UTC-4 (9·10월 서머타임) · 11/1 이후는 UTC-5
const et = (ymd: string, h: number, m = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:00-04:00`);
const etS = (ymd: string, h: number, m = 0) => Date.parse(`${ymd}T${hh(h)}:${hh(m)}:00-05:00`);
/** 72 배치 응답의 레벨 메타(구조 한 벌 + 판본 날짜) */
const S72 = (chainDate: string | null = '2026-09-25'): Partial<LevelInput> => ({ hasLevelsMeta: true, levelsSource: 'structure', levelsChainDate: chainDate });
const reason = (v: LevelsVerdict) => (v.ok ? 'ok' : v.reason);

const NOW = et('2026-09-28', 20);                 // 월 20:00 ET = 9/29 KST 09:00 · 기대 체인 판본 9/25(금)

console.log('━━━ 1. 정의 검사 — 9/28 운영 실측값(72 응답 모양) ━━━');
t('MU: 콜월·풋플로어·감마플립 셋 다 위반(맥스페인 970 은 ±20% 안)', () => {
  assert.deepEqual(sorted(levelViolations({ callWall: 1000, putFloor: 60, gammaFlipLevel: 530, maxPain: 970 }, 1053.98)),
    ['callWall', 'gammaFlipLevel', 'putFloor']);
});
t('TSLA: 풋플로어 200·감마플립 300 위반 → 지도 숨김(정의)', () => {
  const v = checkLevels({ price: 357.45, callWall: 400, putFloor: 200, gammaFlipLevel: 300, maxPain: 370, ...S72() }, NOW);
  assert.equal(v.ok, false);
  assert.equal(reason(v), 'definition');
  assert.deepEqual(sorted((v as any).bad), ['gammaFlipLevel', 'putFloor']);
});
t('NVDA: 콜월 220 이 현재가 228.86 아래 → 위반(한 값이라도 어기면 한 벌 전부 버린다)', () => {
  const v = checkLevels({ price: 228.86, callWall: 220, putFloor: 200, gammaFlipLevel: 210, maxPain: 215, ...S72() }, NOW);
  assert.equal(v.ok, false);
  assert.deepEqual((v as any).bad, ['callWall']);
});
t('NKE: 풋플로어 38.5 가 현재가 36.39 위 → 위반', () => {
  const v = checkLevels({ price: 36.39, callWall: 40, putFloor: 38.5, gammaFlipLevel: 41, maxPain: 39.5, ...S72() }, NOW);
  assert.equal(v.ok, false);
});
t('★ A1 AAPL 감마플립 337.5 = (345+330)/2 — 출처 메타 없는 행(수집 Lambda·72 이전 모양)은 정의 안이어도 지도·감마 칩 숨김', () => {
  const lambdaRow = { price: 338.4, callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 };
  assert.equal(337.5, (345 + 330) / 2, '벽 중간값이다');
  assert.deepEqual(levelViolations(lambdaRow, 338.4), [], '정의 검사만으로는 못 거른다(중간값은 늘 벽 사이)');
  const v = checkLevels(lambdaRow, NOW);
  assert.equal(v.ok, false);
  assert.equal(reason(v), 'unverified');
  assert.equal(levelsNotice(v), 'wait');
  // 감마 칩(근접·교차)·벽 칩이 하나도 서지 않는다 — 가격이 감마플립 0.3% 옆이어도
  const chips = selectInsights({ price: 338.4, changePct: 0.1, levels: v, todayLocal: '2026-09-29', nowMs: NOW }, 'ko', 2);
  assert.deepEqual(chips, []);
  // hasLevelsMeta 가 false 로 «명시»된 행도 같다
  assert.equal(reason(checkLevels({ ...lambdaRow, hasLevelsMeta: false }, NOW)), 'unverified');
});
t('★ A1·E3 72 응답이 «구조 없음»(levelsSource null)이면 숨김 — «옵션 레벨 없음»이 아니라 «레벨 갱신 대기»(저장본 아직 없음·읽기 실패와 못 가른다) · 날짜를 모르면 날짜를 주장하지 않고 그린다', () => {
  const base = { price: 338.4, callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 };
  const none = checkLevels({ ...base, hasLevelsMeta: true, levelsSource: null, levelsChainDate: '2026-09-25' }, NOW);
  assert.equal(reason(none), 'source');
  assert.equal(levelsNotice(none), 'wait', '서버 null 은 «진짜 없음»을 보장하지 않는다(E3)');
  assert.equal(reason(checkLevels({ ...base, hasLevelsMeta: true, levelsSource: 'dynamo', levelsChainDate: '2026-09-25' }, NOW)), 'source', '다른 생산자');
  // 9/29 19시 미리보기 실측: 수집 Lambda 캐시 경로 5종목이 판본 날짜 null(㊲-2 ② 배포 전) — 같은 값을 Command·Flow 는 보여 준다
  const undated = checkLevels({ ...base, ...S72(null) }, NOW);
  assert.equal(undated.ok, true);
  assert.equal((undated as any).chainDate, null, '날짜를 모르면 null — 머리줄이 날짜를 주장하지 않는다');
  assert.equal(levelsNotice(undated), null);
  const badShape = checkLevels({ ...base, ...S72('9/25') }, NOW);
  assert.equal(badShape.ok, true);
  assert.equal((badShape as any).chainDate, null, '날짜 모양이 아니면 모르는 것');
  // 같은 숫자라도 구조 한 벌 + 판본 날짜면 그린다(기준은 숫자 모양이 아니라 출처다)
  assert.deepEqual(checkLevels({ ...base, ...S72() }, NOW), { ok: true, S: 338.4, pf: 330, mp: 330, cw: 345, gf: 337.5, chainDate: '2026-09-25' });
});
t('hasLevelsMeta 를 안 주면 levelsSource 키가 있는지로 본다(72 모양을 그대로 넘기는 호출자)', () => {
  assert.equal(checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, levelsSource: 'structure', levelsChainDate: '2026-09-25' }, NOW).ok, true);
  assert.equal(reason(checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, levelsSource: null }, NOW)), 'source');
});
t('경계: 콜월 정확히 1.2S · 풋플로어 정확히 0.8S 는 통과, 콜월 = S 는 위반', () => {
  assert.deepEqual(levelViolations({ callWall: 120, putFloor: 80 }, 100), []);
  assert.deepEqual(levelViolations({ callWall: 100 }, 100), ['callWall']);
  assert.deepEqual(levelViolations({ putFloor: 100 }, 100), ['putFloor']);
  assert.deepEqual(levelViolations({ callWall: 120.01 }, 100), ['callWall']);
});
t('★ 맥스페인 ±35% — 공용 LEVEL_BANDS 그대로(서버·Command 와 같은 정의 · 9/30): 136 위반 · 134 통과 · 예전 ±20% 의 121 은 이제 통과', () => {
  assert.equal(LEVEL_RULES, LEVEL_BANDS, '밴드는 한 곳(lib/optionLevelGate)');
  assert.deepEqual(levelViolations({ maxPain: 136 }, 100), ['maxPain']);
  assert.deepEqual(levelViolations({ maxPain: 134 }, 100), []);
  assert.deepEqual(levelViolations({ maxPain: 121 }, 100), [], '20~35% 는 Command 엔 값이 보인다 — 내 종목도 «레벨 갱신 대기»가 아니다');
  // 벽 밖 맥스페인도 지도를 그린다 — ◆ 는 끝에 붙는다(mpClamped)
  const v = checkLevels({ price: 100, putFloor: 90, callWall: 110, maxPain: 70, ...S72() }, NOW);
  assert.equal(v.ok, true);
  assert.equal(mapGeometry(v as any).mpClamped, true);
});
t('감마플립 ±15%: 116 위반 · 85 통과 · 없으면 판단하지 않는다(지도는 그린다)', () => {
  assert.deepEqual(levelViolations({ gammaFlipLevel: 116 }, 100), ['gammaFlipLevel']);
  assert.deepEqual(levelViolations({ gammaFlipLevel: 85 }, 100), []);
  const v = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, gammaFlipLevel: null, ...S72() }, NOW);
  assert.equal(v.ok, true);
  assert.equal((v as any).gf, null);
});
t('값이 비면 outOfRange(«범위 밖» — 판본은 있는데 정의상 값이 없다 · 9/30 공용 표시) · 가격이 없으면 no-price(«—» — 갱신을 약속하지 않는다) · 0·음수도 «범위 밖»', () => {
  const miss = checkLevels({ price: 100, callWall: 110, putFloor: null, maxPain: 100, ...S72() }, NOW);
  assert.equal(reason(miss), 'outOfRange');
  assert.deepEqual((miss as any).out, ['putFloor']);
  assert.deepEqual((miss as any).values, { pf: null, mp: 100, cw: 110 });
  assert.equal(levelsNotice(miss), 'outOfRange');
  const np = checkLevels({ price: 0, callWall: 110, putFloor: 90, maxPain: 100, ...S72() }, NOW);
  assert.equal(reason(np), 'no-price');
  assert.equal(levelsNotice(np), 'dash', '가격을 못 받았다 → «없음»도 «갱신 대기»도 아닌 «—»(가격 칸과 같은 말 · 11번)');
  assert.equal(reason(checkLevels({ price: 100, callWall: -1, putFloor: 90, maxPain: 100, ...S72() }, NOW)), 'outOfRange');
  // 아무것도 모르는 행(요청 실패 뒤 값 없음) — 가격 칸처럼 «—»
  const nothing = checkLevels({}, NOW);
  assert.equal(reason(nothing), 'no-price');
  assert.equal(levelsNotice(nothing), 'dash');
  // 가격이 없으면 출처보다 먼저 no-price — 서버 null 행도 가격 없이는 «—»(모든 행이 «레벨 갱신 대기»가 되지 않게)
  assert.equal(reason(checkLevels({ price: null, hasLevelsMeta: true, levelsSource: null }, NOW)), 'no-price');
});
t('★ A15 서버 정의 게이트가 지운 칸(levelsDropped)은 «원래 없음»이 아니라 정의 위반 → «레벨 갱신 대기»', () => {
  const v = checkLevels({ price: 100, callWall: null, putFloor: 90, maxPain: 100, levelsDropped: ['callWall'], ...S72() }, NOW);
  assert.equal(reason(v), 'definition');
  assert.deepEqual((v as any).bad, ['callWall']);
  assert.equal(levelsNotice(v), 'wait');
  // 감마플립만 지워졌으면 지도는 그린다(감마 칩만 없다)
  const g = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, gammaFlipLevel: null, levelsDropped: ['gammaFlipLevel'], ...S72() }, NOW);
  assert.equal(g.ok, true);
});
t('★ A15·E3·11 사유별 말: outOfRange → «범위 밖» / source·definition·stale·undated·unverified → «레벨 갱신 대기» / no-price → «—» / 지도면 null', () => {
  const cases: Array<[LevelsVerdict, 'outOfRange' | 'wait' | 'dash' | null]> = [
    [{ ok: false, reason: 'outOfRange' }, 'outOfRange'],
    [{ ok: false, reason: 'source' }, 'wait'],
    [{ ok: false, reason: 'definition' }, 'wait'],
    [{ ok: false, reason: 'stale' }, 'wait'],
    [{ ok: false, reason: 'undated' }, 'wait'],
    [{ ok: false, reason: 'unverified' }, 'wait'],
    [{ ok: false, reason: 'no-price' }, 'dash'],
    [{ ok: true, S: 100, pf: 90, mp: 100, cw: 110, gf: null, chainDate: '2026-09-25' }, null],
  ];
  for (const [v, want] of cases) assert.equal(levelsNotice(v), want, JSON.stringify(v));
  // «범위 밖» 글자는 공용 함수(Command·Flow 의 LevelValue 와 같은 글자) · 범례의 뜻 한 줄은 3개 언어에 있다
  assert.deepEqual((['ko', 'en', 'ja'] as const).map((l) => levelOutOfRangeText(l)), ['범위 밖', 'Out of range', '範囲外']);
  for (const loc of ['ko', 'en', 'ja'] as const) assert.ok(WL_COPY[loc].mapOutSub.length > 0);
});

console.log('━━━ 1b. 공용 레벨 표시(9/30 — 통합 레벨 levelCellState·levelOutOfRangeText) ━━━');
t('★ 얇은 체인(DH 모양 — levelsSource structure · 값 전부 null)은 «범위 밖» — «—»·«옵션 레벨 없음»이 아니다', () => {
  const dh = { price: 4.2, callWall: null, putFloor: null, maxPain: null, gammaFlipLevel: null, ...S72('2026-09-29') };
  const v = checkLevels(dh, NOW);
  assert.equal(reason(v), 'outOfRange');
  assert.deepEqual(sorted((v as any).out), sorted(['callWall', 'putFloor', 'maxPain']));
  assert.equal(levelsNotice(v), 'outOfRange');
});
t('★ 판정은 공용 levelCellState 와 같다 — 지도 칸마다 «범위 밖» ⟺ levelCellState === outOfRange (값·판본·안전망 조합 전수)', () => {
  const vals = [null, 0, -1, 90, 110, 100];
  const sources: Array<string | null> = ['structure', null];
  const drops: Array<string[] | null> = [null, [], ['callWall'], ['putFloor', 'maxPain']];
  let checked = 0;
  for (const pf of vals) for (const cw of vals) for (const mp of vals) for (const src of sources) for (const dropped of drops) {
    const v = checkLevels({ price: 100, putFloor: pf, callWall: cw, maxPain: mp, hasLevelsMeta: true, levelsSource: src, levelsChainDate: '2026-09-25', levelsDropped: dropped }, NOW);
    if (v.ok || v.reason !== 'outOfRange') continue;
    const meta = { levelsSource: src, levelsDropped: dropped };
    for (const [f, val] of [['putFloor', pf], ['callWall', cw], ['maxPain', mp]] as const) {
      assert.equal((v.out || []).includes(f), levelCellState(val, meta, f) === 'outOfRange', JSON.stringify({ pf, cw, mp, src, dropped, f }));
    }
    checked++;
  }
  assert.ok(checked > 50, `${checked}개 조합`);
});
t('빈 칸이 전부 안전망이 지운 칸(levelsDropped)이면 «범위 밖»이 아니라 «레벨 갱신 대기»(공용: levelCellState none) · 판본이 없으면(source null) «레벨 갱신 대기»', () => {
  const d = checkLevels({ price: 100, callWall: null, putFloor: 90, maxPain: 100, levelsDropped: ['callWall'], ...S72() }, NOW);
  assert.equal(reason(d), 'definition');
  assert.equal(levelsNotice(d), 'wait');
  assert.equal(levelCellState(null, { levelsSource: 'structure', levelsDropped: ['callWall'] }, 'callWall'), 'none');
  assert.equal(levelsNotice(checkLevels({ price: 100, callWall: null, putFloor: null, maxPain: null, hasLevelsMeta: true, levelsSource: null }, NOW)), 'wait');
});
t('★ 운영 DH 모양(9/30 실측 — 네 칸 null · levelsDropped [maxPain]) → «범위 밖»(벽 둘이 범위 밖이라 지운 맥스페인이 돌아와도 지도는 없다)', () => {
  const dh = { price: 0.93, callWall: null, putFloor: null, maxPain: null, gammaFlipLevel: null, levelsDropped: ['maxPain'], ...S72('2026-09-29') };
  const v = checkLevels(dh, NOW);
  assert.equal(reason(v), 'outOfRange');
  assert.deepEqual(sorted((v as any).out), sorted(['callWall', 'putFloor']));
  assert.equal(levelsNotice(v), 'outOfRange');
  // 운영 BLNK(9/30 실측 — 콜월만 null · 나머지 0.5): «범위 밖»(콜월) — 예전 «레벨 갱신 대기»
  const blnk = checkLevels({ price: 0.5581, callWall: null, putFloor: 0.5, maxPain: 0.5, gammaFlipLevel: 0.5, ...S72('2026-09-29') }, NOW);
  assert.equal(reason(blnk), 'outOfRange');
  assert.deepEqual((blnk as any).out, ['callWall']);
  assert.deepEqual((blnk as any).values, { pf: 0.5, mp: 0.5, cw: null });
});
t('★ 화면은 공용 글자를 쓴다(소스) — 지도·범례·알림 시트가 levelOutOfRangeText 를 부르고 «옵션 레벨 없음»을 쓰지 않는다 · 기준 날짜·출처 줄(levelInfoNote)은 싣지 않는다', () => {
  const root = path.join(__dirname, '..');
  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
  const page = read('src/app/[locale]/app-view/watchlist/page.tsx');
  const map = read('src/components/app/watchlist/PositionMap.tsx');
  const host = read('src/components/app/watchlist/WatchlistHost.tsx');
  const sheet = read('src/components/app/watchlist/AlertSettingsSheet.tsx');
  const copy = read('src/components/app/watchlist/copy.ts');
  assert.ok(/outOfRange: levelOutOfRangeText\(loc\)/.test(page), '목록 지도에 공용 글자');
  assert.ok(/notice === 'outOfRange' \? labels\.outOfRange/.test(map), '지도가 «범위 밖»을 그린다');
  assert.ok(host.includes('levelOutOfRangeText(loc)'), '범례 머리글도 공용 글자');
  assert.ok(sheet.includes('levelOutOfRangeText(loc)') && /levelsOut \? \(/.test(sheet), '알림 시트도 «범위 밖»');
  assert.ok(/levelsOut = !r\.levels\.ok && r\.levels\.reason === 'outOfRange'/.test(page), '종 버튼이 «범위 밖» 상태를 시트에 넘긴다');
  for (const [name, src] of [['page', page], ['map', map], ['host', host], ['sheet', sheet], ['copy', copy]] as const) {
    assert.equal(/옵션 레벨 없음|No option levels|オプションレベルなし|levelsNone|mapNone/.test(src), false, `${name}: 옛 «옵션 레벨 없음» 이 남았다`);
    assert.equal(/levelInfoNote/.test(src), false, `${name}: 기준 날짜·출처 줄은 내 종목에 싣지 않는다`);
  }
});


console.log('━━━ 2. 신선도(체인 판본 날짜) · 가격 기준 · 조기 폐장 ━━━');
t('화 10:00 ET → 기대 판본 월 · 금 판본(1거래일 늦음)은 날짜를 밝혀 그린다 · 목 판본(2거래일 늦음)은 숨김', () => {
  const now = et('2026-09-29', 10);
  assert.equal(expectedChainDate(now), '2026-09-28');
  assert.equal(isStaleDate('2026-09-25', now), true, '칩(고래·장외)용 엄격 판정은 그대로');
  assert.equal(isStaleDate('2026-09-28', now), false);
  assert.equal(isTooStaleLevels('2026-09-25', now), false, '지도는 1거래일 늦음을 허용');
  assert.equal(isTooStaleLevels('2026-09-24', now), true);
  const v = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, ...S72('2026-09-25') }, now);
  assert.equal(v.ok, true);
  assert.equal((v as any).chainDate, '2026-09-25', '머리줄이 «레벨 9/25 마감 기준»으로 밝힌다');
  const old = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, ...S72('2026-09-24') }, now);
  assert.equal(reason(old), 'stale');
  assert.equal(levelsNotice(old), 'wait');
});
t('월 07:00 → 기대 금 · 목 판본(1거래일)은 그리고 수 판본(2거래일)은 숨김 — 주말을 거래일로 세지 않는다', () => {
  const now = et('2026-09-28', 7);
  assert.equal(isTooStaleLevels('2026-09-24', now), false);
  assert.equal(isTooStaleLevels('2026-09-23', now), true);
});
t('★ A2 72 응답 모양이면 지도가 체인 날짜를 달고 선다 → 머리말 «레벨 9/28 마감 기준»의 재료', () => {
  const now = et('2026-09-29', 10);
  const v = checkLevels({ price: 100, callWall: 110, putFloor: 90, maxPain: 100, gammaFlipLevel: 101, ...S72('2026-09-28') }, now);
  assert.equal(v.ok, true);
  assert.equal((v as any).chainDate, '2026-09-28');
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
t('★ A9 조기 폐장(11/27·12/24 13:00 ET) — 13~16시의 «종가»는 그날이다(예전엔 전 거래일)', () => {
  assert.equal(sessionCloseMinutes('2026-11-27'), 13 * 60);
  assert.equal(sessionCloseMinutes('2026-09-28'), 16 * 60);
  assert.equal(lastCompletedSession(etS('2026-11-27', 14)), '2026-11-27');
  assert.equal(lastCompletedSession(etS('2026-11-27', 12, 59)), '2026-11-25', '11/26 추수감사절 휴장 → 직전은 11/25');
  assert.equal(lastCompletedSession(etS('2026-12-24', 13, 0)), '2026-12-24');
  assert.equal(lastCompletedSession(etS('2026-12-24', 15, 30)), '2026-12-24');
  assert.equal(lastCompletedSession(etS('2026-12-24', 12)), '2026-12-23');
  const b = priceBasis('post', etS('2026-11-27', 14));
  assert.deepEqual(b, { kind: 'close', date: '2026-11-27' });
  assert.equal(priceBasisLabel(b, 'ko'), '11/27(금) 종가');
  assert.equal(priceBasisLabel(priceBasis('closed', etS('2026-12-24', 15)), 'en'), 'Thu 12/24 close');
  // 평일 정상 마감일은 그대로 16:00
  assert.equal(lastCompletedSession(et('2026-09-28', 14)), '2026-09-25');
  // 7/2(목)은 조기 폐장이 아니다(7/3 이 대체 휴장) — 14:00 ET 의 «종가»는 7/1
  assert.equal(lastCompletedSession(et('2026-07-02', 14)), '2026-07-01');
  // 표의 날짜는 전부 거래일이다(휴장·주말이면 표가 틀린 것)
  for (const d of EARLY_CLOSE_DATES) assert.ok(isTradingDay(d), d);
});
t('★ A9 만기까지 남은 정규장도 조기 폐장 뒤엔 내일부터 센다', () => {
  assert.equal(tradingDaysUntil('2026-11-27', etS('2026-11-27', 12)), 1, '폐장 전 → 오늘 포함');
  assert.equal(tradingDaysUntil('2026-11-27', etS('2026-11-27', 14)), 0, '13:00 폐장 뒤 → 오늘 장은 끝났다');
  assert.equal(tradingDaysUntil('2026-12-04', etS('2026-11-27', 14)), 5, '월~금');
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
t('★ A10 가격 기준은 «받은 시각»으로 계산해야 맞다 — 금 15:00 장중 값을 토요일에 보면 «토 장중»이 아니라 «금 장중»', () => {
  const receivedAt = et('2026-10-02', 15);       // 금 장중에 받은 값
  const viewedAt = et('2026-10-03', 11);         // 토요일에 다시 봄(캐시 행이 남은 채 복귀)
  assert.equal(priceBasisLabel(priceBasis('reg', receivedAt), 'ko'), '10/2(금) 장중');
  assert.equal(priceBasisLabel(priceBasis('reg', viewedAt), 'ko'), '10/3(토) 장중', '«지금»으로 계산하면 있지도 않은 토요일 장중이 된다');
});

console.log('━━━ 3. 지도 기하 · 맥스페인 숫자 겹침 ━━━');
t('MU 시안 값: 풋플로어 900 · 맥스페인 970 · 종가 1053.98 · 콜월 1100 → 35% · 77%', () => {
  const g = mapGeometry({ S: 1053.98, pf: 900, mp: 970, cw: 1100 });
  assert.equal(g.mp.toFixed(4), '0.3500');
  assert.equal(g.px.toFixed(4), '0.7699');
  assert.equal(g.segFrom, 'left');
  assert.equal(g.mpClamped, false);
});
t('META: 가격이 맥스페인 왼쪽 → ◆ 는 오른쪽(segFrom right) · 띠는 ●(왼쪽)가 짙다', () => {
  const g = mapGeometry({ S: 718.11, pf: 700, mp: 740, cw: 780 });
  assert.equal(g.segFrom, 'right');
  assert.equal(g.px.toFixed(4), '0.2264');
  // 90deg = 왼쪽 → 오른쪽: 첫 색(짙은 .5)이 왼쪽(●) 끝
  assert.equal(mapBandBackground(g.segFrom), 'linear-gradient(90deg, rgba(148,163,184,.5), rgba(148,163,184,.12))');
});
t('★ C6 ◆→● 띠는 금색이 아니다(금색은 ◆ 표식과 하트에만) · 짙은 끝은 늘 ● 쪽', () => {
  for (const side of ['left', 'right'] as const) {
    const bg = mapBandBackground(side);
    assert.ok(!/251\s*,\s*191\s*,\s*36|fbbf24|f59e0b/i.test(bg), bg);
  }
  assert.ok(mapBandBackground('left').startsWith('linear-gradient(270deg'), '◆ 왼쪽 → ●(오른쪽)이 짙다');
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
const good = (S: number, lv: { pf: number; mp: number; cw: number; gf?: number | null }): LevelsVerdict =>
  checkLevels({ price: S, putFloor: lv.pf, maxPain: lv.mp, callWall: lv.cw, gammaFlipLevel: lv.gf ?? null, ...S72() }, NOW);
const base = (over: Partial<InsightInput>): InsightInput => ({
  price: 100, changePct: 0, levels: { ok: false, reason: 'outOfRange' },
  todayLocal: '2026-09-29', nowMs: NOW, ...over,
});
/** 72 이후 옵션 EOD 요약의 «우세한 쪽» 한 벌(MU 9/25: 풋 2,100계약 · 콜 1,377계약 — 합계 3,477 은 싣지 않는다) */
const MU_WHALE = { side: 'put' as const, contracts: 2_100, notional: 126_000_000, date: '2026-09-25', prevDate: '2026-09-24' };
t('good() 은 72 모양으로 지도를 세운다(테스트 전제)', () => {
  assert.equal(good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 }).ok, true);
});
t('실적 D-1 → 1순위 · 날짜·발표 시각만(옵션 ± 없음) · 긴 문장/짧은 문장', () => {
  // D-n 은 ET 시장 날짜로 센다(9/30) — «미국 날짜 9/29»인 시각(화 08:00 ET)에서 본다. NOW(월 20:00 ET)면 9/30 은 D-2 다
  const tue = et('2026-09-29', 8);
  const chips = selectInsights(base({ nowMs: tue, earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 1);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, 'earnings');
  assert.equal(segText(chips[0].long), '실적 D-1 · 9/30 장 마감 후');
  assert.equal(segText(chips[0].short), '실적 D-1 · 9/30');
  const en = selectInsights(base({ nowMs: tue, earnings: { date: '2026-09-30', hour: 'amc' } }), 'en', 1);
  assert.equal(segText(en[0].long), 'Earnings D-1 · 9/30 after close');
  const ja = selectInsights(base({ nowMs: tue, earnings: { date: '2026-09-30', hour: 'amc' } }), 'ja', 1);
  assert.equal(segText(ja[0].long), '決算 D-1 · 9/30 引け後');
  const today = selectInsights(base({ nowMs: tue, earnings: { date: '2026-09-29', hour: 'bmo' } }), 'ko', 1);
  assert.equal(segText(today[0].long), '실적 오늘 · 9/29 장 시작 전');
  // 같은 입력을 월 20:00 ET(= 한국 화 09:00)에 보면 미국 날짜로는 아직 월요일 — 9/30 은 D-2, 9/29 bmo 는 D-1
  assert.equal(segText(selectInsights(base({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 1)[0].long), '실적 D-2 · 9/30 장 마감 후');
  assert.equal(segText(selectInsights(base({ earnings: { date: '2026-09-29', hour: 'bmo' } }), 'ko', 1)[0].long), '실적 D-1 · 9/29 장 시작 전');
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
  assert.equal(selectInsights(base({ earnings: { date: '2026-09-28' } }), 'ko', 2).length, 0, '월 20:00 ET — 시각 미정 실적도 20:00 부터 지남');
  assert.equal(selectInsights(base({ earnings: { date: '2026-09-25', hour: 'amc' } }), 'ko', 2).length, 0);
});
t('★ A5 한국 기기(KST 10/1 03:00 = 9/30 14:00 ET) · 9/30 amc 실적 — 미국 장중엔 «오늘» 칩이 선다(예전엔 기기 날짜로 걸러져 사라졌다)', () => {
  const nowMs = et('2026-09-30', 14);
  const kr = (over: Partial<InsightInput>) => base({ todayLocal: '2026-10-01', nowMs, ...over });
  const c = selectInsights(kr({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 2);
  assert.deepEqual(c.map((x) => x.kind), ['earnings']);
  assert.equal(segText(c[0].long), '실적 오늘 · 9/30 장 마감 후', '기기 기준 D-(-1) → 발표 전이면 «오늘»으로 접는다');
  assert.equal(segText(selectInsights(kr({ earnings: { date: '2026-09-30', hour: 'amc' } }), 'ja', 1)[0].long), '決算 本日 · 9/30 引け後');
  // 16:00 ET(KST 05:00) — 장 마감 후 발표 시각이 지났다
  assert.equal(selectInsights(base({ todayLocal: '2026-10-01', nowMs: et('2026-09-30', 16, 1), earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 2).length, 0);
  // 다음 날 실적(10/1 bmo)은 미국 날짜로 내일 — D-1(9/30 부터 D-n 도 ET 시장 날짜. 예전엔 기기 달력으로 «오늘»이었다)
  const next = selectInsights(kr({ earnings: { date: '2026-10-01', hour: 'bmo' } }), 'ko', 1);
  assert.equal(segText(next[0].long), '실적 D-1 · 10/1 장 시작 전');
});
t('★ 9/30 대표 캡처 — 미국 9/29 장중(한국 9/30 00:5x) MU 9/30 장 마감 후 실적은 «오늘»이 아니라 D-1(ET 시장 날짜) · 9/30 미국 장중엔 «오늘»', () => {
  const inUsSession = et('2026-09-29', 11, 55);                 // KST 9/30 00:55
  const chip = (nowMs: number, loc: 'ko' | 'en' | 'ja' = 'ko') => selectInsights(
    base({ todayLocal: '2026-09-30', nowMs, earnings: { date: '2026-09-30', hour: 'amc' } }), loc, 1);
  assert.equal(segText(chip(inUsSession)[0].long), '실적 D-1 · 9/30 장 마감 후');
  assert.equal(segText(chip(inUsSession, 'en')[0].long), 'Earnings D-1 · 9/30 after close', '«Earnings today · 9/30» 이 아니다');
  assert.equal(segText(chip(et('2026-09-30', 10))[0].long), '실적 오늘 · 9/30 장 마감 후', '미국 9/30 장중 — 오늘');
  // 기기 날짜를 무엇으로 주든 결과가 같다(ET 로 센다)
  assert.equal(segText(selectInsights(base({ todayLocal: '1999-01-01', nowMs: inUsSession, earnings: { date: '2026-09-30', hour: 'amc' } }), 'ko', 1)[0].long), '실적 D-1 · 9/30 장 마감 후');
});
t('★ A5 earningsPending: bmo 09:30 · amc 16:00(조기 폐장 13:00) · 시각 미정 20:00 ET 경계', () => {
  assert.equal(earningsPending('2026-09-30', 'bmo', et('2026-09-30', 9, 29)), true);
  assert.equal(earningsPending('2026-09-30', 'bmo', et('2026-09-30', 9, 30)), false);
  assert.equal(earningsPending('2026-09-30', 'amc', et('2026-09-30', 15, 59)), true);
  assert.equal(earningsPending('2026-09-30', 'amc', et('2026-09-30', 16, 0)), false);
  assert.equal(earningsPending('2026-11-27', 'amc', etS('2026-11-27', 13, 30)), false, '조기 폐장일은 13:00 이 마감');
  assert.equal(earningsPending('2026-09-30', '', et('2026-09-30', 19, 59)), true);
  assert.equal(earningsPending('2026-09-30', null, et('2026-09-30', 20, 0)), false);
  assert.equal(earningsPending('2026-10-01', 'amc', et('2026-09-30', 23)), true, '내일 실적');
  assert.equal(earningsPending('2026-09-29', 'bmo', et('2026-09-30', 1)), false, '어제 실적');
  assert.equal(earningsPending('bad', 'amc', et('2026-09-30', 1)), false);
});
t('감마 플립 2% 이내(아래) → «감마 플립 230 아래 −0.5%» — 해석 꼬리(«변동 확대 구간»)는 세 언어 모두 없다(7번 · 단정 표현 없이)', () => {
  const lv = good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 });
  const c = selectInsights(base({ price: 228.86, changePct: -0.2, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'gammaNear');
  assert.equal(segText(c[0].long), '감마 플립 230 아래 −0.5%');
  const TAIL = /변동|구간|変動|ゾーン|volatil|zone/i;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    for (const [px, ch] of [[228.86, -0.2], [228.86, -1.5], [231.5, 0.2], [231.5, 1.5]] as const) {
      const lv2 = good(px, { pf: 200, mp: 220, cw: 250, gf: 230 });
      for (const x of selectInsights(base({ price: px, changePct: ch, levels: lv2 }), loc, 2).filter((y) => y.group === 'gamma')) {
        assert.ok(!TAIL.test(segText(x.long)) && !TAIL.test(segText(x.short)), `${loc}: ${segText(x.long)}`);
      }
    }
  }
});
t('오늘 감마 플립을 건넜으면 «하향 이탈»(전일 종가 = S/(1+등락률))', () => {
  const lv = good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 });
  const c = selectInsights(base({ price: 228.86, changePct: -1.5, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'gammaCross');
  assert.equal(segText(c[0].short), '감마 플립 230 하향 이탈');
});
t('★ A1 같은 숫자라도 출처가 확인 안 되면 감마 칩(교차·근접)이 서지 않는다', () => {
  for (const meta of [{}, { hasLevelsMeta: true, levelsSource: null }, { hasLevelsMeta: true, levelsSource: 'dynamo' }] as Partial<LevelInput>[]) {
    const lv = checkLevels({ price: 228.86, putFloor: 200, maxPain: 220, callWall: 250, gammaFlipLevel: 230, ...meta }, NOW);
    const c = selectInsights(base({ price: 228.86, changePct: -1.5, levels: lv }), 'ko', 2);
    assert.ok(!c.some((x) => x.group === 'gamma' || x.group === 'walls'), JSON.stringify(meta));
  }
});
t('구조 한 벌이면 판본 날짜를 몰라도 지도·감마 칩이 선다(Command·Flow 와 같은 값 — 9/29 미리보기 실측)', () => {
  const lv = checkLevels({ price: 228.86, putFloor: 200, maxPain: 220, callWall: 250, gammaFlipLevel: 230, ...S72(null) }, NOW);
  assert.equal(lv.ok, true);
  const c = selectInsights(base({ price: 228.86, changePct: -1.5, levels: lv }), 'ko', 2);
  assert.ok(c.some((x) => x.group === 'gamma'), '감마 칩');
});
t('콜 월 2% 이내 → «콜 월 345까지 +1.9%» (AAPL 시안 · 이름은 앱 용어집과 같게)', () => {
  const lv = good(338.6, { pf: 320, mp: 335, cw: 345 });
  const c = selectInsights(base({ price: 338.6, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'callNear');
  assert.equal(segText(c[0].long), '콜 월 345까지 +1.9%');
  assert.equal(segText(selectInsights(base({ price: 338.6, levels: lv }), 'en', 1)[0].long), '+1.9% to call wall 345');
});
t('★ C4 벽 칩의 짧은 문장 — 조사 없이 «이름 값 · 거리»(ja 는 «まで» 없이) · 긴 문장은 그대로', () => {
  const lv = good(1079.5, { pf: 1000, mp: 1050, cw: 1100 });
  const pick = (loc: 'ko' | 'en' | 'ja') => selectInsights(base({ price: 1079.5, levels: lv }), loc, 1)[0];
  assert.equal(pick('ja').kind, 'callNear');
  assert.equal(segText(pick('ja').short), 'コールウォール 1,100 · +1.9%');
  assert.equal(segText(pick('ja').long), 'コールウォール 1,100 まで +1.9%');
  assert.equal(segText(pick('ko').short), '콜 월 1,100 · +1.9%');
  assert.equal(segText(pick('en').short), 'Call wall 1,100 · +1.9%');
  const put = good(718.11, { pf: 700, mp: 740, cw: 780 });
  assert.equal(segText(selectInsights(base({ price: 718.11, levels: put }), 'ja', 1)[0].short), 'プットフロア 700 · −2.5%');
  // 숫자(레벨·거리)는 짧은 문장에도 그대로 — 굵게
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const bolds = pick(loc).short.filter((x) => typeof x !== 'string').map((x) => (x as { b: string }).b);
    assert.deepEqual(bolds, ['1,100', '+1.9%'], loc);
  }
});
t('★ A3 PRO 2개: 실적 + 고래 신규 풋(MU) — 우세한 쪽의 계약 수만 · 금액 없음 · OI 를 잰 세션 날짜', () => {
  const c = selectInsights(base({ price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' }, whale: MU_WHALE }), 'ko', 2);
  assert.deepEqual(c.map((x) => x.kind), ['earnings', 'whale']);
  assert.equal(segText(c[1].short), '고래 신규 풋 +2,100 · 9/25');
  assert.equal(segText(c[1].long), '고래 신규 풋 +2,100계약 · 9/25 마감');
  const en = selectInsights(base({ whale: MU_WHALE }), 'en', 1);
  assert.equal(segText(en[0].long), 'New whale puts +2,100 · 9/25 close');
  assert.equal(segText(en[0].short), 'New puts +2,100 · 9/25');
  assert.equal(segText(selectInsights(base({ whale: MU_WHALE }), 'ja', 1)[0].long), '大口新規プット +2,100枚 · 9/25引け');
  const call = selectInsights(base({ whale: { ...MU_WHALE, side: 'call' } }), 'ko', 1);
  assert.equal(segText(call[0].short), '고래 신규 콜 +2,100 · 9/25');
});
t('★ A3 금액($)을 싣지 않는다 — ΔOI×100×행사가는 프리미엄이 아니다(예전 «$209M»)', () => {
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const [w] = selectInsights(base({ whale: MU_WHALE }), loc, 1);
    assert.ok(!segText(w.long).includes('$') && !segText(w.short).includes('$'), segText(w.long));
    assert.ok(!segText(w.long).includes('3,477'), '콜+풋 합계를 싣지 않는다');
  }
});
t('★ A3 한쪽 계약 수가 문턱(1,000) 미만이면 칩이 아니다 — 콜 900 + 풋 800 = 1,700 을 «신규 콜 +1,700»으로 적던 사례', () => {
  assert.equal(selectInsights(base({ whale: { side: 'call', contracts: 900, notional: 90e6, date: '2026-09-25', prevDate: '2026-09-24' } }), 'ko', 2).length, 0);
});
t('★ A3 «전 세션 대비»가 아니면 버린다 — prevDate 가 직전 거래일이 아니거나(적재가 하루 빠짐) 없으면', () => {
  assert.equal(selectInsights(base({ whale: { ...MU_WHALE, prevDate: '2026-09-23' } }), 'ko', 2).length, 0);
  assert.equal(selectInsights(base({ whale: { ...MU_WHALE, prevDate: null } }), 'ko', 2).length, 0);
  assert.equal(selectInsights(base({ whale: { ...MU_WHALE, prevDate: undefined } }), 'ko', 2).length, 0);
  // 휴장을 건너뛴 직전 거래일은 정상: 9/8(화) 판본의 직전은 9/4(금) — 9/7 노동절
  const lab = selectInsights(base({ nowMs: et('2026-09-08', 20), todayLocal: '2026-09-09', whale: { ...MU_WHALE, date: '2026-09-08', prevDate: '2026-09-04' } }), 'ko', 1);
  assert.equal(lab[0]?.kind, 'whale');
});
t('무료는 1개 — 같은 입력에서 1순위만', () => {
  const c = selectInsights(base({ earnings: { date: '2026-09-30' }, whale: MU_WHALE }), 'ko', 1);
  assert.deepEqual(c.map((x) => x.kind), ['earnings']);
});
t('고래: 판본이 오래됐거나(목 → 월 저녁 기대 금) 작으면 버린다', () => {
  const stale = selectInsights(base({ whale: { contracts: 5000, notional: 5e8, side: 'call', date: '2026-09-24', prevDate: '2026-09-23' } }), 'ko', 2);
  assert.equal(stale.length, 0);
  const small = selectInsights(base({ whale: { contracts: 500, notional: 5e8, side: 'call', date: '2026-09-25', prevDate: '2026-09-24' } }), 'ko', 2);
  assert.equal(small.length, 0);
  const cheap = selectInsights(base({ whale: { contracts: 5000, notional: 5e6, side: 'call', date: '2026-09-25', prevDate: '2026-09-24' } }), 'ko', 2);
  assert.equal(cheap.length, 0, '행사가 기준 명목 $10M 미만');
});
t('장외 비중: 물량이 20일 평균의 1.25배 이상일 때만 · 판본 날짜 확인', () => {
  const on = selectInsights(base({ darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'ko', 1);
  assert.equal(segText(on[0].long), '장외 비중 58% · 물량 20일 평균의 1.3배');
  // C13 영어는 «Off-exchange»(줄임말 Off-exch 없이) — 긴·짧은 문장 모두
  const en = selectInsights(base({ darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'en', 1)[0];
  assert.equal(segText(en.long), 'Off-exchange 58% · vol 1.3× 20d avg');
  assert.equal(segText(en.short), 'Off-exchange 58% · 1.3× vol');
  assert.equal(selectInsights(base({ darkPool: { pct: 58, volRatio: 1.1, date: '2026-09-28' } }), 'ko', 1).length, 0);
  assert.equal(selectInsights(base({ darkPool: { pct: 58, volRatio: 2, date: '2026-09-20' } }), 'ko', 1).length, 0);
});
t('만기 주간 맥스페인 괴리: 남은 정규장 3회 이내 + 괴리 2% 이상(만기를 알 때만)', () => {
  const lv = good(338.6, { pf: 320, mp: 330, cw: 350 });
  // 월 20:00 ET(장 마감 뒤) → 목 만기 = 화·수·목 3회
  const c = selectInsights(base({ price: 338.6, levels: lv, levelsExpiration: '2026-10-01' }), 'ko', 2);
  assert.ok(c.some((x) => x.kind === 'mpDiverge'));
  assert.equal(segText(c.find((x) => x.kind === 'mpDiverge')!.long), '만기 주간 맥스 페인 330 · 괴리 +2.6%');
  const en = selectInsights(base({ price: 338.6, levels: lv, levelsExpiration: '2026-10-01' }), 'en', 2).find((x) => x.kind === 'mpDiverge')!;
  assert.equal(segText(en.long), 'Expiry week · max pain 330 · gap +2.6%');
  assert.equal(segText(en.short), 'Max pain 330 · gap +2.6%', '무엇의 +2.6% 인지 밝힌다');
  // 금 만기는 4회 남음 → 아직 만기 주간 칩이 아니다
  const fri = selectInsights(base({ price: 338.6, levels: lv, levelsExpiration: '2026-10-02' }), 'ko', 2);
  assert.ok(!fri.some((x) => x.kind === 'mpDiverge'));
  const noExp = selectInsights(base({ price: 338.6, levels: lv }), 'ko', 2);
  assert.ok(!noExp.some((x) => x.kind === 'mpDiverge'));
});
t('기본값: 가장 가까운 벽까지 거리(META 시안 «풋 플로어 700까지 −2.5%»)', () => {
  const lv = good(718.11, { pf: 700, mp: 740, cw: 780 });
  const c = selectInsights(base({ price: 718.11, levels: lv }), 'ko', 1);
  assert.equal(c[0].kind, 'nearest');
  assert.equal(segText(c[0].long), '풋 플로어 700까지 −2.5%');
});
t('★ 지어내지 않기: 레벨이 정의를 어겼고 다른 사실도 없으면 칩 0개(칩 줄을 숨긴다)', () => {
  const bad = checkLevels({ price: 1053.98, callWall: 1000, putFloor: 60, gammaFlipLevel: 530, maxPain: 970, ...S72() }, NOW);
  assert.equal(selectInsights(base({ price: 1053.98, changePct: -2.6, levels: bad }), 'ko', 2).length, 0);
});
t('레벨이 숨겨져도 다른 출처(실적) 칩은 남긴다(NKE 시안)', () => {
  const bad = checkLevels({ price: 36.39, callWall: 40, putFloor: 38.5, maxPain: 39.5, ...S72() }, NOW);
  // D-n 은 ET 시장 날짜(9/30) — 미국 날짜 9/29(화 08:00 ET)에서 10/1 은 D-2. NOW(월 20:00 ET)면 D-3 이라 칩이 아니다
  const c = selectInsights(base({ nowMs: et('2026-09-29', 8), price: 36.39, levels: bad, earnings: { date: '2026-10-01', hour: 'amc' } }), 'ko', 2);
  assert.deepEqual(c.map((x) => x.kind), ['earnings']);
  assert.equal(segText(c[0].long), '실적 D-2 · 10/1 장 마감 후');
  assert.equal(selectInsights(base({ price: 36.39, levels: bad, earnings: { date: '2026-10-01', hour: 'amc' } }), 'ko', 2).length, 0);
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
  const input = base({ price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' }, whale: MU_WHALE });
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
  const input = base({ earnings: { date: '2026-09-30' }, whale: MU_WHALE });
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
  assert.deepEqual(chipsForPlan(gam, ON_FREE, 'ko').locked, { kind: 'nearest', label: '콜 월' });
  // 실적 + 장외 비중
  const dp = selectInsights(base({ earnings: { date: '2026-09-30' }, darkPool: { pct: 58.2, volRatio: 1.31, date: '2026-09-28' } }), 'ja', 2);
  assert.deepEqual(chipsForPlan(dp, ON_FREE, 'ja').locked, { kind: 'darkpool', label: '場外比率' });
  // 실적 + 감마 플립(오늘 교차)
  const gx = selectInsights(base({ price: 228.86, changePct: -1.5, earnings: { date: '2026-09-30' }, levels: good(228.86, { pf: 200, mp: 220, cw: 250, gf: 230 }) }), 'en', 2);
  assert.deepEqual(chipsForPlan(gx, ON_FREE, 'en').locked, { kind: 'gammaCross', label: 'Gamma flip' });
  const names: Array<[Parameters<typeof chipKindLabel>[0], string, string, string]> = [
    [{ kind: 'earnings', icon: 'cal' }, '실적 일정', 'Earnings date', '決算日程'],
    [{ kind: 'gammaNear', icon: 'gamma' }, '감마 플립', 'Gamma flip', 'ガンマフリップ'],
    [{ kind: 'callNear', icon: 'ceil' }, '콜 월', 'Call wall', 'コールウォール'],
    [{ kind: 'putNear', icon: 'floor' }, '풋 플로어', 'Put floor', 'プットフロア'],
    [{ kind: 'nearest', icon: 'floor' }, '풋 플로어', 'Put floor', 'プットフロア'],
    [{ kind: 'nearest', icon: 'ceil' }, '콜 월', 'Call wall', 'コールウォール'],
    [{ kind: 'whale', icon: 'bolt' }, '고래 신규 포지션', 'Whale positions', '大口新規'],
    [{ kind: 'darkpool', icon: 'layers' }, '장외 비중', 'Off-exchange', '場外比率'],
    [{ kind: 'mpDiverge', icon: 'diamond' }, '맥스 페인', 'Max pain', 'マックスペイン'],
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
  const input = base({ price: 1053.98, earnings: { date: '2026-09-30', hour: 'amc' }, whale: MU_WHALE });
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
t('꺼짐: PRO 권유 문구에 칩이 없다(«내 종목 100개 · 광고 없음»만) · 켜짐이면 칩을 말한다 — 3개 언어', () => {
  const CHIP = /칩|chip|チップ/i;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = WL_COPY[loc];
    for (const x of [c.incl(false, MAX_ITEMS), c.proTrigger(MAX_ITEMS), c.bCapacity(MAX_ITEMS), c.limitTitle(FREE_LIMIT)]) assert.ok(!CHIP.test(x), x);
    assert.ok(CHIP.test(c.incl(true, MAX_ITEMS)), c.incl(true, MAX_ITEMS));
  }
  assert.equal(WL_COPY.ko.incl(false, MAX_ITEMS), '내 종목 100개 · 광고 없음');
  assert.equal(WL_COPY.en.incl(false, MAX_ITEMS), '100-stock watchlist · no ads');
  assert.equal(WL_COPY.ja.incl(false, MAX_ITEMS), 'マイ銘柄100銘柄 · 広告なし');
});
t('★ C1 칩 혜택은 «행마다 2개»라는 사실만 — «모든 칩»이라 쓰지 않고, 장외(FINRA)·고래·실적 종류를 유료 혜택으로 나열하지 않는다', () => {
  const ALL = /모든|every|すべて/i;
  const KINDS = /장외|고래|실적|off-exchange|whale|earnings|場外|大口|決算/i;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = WL_COPY[loc];
    for (const x of [c.bChips, c.bChipsSub, c.incl(true, MAX_ITEMS)]) {
      assert.ok(!ALL.test(x), x);
      assert.ok(!KINDS.test(x), x);
    }
    assert.ok(/2/.test(c.bChips), c.bChips);
  }
});
t('★ C9 알림 문구는 «닿는 순간·실시간»이 아니다 — 5분 봉 확정(체크 5–15분)이 사실', () => {
  const INSTANT = /실시간 포지셔닝|닿는 순간|the moment|real-time positioning|触れた瞬間|リアルタイム・ポジショニング/i;
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = WL_COPY[loc];
    for (const x of [c.bAlerts, c.alertTitle, c.alertLede('NVDA').join(''), c.alertLede(null).join('')]) {
      assert.ok(!INSTANT.test(x), x);
    }
    assert.ok(/5/.test(c.alertLede('NVDA').join('')), '5분 봉 확정을 밝힌다');
  }
});
t('★ C21·C8·C19·C10 한도 시트·길게 누르기 문구 — 제목과 부제가 같은 문장이 아니다 · 개수 판정(내/도달/초과)', () => {
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = WL_COPY[loc];
    assert.notEqual(c.proTrigger(MAX_ITEMS), c.limitTitle(FREE_LIMIT), '한도 시트의 제목과 트리거 한 줄은 다른 문장');
  }
  assert.equal(WL_COPY.ko.lpFree(3, 5), '3/5 · 무료 한도 내');
  assert.equal(WL_COPY.ko.lpFree(5, 5), '5/5 · 무료 한도 도달');
  assert.equal(WL_COPY.ko.lpFree(8, 5), '8/5 · 무료 한도 초과', '한도보다 많이 가진 목록은 «도달»이 아니다');
  assert.equal(WL_COPY.en.lpFree(8, 5), '8/5 · over the free limit');
  assert.equal(WL_COPY.ja.lpFree(8, 5), '8/5 · 無料枠を超過');
  assert.equal(WL_COPY.en.lpPro(1), '1 stock · PRO');
  assert.equal(WL_COPY.en.lpPro(7), '7 stocks · PRO');
  assert.equal(WL_COPY.ko.added, '내 종목에 담았습니다');
  assert.equal(WL_COPY.ja.added, 'マイ銘柄に追加しました');
  assert.equal(WL_COPY.en.limitTitle(5), 'Free plan: up to 5 stocks');
});

t('★ 대표 9/29 PRO 상한 100 — 혜택·트리거 문구는 상수에서 숫자를 받고 «무제한»이라 쓰지 않는다(3개 언어)', () => {
  assert.equal(MAX_ITEMS, 100, '대표 결정 «프로는 100개» — 바꾸면 이 기대값도 같은 커밋에서');
  assert.equal(FREE_LIMIT, 5);
  assert.equal(WL_COPY.ko.bCapacity(MAX_ITEMS), '내 종목 100개');
  assert.equal(WL_COPY.en.bCapacity(MAX_ITEMS), '100-stock watchlist');
  assert.equal(WL_COPY.ja.bCapacity(MAX_ITEMS), 'マイ銘柄100銘柄');
  assert.equal(WL_COPY.ko.proTrigger(MAX_ITEMS), 'PRO로 100종목까지');
  assert.equal(WL_COPY.en.proTrigger(MAX_ITEMS), 'Up to 100 stocks with PRO');
  assert.equal(WL_COPY.ja.proTrigger(MAX_ITEMS), 'PROなら100銘柄まで');
  assert.equal(WL_COPY.ko.maxItems(MAX_ITEMS), '내 종목은 최대 100종목까지 담을 수 있습니다', '상한 토스트와 같은 숫자');
  // 문구 전체(함수는 표본 값으로 불러서)에 «무제한» 계열 낱말이 없다
  const UNLIMITED = /무제한|제한 없|unlimited|no limit|上限なし|無制限|制限なし/i;
  const flat = (v: unknown): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      const out = (v as (...a: unknown[]) => unknown)('NVDA', 5, 100);
      return Array.isArray(out) ? out.map(String) : [String(out)];
    }
    if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap(flat);
    return [];
  };
  for (const loc of ['ko', 'en', 'ja'] as const) {
    for (const x of flat(WL_COPY[loc])) assert.ok(!UNLIMITED.test(x), `${loc}: ${x}`);
  }
});

t('★ 대표 9/29 «중복 설명 없이» — «내 종목» 문구에 면책·데이터 출처가 없다 · 장점 줄은 «기기»(토스트와 같은 말)', () => {
  const DUP = /투자 (권유|조언)|investment advice|投資(勧誘|助言)|Data source|출처|出典/i;
  const flat = (v: unknown): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      const out = (v as (...a: unknown[]) => unknown)('NVDA', 5, 100);
      return Array.isArray(out) ? out.map(String) : [String(out)];
    }
    if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap(flat);
    return [];
  };
  for (const loc of ['ko', 'en', 'ja'] as const) {
    for (const x of flat(WL_COPY[loc])) assert.ok(!DUP.test(x), `${loc}: ${x}`);
  }
  assert.equal(WL_COPY.ko.onDevice, '가입 없이 · 이 기기에 저장');
  assert.equal(WL_COPY.en.onDevice, 'No sign-up · saved on this device');
  assert.ok(WL_COPY.ko.saveFail.includes('기기') && WL_COPY.en.saveFail.includes('device'), '저장 실패 토스트와 같은 말');
});

console.log('━━━ 8. 앱 화면의 «시장 날짜» — UTC·기기 날짜로 세지 않는다(9/30 · marketCalendar) ━━━');
{
  const MC = require('../src/lib/marketCalendar') as typeof import('../src/lib/marketCalendar');
  const fsx = require('node:fs') as typeof import('node:fs');
  const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString('en-US', opts);
  t('daysBetweenYmd — 달력 날짜만(타임존 없음) · 모양이 틀리면 null', () => {
    assert.equal(MC.daysBetweenYmd('2026-09-29', '2026-09-30'), 1);
    assert.equal(MC.daysBetweenYmd('2026-09-30', '2026-09-30'), 0);
    assert.equal(MC.daysBetweenYmd('2026-12-31', '2027-01-04'), 4);
    assert.equal(MC.daysBetweenYmd('2026-03-07', '2026-03-09'), 2, '서머타임 경계도 정수');
    assert.equal(MC.daysBetweenYmd('2026-09-30', '2026-09-29'), -1);
    assert.equal(MC.daysBetweenYmd('x', '2026-09-30'), null);
  });
  t('★ 실적 D-n(앱 «실적 캘린더»·Intel 캘린더) — 한국 새벽(= 미국 전날 장중)에도 미국 날짜로: MU 9/30 은 미국 9/29 에 D-1', () => {
    const kstMorning = et('2026-09-29', 11, 55);                          // KST 9/30 00:55
    assert.equal(MC.etDateOf(kstMorning), '2026-09-29');
    assert.equal(MC.daysBetweenYmd(MC.etDateOf(kstMorning), '2026-09-30'), 1, '새 계산 — D-1');
    // 예전 계산(기기 자정 기준)을 한국 기기로 — 한국 날짜 9/30 → D-0
    const kstDate = new Date(kstMorning).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    assert.equal(kstDate, '2026-09-30');
    assert.equal(MC.daysBetweenYmd(kstDate, '2026-09-30'), 0, '예전 — D-0(틀림)');
    // 틀리던 시각대는 한국 0시~13시(서머타임 · 겨울 14시) — 미국 날짜가 한국 날짜를 따라잡으면 같다
    assert.equal(MC.etDateOf(et('2026-09-30', 0, 0)), new Date(et('2026-09-30', 0, 0)).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  });
  t('★ Intel 실적일 글자 — 달력 날짜 그대로(UTC 정오 · timeZone UTC) · 예전엔 미주 기기에서 늘 하루 앞(9/30 → Sep 29) · 주 묶음은 미국 날짜 요일', () => {
    assert.equal(new Date('2026-09-30T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), 'Sep 30');
    for (const tz of ['America/Los_Angeles', 'America/New_York']) {
      assert.equal(fmt(Date.parse('2026-09-30'), { month: 'short', day: 'numeric', timeZone: tz }), 'Sep 29', `예전(UTC 자정 → ${tz}) — 하루 앞`);
    }
    const weekMax = (todayET: string) => 7 - new Date(`${todayET}T12:00:00Z`).getUTCDay();
    assert.equal(weekMax('2026-09-29'), 5, '화 → 일요일(10/4)까지 5일');
    assert.equal(weekMax('2026-10-04'), 7, '일 → 다음 일요일까지(예전 경계와 같다)');
  });
  t('★ GEX 타임라인 — 날짜 글자는 ET(한국 기기에서 ET 11:00 이후 기록이 «내일»로 찍혔다) · 날 수는 ET 날짜(ET 20:00 이후 기록이 UTC 다음 날로 쪼개졌다)', () => {
    const afternoon = et('2026-09-29', 15, 30);                            // 미국 장중 — KST 9/30 04:30
    assert.equal(fmt(afternoon, { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' }), '9/29');
    assert.equal(fmt(afternoon, { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }), '9/30', '예전(한국 기기) — 내일 날짜');
    const late = [et('2026-09-03', 20, 3), et('2026-09-03', 20, 11), et('2026-09-03', 20, 20)];     // 운영 NVDA 기록(9/3 20:03~20:20 ET)
    assert.deepEqual([...new Set(late.map((x) => MC.etDateOf(x)))], ['2026-09-03']);
    assert.deepEqual([...new Set(late.map((x) => new Date(x).toISOString().slice(0, 10)))], ['2026-09-04'], '예전 — UTC 로 다음 날');
    const run = [et('2026-09-03', 10), et('2026-09-03', 15, 45), ...late];   // 9/3 하루짜리 국면
    assert.equal(new Set(run.map((x) => MC.etDateOf(x))).size, 1, '하루');
    assert.equal(new Set(run.map((x) => new Date(x).toISOString().slice(0, 10))).size, 2, '예전 — 이틀로 셌다');
  });
  t('★ 공시 배지 «최근 7일» — ET 날짜로 센다: 9/22 공시는 ET 9/29 21:00(UTC 9/30)에도 7일째 · 예전(UTC 자정 기준)은 8일로 빠졌다', () => {
    const at = et('2026-09-29', 21, 0);
    assert.equal(MC.daysBetweenYmd('2026-09-22', MC.etDateOf(at)), 7, '새 계산 — 배지에 남는다');
    assert.equal(Math.floor((at - new Date('2026-09-22T00:00:00Z').getTime()) / 86400000), 8, '예전 — 4~5시간 일찍 빠졌다');
    assert.equal(MC.daysBetweenYmd('2026-09-22', MC.etDateOf(et('2026-09-30', 0, 30))), 8, 'ET 자정 넘어서야 8일');
    const src = fsx.readFileSync('src/components/app/DisclosureBadge.tsx', 'utf8');
    assert.ok(src.includes('daysBetweenYmd(d, etDateOf(Date.now()))') && !src.includes("T00:00:00Z').getTime()) / 86400000"));
  });
  t('원천 검사 — 세 화면이 실제로 시장 날짜 함수를 쓴다 · 안 틀리는 곳(cmd GEX 통계)은 그대로', () => {
    const gex = fsx.readFileSync('src/components/app/AppGexTimeline.tsx', 'utf8');
    assert.ok(!gex.includes('toISOString().slice(0, 10)'), 'AppGexTimeline — UTC 날짜 없음');
    assert.equal((gex.match(/etDateOf\((d|p)\.timestamp\)/g) || []).length, 3);
    assert.equal((gex.match(/timeZone: 'America\/New_York'/g) || []).length, 2);
    const intel = fsx.readFileSync('src/app/[locale]/app-view/intel/page.tsx', 'utf8');
    assert.ok(intel.includes('daysBetweenYmd(todayET, ymd)'));
    assert.equal((intel.match(/timeZone: 'UTC'/g) || []).length, 3);
    assert.ok(!intel.includes('todayMid'), '기기 자정 없음');
    const earn = fsx.readFileSync('src/app/[locale]/app-view/earnings/page.tsx', 'utf8');
    assert.ok(earn.includes('daysBetweenYmd(todayET, g.date)') && !earn.includes('today.setHours'));
    // 안 틀리는 곳 — 정규장(09:30~16:00 ET) 기록만 쓰는 cmd GEX 통계는 UTC 날짜 = ET 날짜라 바꾸지 않았다
    assert.ok(fsx.readFileSync('src/app/[locale]/app-view/cmd/page.tsx', 'utf8').includes('if (tm < 570 || tm > 960) return;'));
  });
}

console.log(`\n${n}/${n} 통과`);
