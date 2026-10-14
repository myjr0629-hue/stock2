'use strict';
// /usr/bin/lockf -k /tmp/signum-heavy.lock node tests/integrityParity.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { baselineLoader, decisions, revision } = require('./helpers/integrityBaseline');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-parity-'));
const oldDir = process.env.INTEGRITY_DIR;
process.env.INTEGRITY_DIR = root;
const clock = require('../scripts/integrity/clock');
const rules = require('../scripts/integrity/rules');
const refs = require('../scripts/integrity/refs');
const originalRefs = { ...refs }, oldFetch = globalThis.fetch, oldNow = Date.now;
const day = '2026-10-13', previous = '2026-10-12';
const ms = (hms, date = day) => clock.etToMs(date, hms);
const daily = { ok: true, daily: ['2026-10-09', previous, day].map((date) => ({ date, c: 100 })), events: [] };
const nas = (rows, asOf = 'Oct 13, 2026', last = 110) => ({ ok: true, last, asOf, trades: rows.map(([hms, price = 110, size = 3000]) => ({ hms, price, size })) });
const bar = (hms, price, date = day) => ({ t: ms(hms, date), c: price, l: price, h: price, o: price, v: 100 });
const raw = (kind, n, bars) => ({ yd: daily, y1m: { ok: true, bars }, [kind === 'pre' ? 'nPre' : 'nPost']: n });
const cases = [];
for (const kind of ['pre', 'post']) {
    const pre = kind === 'pre', at = pre ? '08:47:00' : '17:00:00';
    const first = pre ? '08:20:00' : '16:20:00', last = pre ? '08:46:00' : '16:59:00';
    const variants = {
        empty: nas([]), short: nas([[last]]), wrongDate: nas([[first], [last]], 'Oct 12, 2026'),
        missingDate: nas([[first], [last]], ''), stale: nas([[pre ? '08:00:00' : '16:01:00'], [first]]),
        complete: nas([[first], [last]]), failed: { ok: false, trades: [] },
    };
    for (const [name, n] of Object.entries(variants)) {
        const bars = [];
        for (let t = ms(first); t <= ms(last); t += 60e3) bars.push({ ...bar(first, 110), t });
        cases.push({ name: `gate P1 / preext3 3 ${kind} ${name}`, at, raw: raw(kind, n, bars), price: 105, expectedError: name !== 'failed' });
    }
}
// preext3 1: 부분·후속 봉. 2: 정확한 분 경계 직전 온전한 봉과 단주/비유동 입력.
for (const second of ['00', '30']) for (const hms of ['08:31:00', '08:32:00', '08:46:00']) for (const size of [50, 3000]) {
    cases.push({ name: `preext3 1/2 ${second} ${hms} size=${size}`, at: '08:47:00', price: 105,
        raw: raw('pre', nas([[`08:32:${second}`, 110, size], ['08:46:30', 110, size]]), [bar(hms, 105)]) });
}
for (const n of [null, nas([], 'Oct 12, 2026'), nas([['19:59:57']], 'Oct 12, 2026'), nas([['19:59:57']], ''), nas([['19:59:57']], 'Oct 13, 2026')]) {
    cases.push({ name: `gate P1 / preext3 4 carry ${cases.length}`, at: '04:32:00', price: 150, carry: true,
        raw: { ...raw('post', n, [bar('19:59:00', 110, previous)]), nPre: nas([]) }, expectedError: true });
}
cases.push({ name: 'POST date fallback restored', at: '17:00:00', price: 105,
    raw: raw('post', nas([['16:59:00']], 'Oct 12, 2026', 120), [bar('16:59:00', 110)]) });
cases.push({ name: 'gate P1 ticker-only POST carry', at: '04:32:00', price: 150, carry: true, tickerOnly: true,
    raw: { ...raw('post', nas([], 'Oct 12, 2026'), [bar('19:59:00', 110, previous)]), nPre: nas([]) }, expectedError: true });
