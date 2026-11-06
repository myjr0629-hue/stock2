import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { contradictsChips, firstSentence, selloffWhyFallback, selloffWhyFromReport, selloffWhyLine, selloffTitleKey, currentSelloff, loadRetainedSelloff, mergeSelloffRecord, mergeSelloffRecords, readSelloffMacro, saveRetainedSelloff, SELLOFF_STORE_KEY, selloffForDisplay, selloffPreviewParam, selloffBrief, selloffShown, SELLOFF_COPY, scorecardWeek, type SelloffBrief, type SelloffMacro } from '../src/lib/selloffBriefing';
const now = Date.parse('2026-11-02T15:00:00Z');
const cash = (changePct: number, sessionDate = '2026-10-30', asOf = '2026-10-30T20:00:00Z') => ({ changePct, sessionDate, asOf, price: 100 });
const factor = (chgPct: number, marketTime = '2026-10-30T20:00:00Z') => ({ chgPct, marketTime, status: 'OK', source: 'YAHOO' });
test('SOX and VIX retain nonzero observations against a later zero roll regardless of level', () => {
  for (const [name, key] of [['VIX', 'vix'], ['SOX', 'sox']] as const) {
    const initial: SelloffMacro = { factors: { [key]: { ...factor(12.9), level: 19.42, chgAbs: 2.22 } } };
    const later: SelloffMacro = { factors: { [key]: { ...factor(0, '2026-10-30T20:15:01Z'), level: 19.42, chgAbs: 0 } } };
    const first = mergeSelloffRecord({ now, macro: initial, stored: null, storedKnown: true }).record!;
    const result = mergeSelloffRecord({ now, macro: later, stored: first, storedKnown: true });
    assert.equal(result.record?.chips[0].pct, 12.9, name);
    assert.equal(result.write, false);
    const zero = mergeSelloffRecord({ now, macro: later, stored: null, storedKnown: true }).record!;
    assert.equal(mergeSelloffRecords(first, zero, first.date)?.chips[0].pct, 12.9);
    assert.equal(mergeSelloffRecords(zero, first, first.date)?.chips[0].pct, 0);
    const correction: SelloffMacro = { factors: { [key]: { ...factor(3, '2026-10-30T20:15:01Z'), level: 19.43, chgAbs: 0 } } };
    const fixed = mergeSelloffRecord({ now, macro: correction, stored: first, storedKnown: true });
    assert.equal(fixed.record?.chips[0].pct, 3);
    assert.equal(fixed.write, true);
  }
});
test('four exact thresholds and just inside each boundary', () => {
  const make = (i: number, value: number): SelloffMacro => i === 0 ? { indexBasis: { cash: { spx: cash(value) } } } : i === 1 ? { indexBasis: { cash: { ndx: cash(value) } } } : { factors: { [i === 2 ? 'sox' : 'vix']: factor(value) } };
  [-1.5, -2, -3, 10].forEach((v, i) => { assert.ok(selloffBrief(make(i, v), now)); assert.equal(selloffBrief(make(i, v + (i === 3 ? -0.01 : 0.01)), now), null); });
});
test('missing, mismatched, intraday, future, and unavailable values do not trigger', () => {
  assert.equal(selloffBrief(null, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-11-02', '2026-11-02T14:59:00Z') } }, factors: { sox: factor(-5, '2026-10-29T20:00:00Z') } }, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-10-30', '2026-10-30T19:00:00Z') } }, factors: { vix: { ...factor(20), status: 'UNAVAILABLE' } } }, now), null);
  assert.equal(selloffBrief({ factors: { vix: factor(20, '2026-11-02T21:00:00Z') } }, now), null);
  assert.equal(selloffBrief({ indexBasis: { cash: { spx: cash(-5, '2026-10-29') } }, factors: { sox: factor(-3) } }, now)?.chips.length, 1);
});
test('three locales provide all card labels and week starts Monday', () => {
  for (const loc of ['ko', 'en', 'ja'] as const) for (const text of Object.values(SELLOFF_COPY[loc])) assert.ok(text.length > 0);
  assert.equal(scorecardWeek('2026-10-30'), '2026-10-26');
});
test('card only requests the scorecard and does not subscribe to earnings calendar', () => {
  const source = readFileSync('src/app/[locale]/app-view/dash/SelloffCard.tsx', 'utf8');
  assert.doesNotMatch(source, /watchEarningsCalendar|earningsCalendarData|t\.mine/);
  // «왜» 줄(대표 11/6 승인)은 날짜 지정 리포트 저장본만 읽는다 — 날짜 없는 GET(자가 치유 생성 경로)은 금지.
  assert.deepEqual([...source.matchAll(/crossBriefUrl\(([^)]*)\)/g)].map(m => m[1]), ['brief.date']);
  assert.deepEqual([...source.matchAll(/fetch\(`([^`]+)`/g)].map(m => m[1].split('?')[0]), ['/api/earnings/scorecard']);
});
test('failed macro response clears card and prior session expires at next close', async () => {
  const macro = { indexBasis: { cash: { spx: cash(-5) } } };
  const success = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify(macro)) }, now);
  assert.ok(success.brief);
  for (const result of [
    { status: 'rejected', reason: new Error('network') } as const,
    { status: 'fulfilled', value: new Response('', { status: 503 }) } as const,
    { status: 'fulfilled', value: new Response('invalid json') } as const,
  ]) assert.equal((await readSelloffMacro(result, now)).brief, null);
  assert.equal(currentSelloff(success.brief, now)?.date, '2026-10-30');
  assert.equal(currentSelloff(success.brief, Date.parse('2026-11-02T21:00:00Z')), null);
  assert.equal(selloffBrief(macro, Date.parse('2026-11-02T21:00:00Z')), null);
});
test('preview query is ignored in production for on and off', () => {
  for (const value of ['on', 'off']) {
    assert.equal(selloffPreviewParam(`?selloffPreview=${value}`, 'production'), null);
    assert.equal(selloffPreviewParam(`?selloffPreview=${value}`, 'development'), value);
  }
});

// ── 표시 창(코디네이터 11/2): 급락 세션 D(금 10/30) 마감 ~ 다음 정규장(월 11/2) 마감 ──
const at = Date.parse;
// 10/30 실제 운영 응답과 같은 모양(현물 S&P −1.82%·NDX 피드 없음·SOX −7.2%·VIX +12.9%, 16:47/16:15 ET 마감 관측)
const fridayClose: SelloffMacro = {
  indexBasis: { cash: { spx: { changePct: -1.82, sessionDate: '2026-10-30', asOf: '2026-10-30T20:47:43Z', price: 7580 }, ndx: { changePct: null, sessionDate: null, asOf: null, price: null } } },
  factors: { sox: factor(-7.2, '2026-10-30T21:16:01Z'), vix: factor(12.9, '2026-10-30T20:15:01Z') },
};
// 월요일 장중(10:00 EST)엔 같은 응답 칸이 월요일 장중 값으로 바뀐다(평온한 장).
const mondayIntraday = (t = '2026-11-02T14:59:00Z'): SelloffMacro => ({
  indexBasis: { cash: { spx: { changePct: 0.3, sessionDate: '2026-11-02', asOf: t, price: 7600 } } },
  factors: { sox: factor(0.5, t), vix: factor(-4, t) },
});
const day = (macro: SelloffMacro | null, iso: string, retained: SelloffBrief | null = null) => selloffForDisplay({ now: at(iso), macro, retained });
/** 칩 비교에서 관측 시각(at)은 따로 본다 */
const bare = (b: SelloffBrief | null | undefined) => b ? { date: b.date, chips: b.chips.map(({ name, pct }) => ({ name, pct })) } : b;

test('window: hidden before the sell-off session closes, shown from its close', () => {
  const intradayFri = { indexBasis: { cash: { spx: cash(-2.5, '2026-10-30', '2026-10-30T19:58:00Z') } }, factors: { sox: factor(-6, '2026-10-30T19:58:00Z') } };
  assert.equal(day(intradayFri, '2026-10-30T19:58:30Z'), null);              // 금 15:58 ET 장중 — D 는 아직 목요일
  assert.equal(day(fridayClose, '2026-10-30T20:59:00Z')?.date, '2026-10-30'); // 금 장후
  const atClose = { indexBasis: { cash: { spx: cash(-1.5, '2026-10-30', '2026-10-30T19:59:00Z') } } };
  assert.equal(day(atClose, '2026-10-30T20:00:00Z')?.date, '2026-10-30');      // 16:00 정각, 15:59 마지막 봉
  assert.equal(day({ indexBasis: { cash: { spx: cash(-1.5, '2026-10-30', '2026-10-30T19:58:00Z') } } }, '2026-10-30T20:00:00Z'), null); // 15:58 장중 봉은 종가 아님
});

test('window: weekend and next pre-open keep the card from the macro payload alone', () => {
  const sat = day(fridayClose, '2026-10-31T15:00:00Z');
  assert.deepEqual(bare(sat), { date: '2026-10-30', chips: [{ name: 'S&P 500', pct: -1.82 }, { name: 'SOX', pct: -7.2 }, { name: 'VIX', pct: 12.9 }] });
  assert.equal(day(fridayClose, '2026-11-02T14:29:00Z')?.date, '2026-10-30'); // 월 09:29 EST 개장 1분 전
  // 개장 전 VIX 만 월요일 시각으로 넘어가도, 같은 D 보관본이 VIX 칸을 잇는다.
  const vixRolled = { ...fridayClose, factors: { ...fridayClose.factors, vix: factor(-1, '2026-11-02T13:00:00Z') } };
  assert.deepEqual(day(vixRolled, '2026-11-02T13:05:00Z', sat)?.chips.map(c => c.pct), [-1.82, -7.2, 12.9]);
});

test('window: during the next regular session the D card stays (gate 11020215 regression)', () => {
  const kept = day(fridayClose, '2026-10-31T15:00:00Z');
  assert.ok(kept);
  for (const t of ['2026-11-02T14:30:00Z', '2026-11-02T15:00:00Z', '2026-11-02T20:59:00Z']) {
    const shown = day(mondayIntraday(new Date(at(t) - 60_000).toISOString()), t, kept);
    assert.equal(shown?.date, '2026-10-30', t);
    assert.deepEqual(shown?.chips, kept!.chips);
    assert.equal(currentSelloff(shown, at(t))?.date, '2026-10-30');
  }
  // D 기록(서버 selloffRecord·기기 보관본)이 하나도 없으면 장중 응답만으로는 D 를 알 수 없다 → 꾸며 내지 않고 숨긴다.
  assert.equal(day(mondayIntraday(), '2026-11-02T15:00:00Z'), null);
  // 다른 세션의 보관본은 쓰지 않는다.
  assert.equal(day(mondayIntraday(), '2026-11-02T15:00:00Z', { ...kept!, date: '2026-10-29' }), null);
});

test('window: disappears once the next session closes without a sell-off, new sell-off replaces it', () => {
  const kept = day(fridayClose, '2026-10-31T15:00:00Z')!;
  const mondayClose = mondayIntraday('2026-11-02T20:59:00Z');
  assert.equal(day(mondayClose, '2026-11-02T21:01:00Z', kept), null);
  assert.equal(currentSelloff(kept, at('2026-11-02T21:00:00Z')), null);      // 상태에 남은 카드도 16:00 EST 렌더에서 사라진다
  assert.equal(currentSelloff(kept, at('2026-11-02T20:59:59Z'))?.date, '2026-10-30');
  const mondaySelloff = { ...mondayClose, factors: { ...mondayClose.factors, sox: factor(-3.1, '2026-11-02T21:00:30Z') } };
  assert.equal(day(mondaySelloff, '2026-11-02T21:01:00Z', kept)?.date, '2026-11-02');
});

test('data missing or stale hides the card even inside the window', () => {
  const kept = day(fridayClose, '2026-10-31T15:00:00Z')!;
  assert.equal(day(null, '2026-11-02T15:00:00Z', kept), null);                // 요청 실패
  assert.equal(day({}, '2026-11-02T15:00:00Z', kept), null);                  // 빈 응답
  const stale: SelloffMacro = { indexBasis: { cash: { spx: cash(0.2, '2026-10-29', '2026-10-29T20:30:00Z') } }, factors: { sox: factor(0.1, '2026-10-29T21:00:00Z'), vix: factor(1, '2026-10-29T20:15:00Z') } };
  assert.equal(day(stale, '2026-11-02T15:00:00Z', kept), null);               // 멈춘 피드(D 이전 시각)
  assert.equal(day(stale, '2026-10-31T15:00:00Z'), null);
  const future = mondayIntraday('2026-11-02T16:00:00Z');
  assert.equal(day(future, '2026-11-02T15:00:00Z', kept), null);              // 미래 시각만 있는 응답
  const failed = { factors: { sox: { ...factor(0, '2026-11-02T14:59:00Z'), status: 'UNAVAILABLE' }, vix: { ...factor(0, '2026-11-02T14:59:00Z'), source: 'FAIL' } } };
  assert.equal(day(failed, '2026-11-02T15:00:00Z', kept), null);              // 실패 표시 관측은 «현재» 근거가 아니다
  // 같은 관측 시각이라도 더 늦은 세대의 정정이면 반영한다.
  const corrected = { ...fridayClose, fetchedAtET: '2026-10-31T14:00:00.000Z', selloffReadAt: '2026-10-31T14:00:00.000Z', indexBasis: { cash: { spx: { ...fridayClose.indexBasis!.cash!.spx!, changePct: -0.4 } } }, factors: { sox: factor(-1, '2026-10-30T21:16:01Z'), vix: factor(3, '2026-10-30T20:15:01Z') } };
  assert.equal(day(corrected, '2026-10-31T15:00:00Z', kept), null);
});

test('retained storage is shape-checked and never throws', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const kept = day(fridayClose, '2026-10-31T15:00:00Z');
  saveRetainedSelloff(store, kept);
  assert.deepEqual(loadRetainedSelloff(store), kept);
  saveRetainedSelloff(store, null);                                          // 조건 미달은 덮어쓰지 않는다(날짜로 만료)
  assert.deepEqual(loadRetainedSelloff(store), kept);
  mem.set(SELLOFF_STORE_KEY, '{bad json');
  assert.equal(loadRetainedSelloff(store), null);
  mem.set(SELLOFF_STORE_KEY, JSON.stringify({ date: '2026-10-30', chips: [{ name: 'DOW', pct: -9 }, { name: 'VIX', pct: 'x' }] }));
  assert.equal(loadRetainedSelloff(store), null);
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(loadRetainedSelloff(throwing), null);
  assert.doesNotThrow(() => saveRetainedSelloff(throwing, kept));
  assert.equal(loadRetainedSelloff(null), null);
});

test('preview flag is ignored in production end-to-end; dev on/off forces the card', () => {
  const kept = day(fridayClose, '2026-10-31T15:00:00Z');
  const now = at('2026-11-02T21:01:00Z');                                    // 창 밖
  for (const v of ['on', 'off']) assert.equal(selloffShown(selloffPreviewParam(`?selloffPreview=${v}`, 'production'), kept, now), null);
  assert.deepEqual(selloffShown(selloffPreviewParam('?selloffPreview=off', 'production'), kept, at('2026-11-02T15:00:00Z')), kept);
  assert.ok(selloffShown(selloffPreviewParam('?selloffPreview=on', 'development'), null, now));
  assert.equal(selloffShown(selloffPreviewParam('?selloffPreview=off', 'development'), kept, at('2026-11-02T15:00:00Z')), null);
});

test('corrected D close overwrites the retained record so it cannot revive next session (gate 11020317)', async () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const load = async (macro: SelloffMacro, iso: string) => {
    const r = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify(macro)) }, at(iso), loadRetainedSelloff(store));
    saveRetainedSelloff(store, r.record);
    return r.brief;
  };
  assert.equal((await load(fridayClose, '2026-10-30T21:00:00Z'))?.date, '2026-10-30');      // 금 장후: 급락 저장
  const corrected: SelloffMacro = {
    fetchedAtET: '2026-10-31T14:00:00.000Z', selloffReadAt: '2026-10-31T14:00:00.000Z',
    indexBasis: { cash: { spx: { changePct: -0.4, sessionDate: '2026-10-30', asOf: '2026-10-30T20:47:43Z', price: 7580 } } },
    factors: { sox: factor(-1, '2026-10-30T21:16:01Z'), vix: factor(3, '2026-10-30T20:15:01Z') },
  };
  assert.equal(await load(corrected, '2026-10-31T15:00:00Z'), null);                         // 토: 종가 정정 → 숨김
  assert.deepEqual(loadRetainedSelloff(store)?.chips.map(c => c.pct), [-0.4, -1, 3]);       // 보관본도 정정값
  assert.equal(await load(mondayIntraday(), '2026-11-02T15:00:00Z'), null);                  // 월 장중: 되살아나지 않음
  // 정정 없이 금→월 장중이면 그대로 이어진다(같은 경로).
  mem.clear();
  await load(fridayClose, '2026-10-30T21:00:00Z');
  assert.equal((await load(mondayIntraday(), '2026-11-02T15:00:00Z'))?.date, '2026-10-30');
  // 일부 지표만 정정(S&P 만 −0.4)이면 정정 안 된 SOX·VIX 기록으로 조건 유지.
  mem.clear();
  await load(fridayClose, '2026-10-30T21:00:00Z');
  const spxOnly = { ...fridayClose, selloffReadAt: '2026-10-31T14:00:00.000Z', indexBasis: { cash: { spx: { ...fridayClose.indexBasis!.cash!.spx!, changePct: -0.4 } } } };
  assert.deepEqual((await load(spxOnly, '2026-10-31T15:00:00Z'))?.chips.map(c => c.pct), [-0.4, -7.2, 12.9]);
});

test('first visit during the next session: server D record keeps the card (gate 11020319)', async () => {
  // 서버(macro 라우트)가 D 마감 뒤 응답마다 기록을 합쳐 캐시에 둔다.
  let stored: SelloffBrief | null = null;
  const serve = (macro: SelloffMacro, iso: string) => {
    const { record, write } = mergeSelloffRecord({ now: at(iso), macro, stored, storedKnown: true });
    if (write && record) stored = record;
    return record ? { ...macro, selloffRecord: record } : macro;
  };
  const first = serve(fridayClose, '2026-10-30T21:20:00Z');
  assert.deepEqual(bare(stored), { date: '2026-10-30', chips: [{ name: 'S&P 500', pct: -1.82 }, { name: 'SOX', pct: -7.2 }, { name: 'VIX', pct: 12.9 }] });
  assert.equal(mergeSelloffRecord({ now: at('2026-10-30T21:20:00Z'), macro: fridayClose, stored, storedKnown: true }).write, false); // 같은 세대면 다시 쓰지 않음
  assert.ok(first);
  // 월 10:00 EST — 이 기기는 처음(보관본 없음), 응답은 월요일 장중 값 + 서버 D 기록.
  const monday = serve(mondayIntraday(), '2026-11-02T15:00:00Z');
  assert.equal(mergeSelloffRecord({ now: at('2026-11-02T15:00:00Z'), macro: mondayIntraday(), stored, storedKnown: true }).write, false); // 장중 값만으로는 쓰지 않음
  const visit = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify(monday)) }, at('2026-11-02T15:00:00Z'), null);
  assert.equal(visit.brief?.date, '2026-10-30');
  assert.deepEqual(visit.brief?.chips.map(c => c.pct), [-1.82, -7.2, 12.9]);
  // 월 마감 뒤(조건 미달) — 서버 키가 바뀌어 D 기록은 더 붙지 않고, 카드도 없다.
  const after = serve(mondayIntraday('2026-11-02T20:59:00Z'), '2026-11-02T21:01:00Z');
  const late = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify({ ...after, selloffRecord: { date: '2026-10-30', chips: [{ name: 'VIX', pct: 30 }] } })) }, at('2026-11-02T21:01:00Z'), null);
  assert.equal(late.brief, null);                                             // 다른 날짜의 서버 기록은 무시
  // 서버 기록이 있어도 요청 실패면 숨김.
  assert.equal((await readSelloffMacro({ status: 'rejected', reason: new Error('x') }, at('2026-11-02T15:00:00Z'), stored)).brief, null);
});

test('server record: corrections overwrite, unknown cache state never writes', () => {
  const kept = selloffForDisplay({ now: at('2026-10-31T15:00:00Z'), macro: fridayClose })!;
  const corrected: SelloffMacro = { fetchedAtET: '2026-10-31T14:00:00.000Z', selloffReadAt: '2026-10-31T14:00:00.000Z', indexBasis: { cash: { spx: { changePct: -0.4, sessionDate: '2026-10-30', asOf: '2026-10-30T20:47:43Z', price: 7580 } } }, factors: { sox: factor(-1, '2026-10-30T21:16:01Z'), vix: factor(3, '2026-10-30T20:15:01Z') } };
  const fix = mergeSelloffRecord({ now: at('2026-10-31T15:00:00Z'), macro: corrected, stored: kept, storedKnown: true });
  assert.equal(fix.write, true);
  assert.deepEqual(fix.record?.chips.map(c => c.pct), [-0.4, -1, 3]);
  assert.equal(mergeSelloffRecord({ now: at('2026-10-31T15:00:00Z'), macro: fridayClose, stored: null, storedKnown: false }).write, false); // 캐시 읽기 실패·시간 초과
  assert.equal(mergeSelloffRecord({ now: at('2026-10-31T15:00:00Z'), macro: null, stored: kept, storedKnown: true }).write, false);
});

test('Nasdaq slot: ^NDX feed absent in production → cash composite ^IXIC at the same −2.0% line (gate 11020322)', () => {
  const t = '2026-10-31T15:00:00Z';
  const noNdx = (ixic: number, ndx?: number): SelloffMacro => ({ indexBasis: { cash: {
    spx: cash(-0.5), ndx: ndx == null ? { changePct: null, sessionDate: null, asOf: null, price: null } : cash(ndx), nasdaq: cash(ixic) } } });
  assert.deepEqual(bare(day(noNdx(-2.0), t))?.chips, [{ name: 'S&P 500', pct: -0.5 }, { name: 'NASDAQ', pct: -2.0 }]);
  assert.equal(day(noNdx(-1.99), t), null);
  // NDX 가 있으면 NDX 가 우선(종합은 쓰지 않음)
  assert.equal(day(noNdx(-5, -1.0), t), null);
  assert.deepEqual(day(noNdx(-1, -2.1), t)?.chips.map(c => c.name), ['S&P 500', 'NASDAQ 100']);
  // 다음 장중엔 보관 기록의 «NASDAQ» 칸이 이어진다
  const kept = day(noNdx(-2.86), t)!;
  const mon = { ...mondayIntraday(), indexBasis: { cash: { ...mondayIntraday().indexBasis!.cash, nasdaq: cash(0.4, '2026-11-02', '2026-11-02T14:59:00Z') } } };
  assert.deepEqual(day(mon, '2026-11-02T15:00:00Z', kept)?.chips, kept.chips);
  // 10/30 실제 운영 응답 모양(nasdaq −2.86%)도 칩 4개로
  const real = { ...fridayClose, indexBasis: { cash: { ...fridayClose.indexBasis!.cash, nasdaq: { changePct: -2.86, sessionDate: '2026-10-30', asOf: '2026-10-30T21:16:01Z', price: 25437 } } } };
  assert.deepEqual(day(real, '2026-10-31T15:00:00Z')?.chips.map(c => c.name), ['S&P 500', 'NASDAQ', 'SOX', 'VIX']);
});

test('scorecard row refreshes while the card stays up; route uses strict cache read/write', () => {
  const card = readFileSync('src/app/[locale]/app-view/dash/SelloffCard.tsx', 'utf8');
  assert.match(card, /setInterval\(\(\) => \{ load\(\); loadReport\(\); \}, 10 \* 60_000\)/);
  assert.match(card, /clearInterval\(id\)/);
  const route = readFileSync('src/app/api/market/macro/route.ts', 'utf8');
  assert.match(route, /getSelloffRecordStrict\(key\)\.then\(r => \(\{ known: r\.ok/);
  assert.doesNotMatch(route, /getFromCache|setInCache/);
});

test('concurrent instances: an older snapshot cannot revert a newer stored observation (gate 11020323)', () => {
  const t = '2026-10-31T15:00:00Z';
  // B 가 정정(관측 21:30)으로 VIX 를 +3 으로 썼다. A 의 낡은 스냅샷은 VIX +12.9(관측 20:15)·S&P 만 가진다.
  const storedB: SelloffBrief = { date: '2026-10-30', chips: [
    { name: 'S&P 500', pct: -0.4, at: '2026-10-30T21:30:00.000Z' }, { name: 'SOX', pct: -1, at: '2026-10-30T21:30:00.000Z' }, { name: 'VIX', pct: 3, at: '2026-10-30T21:30:00.000Z' }] };
  const staleA: SelloffMacro = { indexBasis: { cash: { spx: { changePct: -1.82, sessionDate: '2026-10-30', asOf: '2026-10-30T20:47:43Z', price: 7580 } } }, factors: { vix: factor(12.9, '2026-10-30T20:15:01Z') } };
  const m = mergeSelloffRecord({ now: at(t), macro: staleA, stored: storedB, storedKnown: true });
  assert.deepEqual(m.record?.chips.map(c => c.pct), [-0.4, -1, 3]);
  assert.equal(m.write, false);
  assert.equal(selloffForDisplay({ now: at(t), macro: staleA, retained: storedB }), null);
  // 더 늦은 관측(새 정정)은 저장본을 이긴다
  const newerA: SelloffMacro = { factors: { vix: factor(11, '2026-10-30T21:45:00Z') } };
  const n = mergeSelloffRecord({ now: at(t), macro: newerA, stored: storedB, storedKnown: true });
  assert.equal(n.write, true);
  assert.deepEqual(n.record?.chips.map(c => [c.name, c.pct]), [['S&P 500', -0.4], ['SOX', -1], ['VIX', 11]]);
  // 관측 시각 없는 옛 기록과 겹치면 이 응답이 이긴다
  const legacy: SelloffBrief = { date: '2026-10-30', chips: [{ name: 'VIX', pct: 30 }] };
  assert.equal(mergeSelloffRecord({ now: at(t), macro: newerA, stored: legacy, storedKnown: true }).record?.chips[0].pct, 11);
});

test('macro route sends only its own D-close observations to the atomic store merge (no app-side read-modify-write)', () => {
  const route = readFileSync('src/app/api/market/macro/route.ts', 'utf8');
  assert.match(route, /mergeSelloffRecordAtomic\(key, own, 7 \* 86_400\)/);
  assert.match(route, /getSelloffRecordStrict\(key\)/);
  assert.doesNotMatch(route, /getFromCache|setInCache|setAuthoritativeCache|getAuthoritativeCache/);
  const t = at('2026-10-31T15:00:00Z');
  const stored: SelloffBrief = { date: '2026-10-30', chips: [{ name: 'VIX', pct: 3, at: '2026-10-30T21:30:00.000Z' }] };
  const m = mergeSelloffRecord({ now: t, macro: fridayClose, stored, storedKnown: true });
  assert.deepEqual(m.own?.chips.map(c => c.name), ['S&P 500', 'SOX', 'VIX']);   // own = 응답 관측만(저장본 미포함)
  assert.equal(m.own?.chips[2].pct, 12.9);
  assert.equal(m.record?.chips[2].pct, 3);                                        // 화면용 합본은 늦은 관측
});

test('lost write race self-heals on the next response that still carries the newer D observation', () => {
  const t = at('2026-10-31T15:00:00Z');
  const corrected: SelloffMacro = { factors: { vix: factor(3, '2026-10-30T21:30:00Z') } };
  const stale: SelloffMacro = { factors: { vix: factor(12.9, '2026-10-30T20:15:01Z') } };
  // A(낡은 스냅샷)가 B 의 정정 직후 경합에서 이겨 옛 값을 썼다고 하자.
  const lost = mergeSelloffRecord({ now: t, macro: stale, stored: null, storedKnown: true }).record!;
  assert.equal(lost.chips[0].pct, 12.9);
  const heal = mergeSelloffRecord({ now: t + 60_000, macro: corrected, stored: lost, storedKnown: true });
  assert.equal(heal.write, true);
  assert.equal(heal.record?.chips[0].pct, 3);
  // 정정본이 저장된 뒤엔 낡은 스냅샷이 다시 와도 쓰지 않는다.
  assert.equal(mergeSelloffRecord({ now: t + 120_000, macro: stale, stored: heal.record, storedKnown: true }).write, false);
});

test('signum-warm cron requests macro around the clock (record is written between close and next open)', () => {
  const crons = JSON.parse(readFileSync('vercel.json', 'utf8')).crons as { path: string; schedule: string }[];
  const warm = crons.filter(c => c.path === '/api/cron/signum-warm').map(c => c.schedule);
  assert.deepEqual(warm.sort(), ['*/20 * * * 0,6', '*/20 0-8 * * 1-5', '*/5 9-23 * * 1-5'].sort());
  assert.match(readFileSync('src/app/api/cron/signum-warm/route.ts', 'utf8'), /'\/api\/market\/macro'/);
});

test('SOX/VIX need a stamp at or after the close; cash keeps the shared 15:59 close-bar rule (gate 11020327)', () => {
  const t = '2026-10-30T20:30:00Z';
  assert.equal(day({ factors: { sox: factor(-4, '2026-10-30T19:59:01Z') } }, t), null);   // 15:59:01 장중 틱
  assert.equal(day({ factors: { vix: factor(15, '2026-10-30T19:59:59Z') } }, t), null);
  assert.ok(day({ factors: { sox: factor(-4, '2026-10-30T20:00:00Z') } }, t));
  assert.ok(day({ indexBasis: { cash: { spx: cash(-1.6, '2026-10-30', '2026-10-30T19:59:00Z') } } }, t)); // 수집기의 종가 봉(15:59:00)
});

test('server and device records merge per slot; the newer observation wins either way (gate 11020327)', async () => {
  const D = '2026-10-30';
  const server: SelloffBrief = { date: D, chips: [{ name: 'S&P 500', pct: -1.82, at: '2026-10-30T20:47:43.000Z' }, { name: 'VIX', pct: 12.9, at: '2026-10-30T20:15:01.000Z' }] };
  const device: SelloffBrief = { date: D, chips: [{ name: 'VIX', pct: 3, at: '2026-10-30T21:30:00.000Z' }] };
  assert.deepEqual(mergeSelloffRecords(server, device, D)?.chips.map(c => c.pct), [-1.82, 3]);
  assert.deepEqual(mergeSelloffRecords(device, server, D)?.chips.map(c => c.pct), [-1.82, 3]);
  const now = at('2026-11-02T15:00:00Z');
  const res = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify({ ...mondayIntraday(), selloffRecord: server })) }, now, { ...device, chips: [...device.chips, { name: 'S&P 500', pct: -0.4, at: '2026-10-30T21:30:00.000Z' }] });
  assert.equal(res.brief, null);                                                      // 기기의 더 늦은 정정이 이긴다
  assert.deepEqual(res.record?.chips.map(c => c.pct), [-0.4, 3]);
  const res2 = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify({ ...mondayIntraday(), selloffRecord: server })) }, now, { date: D, chips: [{ name: 'VIX', pct: 3, at: '2026-10-30T20:00:00.000Z' }] });
  assert.deepEqual(res2.brief?.chips.map(c => c.pct), [-1.82, 12.9]);                 // 서버 쪽이 더 늦으면 서버
  assert.equal(mergeSelloffRecords(server, { ...device, date: '2026-10-29' }, D)?.chips.length, 2); // 다른 날짜는 무시
});

test('same-timestamp correction reaches the record and the card; same generation does not write', () => {
  const t = at('2026-10-31T15:00:00Z');
  const snap = (pct: number, fetched: string): SelloffMacro => ({ fetchedAtET: fetched, factors: { vix: factor(pct, '2026-10-30T20:15:01Z') } });
  const first = mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:20:00.000Z'), stored: null, storedKnown: true }).record!;
  assert.equal(mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:20:00.000Z'), stored: first, storedKnown: true }).write, false); // 같은 세대
  const same = mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:22:00.000Z'), stored: first, storedKnown: true });
  assert.equal(same.write, true);                                                 // 새 세대는 값이 같아도 rx 전진
  assert.equal(same.record?.chips[0].pct, 12);
  const fix = mergeSelloffRecord({ now: t, macro: snap(3, '2026-10-30T20:30:00.000Z'), stored: first, storedKnown: true });
  assert.equal(fix.write, true);
  assert.equal(fix.record?.chips[0].pct, 3);
  assert.equal(selloffForDisplay({ now: t, macro: snap(3, '2026-10-30T20:30:00.000Z'), retained: first }), null);
  // 정정 전에 받은 낡은 스냅샷은 정정을 되돌리지 못한다
  const back = mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:25:00.000Z'), stored: fix.record, storedKnown: true });
  assert.equal(back.record?.chips[0].pct, 3);
  assert.equal(back.write, false);
});

test('chips carry observation time and snapshot generation (rx = fetchedAtET)', () => {
  const t = at('2026-10-31T15:00:00Z');
  const b = selloffForDisplay({ now: t, macro: { fetchedAtET: '2026-10-31T14:59:00.000Z', factors: { vix: factor(12.9, '2026-10-30T20:15:01Z') } } });
  assert.deepEqual(b?.chips[0], { name: 'VIX', pct: 12.9, at: '2026-10-30T20:15:01.000Z', rx: '2026-10-31T14:59:00.000Z' });
  // 미래 세대 시각은 붙이지 않는다
  const f = selloffForDisplay({ now: t, macro: { fetchedAtET: '2026-10-31T16:00:00.000Z', factors: { vix: factor(12.9, '2026-10-30T20:15:01Z') } } });
  assert.equal(f?.chips[0].rx, undefined);
});

test('cash generation = server read time (selloffReadAt), never the device clock (gates 11020339/11020341)', async () => {
  const D = '2026-10-30';
  const spx = (pct: number) => ({ changePct: pct, sessionDate: D, asOf: '2026-10-30T20:47:43Z', price: 7580 });
  const body = (pct: number, readAt: string, fetched = '2026-10-30T21:04:00.000Z'): SelloffMacro => ({ fetchedAtET: fetched, selloffReadAt: readAt, indexBasis: { cash: { spx: spx(pct) } } });
  const t = at('2026-10-30T21:30:00Z');
  const before = mergeSelloffRecord({ now: t, macro: body(-1.8, '2026-10-30T21:05:00.000Z'), stored: null, storedKnown: true }).record!;
  assert.equal(before.chips[0].rx, '2026-10-30T21:05:00.000Z');
  // 같은 매크로 본문 세대에서 현물만 정정 → 읽은 시각이 늦으니 바로 반영
  const fixed = mergeSelloffRecord({ now: t, macro: body(-0.4, '2026-10-30T21:10:00.000Z'), stored: before, storedKnown: true });
  assert.equal(fixed.write, true);
  assert.equal(fixed.record?.chips[0].pct, -0.4);
  // 더 새 매크로 본문 + 정정 전에 읽은 현물(21:05) → 못 이김
  const stale = mergeSelloffRecord({ now: t, macro: body(-1.8, '2026-10-30T21:05:00.000Z', '2026-10-30T21:09:30.000Z'), stored: fixed.record, storedKnown: true });
  assert.equal(stale.record?.chips[0].pct, -0.4);
  assert.equal(stale.write, false);
  // 기기: 정정 기록(서버)이 있는 뒤 옛 응답(21:05 읽음)이 늦게 도착해도 기기 시계로 새 세대를 붙이지 않는다 → 카드 재등장 없음
  const late = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify(body(-1.8, '2026-10-30T21:05:00.000Z'))) }, at('2026-10-31T15:00:00Z'), fixed.record);
  assert.equal(late.brief, null);
  assert.equal(late.record?.chips[0].pct, -0.4);
  // selloffReadAt 이 없으면 rx 없음 → 같은 관측 시각 경합에서는 기록 쪽이 이긴다
  const noStamp = await readSelloffMacro({ status: 'fulfilled', value: new Response(JSON.stringify({ indexBasis: { cash: { spx: spx(-1.8) } } })) }, at('2026-10-31T15:00:00Z'), fixed.record);
  assert.equal(noStamp.brief, null);
  assert.equal(noStamp.record?.chips[0].rx, '2026-10-30T21:10:00.000Z');
});

test('rx-only advances are marked (write) and distinguished from value changes', () => {
  const t = at('2026-10-31T15:00:00Z');
  const withRead = (m: SelloffMacro, readAt: string): SelloffMacro => ({ ...m, selloffReadAt: readAt });
  const first = mergeSelloffRecord({ now: t, macro: withRead(fridayClose, '2026-10-31T15:00:00.000Z'), stored: null, storedKnown: true }).record!;
  assert.equal(mergeSelloffRecord({ now: t, macro: withRead(fridayClose, '2026-10-31T15:00:00.000Z'), stored: first, storedKnown: true }).write, false);
  const later = mergeSelloffRecord({ now: t + 30_000, macro: withRead(fridayClose, '2026-10-31T15:00:30.000Z'), stored: first, storedKnown: true });
  assert.equal(later.write, true);
  assert.equal(later.valueChanged, false);
  const changed = mergeSelloffRecord({ now: t + 30_000, macro: withRead({ ...fridayClose, indexBasis: { cash: { spx: { ...fridayClose.indexBasis!.cash!.spx!, changePct: -0.4 } } } }, '2026-10-31T15:00:30.000Z'), stored: first, storedKnown: true });
  assert.equal(changed.valueChanged, true);
  const route = readFileSync('src/app/api/market/macro/route.ts', 'utf8');
  // 세대만 전진한 쓰기도 건너뛰지 않는다(gate 11020344) — 세대가 분 단위라 쓰기는 인스턴스당 분당 최대 1회
  assert.match(route, /if \(write && own && !selloffWriteFlight\) \{/);
  assert.doesNotMatch(route, /selloffRxWriteAt/);
  assert.match(route, /selloffReadAt: new Date\(Math\.floor\(readStartedAt \/ 60_000\) \* 60_000\)\.toISOString\(\)/);
  // 세대 시각은 스냅샷(현물 병렬 읽기 포함)을 «시작하기 전»에 잡는다 (gate 11020343)
  const get = route.slice(route.indexOf('export async function GET'));
  assert.ok(get.indexOf('const readStartedAt = Date.now();') >= 0 && get.indexOf('const readStartedAt = Date.now();') < get.indexOf('await getMacroSnapshotSSOT()'));
});

test('route never stores its precomputed merge in the memo; writes force a re-read, failures retry (gates 11020345/11020347)', () => {
  const route = readFileSync('src/app/api/market/macro/route.ts', 'utf8');
  const write = route.indexOf('await mergeSelloffRecordAtomic(key, own');
  assert.ok(write > 0);
  // 쓰기 앞에서 메모를 record 로 바꾸지 않는다
  assert.doesNotMatch(route.slice(route.indexOf('if (write && own) {'), write), /selloffMemo = \{ key, value: record/);
  // 쓰기 뒤에도 미리 계산한 합본을 메모에 넣지 않고(gate 11020347) 저장본 재조회를 강제한다
  assert.doesNotMatch(route, /value: record/);
  assert.match(route.slice(write), /if \(selloffMemo\?\.key === key && result !== null\) selloffMemo = \{ \.\.\.selloffMemo, at: 0 \};/);
  // 실패 뒤 다음 요청: 메모(이전 저장본) 기준으로 여전히 write=true → 다시 쓴다
  const t = at('2026-10-31T15:00:00Z');
  const m = { ...fridayClose, selloffReadAt: '2026-10-31T15:00:00.000Z' };
  assert.equal(mergeSelloffRecord({ now: t, macro: m, stored: null, storedKnown: true }).write, true);
  assert.equal(mergeSelloffRecord({ now: t + 1_000, macro: m, stored: null, storedKnown: true }).write, true);
});

test('route single-flights the memo read and the record write per instance (gate 11020348)', () => {
  const route = readFileSync('src/app/api/market/macro/route.ts', 'utf8');
  assert.match(route, /if \(!selloffReadFlight\) selloffReadFlight = \(async \(\) => \{/);
  assert.match(route, /await selloffReadFlight;/);
  assert.match(route, /if \(write && own && !selloffWriteFlight\) \{\n\s+selloffWriteFlight = true;/);
  assert.match(route, /finally \{ selloffWriteFlight = false; \}/);
  assert.equal((route.match(/getSelloffRecordStrict\(/g) || []).length, 1);
});

// 11/5 대표: 지수가 오른 날 SOX 하나로 «시장 급락»이 뜨면 안 된다
{
  const up = { date: '2026-11-04', chips: [{ name: 'S&P 500', pct: 1.6 }, { name: 'NASDAQ', pct: 1.4 }, { name: 'SOX', pct: -3.1 }, { name: 'VIX', pct: -20.3 }] };
  assert.equal(selloffTitleKey(up), 'chipsTitle');
  assert.equal(selloffTitleKey({ ...up, chips: [{ name: 'S&P 500', pct: -1.8 }, { name: 'SOX', pct: -3.1 }] }), 'title');
  assert.equal(selloffTitleKey({ ...up, chips: [{ name: 'VIX', pct: 12 }] }), 'title');
  assert.equal(selloffTitleKey({ ...up, chips: [{ name: 'NASDAQ', pct: -2.1 }] }), 'title');
  console.log('  ✓ selloffTitleKey: SOX 단독 → 반도체 급락, 지수·VIX → 시장 급락');
}

// ── «왜» 한 줄(대표 11/6 «특정한 날에 그러는것은 찬성» — 급락 카드가 뜬 날만) ──
const nov5: SelloffBrief = { date: '2026-11-05', chips: [{ name: 'S&P 500', pct: -4.355659560274951 }, { name: 'NASDAQ', pct: -5.52332767174065 }, { name: 'SOX', pct: -12.246161960467258 }, { name: 'VIX', pct: 69.65683323299217 }] };
const why1105 = {
  ko: '가장 강한 근거는 세션 중 보도된 반도체·AI 하드웨어 관련 매도세 소식입니다. 24/7 Wall Street는 2026-11-05 13:02 ET에 Dell·HPE·Super Micro 급락을 보도했습니다. 이는 직접 원인이 확정된 것은 아닙니다.',
  en: 'The strongest candidate is session-time reporting of selling in AI hardware: 24/7 Wall Street reported Dell, HPE and Super Micro declines at 2026-11-05 13:02 ET. Silicon Core fell sharply, but a direct cause is not confirmed.',
  ja: '最も強い根拠は、取引時間中に報じられたAIハードウェア株の売り関連ニュースです。24/7 Wall Streetは2026-11-05 13:02 ETにDell・HPE・Super Microの急落を報じました。',
};
const served = (over: Record<string, unknown> = {}, why: Record<string, string> = why1105) => ({ success: true, date: '2026-11-05', source: 'v4', generatedAt: '2026-11-06T00:02:17.282Z', structured: { closingNarrative: { why } }, ...over });
test('why line: same-session narrative shows its first sentence in ko/en/ja', () => {
  assert.equal(selloffWhyFromReport(served(), nov5, 'ko'), '원인 미확정 · 가장 강한 근거는 세션 중 보도된 반도체·AI 하드웨어 관련 매도세 소식입니다.');
  assert.equal(selloffWhyFromReport(served(), nov5, 'en'), 'Unconfirmed · The strongest candidate is session-time reporting of selling in AI hardware: 24/7 Wall Street reported Dell, HPE and Super Micro declines at 2026-11-05 13:02 ET.');
  assert.equal(selloffWhyFromReport(served(), nov5, 'ja'), '最も強い根拠は、取引時間中に報じられたAIハードウェア株の売り関連ニュースです。');
  for (const loc of ['ko', 'en', 'ja'] as const) assert.equal(selloffWhyLine(nov5, loc, { status: 'ok', json: served() })?.source, 'narrative');
  // 리포트가 유보를 안 했으면 표식 없이, 첫 문장에 유보가 있으면 중복 표식 없이(관문 11061022: 유보가 잘리면 안 됨).
  assert.equal(selloffWhyFromReport(served(), nov5, 'ja'), '最も強い根拠は、取引時間中に報じられたAIハードウェア株の売り関連ニュースです。');
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, ja: why1105.ja + '直接の原因は確認されていません。' }), nov5, 'ja'), '原因未確定 · 最も強い根拠は、取引時間中に報じられたAIハードウェア株の売り関連ニュースです。');
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, en: 'A report of AI hardware selling coincided with the drop, but a direct cause is not confirmed. More text.' }), nov5, 'en'), 'A report of AI hardware selling coincided with the drop, but a direct cause is not confirmed.');
  // 숫자 안의 마침표·«U.S.» 같은 짧은 조각에서 끊지 않는다.
  assert.equal(firstSentence('U.S. stocks fell 4.36% as chip shares slid. Second sentence.'), 'U.S. stocks fell 4.36% as chip shares slid.');
});
test('why line: stale or foreign narrative is rejected (other date, pre-close generation, failed/unsourced payload, wrong script)', () => {
  assert.equal(selloffWhyFromReport(served({ date: '2026-11-04' }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({ generatedAt: '2026-11-05T19:30:00.000Z' }), nov5, 'ko'), null); // 15:30 ET — 마감 전
  assert.equal(selloffWhyFromReport(served({ generatedAt: '2026-11-04T23:00:00.000Z' }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({ generatedAt: 'nope' }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({ success: false }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({ source: undefined }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, en: why1105.ko }), nov5, 'en'), null);
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, ja: why1105.ko }), nov5, 'ja'), null);
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, ko: 'Fallback English text that slipped into the Korean slot.' }), nov5, 'ko'), null);
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, ko: '   ' }), nov5, 'ko'), null);
  // 다른 날 서사면 카드에는 사실 한 줄만(옛 문장 0).
  assert.equal(selloffWhyLine(nov5, 'ko', { status: 'ok', json: served({ date: '2026-11-04' }) })?.source, 'fallback');
});
test('why line: a narrative that could disagree with the chips is not shown (any %, opposite direction)', () => {
  assert.equal(contradictsChips('가장 강한 근거는 세션 중 보도된 반도체·AI 하드웨어 관련 매도세 소식입니다.', nov5), false);
  assert.equal(contradictsChips('Selling in AI hardware was reported at 13:02 ET; the S&P 500 fell with chips.', nov5), false);
  // 관문 11061022 재현: 부호 없는 상승·나스닥 단독 표기 숫자
  assert.equal(contradictsChips('The S&P 500 rose 4.4% after the report.', nov5), true);
  assert.equal(contradictsChips('Nasdaq fell 3.1% as chips slid.', nov5), true);
  assert.equal(contradictsChips('S&P 500은 -4.36%로 마감했습니다.', nov5), true); // 맞는 숫자라도 % 는 칩 몫
  assert.equal(contradictsChips('The S&P 500 rallied on the news.', nov5), true);
  assert.equal(contradictsChips('나스닥이 반등했지만 반도체는 밀렸습니다.', nov5), true);
  assert.equal(contradictsChips('VIX는 하락했습니다.', nov5), true);
  assert.equal(contradictsChips('S&P500は上昇しました。', nov5), true);
  assert.equal(selloffWhyFromReport(served({}, { ...why1105, ko: 'S&P 500이 -2.10% 하락한 배경은 반도체 매도세와 같은 세션에 일치합니다.' }), nov5, 'ko'), null);
  assert.equal(selloffWhyLine(nov5, 'en', { status: 'ok', json: served({}, { ...why1105, en: 'The S&P 500 rose 4.4% after a strong jobs report released that morning.' }) })?.source, 'fallback');
});
test('why line: missing narrative falls back to a fact from the card numbers only (no cause); «pending» only for 404 inside the generation window', () => {
  const inWindow = Date.parse('2026-11-05T21:30:00Z'), late = Date.parse('2026-11-06T01:00:00Z');
  assert.equal(selloffWhyLine(nov5, 'ko', { status: 'missing' }, inWindow)?.text, '반도체(SOX) −12.2%로 낙폭이 가장 컸습니다 · 원인 분석은 장마감 리포트 준비 중');
  assert.equal(selloffWhyLine(nov5, 'en', { status: 'missing' }, inWindow)?.text, 'Chips (SOX) −12.2%, the steepest drop · cause analysis pending in the closing report');
  assert.equal(selloffWhyLine(nov5, 'ja', { status: 'missing' }, inWindow)?.text, '半導体(SOX) −12.2%で下げ幅が最大でした · 要因分析は引け後レポート準備中');
  // 창이 지난 404(저장소 장애일 수도)·읽는 중·네트워크 실패: «준비 중»이라 단정하지 않는다.
  assert.equal(selloffWhyLine(nov5, 'ko', { status: 'missing' }, late)?.text, '반도체(SOX) −12.2%로 낙폭이 가장 컸습니다');
  for (const r of [null, { status: 'error' } as const]) assert.equal(selloffWhyLine(nov5, 'ko', r, inWindow)?.text, '반도체(SOX) −12.2%로 낙폭이 가장 컸습니다');
  // 리포트는 있는데 서사 칸이 없으면(v3 등) 사실 한 줄, «준비 중» 없음.
  assert.equal(selloffWhyLine(nov5, 'en', { status: 'ok', json: { success: true, date: '2026-11-05', source: 'v3', structured: {} } }, inWindow)?.text, 'Chips (SOX) −12.2%, the steepest drop');
  const soxOnly: SelloffBrief = { date: '2026-11-04', chips: [{ name: 'S&P 500', pct: 1.6 }, { name: 'NASDAQ', pct: 1.4 }, { name: 'SOX', pct: -3.1 }, { name: 'VIX', pct: -20 }] };
  assert.equal(selloffWhyFallback(soxOnly, 'ko', false), '반도체(SOX) −3.1% 하락');
  const vixOnly: SelloffBrief = { date: '2026-11-04', chips: [{ name: 'S&P 500', pct: 0.2 }, { name: 'VIX', pct: 11 }] };
  assert.equal(selloffWhyFallback(vixOnly, 'ja', true), 'VIX +11.0% 急騰 · 要因分析は引け後レポート準備中');
  for (const loc of ['ko', 'en', 'ja'] as const) assert.doesNotMatch(selloffWhyFallback(nov5, loc, true)!, /because|때문|ため|due to/i);
});
test('why line source: dated report GET is read-only (404 before any self-healing generation)', () => {
  const route = readFileSync('src/app/api/intel/cross-sector-brief/route.ts', 'utf8');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  const dated404 = get.indexOf("if (requested) return NextResponse.json({ success: false, date: requested");
  assert.ok(dated404 > 0 && dated404 < get.indexOf('healingKey'));
  const card = readFileSync('src/app/[locale]/app-view/dash/SelloffCard.tsx', 'utf8');
  assert.match(card, /selloffWhyLine\(brief, loc, report\)/);
  assert.match(card, /setReport\(null\)/); // 날짜가 바뀌면 이전 날 리포트를 버린다
});
