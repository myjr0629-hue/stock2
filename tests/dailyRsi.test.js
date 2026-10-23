// H1: 실제 공통 함수와 batch 경로를 오프라인으로 실행한다. 외부 I/O 없음.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
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
const bars = closes => closes.map((c, i) => ({ t: end - (closes.length - 1 - i) * 86400000, c }));
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
    assert.equal(rsi.dailyRsi14([...bars(textbook), {t:NaN,c:100}], '2026-10-22'), null);
    for (const [closes, expected] of [[Array.from({length:30}, (_,i) => 100-i),0], [Array.from({length:30}, (_,i) => 100+i),100], [Array(30).fill(100),50]]) {
        assert.equal(rsi.dailyRsi14(bars(closes), '2026-10-22'), expected);
    }
});
test('H1 250봉 warm-up·정렬·당일 진행 봉 제외', () => {
    const rows = bars(Array.from({length:350}, (_,i) => 100+i*.03+5*Math.sin(i*.7)));
    const value = rsi.dailyRsi14(rows, '2026-10-22');
    assert.equal(value, rsi.dailyRsi14(rows.slice(-250).reverse(), '2026-10-22'));
    assert.equal(value, rsi.dailyRsi14([...rows,{t:end+86400000,c:99999}], '2026-10-22'));
    assert.ok(Math.abs(value-rsi.dailyRsi14(rows.slice(-20), '2026-10-22')) > 1, '20봉 seed 오차를 재현');
});
test('H1 실제 batch 입력: 공통 함수와 일치·별도 RSI 호출 제거·기존 30일 자료 보존', async () => {
    const now = Date.parse('2026-10-23T01:20:00Z');
    const rows = bars(Array.from({length:250}, (_,i) => 100+i*.03+5*Math.sin(i*.7)));
    for (const dailyRows of [rows, [], bars(Array.from({length:30}, (_,i) => 100-i))]) {
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
        assert.equal(calls.length, 3);
        const daily = calls.find(c => c.url.includes('/range/1/day/'));
        assert.ok(daily.url.includes(rsi.dailyRsiWindow(now).from));
        assert.equal(daily.params.limit, '500');
        assert.deepEqual(result.dailyResults.map(r => r.close), dailyRows.filter(r => r.t >= Date.parse('2026-09-23')).map(r => r.c));
    }
});