function inputs(c) {
    const now = ms(c.at), S = clock.sessionAt(now), label = c.carry ? 'POST' : S.session.toUpperCase();
    const quote = { price: 100, previousClose: 100, changePercent: 0, session: S.session,
        extendedPrice: c.price, extendedLabel: label, extendedDate: c.carry ? previous : day,
        extendedTime: new Date(now - 15 * 60e3).toISOString() };
    const ticker = { session: S.session.toUpperCase(), display: { price: 100, changePctPct: 0 },
        prices: { prevRegularClose: 100, regularCloseToday: 100 },
        extended: c.carry ? { prevPostPrice: c.price, prevPostDate: previous, prevPostTime: quote.extendedTime } : {} };
    if (c.tickerOnly) { quote.extendedPrice = 0; quote.extendedLabel = ''; }
    return { now, S, quote, ticker };
}
let comparisons = 0;
function equal(actual, expected, name) { assert.deepEqual(actual, expected, name); comparisons++; }
function summary(sum) {
    const { ms: elapsed, stagesMs, doors, errorList, warnList, delayList, infoList, ...rest } = sum;
    return { ...rest, errorList: decisions(errorList), warnList: decisions(warnList), delayList: decisions(delayList), infoList: decisions(infoList) };
}
(async () => {
    try {
        const baseline = baselineLoader(), mainRules = baseline('rules');
        const watch = require('../scripts/integrity/watch'), mainWatch = baseline('watch');
        const big = require('../scripts/integrity/bigdoor'), mainBig = baseline('bigdoor');
        for (const c of cases) {
            const { now, S, quote, ticker } = inputs(c);
            const ref = rules.deriveRef(now, S, structuredClone(c.raw)), mainRef = mainRules.deriveRef(now, S, structuredClone(c.raw));
            for (const [name, args] of [
                ['judgeQuoteApi', ['TEST', quote]],
                ['judgeExtFlow', ['TEST', 'screen:flow', { extPrice: c.price, extLabel: quote.extendedLabel }]],
                ['judgeListShown', ['TEST', 'screen:list', { price: c.price, ext: true }, quote]],
            ]) equal(rules[name](now, S, ref, ...args), mainRules[name](now, S, mainRef, ...args), `${c.name} ${name}`);
            for (const listData of [{ TEST: quote }, {}]) {
                const args = { now, S, list: ['TEST'], data: { TEST: quote }, listData };
                equal(big.judgeBig({ ...args, refOf: () => ref }), mainBig.judgeBig({ ...args, refOf: () => mainRef }), `${c.name} bigdoor`);
            }
            const ctx = { t0: now, S, symbols: ['TEST'], sample: ['TEST'],
                quotes: { ok: true, calls: 1, ms: 0, session: S.session, data: { TEST: quote }, receipts: { TEST: { receivedAt: now } } },
                tickers: { out: { TEST: ticker }, fails: 0, stale: 0, receipts: { TEST: { receivedAt: now } } },
                wl: { ok: true, out: {} }, dash: { ok: true, out: {} }, hub: { skipped: true }, refRaw: { TEST: c.raw } };
            const actual = watch.judgeAll(ctx), expected = mainWatch.judgeAll(ctx);
            equal(decisions(actual), decisions(expected), `${c.name} judgeAll`);
            if (c.expectedError) assert.ok(actual.some((f) => f.code === 'EXT_VALUE' && f.sev === 'error'), c.name);
            const ext = actual.filter((f) => f.code.startsWith('EXT_'));
            for (const f of ext) {
                equal(f.msg.includes('[기준 부족:'), !f.referenceCoverage.sufficient, c.name + ' annotation');
                assert.ok(f.timing.delayedFeedSuspected, c.name + ' receipt timing');
            }
        }
        // 실제 수집·재확인·집계 경로도 같은 합성 응답으로 두 번 실행한다. 네트워크·브라우저·알림은 호출하지 않는다.
        const replayCases = [cases[1], cases[8], cases[26], cases[cases.length - 1],
            { name: 'preext3 5 after carry window', at: '04:32:00', price: 150, carry: true, raw: { ...raw('post', nas([], 'Oct 12, 2026'), [bar('19:59:00', 110, previous)]), nPre: nas([]) } },
            { name: 'preext3 5 inside carry window', at: '04:10:00', price: 150, carry: true, raw: { ...raw('post', nas([], 'Oct 12, 2026'), [bar('19:59:00', 110, previous)]), nPre: nas([]) } },
            { ...cases[1], name: 'transient confirmation', transient: true }];
        let selected, quoteCalls, extCalls;
        const mockRefs = { ...refs, sleep: async () => {}, setDeadline: () => {}, getJson: async () => ({ ok: true, body: {} }),
            fetchYahoo1m: async () => structuredClone(selected.raw.y1m), fetchYahooDaily: async () => structuredClone(daily),
            fetchNasdaqInfo: async () => ({ ok: false }), fetchNasdaqExt: async (sym, cls, kind) => {
                extCalls.push(kind); return structuredClone(selected.raw[kind === 'pre' ? 'nPre' : 'nPost'] || { ok: false, trades: [] });
            } };
        Object.assign(refs, mockRefs);
        // watch captures sleep at import; load a fresh module with the mocked dependency.
        delete require.cache[require.resolve('../scripts/integrity/watch')];
        const replayWatch = require('../scripts/integrity/watch');
        const replayMain = baselineLoader({ refs: mockRefs })('watch');
        for (const c of replayCases) {
            selected = c;
            const { now, S, quote, ticker } = inputs(c);
            Date.now = () => now;
            globalThis.fetch = async (url) => {
                const u = new URL(String(url)); let body;
                if (u.pathname === '/api/live/quotes') { quoteCalls++; body = { session: S.session, data: { TEST: { ...quote, extendedPrice: c.transient && quoteCalls > 1 ? 110 : quote.extendedPrice } } }; }
                else if (u.pathname === '/api/live/ticker') body = ticker;
                else if (u.pathname === '/api/watchlist/batch') body = { results: [] };
                else if (u.pathname === '/api/dashboard/unified') body = { tickers: {} };
                else if (u.pathname === '/api/market/index-close') body = {};
                else throw new Error('Unexpected synthetic route');
                return { ok: true, status: 200, text: async () => JSON.stringify(body) };
            };
            const results = [];
            for (const runner of [replayMain, replayWatch]) {
                for (const name of fs.readdirSync(root)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
                quoteCalls = 0; extCalls = [];
                const result = await runner.runOnce({ symbols: ['TEST'], noHub: true, noBig: true, noNotify: true, probe: false, quiet: true });
                results.push({ findings: decisions(result.findings), sum: summary(result.sum), extCalls: [...extCalls], quoteCalls });
            }
            equal(results[1], results[0], `${c.name} runOnce/confirmation/summary`);
            if (!c.transient) { assert.equal(results[1].sum.errorSymbols, 1); assert.equal(results[1].sum.ok, 0); }
            else assert.ok(results[1].findings.some((f) => f.code === 'TRANSIENT_EXT_VALUE'));
        }
        console.log(`integrityParity: ${cases.length} synthetic cases + ${replayCases.length} full replays; ${comparisons}/${comparisons} comparisons passed against origin/main ${revision.slice(0, 9)}`);
    } finally {
        Object.assign(refs, originalRefs); globalThis.fetch = oldFetch; Date.now = oldNow;
        fs.rmSync(root, { recursive: true, force: true });
        if (oldDir === undefined) delete process.env.INTEGRITY_DIR; else process.env.INTEGRITY_DIR = oldDir;
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
