/**
 * 묶음 4 — 원천 날짜·관측 시각·근거(src/lib/sourceStamp.ts)와 그 소비처(무네트워크)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/sourceStamp.test.ts
 *
 * 지키는 것(SESSION-MATRIX-CODEX.md 묶음 4 검증 칸):
 *   · 서로 다른 날짜 응답 — 혼합 행을 최대 날짜 하나로 대표하지 않는다(관심종목 머리말·Intel 옵션 기준)
 *   · 종목별 지연 — 한 종목만 옛 날짜면 그 행은 제 날짜로 말한다
 *   · 세션 전환 중 응답 역전 — 늦게 도착한 옛 원천 응답이 새 값을 덮지 않는다 · 값 없는 응답이 값 있는 직전본을 지우지 않는다
 *   · 오래된 WS 틱 주입 — 가격이 기준가에 가까워도 체결 시각이 지난 세션·시세보다 옛것이면 쓰지 않는다
 *   · 화면의 기존 날짜 표식(«9/28 종가»·«M/D, HH:MM ET»)은 원천 날짜로 채운다(라벨 문구는 그대로)
 */
import assert from 'node:assert/strict';
import {
  asEpochMs, asSessionDate, makeStamp, readStamp, regularPriceStamp, preferNewer, summarizeStamps, wsTickFresh,
  stampTimeLabelET, tickerPayloadStamp, REVERSAL_HOLD_MS, WS_TICK_MAX_IDLE_MS, type SourceStamp,
} from '../src/lib/sourceStamp';
import { liveDisplay, wsTickUsable, tickMismatch, mergeQuotesByStamp, restDisplayStamp, type RestQuote } from '../src/utils/liveQuote';
import { displayBasis, headerBasisOf, priceBasisLabel } from '../src/lib/app/watchlistInsights';
import { mergeRow } from '../src/components/app/watchlist/useWatchlistData';
import { optionsAsOfRange, optionsAsOfNote } from '../src/lib/app/intelOptionsBasis';
import { optionMetrics } from '../src/lib/optionMetrics';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

