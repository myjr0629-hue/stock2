// H1: 실제 공통 함수와 batch 경로를 오프라인으로 실행한다. 외부 I/O 없음.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const load = (file, mocks = {}, extra = '', now) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const compiled = ts.transpileModule(source + extra, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const mod = { exports: {} };
    const RealDate = Date;
    const Clock = now ? class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    } : RealDate;
    new Function('require', 'module', 'exports', 'process', 'Date', compiled)(id => mocks[id] || {}, mod, mod.exports, { env: {} }, Clock);
    return mod.exports;
};
const calendar = load('src/lib/marketCalendar.ts');
const rsi = load('src/lib/dailyRsi.ts', { '@/lib/marketCalendar': calendar });
const end = Date.parse('2026-10-22T00:00:00Z');
const bars = closes => closes.map((c, i) => ({ t: end - (closes.length - 1 - i) * 86400000, c, adjustedClose: c }));
const textbook = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21];
test('H1 Wilder seed와 평활: 알려진 14기간 표본', () => {
    assert.ok(Math.abs(rsi.dailyRsi14(bars(textbook.slice(0,15)), '2026-10-22') - 70.4641350211) < 1e-8);
    assert.ok(Math.abs(rsi.dailyRsi14(bars(textbook), '2026-10-22') - 62.8807183099) < 1e-8);
});
test('H1 결측·부족·중복·낡은 세션은 null; 0/100/50은 실제 값', () => {
    for (const closes of [[], textbook.slice(0,14), [...textbook.slice(0,-1),null], [...textbook.slice(0,-1),0], [...textbook.slice(0,-1),NaN]]) {
        assert.equal(rsi.dailyRsi14(bars(closes), '2026-10-22'), null);
    }
    assert.equal(rsi.dailyRsi14(bars(textbook).slice(0,-1), '2026-10-22'), null);
    const duplicate = bars(textbook); duplicate.push(duplicate.at(-1));
    assert.equal(rsi.dailyRsi14(duplicate, '2026-10-22'), null);
    assert.equal(rsi.dailyRsi14([...bars(textbook), {t:NaN,c:100,adjustedClose:100}], '2026-10-22'), null);
    for (const [closes, expected] of [[Array.from({length:30}, (_,i) => 100-i),0], [Array.from({length:30}, (_,i) => 100+i),100], [Array(30).fill(100),50]]) {
        assert.equal(rsi.dailyRsi14(bars(closes), '2026-10-22'), expected);
    }
});
test('H1 250봉 warm-up·정렬·당일 진행 봉 제외', () => {
    const rows = bars(Array.from({length:350}, (_,i) => 100+i*.03+5*Math.sin(i*.7)));
    const value = rsi.dailyRsi14(rows, '2026-10-22');
    assert.equal(value, rsi.dailyRsi14(rows.slice(-250).reverse(), '2026-10-22'));
    assert.equal(value, rsi.dailyRsi14([...rows,{t:end+86400000,c:99999,adjustedClose:99999}], '2026-10-22'));
    assert.ok(Math.abs(value-rsi.dailyRsi14(rows.slice(-20), '2026-10-22')) > 1, '20봉 seed 오차를 재현');
});
test('H1 실제 batch 입력: 공통 함수와 일치·별도 RSI 호출 제거·기존 30일 자료 보존', async () => {
    const now = Date.parse('2026-10-23T01:20:00Z');
    const rows = bars(Array.from({length:250}, (_,i) => 100+i*.03+5*Math.sin(i*.7)));
    for (const dailyRows of [rows, rows.map((r,i) => ({...r,c:r.c*(i<235 ? 10 : 1)})), [], bars(Array.from({length:30}, (_,i) => 100-i))]) {
        const calls = [];
        const batch = load('src/services/watchlistBatchService.ts', {
            '@/lib/dailyRsi': { ...rsi, dailyRsiWindow: () => rsi.dailyRsiWindow(now) },
            '@/lib/marketCalendar': calendar,
            '@/services/extendedSessionClose': { isTradeInExtSession: () => false },
            '@/lib/vwap': { selectVwap: () => null },
            '@/services/timezoneUtils': { getETNow: () => ({ hour:21, minute:20, isWeekend:false, dateString:'2026-10-22' }) },
            '@/services/massiveClient': { fetchMassive: async (url, params) => {
                calls.push({url,params});
                if (url.includes('/v2/snapshot/')) return { ticker: { prevDay:{c:100}, day:{c:101}, lastTrade:{p:102} } };
                if (url.includes('/range/1/day/')) return { results: dailyRows };
                if (url.includes('/indicators/macd/')) return { results: {values:[]} };
                throw Error('허용되지 않은 공급사 호출');
            } },
        }, '\nexport { getStockDataLight };', now);
        const result = await batch.getStockDataLight('MSFT');
        assert.equal(result.rsi, rsi.dailyRsi14(dailyRows, '2026-10-22'));
        assert.equal(result.rsi14Date, '2026-10-22');
        assert.equal(result.rsi14Basis, rsi.DAILY_RSI_BASIS);
        assert.equal(calls.length, 3);
        const daily = calls.find(c => c.url.includes('/range/1/day/'));
        assert.ok(daily.url.includes(rsi.dailyRsiWindow(now).from));
        assert.equal(daily.params.limit, '500');
        assert.deepEqual(result.dailyResults.map(r => r.close), dailyRows.filter(r => r.t >= Date.parse('2026-09-23')).map(r => r.c));
    }
});


