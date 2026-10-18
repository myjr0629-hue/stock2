/**
 * aiq55(2026-10-12) — AI 분석 입력 보강: 사실 만들기 · 기준 시각이 붙은 문구 · 근거 숫자 가드 · 신뢰 경로 어댑터 · 읽기 서비스(끄기 스위치) · 인텔 출구 가드
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/aiqContext.test.ts
 */
import assert from 'node:assert/strict';

// ── 모듈 바꿔 끼우기(서비스 import 전): 레디스(메모리) · Upstash 저장소(끄기 스위치) ──
const store = new Map<string, unknown>();
let redisReads = 0;
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
    id: rcPath, filename: rcPath, loaded: true,
    exports: {
        getFromCache: async (k: string) => { redisReads++; return store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; },
        mgetFromCache: async (ks: string[]) => { redisReads++; return ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)); },
        setInCache: async () => true,
    },
} as unknown as NodeModule;
const upstash = new Map<string, string>();
const lsPath = require.resolve('../src/lib/ai/llmStore');
const realLs = require(lsPath);
require.cache[lsPath] = { id: lsPath, filename: lsPath, loaded: true, exports: { ...realLs, upstashStore: { ...realLs.memoryStore(), get: async (k: string) => upstash.get(k) ?? null } } } as unknown as NodeModule;

import {
    citeFreshness, withReach, volBand, vsMarket, buildAiqFacts, offExFrom, impliedFrom, holdersFrom, ranksFrom, prettyFiler, citeOffEx, citeImplied, citeLevels, citeEarnings, citeHolders, citeRank,
    contextXml, contextLines, groundingText, attachEarnings, AIQ_DISCIPLINE, type AiqFacts,
} from '../src/lib/ai/aiqContext';
import { checkAiqSlot, hasAsOfMarker, hasRealNumber, sanitizeFieldsAiq, measureAiqText } from '../src/lib/ai/aiqGuard';
import { patchFlowDataWithAiq, aiqGateWrap, aiqCorrective } from '../src/lib/ai/aiqTrust';
import { intelAnalysesGate } from '../src/lib/ai/intelBatch';
import { flowTextSlots } from '../src/lib/ai/flowTrust';
import { structureV2Key, structureLastGoodKey } from '../src/services/structureService';
import { rankingCacheKey } from '../src/lib/rankings/cacheKey';

let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); passed++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };

// 운영 실측(2026-10-12, NVDA): 장외 FINRA 행 · 구조 사본 impliedMove · 13F 색인
const dpRow = { pct: 43.8, date: '2026-10-09', marketAvg: 52.1, volRatio: 0.88, shortPct: 48.2, shortAvg: 42.7, regime: 'NEUTRAL' };
const imRow = { def: 'atm-straddle-mid/1', pct: 3.2, straddle: 7.35, strike: 230, expiry: '2026-10-16', basis: 'eod', asOf: null, chainDate: '2026-10-09', session: '2026-10-09' };
const holders13f = {
    period: '2026-06-30', totalHolders: 5953, totalShares: 16792908656, source: 'sec-form13f-datasets', universeFilers: 8857,
    holders: [
        { name: 'BlackRock, Inc.', shares: 1941918386, marketValue: 388558449946 }, { name: 'VANGUARD CAPITAL MANAGEMENT LLC', shares: 1540816358, marketValue: 308301945144 },
        { name: 'FMR LLC', shares: 1026051548, marketValue: 205302654287 }, { name: 'STATE STREET CORP', shares: 1009783437, marketValue: 202047567957 },
        { name: 'GEODE CAPITAL MANAGEMENT, LLC', shares: 606216492, marketValue: 121297857913 },
    ],
};
const rankBlob = {
    generatedAt: '2026-10-12T11:40:47.001Z',
    results: {
        stealth: { available: true, phase: 'postclose', state: 'fresh', session: '2026-10-09', candidates: 913, name: { ko: '은밀 축적·분산', en: 'Stealth accumulation', ja: '静かな買い集め' }, items: [{ ticker: 'LOAR' }, { ticker: 'NVDA' }] },
        'maxpain-gap': { available: true, phase: 'intraday', candidates: 224, name: { ko: '맥스페인 이격도', en: 'Max pain gap', ja: 'マックスペイン乖離' }, items: [{ ticker: 'FIVN' }] },
        'volatility-bet': { available: true, phase: 'postclose', state: 'fresh', name: { ko: 'a', en: 'b', ja: 'c' }, items: [{ ticker: 'NVDA' }] },
        'darkpool-volume': { available: true, phase: 'postclose', state: 'stale', session: '2026-10-07', candidates: 700, name: { ko: 'x', en: 'y', ja: 'z' }, items: [{ ticker: 'NVDA' }] },
    },
};