// 2026-10 은 EDT(UTC−4). 10/16 금 · 10/17 토 · 10/19 월
const ET = (ymd: string, hh: number, mm = 0) => Date.parse(`${ymd}T${String(hh + 4).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
const FRI_REG = ET('2026-10-16', 11, 0);
const MON_PRE = ET('2026-10-19', 8, 0);
const MON_REG = ET('2026-10-19', 10, 30);
const SAT = ET('2026-10-17', 12, 0);

console.log('sourceStamp — 모양');
t('날짜·시각 정규화(초·ns 를 ms 로 · 틀린 모양은 null)', () => {
  assert.equal(asSessionDate('2026-10-16'), '2026-10-16');
  assert.equal(asSessionDate('2026-10-16T20:00:00Z'), '2026-10-16');
  assert.equal(asSessionDate('10/16/2026'), null);
  assert.equal(asEpochMs(1_760_000_000), 1_760_000_000_000);
  assert.equal(asEpochMs(1_760_000_000_000 * 1e6), 1_760_000_000_000);
  assert.equal(asEpochMs(0), null);
  assert.equal(asEpochMs('x'), null);
  const s = makeStamp({ sourceSessionDate: 'bad', observedAt: -1, receivedAt: MON_REG }, SAT);
  assert.deepEqual(s, { sourceSessionDate: null, observedAt: null, receivedAt: MON_REG, basis: 'missing' });
  assert.equal(readStamp({ price: 1 }), null, '스탬프 필드가 없는 옛 응답은 null — 달력으로 지어내지 않는다');
  assert.equal(readStamp({ sourceStamp: { sourceSessionDate: '2026-10-16', basis: 'eod' } })!.sourceSessionDate, '2026-10-16');
});

console.log('regularPriceStamp — 세션별 근거');
t('정규장 오늘 체결 = live · 호가 중간값 = proxy · 종가류 = last-session(값은 있으니 missing 아님)', () => {
  const live = regularPriceStamp({ session: 'regular', regularDate: '2026-10-19', tradeMs: MON_REG - 60_000, priceBasis: 'trade', hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_REG });
  assert.equal(live.basis, 'live'); assert.equal(live.sourceSessionDate, '2026-10-19'); assert.equal(live.observedAt, MON_REG - 60_000);
  assert.equal(regularPriceStamp({ session: 'regular', regularDate: null, tradeMs: MON_REG, priceBasis: 'quote_mid', hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_REG }).basis, 'proxy');
  assert.equal(regularPriceStamp({ session: 'regular', regularDate: null, tradeMs: MON_REG, priceBasis: 'fair_value', hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_REG }).basis, 'live');
  const eodInReg = regularPriceStamp({ session: 'regular', regularDate: '2026-10-16', tradeMs: null, priceBasis: 'eod_close', hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_REG });
  assert.equal(eodInReg.basis, 'last-session'); assert.equal(eodInReg.sourceSessionDate, '2026-10-16');
  // 정규장인데 체결 시각이 지난 거래일 — 오늘 값이 아니다
  const old = regularPriceStamp({ session: 'regular', regularDate: null, tradeMs: FRI_REG, priceBasis: 'trade', hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_REG });
  assert.equal(old.basis, 'last-session'); assert.equal(old.sourceSessionDate, '2026-10-16');
});
t('프리·주말 = 마지막 완료 정규장 종가면 eod · 더 앞이면 last-session · 값 없으면 missing', () => {
  assert.equal(regularPriceStamp({ session: 'pre', regularDate: '2026-10-16', tradeMs: null, hasPrice: true, lastClosed: '2026-10-16', nowMs: MON_PRE }).basis, 'eod');
  assert.equal(regularPriceStamp({ session: 'closed', regularDate: '2026-10-16', tradeMs: null, hasPrice: true, lastClosed: '2026-10-16', nowMs: SAT }).basis, 'eod');
  const late = regularPriceStamp({ session: 'closed', regularDate: '2026-10-15', tradeMs: null, hasPrice: true, lastClosed: '2026-10-16', nowMs: SAT });
  assert.equal(late.basis, 'last-session'); assert.equal(late.sourceSessionDate, '2026-10-15', '종목별 지연 — 그 종목의 날짜를 그대로 싣는다');
  assert.equal(regularPriceStamp({ session: 'post', regularDate: '2026-10-16', tradeMs: null, hasPrice: true, lastClosed: '2026-10-15', nowMs: ET('2026-10-16', 17) }).basis, 'eod', 'POST 의 day.c = 오늘 정규장 종가');
  assert.equal(regularPriceStamp({ session: 'closed', regularDate: '2026-10-16', tradeMs: null, hasPrice: false, lastClosed: '2026-10-16', nowMs: SAT }).basis, 'missing');
});

console.log('preferNewer — 응답 역전');
const st = (d: string | null, basis: SourceStamp['basis'], observedAt: number | null = null, receivedAt = MON_REG): SourceStamp => ({ sourceSessionDate: d, observedAt, receivedAt, basis });
t('옛 날짜 응답은 새 날짜 값을 덮지 못한다 · 같은 날 더 옛 체결도 · 확정 종가(eod)는 같은 날 live 를 대신한다', () => {
  assert.equal(preferNewer(st('2026-10-19', 'live', MON_REG), st('2026-10-16', 'eod'), MON_REG + 1000), false);
  assert.equal(preferNewer(st('2026-10-19', 'live', MON_REG), st('2026-10-19', 'live', MON_REG - 30_000), MON_REG + 1000), false);
  assert.equal(preferNewer(st('2026-10-19', 'live', MON_REG), st('2026-10-19', 'live', MON_REG + 30_000), MON_REG + 31_000), true);
  assert.equal(preferNewer(st('2026-10-19', 'live', MON_REG), st('2026-10-19', 'eod'), MON_REG + 1000), true);
  assert.equal(preferNewer(st('2026-10-19', 'eod'), st('2026-10-19', 'live', MON_REG), MON_REG + 1000), false);
  assert.equal(preferNewer(null, st('2026-10-16', 'eod')), true);
});
t('값 없는 응답(missing)은 값 있는 직전본을 언제까지나 지우지 않는다 · 옛 원천 보류는 10분까지', () => {
  assert.equal(preferNewer(st('2026-10-16', 'eod'), st(null, 'missing'), MON_REG + 1000), false);
  assert.equal(preferNewer(st('2026-10-16', 'eod'), st(null, 'missing'), MON_REG + REVERSAL_HOLD_MS * 10), false);
  assert.equal(preferNewer(st('2026-10-19', 'live', MON_REG), st('2026-10-16', 'eod'), MON_REG + REVERSAL_HOLD_MS + 1), true);
});

console.log('summarizeStamps — 혼합 행');
t('날짜가 섞이면 하나로 대표하지 않는다(sourceSessionDate null · mixed · 최소·최대·최빈)', () => {
  const s = summarizeStamps(['2026-10-16', '2026-10-16', '2026-10-15', null, st('2026-10-16', 'eod')]);
  assert.equal(s.sourceSessionDate, null); assert.equal(s.mixed, true);
  assert.equal(s.minDate, '2026-10-15'); assert.equal(s.maxDate, '2026-10-16'); assert.equal(s.modeDate, '2026-10-16');
  assert.equal(s.undated, 1);
  assert.equal(summarizeStamps(['2026-10-16', '2026-10-16']).sourceSessionDate, '2026-10-16');
  assert.equal(summarizeStamps(['2026-10-16', '2026-10-15']).modeDate, '2026-10-15', '동수면 앞 날짜(보수적으로)');
});

console.log('wsTickFresh — 오래된 WS 틱');
t('지난 세션 체결·세션 시작 전 체결·시세보다 옛 체결은 쓰지 않는다', () => {
  assert.equal(wsTickFresh({ priceTime: FRI_REG, receivedAt: MON_REG }, 'reg', MON_REG), false, '금요일 체결을 월요일 정규장에');
  assert.equal(wsTickFresh({ priceTime: ET('2026-10-19', 9, 29), receivedAt: MON_REG }, 'reg', MON_REG), false, '09:29 프리 체결을 정규장 값으로');
  assert.equal(wsTickFresh({ priceTime: ET('2026-10-19', 3, 59), receivedAt: MON_PRE }, 'pre', MON_PRE), false, '04:00 전 체결을 프리로');
  assert.equal(wsTickFresh({ priceTime: ET('2026-10-19', 15, 59), receivedAt: ET('2026-10-19', 16, 2) }, 'post', ET('2026-10-19', 16, 2)), false, '정규장 마지막 체결을 애프터로');
  assert.equal(wsTickFresh({ priceTime: MON_REG - 120_000, receivedAt: MON_REG }, 'reg', MON_REG, MON_REG - 10_000), false, '시세가 이미 더 늦은 체결을 봤다');
  assert.equal(wsTickFresh({ priceTime: MON_REG - 5_000, receivedAt: MON_REG }, 'regular', MON_REG, MON_REG - 10_000), true);
  assert.equal(wsTickFresh({ priceTime: MON_REG, receivedAt: MON_REG }, 'closed', MON_REG), false);
});
t('체결 시각 없는 틱은 받은 지 10분 넘으면 쓰지 않는다(뒤로 갔다 온 앱 메모리의 틱)', () => {
  assert.equal(wsTickFresh({ priceTime: 0, receivedAt: MON_REG - WS_TICK_MAX_IDLE_MS - 1 }, 'reg', MON_REG), false);
  assert.equal(wsTickFresh({ priceTime: 0, receivedAt: MON_REG - 60_000 }, 'reg', MON_REG), true);
});

console.log('liveQuote — 값과 스탬프가 함께 간다');
const restMonReg: RestQuote = { price: 100, previousClose: 98, changePercent: 2.04, session: 'regular', sourceSessionDate: '2026-10-19', observedAt: MON_REG - 10_000, receivedAt: MON_REG, basis: 'live' };
t('가격이 기준가 0.1% 안이어도 체결 시각이 금요일이면 틱을 쓰지 않는다(가격 근접성만으로 최신 판정 금지)', () => {
  const staleTick = { price: 100.1, changePct: 0, ts: MON_REG, priceTime: FRI_REG };
  assert.equal(wsTickUsable(restMonReg, staleTick, 'reg', MON_REG), false);
  assert.equal(tickMismatch(restMonReg, { ...staleTick, price: 150 }, 'reg', MON_REG), false, '묵은 틱은 시세를 앞당기지 않는다(요청 증가 없음)');
  const d = liveDisplay(restMonReg, staleTick, { wsConnected: true, restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(d.live, false); assert.equal(d.price, 100);
  assert.equal(d.stamp.sourceSessionDate, '2026-10-19'); assert.equal(d.stamp.basis, 'live');
  const fresh = liveDisplay(restMonReg, { price: 100.2, changePct: 0, ts: MON_REG, priceTime: MON_REG - 1000 }, { wsConnected: true, restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(fresh.live, true); assert.equal(fresh.price, 100.2);
  assert.equal(fresh.stamp.observedAt, MON_REG - 1000); assert.equal(fresh.stamp.sourceSessionDate, '2026-10-19');
});
t('시간외 값을 그리면 스탬프는 그 시간외 날짜·체결 시각', () => {
  const s = restDisplayStamp({ price: 100, extendedPrice: 101, extendedDate: '2026-10-19', basis: 'eod', sourceSessionDate: '2026-10-16', ...({ extendedKind: 'live', extendedTime: new Date(MON_PRE).toISOString() } as any) }, true, MON_PRE);
  assert.equal(s.sourceSessionDate, '2026-10-19'); assert.equal(s.observedAt, MON_PRE); assert.equal(s.basis, 'live');
  assert.equal(restDisplayStamp({ price: 100, sourceSessionDate: '2026-10-16', basis: 'eod' }, false, MON_PRE).sourceSessionDate, '2026-10-16');
});
t('응답 역전 병합 — 늦게 온 옛 응답·오류 행은 앞 값을 남긴다, 새 원천은 받는다', () => {
  const prev: Record<string, RestQuote> = {
    NVDA: { ...restMonReg },
    AAPL: { price: 200, sourceSessionDate: '2026-10-19', observedAt: MON_REG - 5_000, receivedAt: MON_REG, basis: 'live' },
    MSFT: { price: 300, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: MON_REG },
  };
  const next: Record<string, RestQuote> = {
    NVDA: { price: 99, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: MON_REG + 2000 },     // 다른 인스턴스의 금요일 값
    AAPL: { price: 201, sourceSessionDate: '2026-10-19', observedAt: MON_REG + 1_000, receivedAt: MON_REG + 2000, basis: 'live' },
    MSFT: { price: 0, error: 'no data in batch', sourceSessionDate: null, basis: 'missing', receivedAt: MON_REG + 2000 },
  };
  const m = mergeQuotesByStamp(prev, next, MON_REG + 2000);
  assert.equal(m.data.NVDA.price, 100); assert.equal(m.data.AAPL.price, 201); assert.equal(m.data.MSFT.price, 300);
  assert.deepEqual(m.kept.sort(), ['MSFT', 'NVDA']);
  assert.deepEqual(mergeQuotesByStamp(undefined, next).data, next);
});

console.log('관심종목 날짜 표식 — 원천 날짜로');
t('월요일 프리에 받은 «금요일 종가» 행은 금요일 날짜 · 한 종목만 목요일이면 그 행은 목요일', () => {
  const fri = displayBasis('pre', false, MON_PRE, { sourceSessionDate: '2026-10-16', basis: 'eod' });
  assert.deepEqual(fri, { kind: 'close', date: '2026-10-16' });
  assert.equal(priceBasisLabel(fri, 'ko', true).includes('10/16') || priceBasisLabel(fri, 'ko').includes('10/16'), true);
  assert.deepEqual(displayBasis('closed', false, SAT, { sourceSessionDate: '2026-10-15', basis: 'last-session' }), { kind: 'close', date: '2026-10-15' });
  // 정규장인데 값이 지난 세션 종가 → «장중»이 아니라 그 날짜 «종가»
  assert.deepEqual(displayBasis('reg', false, MON_REG, { sourceSessionDate: '2026-10-16', basis: 'last-session' }), { kind: 'close', date: '2026-10-16' });
  assert.deepEqual(displayBasis('reg', false, MON_REG, { sourceSessionDate: '2026-10-19', basis: 'live' }), { kind: 'live', date: '2026-10-19' });
  // 원천 날짜가 없는 옛 응답은 예전 그대로(달력)
  assert.deepEqual(displayBasis('closed', false, SAT), { kind: 'close', date: '2026-10-16' });
});
t('머리말은 «가장 최근에 받은 행» 하나가 아니라 가장 많은 행의 기준(동수면 앞 날짜)', () => {
  const rows = [
    { session: 'closed', ext: false, receivedAt: SAT, sourceSessionDate: '2026-10-16', stampBasis: 'eod' },
    { session: 'closed', ext: false, receivedAt: SAT, sourceSessionDate: '2026-10-16', stampBasis: 'eod' },
    { session: 'closed', ext: false, receivedAt: SAT + 60_000, sourceSessionDate: '2026-10-15', stampBasis: 'last-session' },
  ];
  assert.deepEqual(headerBasisOf(rows, SAT + 60_000), { kind: 'close', date: '2026-10-16' });
  assert.deepEqual(headerBasisOf(rows.slice(1), SAT + 60_000), { kind: 'close', date: '2026-10-15' });
  assert.equal(headerBasisOf([], SAT), null);
});
t('mergeRow 가 공용 실시간 값의 스탬프를 행에 싣는다', () => {
  const d = liveDisplay({ price: 100, previousClose: 98, session: 'closed', sourceSessionDate: '2026-10-16', basis: 'eod' }, undefined, { wsConnected: false, restAt: SAT, nowMs: SAT })!;
  const row = mergeRow(d, null, true)!;
  assert.equal(row.sourceSessionDate, '2026-10-16'); assert.equal(row.stampBasis, 'eod');
});

console.log('Intel 옵션 기준 — 혼합 행');
t('행 날짜가 섞이면 가장 앞 날짜로 말한다(«이전 세션» 표식이 그대로 붙는다) · 하나면 그 날', () => {
  const thu = ET('2026-10-15', 17), fri = ET('2026-10-16', 17);
  const r = optionsAsOfRange([{ optionsAsOf: fri }, { optionsAsOf: thu }, { optionsAsOf: null }]);
  assert.equal(r.mixed, true); assert.equal(r.latest, fri); assert.equal(r.noteAsOf, thu);
  const note = optionsAsOfNote(r.noteAsOf, SAT, false, 'ko')!;
  assert.equal(note.session, '2026-10-15'); assert.equal(note.isPriorSession, true);
  assert.equal(optionsAsOfRange([{ optionsAsOf: fri }, { optionsAsOf: fri + 1000 }]).noteAsOf, fri + 1000);
});

console.log('Flow·Command 시각 칸 — 원천 시각');
t('정규장 종가는 그날 마감 시각 · live 는 관측 시각 · 원천이 없으면 null(호출자가 예전 시계 유지)', () => {
  assert.equal(stampTimeLabelET(st('2026-10-16', 'eod'), null), '10/16, 16:00 ET');
  assert.equal(stampTimeLabelET(st('2026-11-27', 'eod'), null), '11/27, 13:00 ET', '조기 폐장');
  assert.equal(stampTimeLabelET(st('2026-10-19', 'live', ET('2026-10-19', 10, 5)), null), '10/19, 10:05 ET');
  assert.equal(stampTimeLabelET(null, '10/16/2026, 16:00'), '10/16, 16:00 ET');
  assert.equal(stampTimeLabelET(st(null, 'missing'), null), null);
});
t('live/ticker 응답 스탬프 — 캐시 적중도 «지금» 기준으로 다시 매긴다', () => {
  const p = { session: 'CLOSED', price: 100, display: { price: 100 }, prices: { regularDate: '2026-10-16' } };
  assert.equal(tickerPayloadStamp(p, '2026-10-16', SAT).basis, 'eod');
  assert.equal(tickerPayloadStamp(p, '2026-10-19', ET('2026-10-19', 17)).basis, 'last-session', '월요일 마감 뒤에도 금요일 값이면 이전 세션');
  const reg = tickerPayloadStamp({ session: 'REG', price: 101, priceTradeMs: MON_REG - 1000, priceBasis: 'trade', prices: { regularDate: '2026-10-19' } }, '2026-10-16', MON_REG);
  assert.equal(reg.basis, 'live'); assert.equal(reg.observedAt, MON_REG - 1000);
});

console.log('관문 1차 보류 수리');
t('P1 — 체결 시각이 오늘·세션 안이어도 받은 지 90분 된 틱은 쓰지 않는다(시세 관측 시각이 없어도)', () => {
  const tick = { priceTime: MON_REG - 90 * 60_000, receivedAt: MON_REG - 90 * 60_000 };
  assert.equal(wsTickFresh(tick, 'reg', MON_REG + 30 * 60_000), false);
  assert.equal(tickMismatch({ price: 100, session: 'regular' }, { price: 150, changePct: 0, ts: tick.receivedAt, priceTime: tick.priceTime }, 'reg', MON_REG + 30 * 60_000), false, '묵은 틱은 앞당김 대상도 아니다');
  assert.equal(wsTickFresh({ priceTime: MON_REG - 15 * 60_000, receivedAt: MON_REG }, 'reg', MON_REG), true, '15분 지연 허브의 «새로 받은» 틱은 통과');
});
t('P1 — 프리 행을 오류 응답 대신 남겨도 세션은 지금 응답의 것(정규장) → 신선한 정규장 틱을 쓴다', () => {
  const prev: Record<string, RestQuote> = { NVDA: { price: 100, previousClose: 98, session: 'pre', extendedPrice: 0, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: MON_REG - 60_000 } };
  const next: Record<string, RestQuote> = { NVDA: { price: 0, changePercent: 0, error: 'no data in batch', basis: 'missing', receivedAt: MON_REG } };
  const m = mergeQuotesByStamp(prev, next, MON_REG, { asked: ['NVDA'], session: 'regular' });
  assert.equal(m.data.NVDA.price, 100); assert.equal(m.data.NVDA.session, 'regular');
  const d = liveDisplay(m.data.NVDA, { price: 100.5, changePct: 0, ts: MON_REG, priceTime: MON_REG - 2000 }, { wsConnected: true, session: 'reg', restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(d.live, true); assert.equal(d.price, 100.5);
});
t('P2 — 한 묶음이 실패해 응답에서 빠진 종목도 직전 정상 가격을 남긴다(제 날짜를 단 채)', () => {
  const prev: Record<string, RestQuote> = { A: { price: 10, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: SAT }, B: { price: 20, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: SAT } };
  const next: Record<string, RestQuote> = { A: { price: 11, sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: SAT + 1000 } };
  const m = mergeQuotesByStamp(prev, next, SAT + 1000, { asked: ['A', 'B'], session: 'closed' });
  assert.equal(m.data.A.price, 11); assert.equal(m.data.B.price, 20); assert.equal(m.data.B.sourceSessionDate, '2026-10-16');
});
t('P2 — 같은 날 시간외 체결이 더 옛 응답이면 시간외 칸만 앞 값(PRE 08:25 $102 → 08:20 $101 역전 방지)', () => {
  const base = { price: 100, previousClose: 98, session: 'pre', sourceSessionDate: '2026-10-16', basis: 'eod', extendedLabel: 'PRE', extendedDate: '2026-10-19', extendedKind: 'live' } as any;
  const prev = { X: { ...base, extendedPrice: 102, extendedTime: new Date(ET('2026-10-19', 8, 25)).toISOString(), receivedAt: MON_PRE } };
  const next = { X: { ...base, extendedPrice: 101, extendedTime: new Date(ET('2026-10-19', 8, 20)).toISOString(), receivedAt: MON_PRE + 5000 } };
  const m = mergeQuotesByStamp(prev, next, MON_PRE + 5000, { asked: ['X'], session: 'pre' });
  assert.equal(m.data.X.extendedPrice, 102);
  const fwd = mergeQuotesByStamp(next, prev, MON_PRE + 6000, { asked: ['X'], session: 'pre' });
  assert.equal(fwd.data.X.extendedPrice, 102, '더 새 체결은 받는다');
});
t('P2 — 지난 세션 «장중» 마지막 체결(11:00)은 시각 칸에 16:00 이 아니라 그 체결 시각', () => {
  assert.equal(stampTimeLabelET(st('2026-10-16', 'last-session', ET('2026-10-16', 11, 0)), null), '10/16, 11:00 ET');
  assert.equal(stampTimeLabelET(st('2026-10-16', 'last-session'), null), '10/16, 16:00 ET');
});
t('밤 검토 3 — GEX(구조 체인 10/15)와 P/C(OI 행 10/16)의 날짜를 따로 싣고, 공용 기준은 앞 날짜(10/15)', () => {
  const NOW = ET('2026-10-17', 12);
  const m = optionMetrics({ netGex: 5e8, squeezeScore: 40, squeezeRisk: 'LOW', chainDate: '2026-10-15' }, { pcr: 0.9, timestamp: ET('2026-10-16', 17) }, NOW);
  assert.equal(m.gexSessionDate, '2026-10-15'); assert.equal(m.pcrSessionDate, '2026-10-16'); assert.equal(m.optionsAsOfMixed, true);
  assert.equal(optionsAsOfNote(m.optionsAsOf, NOW, false, 'ko')!.session, '2026-10-15');
  const same = optionMetrics({ netGex: 5e8, chainDate: '2026-10-16' }, { pcr: 0.9, timestamp: ET('2026-10-16', 17) }, NOW);
  assert.equal(same.optionsAsOf, ET('2026-10-16', 17)); assert.equal(same.optionsAsOfMixed, false);
  const gexOnly = optionMetrics({ netGex: 5e8, chainDate: '2026-10-16' }, null, NOW);
  assert.equal(optionsAsOfNote(gexOnly.optionsAsOf, NOW, false, 'ko')!.session, '2026-10-16', 'P/C 가 없어도 GEX 날짜로 말한다');
  assert.equal(optionMetrics(null, null, NOW).optionsAsOf, null);
});

console.log('관문 2차 보류 수리');
t('P1 — 정규장 $110·PRE CLOSE $102 행을 애프터 전환 뒤 결측 응답 대신 남겨도 «$102 · 애프터»가 되지 않는다', () => {
  const POST = ET('2026-10-19', 16, 5);
  const prev = { X: { price: 110, previousClose: 100, session: 'regular', extendedPrice: 102, extendedLabel: 'PRE', extendedDate: '2026-10-19', extendedKind: 'close', sourceSessionDate: '2026-10-19', observedAt: POST - 6 * 60_000, basis: 'live', receivedAt: POST - 60_000 } as RestQuote };
  const next = { X: { price: 0, changePercent: 0, error: 'no data in batch', basis: 'missing', receivedAt: POST } as RestQuote };
  const m = mergeQuotesByStamp(prev, next, POST, { asked: ['X'], session: 'post' });
  assert.equal(m.data.X.session, 'post'); assert.equal(m.data.X.extendedPrice, 0);
  const d = liveDisplay(m.data.X, undefined, { wsConnected: false, session: 'post', restAt: POST, nowMs: POST })!;
  assert.equal(d.price, 110); assert.equal(d.ext, false);
});
t('P1 — 개장 뒤 늦게 온 «옛 원천» 응답으로 앞 값을 남겨도 세션은 정규장 → 신선한 정규장 틱을 쓴다', () => {
  const prev = { N: { price: 100, previousClose: 98, session: 'pre', sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: MON_REG - 120_000 } as RestQuote };
  const next = { N: { price: 97, previousClose: 96, session: 'regular', sourceSessionDate: '2026-10-15', basis: 'last-session', receivedAt: MON_REG } as RestQuote };
  const m = mergeQuotesByStamp(prev, next, MON_REG, { asked: ['N'], session: 'regular' });
  assert.equal(m.data.N.price, 100); assert.equal(m.data.N.session, 'regular');
  const d = liveDisplay(m.data.N, { price: 100.5, changePct: 0, ts: MON_REG, priceTime: MON_REG - 2000 }, { wsConnected: true, session: 'reg', restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(d.live, true); assert.equal(d.price, 100.5);
});

console.log('관문 3차 보류 수리');
t('P1 — 금요일 종가 $100·목요일 $98 프리 행을 월요일 개장 뒤 남기면 틱 등락은 $100 기준(+0.50%) · 틱 없으면 원래 숫자(금요일 등락)', () => {
  const prev = { N: { price: 100, previousClose: 98, prevClose: 98, changePercent: 2.04, session: 'pre', sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: MON_REG - 120_000 } as RestQuote };
  const next = { N: { price: 0, error: 'no data in batch', basis: 'missing', receivedAt: MON_REG } as RestQuote };
  const m = mergeQuotesByStamp(prev, next, MON_REG, { asked: ['N'], session: 'regular' });
  const d = liveDisplay(m.data.N, { price: 100.5, changePct: 2.55, ts: MON_REG, priceTime: MON_REG - 2000 }, { wsConnected: true, session: 'reg', restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(d.price, 100.5); assert.equal(Math.round(d.changePct! * 100) / 100, 0.5);
  const noTick = liveDisplay(m.data.N, undefined, { wsConnected: true, session: 'reg', restAt: MON_REG, nowMs: MON_REG })!;
  assert.equal(noTick.price, 100); assert.equal(noTick.changePct, 2.04, '0.00% 를 지어내지 않는다');
  assert.equal(noTick.stamp.sourceSessionDate, '2026-10-16');
});

console.log(`\n${n} passed`);
