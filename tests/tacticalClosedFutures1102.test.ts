// ★2026-11-02 T39 운영 실측 결함 3건 — ① 장외(CLOSED) 선물 재개 뒤에도 금요일 장후 글 «S&P500 선물 보합» ② «재료 확인 안 됨»(직전 정규장 실적·섹터·기사 미입력)
//   ③ ja «本日(10/30)» 월요일 노출. 운영 값: 11/2 08:10Z /api/market/macro ES +0.38%·NQ +0.75%(직전 정산 대비, 종가 기준 키 만료) · 채점표 10/26 주 INTC −28.6%(반응일 10/30).
import assert from 'node:assert/strict';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { buildIndexFacts, hasFuturesSinceCloseFact, isFuturesRefreshSession, postTacticalMayLackFutures, postTacticalMayDriftFutures, tacticalSessionAt, POST_TACTICAL_RETRY_MS } from '@/lib/ai/tacticalIndexFacts';
import { tacticalMacroDrivers, driversForPrompt, driverClaimReasons, causeNewsFromArchive, EARNINGS_DRIVER_KEY } from '@/lib/ai/tacticalDrivers';
import { absoluteDayWords, polishTacticalText, stateRelativeDayReasons, buildTacticalPrompt, tacticalNextReasons, splitSentences, checkTacticalStored } from '@/lib/ai/tacticalPrompt';
import { reservePostTacticalRefresh } from '@/lib/ai/postTacticalRefreshBudget';
import { tickerName } from '@/lib/app/tickerNames';
import { orphanNumberReasons } from '@/lib/ai/claimChecks';

let failed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); console.log('ok -', name); } catch (e) { failed++; console.error('FAIL -', name, e); } };
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

// 11/2(월) 03:10 ET(08:10Z) 운영 값 — 일 18:00 ET 재개 세션, 종가 기준 키(24h) 만료
const MON = Date.parse('2026-11-02T08:10:00Z');
const fut = (symbol: string, price: number, changePct: number, at: number) => ({ symbol, price, changePct, marketTime: iso(at), lastChangeAt: iso(at), source: 'YAHOO' });
const cash = (symbol: string, price: number, changePct: number) => ({ symbol, price, changePct, marketTime: '2026-10-30T21:15:59.000Z', lastChangeAt: '2026-10-30T21:15:59.000Z', source: 'YAHOO' });
const monBasis = buildMarketIndexBasis({ nasdaq: cash('^IXIC', 25436.998, -2.8556), spx: cash('^GSPC', 7580.07, -1.8175),
    nq: fut('NQ=F', 28746.75, 0.7456, MON - 10 * MIN), es: fut('ES=F', 7642.75, 0.3776, MON - 10 * MIN) }, MON, {});

