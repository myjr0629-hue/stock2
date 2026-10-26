/** 외부 호출은 모두 모의한다. 크론·DST·날짜·비용/실패 보존 회귀 시험. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import { sessionQuote, generationSession } from '../src/lib/ai/preMarketContext';
import { FreshTierSkipped, inFreshTier } from '../src/lib/ai/freshTier';
import { etClock } from '../src/lib/marketSession';

const store = new Map<string, any>();
let writes = 0, calls = 0, fetches = 0, denied = false, prompt = '';
let invalidGenerated = false;
function mock(name: string, exports: any) {
    const p = require.resolve(name);
    require.cache[p] = { id: p, filename: p, loaded: true, exports } as Module;
}
mock('../src/services/redisClient', {
    getFromCache: async (k: string) => store.get(k) ?? null,
    mgetFromCache: async (ks: string[]) => ks.map(k => store.get(k) ?? null),
    setInCache: async (k: string, v: any) => { store.set(k, v); writes++; return true; },
    deleteFromCache: async (k: string) => { store.delete(k); return true; },
});
mock('../src/services/todayPicksService', {
    loadBundle: async () => ({ date: '2026-10-16', prevDate: '2026-10-15', tickers: { AAPL: { callOI: 2000, putOI: 1000 } } }),
});
mock('../src/services/bedrockClient', {
    MODELS: { HAIKU_35: 'legacy-unused-in-fresh-tier' },
    callBedrock: async (o: any) => {
        calls++; prompt = o.userPrompt;
        assert.equal(inFreshTier(), etClock(Date.now()).minutes < 570,
            '추가 프리 생성은 기존 크레딧 전용 상한 사용');
        if (denied) throw new FreshTierSkipped(['cap']);
        const facts = promptFacts();
        const text = JSON.stringify(Object.fromEntries(facts.map((f: any) => [f.id, {
            ko: invalidGenerated ? 'NEWS PULSE 기준 섹터 동반 상승이 확인됩니다' : '섹터 안 종목별 움직임 차이가 관측됩니다',
            en: 'Differences across sector members observed', ja: 'セクター内の銘柄間で動きの差を確認',
        }])));
        assert.equal(o.validate(text), !invalidGenerated);
        return { text, model: 'claude-haiku-5.5' };
    },
});
const cron = require('../src/app/api/cron/sector-headlines/route');
const { readPreMarketContext } = require('../src/services/preMarketContext');
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const req = () => new Request('https://www.signumhq.com/api/cron/sector-headlines');
let n = 0;
async function test(name: string, f: () => unknown) { await f(); n++; console.log('ok -', name); }
function promptFacts(): any[] {
    return JSON.parse(prompt.split('not necessarily today):\n')[1].split('\n\nPRE-OPEN')[0]
        .split('\nOnly use numeric values')[0]);
}

function world(iso: string, currentPre: boolean) {
    store.clear(); writes = 0; calls = 0; fetches = 0; denied = false; prompt = '';
    invalidGenerated = false;
    const now = Date.parse(iso); Date.now = () => now;
    for (const key of ['yahoo:nq', 'yahoo:spx']) store.set(key, { price: 20000, changePct: 1.25, source: 'YAHOO', lastChangeAt: iso });
    store.set('guardian:news:digest:v2', { items: [
        { headline: 'Current pre-open news', publishedAt: iso },
        { headline: 'Friday news excluded', publishedAt: '2026-10-16T18:00:00Z' },
    ] });
    globalThis.fetch = async input => {
        fetches++;
        const u = new URL(String(input)); assert.equal(u.pathname, '/api/live/quotes');
        const data = Object.fromEntries(u.searchParams.get('symbols')!.split(',').map(t => [t, {
            price: 100, changePercent: -3, extendedPrice: currentPre ? 102 : 0,
            extendedChangePercent: currentPre ? 2 : 0, extendedLabel: currentPre ? 'PRE' : 'POST',
            extendedDate: currentPre ? iso.slice(0, 10) : '2026-10-16',
        }]));
        return Response.json({ data, session: currentPre ? 'pre' : 'closed' });
    };
    return now;
}

(async () => {
    try {
        await test('평일 UTC 크론 08:30 / 08:40·10:40, 기존 슬롯 유지', () => {
            const { crons } = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
            assert.ok(crons.some((c: any) => c.path === '/api/cron/today-picks' && c.schedule === '30 8 * * 1-5'));
            assert.ok(crons.some((c: any) => c.path === '/api/cron/sector-headlines' && c.schedule === '40 8,10 * * 1-5'));
            assert.equal(crons.filter((c: any) => c.path === '/api/cron/today-picks').length, 5);
        });
        await test('PRE 날짜 불일치·미체결 0·null은 직전 REG, 진짜 0% 프리 체결은 PRE', () => {
            const now = Date.parse('2026-10-19T08:40:00Z');
            const r = { price: 100, changePercent: -3, extendedPrice: 100, extendedChangePercent: 0, extendedLabel: 'PRE', extendedDate: '2026-10-19' };
            assert.equal(sessionQuote('AAPL', r, 'pre', now).basis, 'PRE');
            assert.equal(sessionQuote('AAPL', { ...r, extendedPrice: 0 }, 'pre', now).basis, 'REG');
            const old = sessionQuote('AAPL', { ...r, extendedDate: '2026-10-16' }, 'pre', now);
            assert.equal(old.date, '2026-10-16'); assert.equal(old.changePct, -3);
            assert.equal(sessionQuote('AAPL', { price: null, changePercent: null }, 'pre', now).changePct, null);
        });
        for (const [iso, pre, session] of [
            ['2026-10-19T08:40:00Z', true, 'PRE-MARKET'], ['2026-10-19T10:40:00Z', true, 'PRE-MARKET'],
            ['2026-11-02T08:40:00Z', false, 'CLOSED'], ['2026-11-02T10:40:00Z', true, 'PRE-MARKET'],
            ['2026-10-19T12:20:00Z', true, 'PRE-MARKET'],
        ] as const) await test(`${iso}: 세션·날짜·재료·중복 0콜`, async () => {
            world(iso, pre);
            store.set(cron.HEADLINE_KEY, { date: '2026-10-16', session: 'AFTER HOURS' });
            const res = await cron.GET(req()); assert.equal(res.status, 200);
            assert.equal((await res.json()).success, true);
            const doc = store.get(cron.HEADLINE_KEY);
            assert.equal(doc.date, iso.slice(0, 10)); assert.equal(doc.session, session);
            assert.equal(doc.generatedAt, iso.replace('Z', '.000Z'));
            assert.equal(doc.optionsAsOf, '2026-10-16'); assert.equal(doc.optionsOpenedOn, '2026-10-15');
            assert.equal(doc.context.news.length, 1); assert.equal(doc.context.futures.live, true);
            assert.match(prompt, /priceSession/); assert.doesNotMatch(prompt, /priorOptions|futures|publishedAt/);
            assert.ok(doc.facts.every((f: any) => f.priorOptions && f.members.length === f.measured));
            assert.match(prompt, pre ? /"priceSession": "PRE"/ : /"priceSession": "REG"/);
            const again = await (await cron.GET(req())).json(); assert.equal(again.skipped, 'same-slot');
            assert.equal(calls, 1); assert.equal(fetches, 1);
        });
        await test('같은 날 두 PRE 슬롯은 각각 1회 생성', async () => {
            world('2026-10-19T08:40:00Z', true); await cron.GET(req());
            Date.now = () => Date.parse('2026-10-19T10:40:00Z');
            await cron.GET(req()); assert.equal(calls, 2);
        });
        await test('실측 PRE 0%를 금요일 -3%로 바꾸지 않고 보합으로 집계', async () => {
            world('2026-10-19T08:40:00Z', true);
            const fetchAll = globalThis.fetch;
            globalThis.fetch = async (u, opts) => {
                const body = await (await fetchAll(u, opts)).json();
                for (const r of Object.values<any>(body.data)) {
                    r.extendedPrice = 100; r.extendedChangePercent = 0; r.extendedMissing = false;
                }
                return Response.json(body);
            };
            await cron.GET(req());
            const facts = promptFacts();
            assert.equal(facts.length, 10);
            for (const f of facts) {
                assert.equal(f.priceSession, 'PRE'); assert.equal(f.priceDate, '2026-10-19');
                assert.equal(f.equalWeightAvgPct, 0); assert.equal(f.up, 0); assert.equal(f.down, 0);
                assert.equal(f.flat, f.measuredNames);
            }
            const doc = store.get(cron.HEADLINE_KEY);
            assert.ok(doc.context.quotes.every((q: any) => q.basis === 'PRE' && q.changePct === 0));
        });
        await test('크레딧 상한 차단이면 이전판 유지·AWS 호출 없음', async () => {
            world('2026-10-19T08:40:00Z', true); denied = true;
            const prev = { date: '2026-10-16', session: 'AFTER HOURS' }; store.set(cron.HEADLINE_KEY, prev);
            assert.equal((await (await cron.GET(req())).json()).skipped, 'credit-cap-or-unavailable');
            assert.equal(store.get(cron.HEADLINE_KEY), prev); assert.equal(calls, 1);
        });
        await test('새 생성 전부 탈락이면 기존 정상 저장본을 새 검사 없이 보존', async () => {
            world('2026-10-19T08:40:00Z', true); invalidGenerated = true;
            const prev = { date: '2026-10-19', session: 'PRE-MARKET', sectors: {
                m7: { headline: '기존 저장 글은 그대로 보존되는 문장입니다', headlineEN: 'Stored English remains available', headlineJP: '既存の日本語の文をそのまま保持' },
            } };
            store.set(cron.HEADLINE_KEY, prev);
            const response = await cron.GET(req());
            assert.equal(response.status, 502); assert.equal((await response.json()).error, 'all rejected');
            assert.equal(store.get(cron.HEADLINE_KEY), prev);
            assert.equal(writes, 1, 'PRE 배경 잠금만 기록하고 headline pack은 쓰지 않음');
        });
        await test('PRE 일부만 있으면 섞지 않고 REG 기준일로 평균', async () => {
            world('2026-10-19T08:40:00Z', true);
            const fetchAll = globalThis.fetch;
            globalThis.fetch = async (u, opts) => {
                const body = await (await fetchAll(u, opts)).json();
                for (const [t, r] of Object.entries<any>(body.data)) if (t !== 'AAPL') { r.extendedPrice = 0; r.extendedChangePercent = 0; }
                return Response.json(body);
            };
            await cron.GET(req()); assert.match(prompt, /"priceSession": "REG"/);
            assert.match(prompt, /"equalWeightAvgPct": -3/); assert.match(prompt, /"priceDate": "2026-10-16"/);
        });
        for (const [measured, pct, basis] of [[1, 1, 'REG'], [4, 1, 'POST'], [7, 0, 'POST']] as const) {
            await test(`2차 관문 POST 재현: 실측 ${measured}종목 ${pct}%·나머지 REG -5%를 섞지 않음`, async () => {
                world('2026-10-19T20:05:00Z', false);
                globalThis.fetch = async input => {
                    fetches++;
                    const tickers = new URL(String(input)).searchParams.get('symbols')!.split(',');
                    const data = Object.fromEntries(tickers.map((t, i) => [t, {
                        price: 100, changePercent: -5, extendedPrice: i < measured ? 100 + pct : 0,
                        extendedChangePercent: pct, extendedMissing: i >= measured,
                        extendedLabel: 'POST', extendedDate: '2026-10-19',
                    }]));
                    return Response.json({ data, session: 'post' });
                };
                await cron.GET(req());
                const f = promptFacts().find(f => f.id === 'm7');
                assert.equal(f.priceSession, basis);
                assert.equal(f.priceDate, '2026-10-19');
                assert.equal(f.equalWeightAvgPct, basis === 'REG' ? -5 : pct);
                assert.equal(f.measuredNames, basis === 'REG' ? 7 : measured);
                assert.equal(f.down, basis === 'REG' ? 7 : 0);
                assert.equal(f.flat, pct === 0 ? measured : 0);
                assert.equal(store.get(cron.HEADLINE_KEY).session, 'AFTER HOURS');
            });
        }
        await test('묵은 선물·뉴스는 현재 PRE 재료로 쓰지 않음', async () => {
            const now = world('2026-10-19T08:40:00Z', true);
            store.set('yahoo:nq', { price: 20000, changePct: 1, source: 'YAHOO', lastChangeAt: '2026-10-16T20:00:00Z' });
            store.delete('yahoo:spx');
            const c = await readPreMarketContext(now); assert.equal(c.futures.live, false); assert.equal(c.futures.nq, null);
        });
        await test('토·일은 시세·AI·저장 모두 0', async () => {
            for (const iso of ['2026-10-17T08:40:00Z', '2026-10-18T10:40:00Z']) {
                world(iso, false);
                assert.equal((await (await cron.GET(req())).json()).skipped, 'closed-day');
                assert.equal(calls, 0); assert.equal(fetches, 0); assert.equal(writes, 0);
            }
            assert.equal(generationSession(Date.parse('2026-11-02T08:30:00Z')), 'CLOSED');
        });
        console.log(`${n} passed`);
    } finally { Date.now = originalNow; globalThis.fetch = originalFetch; }
})().catch(e => { console.error(e); process.exitCode = 1; });