(async () => {
    await t('FINRA 행 → 사실: 100% 이상·날짜 없음은 버린다', () => {
        assert.deepEqual(offExFrom(dpRow), { pct: 43.8, date: '2026-10-09', marketAvg: 52.1, volRatio: 0.88, shortPct: 48.2, shortAvg: 42.7, regime: 'NEUTRAL' });
        assert.equal(offExFrom({ ...dpRow, pct: 100 }), null);
        assert.equal(offExFrom({ ...dpRow, date: null }), null);
        // UC 의 money 필드 이름도 받는다
        assert.equal(offExFrom({ darkPoolPct: 43.8, darkPoolDate: '2026-10-09', darkPoolMarketAvg: 52.1, darkPoolVolRatio: 0.88 })?.marketAvg, 52.1);
    });

    await t('옵션이 반영한 변동폭: 정의 표식이 다르면 버린다(벽 사이 폭이 아니다)', () => {
        assert.deepEqual(impliedFrom(imRow), { pct: 3.2, expiry: '2026-10-16', basis: 'eod', session: '2026-10-09' });
        assert.equal(impliedFrom({ ...imRow, def: 'wall-range/0' }), null);
        assert.equal(impliedFrom({ ...imRow, pct: 75 }), null);
    });

    await t('기관 이름 다듬기', () => {
        assert.equal(prettyFiler('VANGUARD CAPITAL MANAGEMENT LLC'), 'Vanguard Capital Management');
        assert.equal(prettyFiler('BlackRock, Inc.'), 'BlackRock');
        assert.equal(prettyFiler('JPMORGAN CHASE & CO'), 'JPMorgan Chase');
        assert.equal(prettyFiler('STATE STREET CORP'), 'State Street');
    });

    await t('13F: 상위 5곳·집중도는 코드가 계산 · 소표본은 버린다', () => {
        const h = holdersFrom(holders13f, false)!;
        assert.equal(h.period, '2026-06-30'); assert.equal(h.total, 5953);
        assert.equal(h.top[0].name, 'BlackRock'); assert.equal(h.top[0].sharePct, 11.6);
        assert.equal(h.top5SharePct, 36.5);
        assert.equal(holdersFrom(holders13f, true), null);
        assert.equal(holdersFrom({ ...holders13f, holders: holders13f.holders.slice(0, 2) }, false), null);
    });

    await t('랭킹: 상위 목록 안·fresh 마감 후 랭킹만 · volatility-bet(실적 캘린더 정의) 제외', () => {
        const r = ranksFrom(rankBlob, 'nvda');
        assert.deepEqual(r.map((x) => x.id), ['stealth']);
        assert.equal(r[0].rank, 2); assert.equal(r[0].asOf, '2026-10-09'); assert.equal(r[0].candidates, 913);
        assert.deepEqual(ranksFrom(rankBlob, 'AAPL'), []);
    });

    const facts = buildAiqFacts({
        ticker: 'nvda', todayEt: '2026-10-12', offEx: dpRow, implied: imRow, levels: { chainDate: '2026-10-09', expiry: '2026-10-16', maxPain: 215 },
        earnings: { date: '2026-10-15' }, holders13f: { entry: holders13f, partial: false }, rankings: rankBlob,
    })!;

    await t('사실 묶음: 실적 D-n 은 ET 오늘 기준 · 비면 null', () => {
        assert.equal(facts.ticker, 'NVDA'); assert.deepEqual(facts.earnings, { date: '2026-10-15', days: 3 });
        assert.equal(buildAiqFacts({ ticker: 'X', todayEt: '2026-10-12' }), null);
        assert.equal(attachEarnings(facts, '2026-10-01')!.earnings!.days, 3, '지난 실적은 붙이지 않는다');
        assert.equal(attachEarnings(null, '2026-10-15'), null);
    });

    await t('문구: 날짜·출처·숫자가 한 덩어리(앱 마감 꼬리표와 같은 표기)', () => {
        assert.equal(citeOffEx(facts.offEx!, 'ko'), '10/9(금) 마감 기준 FINRA 장외 비중 43.8%(시장 평균 52.1%, 시장 평균보다 낮음, 이 종목 20일 평균 대비 장외 물량 0.88배로 평소 수준)');
        assert.equal(citeOffEx(facts.offEx!, 'en'), 'FINRA off-exchange share 43.8% (Fri 10/9 close; market average 52.1%, below the market average; off-exchange volume 0.88x its own 20-day average, about normal)');
        assert.ok(citeOffEx(facts.offEx!, 'ja').startsWith('10/9(金) 終値、FINRA場外比率43.8%'));
        assert.equal(citeImplied(facts.implied!, 'ko'), '10/9(금) 마감 기준 옵션이 10/16 만기까지 반영한 변동폭 ±3.2%(ATM 스트래들 기준)');
        assert.equal(citeImplied(facts.implied!, 'en'), 'options price in a ±3.2% move by the 10/16 expiry (ATM straddle, Fri 10/9 close)');
        assert.ok(citeLevels(facts.levels!, 'ko').includes('Max Pain·Call Wall·Put Floor·Gamma Flip') && citeLevels(facts.levels!, 'ja').includes('Gamma Flip'));
        assert.ok(citeEarnings(facts.earnings!, 'ko', '2026-10-16').includes('D-3') && citeEarnings(facts.earnings!, 'ko', '2026-10-16').includes('만기 안에 실적'));
        assert.ok(!citeEarnings(facts.earnings!, 'ko', '2026-10-13').includes('만기 안에'), '실적이 만기 뒤면 «안에 들어 있음»을 쓰지 않는다');
        assert.ok(citeHolders(facts.holders!, 'ko').includes('6/30 분기말 13F') && citeHolders(facts.holders!, 'ko').includes('발행주식 대비 비율 아님') && citeHolders(facts.holders!, 'en').includes('top 5 together 36.5%; not a share of shares outstanding'));
        assert.equal(citeRank(facts.ranks![0], 'ko'), '10/9 기준 «은밀 축적·분산» 랭킹 2위(913종목 중)');
    });

    await t('옵션 지표별 기준 시각: 거래량·프리미엄·OPI·레벨은 직전 마감 하루치(코드 근거 dataFreshness)', () => {
        const ko = citeFreshness('2026-10-09', 'ko');
        assert.ok(ko.includes('10/9(금) 마감 기준 하루치(전일 데이터)') && ko.includes('OPI와 옵션 레벨은 같은 날 미결제약정 기준') && ko.includes('가격과 변동성은 화면의 현재 세션'));
        assert.ok(citeFreshness('2026-10-09', 'en').includes('previous-session data') && citeFreshness('2026-10-09', 'ja').includes('前日データ'));
    });

    await t('코드가 정하는 말: 장외 물량 배수 구간·시장 평균 대비(모델이 1.11배를 «매집»으로 과해석하지 않게)', () => {
        assert.deepEqual([2, 1.5, 1.3, 1.2, 1.1, 0.8, 0.79].map(volBand), ['surge', 'surge', 'above', 'above', 'normal', 'normal', 'below']);
        assert.equal(volBand(null), null);
        assert.deepEqual([vsMarket(50.3, 52.1), vsMarket(43.8, 52.1), vsMarket(60, 52.1), vsMarket(50, null)], ['similar', 'lower', 'higher', null]);
        assert.ok(citeOffEx({ ...facts.offEx!, pct: 50.3, volRatio: 1.11 }, 'ko').includes('시장 평균과 비슷') && citeOffEx({ ...facts.offEx!, volRatio: 1.9 }, 'ja').includes('平常を大きく上回る'));
    });

    await t('옵션이 반영한 변동폭 × 두 벽: 범위 안/밖을 코드가 계산(화면 토큰과 같은 거리 식) · 벽이 이미 넘겨졌으면 뺀다', () => {
        const f = withReach(facts, 382.83)!;   // TSLA 식: 변동폭 ±3.2% = 범위 안에 Put Floor(220?) — 여기서는 NVDA 구조 값 사용
        const base = buildAiqFacts({ ticker: 'TSLA', todayEt: '2026-10-12', implied: { ...imRow, pct: 4.1 }, levels: { chainDate: '2026-10-09', expiry: '2026-10-16', callWall: 400, putFloor: 380 } })!;
        const r = withReach(base, 382.83)!.implied!.reach!;
        assert.deepEqual(r.call, { level: 400, distPct: 4.5, inside: false }); assert.deepEqual(r.put, { level: 380, distPct: 0.7, inside: true });
        const ko = citeImplied(withReach(base, 382.83)!.implied!, 'ko');
        assert.ok(ko.includes('Call Wall $400은 현재가에서 4.5% 위로 이 범위 밖') && ko.includes('Put Floor $380은 0.7% 아래로 이 범위 안'));
        assert.ok(citeImplied(withReach(base, 382.83)!.implied!, 'en').includes('the Call Wall $400 is 4.5% above spot, outside that range; the Put Floor $380 is 0.7% below, inside it'));
        assert.equal(f.implied!.reach, undefined, '벽 값이 없으면 reach 를 만들지 않는다(NVDA 구조 값은 levels 에 벽이 없다)');
        assert.equal(withReach(base, 405)!.implied!.reach!.call, undefined, '가격이 콜월을 넘었으면 그 벽은 뺀다');
        assert.equal(withReach(base, null), base); assert.equal(withReach(null, 100), null);
    });

    await t('프롬프트 조각: 세 언어 cite · 규율(사실→의미→지켜볼 지점·권유 금지) · 한 언어 줄', () => {
        const x = contextXml(facts);
        for (const tag of ['<verified_context today="2026-10-12"', '<levels_as_of', '<data_freshness last_completed_session="2026-10-09"', '<off_exchange', '<implied_move', '<earnings_countdown', '<institutional_13f', '<ranking id="stealth"', '<cite_ko>', '<cite_en>', '<cite_ja>']) assert.ok(x.includes(tag), tag);
        assert.ok(x.includes('Quarter-over-quarter changes are NOT available'));
        assert.equal(contextXml(null), '');
        assert.equal(contextXml({ ...facts, earnings: undefined }, { withEarnings: false }).includes('earnings_countdown'), false);
        assert.ok(AIQ_DISCIPLINE.includes('FACT → MEANING → WATCH') && /Never compute new numbers/.test(AIQ_DISCIPLINE) && /no buy\/sell\/hold advice, no price targets/i.test(AIQ_DISCIPLINE));
        const lines = contextLines(facts, 'ko', { withEarnings: true });
        assert.equal(lines.length, 6);
        assert.equal(contextLines(facts, 'ko', { skipOffEx: true }).length, 4);
        assert.ok(groundingText(facts).includes('43.8') && groundingText(facts).includes('5,953'));
    });

    const ground = `${groundingText(facts)}\nprice 228.93 callWall 250 putFloor 220 maxPain 215 OPI 63`;

    await t('가드: 근거 있는 새 사실 문장은 통과 · 기준 시각 확인', () => {
        const r = checkAiqSlot('10/9(금) 마감 기준 FINRA 장외 비중은 43.8%로 시장 평균 52.1%보다 낮다. 가격은 Put Floor 220 위에 있다.', 'ko', ground);
        assert.deepEqual(r.removed, []); assert.equal(r.cites, true); assert.equal(r.asOfMissing, false); assert.equal(r.text.includes('43.8'), true);
    });

    await t('가드: 입력에 없는 숫자(계산한 차이·지어낸 값)가 든 새 사실 문장만 뺀다', () => {
        const r = checkAiqSlot('10/9 마감 기준 장외 비중은 43.8%다. 시장 평균보다 8.3%p 낮다. Put Floor는 220이다.', 'ko', ground);
        assert.equal(r.removed.length, 1); assert.ok(r.removed[0].includes('8.3%p'));
        assert.ok(r.text.includes('43.8%') && r.text.includes('Put Floor') && !r.text.includes('8.3'));
        assert.equal(r.usable, true);
        const en = checkAiqSlot('Options price in a ±4.9% move by the 10/16 expiry.', 'en', ground);
        assert.equal(en.removed.length, 1); assert.equal(en.usable, false, '남는 글이 없으면 못 쓴다');
        // 주제 단어가 없어도 입력에 없는 숫자(모델 계산·지어낸 값)는 뺀다 — 입력에 있는 숫자(OPI 63)는 그대로
        assert.equal(checkAiqSlot('OPI 게이지는 71로 콜 우위다. 그래도 가격 변동은 크지 않다.', 'ko', ground).removed.length, 1);
        assert.equal(checkAiqSlot('OPI 게이지는 63으로 콜 우위다. 그래도 가격 변동은 크지 않다.', 'ko', ground).removed.length, 0);
    });

    await t('가드: 숫자가 있는 새 사실인데 기준 시각이 없으면 asOfMissing', () => {
        const r = checkAiqSlot('장외 비중은 43.8%로 시장 평균 52.1%보다 낮다.', 'ko', ground);
        assert.equal(r.removed.length, 0); assert.equal(r.asOfMissing, true);
        assert.equal(hasAsOfMarker('as of the 10/9 close', 'en'), true); assert.equal(hasAsOfMarker('Fri 10/9 close', 'en'), true); assert.equal(hasAsOfMarker('10/9(金) 終値', 'ja'), true);
        assert.equal(hasAsOfMarker('장외 비중이 높다', 'ko'), false);
        assert.equal(hasRealNumber('10/9 마감 기준 장외'), false, '날짜 조각은 숫자가 아니다');
        assert.equal(hasRealNumber('비중 43.8%'), true);
    });

    await t('가드: 13F 에는 분기 증감이 없다 — «늘렸다·팔았다» 류 문장은 뺀다', () => {
        const r = checkAiqSlot('6/30 분기말 13F 기준 5,953곳이 보고했다. BlackRock이 보유를 늘렸다.', 'ko', ground);
        assert.equal(r.removed.length, 1); assert.ok(r.removed[0].includes('늘렸다')); assert.ok(r.text.includes('5,953'));
        assert.equal(checkAiqSlot('As of the 6/30 quarter-end 13F, BlackRock and Vanguard added to their positions.', 'en', ground).removed.length, 1);
    });

    await t('가드: «데이터가 제공되지 않아…» 군말 문장은 뺀다(관측 사실 «확인되지 않았다»는 남긴다)', () => {
        const ko = checkAiqSlot('10/9(금) 마감 기준 FINRA 장외 비중은 43.8%다. 새 포지션 데이터가 제공되지 않아 방향은 약하게만 읽힌다. 신규 대량 포지션은 확인되지 않았다.', 'ko', ground);
        assert.equal(ko.removed.length, 1); assert.ok(ko.removed[0].includes('제공되지')); assert.ok(ko.text.includes('확인되지 않았다'));
        assert.equal(checkAiqSlot('FINRA off-exchange share was 43.8% (Fri 10/9 close). New position data was not provided, so the read is limited.', 'en', ground).removed.length, 1);
        assert.equal(checkAiqSlot('10/9(金) 終値、FINRA場外比率は43.8%です。新規建玉のデータは提供されていないため、読みは限定的です。', 'ja', ground).removed.length, 1);
        assert.equal(measureAiqText('데이터가 제공되지 않아 약하다.', 'ko', ground).filler, 1);
    });

    await t('가드: 예측어 문장(forecast 옵션) — UC·인텔처럼 신뢰 게이트가 없는 표면에서 빼고, Flow·딥은 기존 게이트가 맡는다', () => {
        const txt = '10/9(금) 마감 기준 FINRA 장외 비중은 43.8%다. 가격은 Call Wall 250까지 오를 것으로 예상된다.';
        assert.equal(checkAiqSlot(txt, 'ko', ground).removed.length, 0, '기본은 예측어를 건드리지 않는다');
        const r = checkAiqSlot(txt, 'ko', ground, { forecast: true });
        assert.equal(r.removed.length, 1); assert.ok(r.removed[0].includes('예상된다')); assert.ok(r.text.includes('43.8%'));
        assert.equal(checkAiqSlot('FINRA off-exchange share was 43.8% (Fri 10/9 close). Price will likely rally toward the Call Wall.', 'en', ground, { forecast: true }).removed.length, 1);
    });

    await t('가드: 영어/일본어 문장도 같은 규칙', () => {
        assert.equal(checkAiqSlot('FINRA off-exchange share was 43.8% (Fri 10/9 close), below the 52.1% market average.', 'en', ground).removed.length, 0);
        assert.equal(checkAiqSlot('10/9(金) 終値、FINRA場外比率は43.8%。市場平均は61.2%。', 'ja', ground).removed.length, 1);
    });

    await t('칸 정리(UC): 못 쓰는 칸 이름·기준 시각 없는 칸 이름을 돌려준다', () => {
        const box = { tickerRead: '장외 비중은 43.8%로 시장 평균보다 낮은 편이다. 시장 평균보다 9.9%p 낮다.', moneyRead: '옵션이 반영한 변동폭 99.9%.', whyItMatters: '10/9 기준 장외 비중 43.8%.' };
        const r = sanitizeFieldsAiq(box, ['tickerRead', 'moneyRead', 'whyItMatters'], 'ko', ground);
        assert.deepEqual(r.unusable, ['moneyRead']); assert.deepEqual(r.asOfMissing, ['tickerRead']);
        assert.ok(!box.tickerRead.includes('9.9') && r.removed === 2);
    });

    await t('측정: 숫자 개수·근거 일치·기준 시각', () => {
        const m = measureAiqText('10/9(금) 마감 기준 FINRA 장외 비중 43.8%. OPI는 63이다. 가짜 수치 77.7%가 있다.', 'ko', ground);
        assert.equal(m.numbers >= 3, true); assert.equal(m.ungrounded, 1); assert.equal(m.topicWithNumber >= 1, true); assert.equal(m.anyAsOf, true);
    });

    await t('신뢰 경로: 앱 Flow 화면이 비운 Max Pain·변동폭을 복사본에만 메운다', () => {
        const fd = { currentPrice: 228.93, regime: { maxPain: 0, maxPainDist: 'N/A', impliedMove: 'N/A', gammaFlipLevel: 220 } };
        const p = patchFlowDataWithAiq(fd, facts);
        assert.notEqual(p, fd); assert.equal(p.regime.maxPain, 215); assert.ok(String(p.regime.maxPainDist).includes('BELOW')); assert.ok(String(p.regime.impliedMove).includes('±3.2%'));
        assert.equal(fd.regime.maxPain, 0, '원본은 그대로');
        assert.equal(patchFlowDataWithAiq(fd, null), fd);
        const filled = { currentPrice: 228.93, regime: { maxPain: 214, impliedMove: '±3.0%' } };
        assert.equal(patchFlowDataWithAiq(filled, facts), filled, '화면이 값을 보냈으면 건드리지 않는다');
    });

    await t('신뢰 경로: 게이트 감싸기 — 어긋난 문장 제거 · 기준 시각은 strict 일 때만 실패', () => {
        const analysis = { structuralThesis: { ko: '장외 비중은 43.8%다. 가격은 Put Floor 위에 있다 {PRICE}.', en: '10/9 close: FINRA off-exchange share 43.8%. Price sits above the Put Floor {PRICE}.', ja: '10/9(金) 終値、FINRA場外比率43.8%。現物はPut Floorの上にある{PRICE}。' }, repricingCondition: { ko: '10/9 기준 Put Floor 아래 마감이 지켜볼 지점이다.', en: 'Watch a close below the Put Floor {PUT_FLOOR}.', ja: 'Put Floor {PUT_FLOOR}を下回る終値が確認点。' } };
        const g0 = { ok: true, analysis: JSON.parse(JSON.stringify(analysis)), reasons: [], stripped: 0 };
        const strict = aiqGateWrap(g0 as any, flowTextSlots, ground, facts, true);
        assert.equal(strict.ok, false); assert.ok(strict.reasons.some((r) => r.startsWith('aiq:ko:structuralThesis:asof-missing')));
        const lenient = aiqGateWrap({ ...g0, analysis: JSON.parse(JSON.stringify(analysis)) } as any, flowTextSlots, ground, facts, false);
        assert.equal(lenient.ok, true);
        assert.equal(aiqGateWrap(g0 as any, flowTextSlots, ground, null, true), g0, 'facts 가 없으면 기존 게이트 결과 그대로');
        const bad = { ok: true, analysis: { structuralThesis: { ko: '옵션이 10/16 만기까지 반영한 변동폭 ±9.9%.', en: 'Options price in ±3.2% by the 10/16 expiry (Fri 10/9 close).', ja: '10/9(金) 終値、想定変動幅±3.2%。' } }, reasons: [], stripped: 0 };
        const rb = aiqGateWrap(bad as any, flowTextSlots, ground, facts, false);
        assert.equal(rb.ok, false); assert.ok(rb.reasons[0].startsWith('aiq:ko:structuralThesis:unusable'));
        assert.equal(aiqCorrective(['ko:token-missing']), ''); assert.ok(aiqCorrective(['aiq:ko:x:asof-missing']).includes('as-of date'));
    });

    await t('읽기 서비스: 끄기 스위치(Upstash 키·환경변수) → null, 켜면 사실 · 끄는 동안 레디스 읽기 0', async () => {
        const svc = await import('../src/services/aiqContextService');
        store.clear(); upstash.clear(); svc._resetAiqMemoForTest();
        store.set('structure:v2:NVDA', { data: { chainDate: '2026-10-09', expiration: '2099-10-16', maxPain: 215, impliedMove: imRow }, timestamp: 2 });
        store.set('cache:13f:cusip:67066G104', holders13f);
        store.set(svc.AIQ_RANK_KEY, rankBlob);
        // 랭킹 키는 /api/ranking 이 굽는 키와 같다(판본 문자열 복제 금지)
        assert.equal(svc.AIQ_RANK_KEY, rankingCacheKey('all', 30, 5)); assert.ok(/^ranking:v\d+:all:30:5$/.test(svc.AIQ_RANK_KEY));
        const on = await svc.loadAiqFacts('NVDA', { offEx: dpRow, withHolders: true, withRanks: true, earningsDate: '2099-12-31', now: Date.UTC(2026, 9, 12, 12) });
        assert.ok(on && on.offEx && on.implied && on.holders && on.ranks?.length === 1 && on.levels?.maxPain === 215);
        assert.equal(on!.levels!.chainDate, '2026-10-09'); assert.equal(on!.earnings, undefined, '120일 밖 실적은 붙이지 않는다');
        // 운영자가 Upstash 에 SET aiq55:off → 30초 안에 꺼진다(메모 만료 후)
        upstash.set(svc.AIQ_OFF_KEY, '1'); svc._resetAiqMemoForTest();
        const reads0 = redisReads;
        assert.equal(await svc.loadAiqFacts('NVDA', { offEx: dpRow, now: Date.UTC(2026, 9, 12, 12, 5) }), null);
        assert.equal(redisReads, reads0, '꺼져 있으면 레디스를 읽지 않는다');
        upstash.delete(svc.AIQ_OFF_KEY); svc._resetAiqMemoForTest();
        process.env.AIQ55_OFF = '1';
        assert.equal(await svc.aiqOff(), true); assert.equal(await svc.loadAiqFacts('NVDA', {}), null);
        delete process.env.AIQ55_OFF; svc._resetAiqMemoForTest();
        assert.equal(await svc.aiqOff(), false);
        // 구조 사본 키는 structureService 와 같다
        assert.equal(svc.AIQ_STRUCTURE_V2('NVDA'), structureV2Key('NVDA')); assert.equal(svc.AIQ_STRUCTURE_LASTGOOD('NVDA'), structureLastGoodKey('NVDA:auto'));
        // 만기가 지난 구조 사본은 쓰지 않는다
        svc._resetAiqMemoForTest(); store.set('structure:v2:TSLA', { data: { chainDate: '2026-10-01', expiration: '2026-10-02', maxPain: 400, impliedMove: imRow }, timestamp: 1 });
        const stale = await svc.loadAiqFacts('TSLA', { offEx: dpRow, now: Date.UTC(2026, 9, 12, 12) });
        assert.equal(stale?.implied, undefined);
    });

    await t('인텔 출구 가드: 요청 종목 전부·3개 언어·언어 순도·거절문', () => {
        const ok = JSON.stringify({ analyses: [{ ticker: 'NVDA', ko: '엔비디아의 옵션 구조는 콜 쪽이 두텁고 Put Floor 220 위에서 가격이 움직이는 모양이라 구조가 비교적 안정적이다 라고 읽힌다.', en: 'NVDA options structure is call-heavy with price holding above the 220 Put Floor, which reads as a relatively stable structure for now.', ja: 'NVDAのオプション構造はコール寄りで、価格はPut Floor 220の上で推移しており、比較的安定した構造と読み取れます。' }] });
        assert.equal(intelAnalysesGate(['NVDA'], '')(ok), true);
        assert.equal(intelAnalysesGate(['NVDA', 'TSLA'], '')(ok), 'missing:1');
        const refusal = JSON.stringify({ analyses: [{ ticker: 'NVDA', ko: 'I cannot provide this analysis because of my guidelines and I apologize for that.', en: 'NVDA options structure is call-heavy with price holding above the 220 Put Floor, stable for now.', ja: 'NVDAのオプション構造はコール寄りで、価格はPut Floor 220の上で推移しており、比較的安定した構造と読み取れます。' }] });
        // AI 기업을 다루는 평범한 말은 거절문이 아니다(«as an AI infrastructure play»·«AI 모델»·«AIモデル»)
        const plain = JSON.stringify({ analyses: [{ ticker: 'NVDA', ko: '엔비디아는 AI 모델 학습 수요의 직접 수혜 종목으로 읽히며 옵션 구조는 콜 쪽이 두텁고 Put Floor 220 위에서 움직이는 모양이다 라고 정리된다.', en: 'NVDA trades as an AI infrastructure play with a call-heavy options structure holding above the 220 Put Floor, which reads as relatively stable for now.', ja: 'NVDAはAIモデル学習需要の恩恵を受ける銘柄で、オプション構造はコール寄りでありPut Floor 220の上で推移していると読み取れます。' }] });
        assert.equal(intelAnalysesGate(['NVDA'], '')(plain), true);
        const rr: any = intelAnalysesGate(['NVDA'], '')(refusal);
        assert.equal(rr.ok, false); assert.ok(rr.reasons.some((x: string) => x.startsWith('NVDA:ko')));
    });

    console.log(`aiqContext.test.ts: ${passed} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