test('P1 실제 일봉 어댑터: 10:1 분할은 손실이 아님·조정 결측은 null·호출 1회', async () => {
    const source = fs.readFileSync(path.join(root, 'src/services/intrinioClient.ts'), 'utf8');
    const context = vm.createContext({ module: { exports: {} }, exports: {}, process: { env: {} },
        require: id => id === '@/lib/marketCalendar' ? calendar : {}, console, Date });
    context.exports = context.module.exports;
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, context);
    const closes = Array.from({length:250}, (_,i) => 100+i*.03+5*Math.sin(i*.7+2));
    const adjusted = bars(closes);
    const raw = adjusted.map((r,i) => ({ date:new Date(r.t).toISOString().slice(0,10),
        close: r.c*(i<235 ? 10 : 1), adj_close:r.c, volume:1000 }));
    context.fixtureRows = raw.slice().reverse();
    vm.runInContext('var providerCalls = 0; callIntrinio = async () => { providerCalls++; return {stock_prices:fixtureRows}; };', context);
    const result = await context.module.exports.getDailyAggregates('SPLIT', '2025-01-01', '2026-10-22', {sort:'asc',limit:500});
    const expected = rsi.dailyRsi14(adjusted, '2026-10-22');
    assert.ok(Math.abs(expected - rsi.dailyRsi14(result.results.map(r => ({...r,adjustedClose:r.c})), '2026-10-22')) > 30);
    assert.equal(rsi.dailyRsi14(result.results, '2026-10-22'), expected);
    assert.deepEqual(Array.from(result.results, r => r.c), raw.map(r => r.close), '기존 원본 가격 유지');
    assert.equal(context.providerCalls, 1);
    for (const missing of [undefined,null,0,NaN,'100']) {
        context.fixtureRows[5].adj_close = missing;
        const absent = await context.module.exports.getDailyAggregates('SPLIT', '2025-01-01', '2026-10-22');
        assert.equal(rsi.dailyRsi14(absent.results, '2026-10-22'), null);
        assert.equal(absent.results[244].adjustedClose, null);
    }
    assert.equal(rsi.dailyRsi14(adjusted.map(({t,c}) => ({t,c})), '2026-10-22'), null, '원본 가격 폴백 금지');
});

