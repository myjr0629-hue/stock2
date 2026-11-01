import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { currentSelloff, loadRetainedSelloff, mergeSelloffRecord, mergeSelloffRecords, readSelloffMacro, saveRetainedSelloff, SELLOFF_STORE_KEY, selloffForDisplay, selloffPreviewParam, selloffBrief, selloffShown, SELLOFF_COPY, scorecardWeek, type SelloffBrief, type SelloffMacro } from '../src/lib/selloffBriefing';
const now = Date.parse('2026-11-02T15:00:00Z');
const cash = (changePct: number, sessionDate = '2026-10-30', asOf = '2026-10-30T20:00:00Z') => ({ changePct, sessionDate, asOf, price: 100 });
const factor = (chgPct: number, marketTime = '2026-10-30T20:00:00Z') => ({ chgPct, marketTime, status: 'OK', source: 'YAHOO' });
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
  assert.doesNotMatch(source, /watchEarningsCalendar|earningsCalendarData|crossBriefUrl|t\.mine/);
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
  // D 마감 관측이 응답에 있으면 보관본보다 우선한다(정정된 값으로 조건 미달이면 숨김).
  const corrected = { ...fridayClose, indexBasis: { cash: { spx: { ...fridayClose.indexBasis!.cash!.spx!, changePct: -0.4 } } }, factors: { sox: factor(-1, '2026-10-30T21:16:01Z'), vix: factor(3, '2026-10-30T20:15:01Z') } };
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
  const spxOnly = { ...fridayClose, indexBasis: { cash: { spx: { ...fridayClose.indexBasis!.cash!.spx!, changePct: -0.4 } } } };
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
  assert.equal(mergeSelloffRecord({ now: at('2026-10-30T21:25:00Z'), macro: fridayClose, stored, storedKnown: true }).write, false); // 같으면 다시 쓰지 않음
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
  const corrected: SelloffMacro = { indexBasis: { cash: { spx: { changePct: -0.4, sessionDate: '2026-10-30', asOf: '2026-10-30T20:47:43Z', price: 7580 } } }, factors: { sox: factor(-1, '2026-10-30T21:16:01Z'), vix: factor(3, '2026-10-30T20:15:01Z') } };
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
  assert.match(card, /setInterval\(load, 10 \* 60_000\)/);
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

test('same-timestamp correction reaches the record and the card; repeated identical snapshots do not write', () => {
  const t = at('2026-10-31T15:00:00Z');
  const snap = (pct: number, fetched: string): SelloffMacro => ({ fetchedAtET: fetched, factors: { vix: factor(pct, '2026-10-30T20:15:01Z') } });
  const first = mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:20:00.000Z'), stored: null, storedKnown: true }).record!;
  assert.equal(mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-31T14:00:00.000Z'), stored: first, storedKnown: true }).write, false);
  const fix = mergeSelloffRecord({ now: t, macro: snap(3, '2026-10-30T20:30:00.000Z'), stored: first, storedKnown: true });
  assert.equal(fix.write, true);
  assert.equal(fix.record?.chips[0].pct, 3);
  assert.equal(selloffForDisplay({ now: t, macro: snap(3, '2026-10-30T20:30:00.000Z'), retained: first }), null);
  // 정정 전에 받은 낡은 스냅샷은 정정을 되돌리지 못한다
  const back = mergeSelloffRecord({ now: t, macro: snap(12, '2026-10-30T20:25:00.000Z'), stored: fix.record, storedKnown: true });
  assert.equal(back.record?.chips[0].pct, 3);
  assert.equal(back.write, false);
});

test('SOX/VIX carry the feed revision stamp (lastChangeAt) as rv', () => {
  const t = at('2026-10-31T15:00:00Z');
  const b = selloffForDisplay({ now: t, macro: { fetchedAtET: '2026-10-31T14:59:00.000Z', factors: { vix: { ...factor(12.9, '2026-10-30T20:15:01Z'), lastChangeAt: '2026-10-30T20:30:37.021Z' } } } });
  assert.deepEqual(b?.chips[0], { name: 'VIX', pct: 12.9, at: '2026-10-30T20:15:01.000Z', rv: '2026-10-30T20:30:37.021Z', rx: '2026-10-31T14:59:00.000Z' });
});