(async () => {
    await test('① 장외 선물 사실 — 종가 기준이 없으면 그 정규장 뒤 새 세션의 정산 대비(PRE 와 같은 기준), POST 는 기존 그대로', () => {
        assert.equal(tacticalSessionAt(MON), 'CLOSED');
        const facts = buildIndexFacts(monBasis, 'CLOSED', MON);
        const es = facts.find(f => f.id === 'es')!, nq = facts.find(f => f.id === 'nq')!;
        assert.equal(es.kind, 'futures'); assert.equal(es.chgPct, 0.3776); assert.equal(nq.chgPct, 0.7456);
        assert.match(es.basis.ko, /정산/);
        assert.equal(facts.find(f => f.id === 'nasdaq')!.sessionDate, '2026-10-30');
        assert.equal(hasFuturesSinceCloseFact(monBasis, MON), true, '수리 전에는 false → 월요일 새벽 다시 만들 계기가 없었다');
        // 금 16:30 ET(장후) 정산 대비 값은 전날 정산 기준 — 쓰지 않는다(POST 계약 불변)
        const fri = Date.parse('2026-10-30T20:30:00Z');
        const friBasis = buildMarketIndexBasis({ nq: fut('NQ=F', 28500, -2.1, fri - 2 * MIN), es: fut('ES=F', 7600, -1.5, fri - 2 * MIN) }, fri, {});
        assert.equal(buildIndexFacts(friBasis, 'POST', fri).filter(f => f.kind === 'futures').length, 0);
        // 장외라도 관측이 그 정규장 18:00 ET 이전이면(새 세션 전) 쓰지 않는다
        const sat = Date.parse('2026-10-31T01:30:00Z');   // 금 21:30 ET — 선물 휴장(주말)
        assert.equal(buildIndexFacts(buildMarketIndexBasis({ es: fut('ES=F', 7600, -1.5, sat - 5 * MIN) }, sat, {}), 'CLOSED', sat).filter(f => f.kind === 'futures').length, 0);
    });

    await test('① 재생성 대상 세션 — POST + 선물이 열린 CLOSED 만(토요일·평일 17~18 ET 휴식·REG·PRE 제외)', () => {
        assert.equal(isFuturesRefreshSession('CLOSED', MON), true);
        assert.equal(isFuturesRefreshSession('POST', MON), true, 'POST 는 기존 판정(세션 문자열) 그대로');
        assert.equal(isFuturesRefreshSession('CLOSED', Date.parse('2026-10-31T15:00:00Z')), false, '토요일');
        assert.equal(isFuturesRefreshSession('CLOSED', Date.parse('2026-11-01T22:00:00Z')), false, '일 17:00 ET — 재개 전');
        assert.equal(isFuturesRefreshSession('CLOSED', Date.parse('2026-11-01T23:30:00Z')), true, '일 18:30 ET — 재개 뒤');
        assert.equal(isFuturesRefreshSession('REG', MON), false);
        assert.equal(isFuturesRefreshSession('PRE', MON), false);
    });

    await test('① 장외 «선물 사실 없이 만든 글» 판정 — 마지막 시도(tacticalFuturesCheckedAt)부터 5분, 생성 기준 있는 글은 30분 변동 비교', () => {
        const friSnap = '2026-10-31T00:00:42.088Z';   // 운영 스냅샷(금 20:00 ET) — 주말 내내 워커 도장만 갱신
        assert.equal(postTacticalMayLackFutures({ timestamp: friSnap }, 'CLOSED', MON), true);
        assert.equal(postTacticalMayLackFutures({ timestamp: friSnap, tacticalFuturesCheckedAt: iso(MON - POST_TACTICAL_RETRY_MS + 1) }, 'CLOSED', MON), false, '시도 뒤 5분은 쉼');
        assert.equal(postTacticalMayLackFutures({ timestamp: friSnap, tacticalFuturesCheckedAt: iso(MON - POST_TACTICAL_RETRY_MS) }, 'CLOSED', MON), true);
        assert.equal(postTacticalMayLackFutures({ timestamp: friSnap, tacticalFutures: true }, 'CLOSED', MON), false);
        assert.equal(postTacticalMayLackFutures({ timestamp: friSnap }, 'CLOSED', Date.parse('2026-10-31T15:00:00Z')), false, '토요일(선물 휴장)은 대상 아님');
        assert.equal(postTacticalMayDriftFutures({ timestamp: friSnap, tacticalFutures: true, tacticalFuturesPct: { es: 0.1 }, tacticalFuturesCheckedAt: iso(MON - 31 * MIN) }, 'CLOSED', MON), true);
        assert.equal(postTacticalMayDriftFutures({ timestamp: friSnap, tacticalFutures: true, tacticalFuturesPct: { es: 0.1 }, tacticalFuturesCheckedAt: iso(MON - 29 * MIN) }, 'CLOSED', MON), false);
    });

    await test('① 장외 예산 — 장후 예산 키와 따로(밤사이 장후 8회를 쓰지 않게), 휴장·REG 는 예약 거절', async () => {
        const keys: string[] = [];
        const redis = { eval: async (_s: string, k: string[]) => { keys.push(k[0]); return 1; } };
        assert.equal(await reservePostTacticalRefresh(redis, MON), true);
        assert.equal(keys[0], 'guardian:tactical:futures-refresh:closed:2026-11-02');
        assert.equal(await reservePostTacticalRefresh(redis, Date.parse('2026-10-30T21:00:00Z')), true);
        assert.equal(keys[1], 'guardian:tactical:futures-refresh:2026-10-30', 'POST 키 불변');
        assert.equal(await reservePostTacticalRefresh(redis, Date.parse('2026-10-31T15:00:00Z')), false, '토요일');
        assert.equal(await reservePostTacticalRefresh(redis, Date.parse('2026-10-30T15:00:00Z')), false, 'REG');
        assert.equal(keys.length, 2);
    });

    // 운영 채점표(/api/earnings/scorecard?week=2026-10-26) 그대로
    const card = [
        { ticker: 'GOOGL', date: '2026-10-28', hour: 'amc' as const, reactDate: '2026-10-29', movePct: -12.6412 },
        { ticker: 'MSFT', date: '2026-10-28', hour: 'amc' as const, reactDate: '2026-10-29', movePct: -0.1638 },
        { ticker: 'AMZN', date: '2026-10-29', hour: 'amc' as const, reactDate: '2026-10-30', movePct: -1.4111 },
        { ticker: 'INTC', date: '2026-10-29', hour: 'amc' as const, reactDate: '2026-10-30', movePct: -28.5761 },
        { ticker: 'ABBV', date: '2026-10-30', hour: 'bmo' as const, reactDate: '2026-10-30', movePct: 1.41 },
    ];
    const en = (t: string) => tickerName(t, 'en', null) || null;
    await test('② 실적 반응 재료 — 반응일 = 그 정규장, ±3% 이상, 크기 순 2개, 장중 제외', () => {
        const d = tacticalMacroDrivers({ earnings: card, companyNameEn: en, session: 'PRE', cashSessionDate: '2026-10-30', nowMs: MON })!;
        assert.deepEqual(d.earnings, { sessionDate: '2026-10-30', moves: [{ ticker: 'INTC', company: 'Intel', reportDate: '2026-10-29', hour: 'amc', movePct: -28.6 }] });
        assert.equal(tacticalMacroDrivers({ earnings: card, companyNameEn: en, session: 'REG', nowMs: Date.parse('2026-10-30T18:00:00Z') }), undefined, '장중은 쓰지 않는다');
        assert.equal(tacticalMacroDrivers({ earnings: card, companyNameEn: en, session: 'CLOSED', cashSessionDate: '2026-10-29', nowMs: MON })!.earnings!.moves[0].ticker, 'GOOGL', '반응일이 그 정규장인 것만');
        assert.equal(tacticalMacroDrivers({ earnings: card, companyNameEn: () => null, session: 'PRE', cashSessionDate: '2026-10-30', nowMs: MON }), undefined, '회사 이름 모르는 티커는 빼고, 남는 재료 없으면 undefined');
        const line = driversForPrompt(d, 'ko', () => undefined)!;
        assert.deepEqual(line[EARNINGS_DRIVER_KEY], { cashSessionDate: '2026-10-30', moves: [{ company: 'Intel', ticker: 'INTC', results: 'released after the previous session close', stockMove: 'during that cash session, vs its previous close (not after hours)', stockMovePct: -28.6 }] });
    });

    await test('② 실적 반응 숫자·방향 대조 — 회사 이름(한·영·일)·티커 뒤 숫자는 그 종목 값, 방향어는 부호', () => {
        const d = tacticalMacroDrivers({ earnings: card, companyNameEn: en, session: 'PRE', cashSessionDate: '2026-10-30', nowMs: MON })!;
        const drivers = JSON.stringify(driversForPrompt(d, 'en', () => undefined));
        assert.deepEqual(driverClaimReasons('10/29 장 마감 뒤 실적을 낸 인텔(INTC)이 28.6% 급락하며 반도체 투매를 이끌었습니다.', drivers), []);
        assert.deepEqual(driverClaimReasons('Intel plunged 28.6% after its 10/29 after-the-close results.', drivers), []);
        assert.deepEqual(driverClaimReasons('インテルは決算後に28.6%急落しました。', drivers), []);
        assert.ok(driverClaimReasons('인텔이 26.8% 급락했습니다.', drivers).includes('tactical:driver-value:earnings:INTC'));
        assert.ok(driverClaimReasons('인텔이 28.6% 급등했습니다.', drivers).includes('tactical:driver-direction:earnings:INTC'));
        assert.ok(driverClaimReasons('INTC +28.6% surged.', drivers).includes('tactical:driver-direction:earnings:INTC'));
        // 관문 11021732 ② — 숫자가 회사 이름 앞에 붙는 꾸밈 모양
        assert.ok(driverClaimReasons('A 50% plunge in Intel shares dragged chips.', drivers).includes('tactical:driver-value:earnings:INTC'));
        assert.ok(driverClaimReasons('A 7% plunge in Intel shares dragged chips.', drivers).includes('tactical:driver-value:earnings:INTC'), '다른 재료 숫자(SMH −7)를 빌려도 탈락');
        assert.deepEqual(driverClaimReasons('A 28.6% plunge in Intel shares dragged chips.', drivers), []);
        assert.deepEqual(driverClaimReasons('28.6% 폭락한 인텔이 반도체를 끌어내렸습니다.', drivers), []);
        assert.ok(driverClaimReasons('28.6% 급등한 인텔이 반도체를 끌어올렸습니다.', drivers).includes('tactical:driver-direction:earnings:INTC'));
        assert.deepEqual(driverClaimReasons('28.6%急落したインテルが半導体を押し下げました。', drivers), []);
        // 회사 이름 = Tactical 숫자 주어(orphan-number 오탐 — 11/2 실모델 3언어) · 공유 호출자 사전은 그대로
        for (const t of ['인텔이 장후 28.6% 폭락했습니다', "Against a report on Intel's 28.6% plunge", 'インテルが28.6%急落しました'])
            assert.deepEqual(orphanNumberReasons(t, { tactical: true }), [], t);
        assert.deepEqual(orphanNumberReasons('인텔이 장후 28.6% 폭락했습니다'), ['orphan-number:28.6%'], '공유 호출자 무영향');
    });

    await test('② 원인 기사 — 직전 정규장 날짜 보관 기사도(날짜 창 지정 시), 기본은 오늘만', () => {
        const items = [
            { summaryEN: 'Chip stocks plunge as Intel results deepen the AI spending selloff across semiconductors', category: 'US_MARKET', urgency: 9, publishedAt: '2026-10-30T15:10:00Z' },
            { summaryEN: 'Stocks edge higher in quiet weekend futures trade as investors await jobs report', category: 'US_MARKET', urgency: 7, publishedAt: '2026-11-02T07:00:00Z' },
        ];
        assert.equal(causeNewsFromArchive(items, MON).length, 1, '기본(오늘)만');
        const both = causeNewsFromArchive(items, MON, 6, ['2026-11-02', '2026-10-30']);
        assert.equal(both.length, 2);
        assert.match(both.join('\n'), /2026-10-30T15:10:00.000Z; 11:10 ET\] Chip stocks plunge/);
    });

    await test('③ 상대 날짜어 + 날짜 → 절대 표기(화면 출구 다듬기 — 저장본도 고쳐진다)', () => {
        const ja = '本日(10/30)の通常取引でナスダック総合は2.9%下落し、S&P500先物は取引終了後横ばいです。';
        assert.equal(absoluteDayWords(ja, 'ja', MON), '10/30(金)の通常取引でナスダック総合は2.9%下落し、S&P500先物は取引終了後横ばいです。');
        assert.equal(absoluteDayWords('어제(10/22) 정규장에서', 'ko', MON), '10/22(목) 정규장에서');
        assert.equal(absoluteDayWords('오늘(10/30)(금) 정규장에서', 'ko', MON), '10/30(금) 정규장에서');
        assert.equal(absoluteDayWords('昨日(10/22)の通常取引', 'ja', MON), '10/22(木)の通常取引');
        assert.equal(absoluteDayWords('In today’s (10/23) cash session', 'en', MON), 'In the 10/23 (Fri) cash session');
        assert.equal(absoluteDayWords('In the 10/30 cash session', 'en', MON), 'In the 10/30 cash session', '이미 절대 표기면 그대로');
        assert.equal(absoluteDayWords('오늘(13/40)', 'ko', MON), '오늘(13/40)', '날짜가 아니면 그대로');
        const p = polishTacticalText(ja + '本日の相場を動かしたマクロ要因は未確認です。', 'ja');
        assert.ok(!/本日/.test(p), p);
        assert.equal(polishTacticalText(p, 'ja'), p, '다시 다듬어도 같다');
        assert.match(polishTacticalText("Today's macro driver is unconfirmed.", 'en'), /^The market-wide driver is unconfirmed\./);
        assert.match(polishTacticalText('오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다.', 'ko'), /^시장 전체를 움직인/);
    });

    await test('③ STATE 상대 날짜어(생성 검사) — 날짜 없는 «오늘·本日»·월요일 장전 «어제» 탈락, 화~금 장전 «어제»·날짜 붙은 형태는 통과', () => {
        const prompt = (session: string, asOf: string) => `SESSION: ${session}\nAS_OF: ${asOf}\n`;
        assert.deepEqual(stateRelativeDayReasons('어제 정규장에서 나스닥 종합은 2.9% 내렸습니다', prompt('PRE', '2026-11-02T09:30:00Z'), 'ko'), ['tactical:relative-day'], '월요일 장전 — 직전 정규장은 금요일');
        assert.deepEqual(stateRelativeDayReasons('어제 정규장에서 나스닥 종합은 2.9% 내렸습니다', prompt('PRE', '2026-10-29T09:30:00Z'), 'ko'), [], '목요일 장전 — 어제가 맞다');
        assert.deepEqual(stateRelativeDayReasons('本日の通常取引でナスダック総合は2.9%下落', prompt('POST', '2026-10-30T21:00:00Z'), 'ja'), ['tactical:relative-day']);
        assert.deepEqual(stateRelativeDayReasons('本日(10/30)の通常取引でナスダック総合は2.9%下落', prompt('POST', '2026-10-30T21:00:00Z'), 'ja'), [], '날짜가 붙으면 화면에서 절대 표기로 바뀐다');
        assert.deepEqual(stateRelativeDayReasons('In yesterday’s session Nasdaq fell', prompt('CLOSED', '2026-11-02T08:10:00Z'), 'en'), ['tactical:relative-day']);
        assert.deepEqual(stateRelativeDayReasons('지금 정규장 나스닥 종합은 0.4% 하락 중입니다', prompt('REG', '2026-11-02T16:00:00Z'), 'ko'), [], 'REG 는 기존 검사');
    });

    await test('NEXT 실적 시각 — 정확 시각 없는 AMC·BMO 실적은 EVENT_TIMES 에 시각 없이(일정 검사와 같은 계약) · 현물 날짜 요일 · 요일 오기 교정 · St. 문장 분리', () => {
        const ctx = { rlsiScore: 33, vix: 19.4, locale: 'ko' as const, session: 'CLOSED' as const, asOf: iso(MON), indexFacts: buildIndexFacts(monBasis, 'CLOSED', MON),
            scheduledEvents: ['[earnings calendar; 2026-11-02; AMC timing boundary 16:00 ET; exact release time unknown] AAPL (confirmed; scheduled; not a released result)',
                '[economic calendar; 2026-11-02 10:00 ET] ISM Manufacturing PMI (Oct) (scheduled; not a released result)'] };
        const p = buildTacticalPrompt(ctx, 'ko');
        const times = JSON.parse(p.match(/^EVENT_TIMES: (.*)$/m)![1]);
        assert.deepEqual(times.map((t: any) => t.timing), ['11/2(월) 장 마감 후', '11/2(월) 10:00 ET(한국 00:00)']);
        assert.equal(JSON.parse(p.match(/^DATE_LABELS: (.*)$/m)![1])['2026-10-30'], '10/30(금)');
        const next = '다음 분기점은 11/2(월) 장 마감 후 예정된 AAPL 실적 발표로, 강하면 기술주 반등을, 약하면 약세 연장을 뜻합니다.';
        assert.ok(!tacticalNextReasons(next, p, 'generate').some(r => r.startsWith('schedule:')), JSON.stringify(tacticalNextReasons(next, p, 'generate')));
        assert.ok(tacticalNextReasons('다음 분기점은 11/2(월) 16:00 ET(한국 06:00) 예정된 AAPL 실적 발표로, 강하면 반등, 약하면 약세입니다.', p, 'generate').includes('schedule:claim-not-upcoming'), '경계 시각 주장은 계속 탈락');
        const pj = buildTacticalPrompt({ ...ctx, locale: 'ja' }, 'ja');
        assert.deepEqual(tacticalNextReasons('次の分岐点は11/2(月)10:00 ET(日本時間00:00)予定のISM製造業景況指数(ISM Manufacturing PMI)で、上振れなら金利上昇圧力、下振れなら緩和期待が強まる構造です。', pj, 'generate'), [], '日本時間 띄어쓰기 없는 병기');
        assert.deepEqual(checkTacticalStored('10/30(金)の通常取引でナスダック総合は2.9%下落しました。次の分岐点は11/2(月)10:00 ET(日本時間00:00)予定のISM製造業景況指数(ISM Manufacturing PMI)で、上振れなら金利上昇圧力、下振れなら緩和期待が強まる構造です。', pj), [], '저장본 검사도 같은 표기(통과·저장한 글이 다시 읽을 때 떨어지지 않게)');
        assert.equal(absoluteDayWords('10/30(수) 정규장에서', 'ko', MON), '10/30(금) 정규장에서');
        assert.equal(absoluteDayWords('10/30(水)の通常取引', 'ja', MON), '10/30(金)の通常取引');
        assert.equal(absoluteDayWords('a 10/30 (Wed) 12:32 ET report', 'en', MON), 'a 10/30 (Fri) 12:32 ET report');
        assert.equal(splitSentences('A. Against a 10/30 12:32 ET report in which the St. Louis Fed chief said hikes loom, yields rose. C.').length, 3);
    });

    console.log(failed ? `${failed} failed` : 'all passed');
    if (failed) process.exitCode = 1;
})();