function cachedBatch(now, entry) {
    const calls = [], writes = [], alphaInputs = [];
    const batch = load('src/services/watchlistBatchService.ts', {
        '@/lib/app/intelOptionsBasis': {latestCollectorGexRow:async () => null},
        '@/services/macroHubProvider': {getMacroSnapshotSSOT:async () => ({})},
        '@/lib/dailyRsi': {...rsi, dailyRsiWindow: () => rsi.dailyRsiWindow(now)},
        '@/lib/marketCalendar': calendar,
        '@/services/analysisCache': {getAnalysisCacheForTickers:async () => ({MSFT:entry}),
            writeAnalysisCache:async (_t,e) => {writes.push(e);}, patchAnalysisCache:async () => true},
        '@/services/structureService': {prefetchLevelsForExit: () => async () => new Map(),applyLevelsToRealtime() {}},
        '@/services/marketStatusProvider': {getMarketStatusSSOT:async () => ({session:'regular'})},
        '@/services/massiveClient': {fetchMassive:async url => {calls.push(url); assert.ok(url.endsWith('/tickers')); return {tickers:[]};}},
        '@/services/alphaEngine': {calculateWhaleIndex:() => 50, calculateAlphaScore:input => {alphaInputs.push(input); return {score:50,dataCompleteness:100,pillars:Object.fromEntries(['momentum','structure','flow','regime','catalyst'].map(k => [k,{score:0}]))};}},
        '@/services/realtimeMetricsService': {fetchTradeData:async () => null},
        '@/services/intrinioClient': {sessionAwareLiquidity:async () => ({})},
        '@/services/darkPool': {getDarkPoolBatch:async () => ({})},
        '@/services/redisClient': {getFromCache:async () => null},
        '@/lib/impliedMove': {readImpliedMoveFields:() => ({})},
    }, '\nexport { processWatchlistBatchCore };', now);
    return {batch,calls,writes,alphaInputs};
}

test('P2 실제 batch 캐시: 15:59→16:01/조기 마감·주말·휴장, 원천·세션 검사·추가 공급사 호출 0', async () => {
    const oldDate = '2026-10-21', newDate = '2026-10-22';
    const previous = {rsi:41.62,rsi14Date:oldDate,rsi14Basis:rsi.DAILY_RSI_BASIS,sparkline:[100],ivSkew:1,gex:1,pcr:1,netPremium:1,maxPain:1,squeezeScore:1,callWall:1,putFloor:1};
    for (const [iso, entry, expected] of [
        ['2026-10-22T19:59:00Z',previous,41.62],
        ['2026-10-22T20:01:00Z',previous,null],
        ['2026-11-27T17:59:00Z',{...previous,rsi14Date:'2026-11-25'},41.62],
        ['2026-11-27T18:01:00Z',{...previous,rsi14Date:'2026-11-25'},null],
        ['2026-10-24T12:00:00Z',{...previous,rsi14Date:'2026-10-23'},41.62],
        ['2026-11-26T21:01:00Z',{...previous,rsi14Date:'2026-11-25'},41.62],
        ['2026-10-22T20:01:00Z',{...previous,rsi:57.84,rsi14Date:newDate},57.84],
        ['2026-10-22T20:01:00Z',{...previous,rsi:0,rsi14Date:newDate},0],
        ['2026-10-22T20:01:00Z',{...previous,rsi:null,rsi14Date:newDate},null],
        ['2026-10-22T20:01:00Z',{...previous,rsi14Date:newDate,rsi14Basis:undefined},null],
        ['2026-10-22T20:01:00Z',{...previous,rsi14Date:undefined},null],
    ]) for (const mode of ['price','price-dp','ssr','full']) {
        const h = cachedBatch(Date.parse(iso), entry);
        const result = await h.batch.processWatchlistBatchCore(['MSFT'],mode);
        assert.equal(result.results[0].realtime.rsi,expected,iso+' '+mode);
        if (mode === 'full') assert.equal(h.alphaInputs[0].rsi14,expected);
        assert.equal(h.calls.length,1,'기존 묶음 snapshot 1회만');
        assert.equal(h.writes.length,mode === 'full' ? 1 : 0);
        for (const written of h.writes) {
            assert.equal(written.rsi,expected);
            assert.equal(written.rsi14Date,entry.rsi14Date,'점수 재계산으로 RSI 날짜를 갱신하지 않는다');
            assert.equal(written.rsi14Basis,entry.rsi14Basis);
        }
        assert.equal(previous.rsi, 41.62, '입력 캐시 원본 보존');
    }
});
