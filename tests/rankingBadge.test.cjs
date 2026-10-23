// 실행: node --test tests/rankingBadge.test.cjs — 네트워크·Redis·DB 없이 실제 소스 실행.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
let now = Date.parse('2026-10-22T20:00:00Z');
class Clock extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
}
function compile(file, imports = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText, { exports, Date: Clock, console, ...globals, require: name => {
        assert.ok(name in imports, `Unmocked import: ${name}`);
        return imports[name];
    } });
    return exports;
}
const calendar = compile('src/lib/marketCalendar.ts');
const engine = compile('src/lib/rankings/engine.ts', { '@/lib/marketCalendar': calendar });
const badge = compile('src/lib/rankings/badge.ts');
const registry = compile('src/lib/rankings/registry.ts');
registry.RANKINGS = plain(registry.RANKINGS);
const keys = compile('src/lib/rankings/cacheKey.ts');
const marketSession = compile('src/lib/marketSession.ts', { './marketCalendar': calendar });
const cases = [
    ['개장 직전', '2026-10-22T13:29:59.999Z', false],
    ['개장', '2026-10-22T13:30:00Z', true],
    ['마감 직전', '2026-10-22T19:59:59.999Z', true],
    ['마감', '2026-10-22T20:00:00Z', false],
    ['보고 시각 18:17 ET', '2026-10-22T22:17:00Z', false],
    ['토요일', '2026-10-24T15:00:00Z', false],
    ['일요일', '2026-10-25T15:00:00Z', false],
    ['노동절 휴장', '2026-09-07T15:00:00Z', false],
    ['조기 폐장 직전', '2026-11-27T17:59:59.999Z', true],
    ['조기 폐장', '2026-11-27T18:00:00Z', false],
    ['성탄 전날 조기 폐장', '2026-12-24T18:00:00Z', false],
    ['EST 개장 직전', '2026-12-01T14:29:59.999Z', false],
    ['EST 개장', '2026-12-01T14:30:00Z', true],
    ['EST 마감', '2026-12-01T21:00:00Z', false],
];
for (const [label, iso, open] of cases) test(`세션·배지: ${label}`, () => {
    now = Date.parse(iso);
    const session = engine.sessionPhase();
    assert.equal(session.regularOpen, open);
    for (const spec of registry.RANKINGS) {
        assert.equal(badge.rankingBadgePhase(spec.phase, session),
            spec.phase === 'intraday' && !open ? 'postclose' : spec.phase, spec.id);
    }
});
test('session 결측·모순은 장중으로 표시하지 않고, 나머지 분류는 그대로다', () => {
    for (const session of [null, undefined, { phase: 'intraday', regularOpen: false },
        { phase: 'postclose', regularOpen: true }, { phase: 'intraday' }]) {
        assert.equal(badge.rankingBadgePhase('intraday', session), 'postclose');
        assert.equal(badge.rankingBadgePhase('postclose', session), 'postclose');
        assert.equal(badge.rankingBadgePhase('anytime', session), 'anytime');
    }
});

const results = Object.fromEntries(registry.RANKINGS.map(spec => [spec.id, {
    phase: spec.phase, name: spec.name, available: false, items: [],
    ...(spec.needsPostClose ? { session: '2026-10-21', state: 'fresh' } : {}),
}]));
function snapshot(at) {
    return { ok: true, generatedAt: new Date(at).toISOString(), session: engine.sessionPhase(at),
        optionSession: '2026-10-21', darkPool: { date: '2026-10-21' }, results: plain(results) };
}
async function api(cached, { run = 'all', duringServe } = {}) {
    const writes = [], jobs = [];
    const route = compile('src/app/api/ranking/route.ts', {
        'next/server': { NextResponse: { json: x => x }, after: job => jobs.push(job) },
        '@/lib/aws/dynamoClient': { TABLES: {}, queryItems: async () => [] },
        '@/lib/app/intelOptionsBasis': { isGuardianSnapshotRow: () => false },
        '@/services/redisClient': {
            getFromCache: async key => key.startsWith('ranking:') ? cached : null,
            setInCache: async (...args) => writes.push(args),
        },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/lib/rankings/registry': registry, '@/lib/rankings/cacheKey': keys,
        '@/lib/rankings/sources': { fetchFundamentals: async () => ({}) },
        '@/services/earningsCalendarService': {}, '@/lib/earningsDate': {},
        '@/lib/marketCalendar': calendar, '@/lib/cache/staleLock': { ageSec: ms => Math.floor(ms / 1000) },
        '@/services/massiveClient': {},
        '@/lib/rankings/livePrice': { STRUCT_LIVE_RULES: {}, withLivePrices: async x => {
            if (duringServe) now = duringServe;
            return x;
        } },
    });
    const out = await route.GET({ nextUrl: new URL(`http://fixture/api/ranking?run=${run}&top=10`) });
    return { out, writes, jobs };
}
for (const [label, boundary] of [
    ['개장', '2026-10-22T13:30:00Z'], ['마감', '2026-10-22T20:00:00Z'],
    ['조기 폐장', '2026-11-27T18:00:00Z'],
]) for (const age of [60, 599, 600, 601]) test(`API ${label} 경계: ${age}초 전 사본`, async () => {
    now = Date.parse(boundary);
    const cached = snapshot(now - age * 1000), before = plain(cached);
    const { out, writes, jobs } = await api(cached);
    assert.equal(out._cache, age <= 600 ? 'hit' : 'stale');
    assert.deepEqual(plain(out.session), plain(engine.sessionPhase()));
    assert.deepEqual(plain(out.results), before.results);
    assert.equal(out.generatedAt, before.generatedAt);
    assert.deepEqual(plain(cached), before, '캐시 원본을 변경하지 않는다');
    assert.equal(writes.length, 0);
    assert.equal(jobs.length, age <= 600 ? 0 : 1);
});
for (const [label, iso] of cases.filter(x => /토요일|휴장/.test(x[0]))) test(`API 장외 stale: ${label}`, async () => {
    now = Date.parse(iso);
    const cached = snapshot(now - 11 * 3600_000);
    cached.session = { phase: 'intraday', regularOpen: true, etTime: '15:59' };
    const { out } = await api(cached);
    assert.equal(out._cache, 'stale');
    assert.equal(out.session.regularOpen, false);
});
test('API miss 및 서빙 도중 마감도 응답 직전에 세션을 갱신한다', async () => {
    now = Date.parse('2026-10-22T19:59:59Z');
    const { out, writes } = await api(null, { run: 'deep-value-fcf', duringServe: now + 1000 });
    assert.equal(out._cache, 'miss');
    assert.equal(out.session.regularOpen, false);
    assert.equal(writes.length, 1, '기존 캐시 쓰기는 메모리 대역에서만 실행');
    assert.equal(writes[0][1].session.regularOpen, true, '저장 당시 session은 응답과 별개');
});

function presentation(cached) {
    return compile('src/lib/rankings/present.ts', {
        '@/lib/net/publicBase': { publicBase: () => 'http://fixture' },
        '@/lib/marketSession': marketSession, './engine': engine,
    }, { fetch: async (_url, options) => {
        assert.equal(options.next.revalidate, 600);
        return { ok: true, json: async () => cached };
    } });
}
for (const [label, boundary] of [['개장', '2026-10-22T13:30:00Z'], ['마감', '2026-10-22T20:00:00Z']]) {
    test(`공개 fetch 600초 캐시: ${label} 전후 동일 자료·현재 session`, async () => {
        const at = Date.parse(boundary), cached = snapshot(at - 60_000), before = plain(cached);
        const present = presentation(cached);
        for (const offset of [-1, 0, 599_000, 600_000]) {
            now = at + offset;
            const out = await present.loadRankingSnapshot();
            assert.deepEqual(plain(out.session), plain(engine.sessionPhase()));
            assert.deepEqual(plain(out.results), before.results);
            assert.equal(out.generatedAt, before.generatedAt);
        }
        assert.deepEqual(plain(cached), before);
    });
}

const jsx = require('react/jsx-runtime');
function elements(tree) {
    if (Array.isArray(tree)) return tree.flatMap(elements);
    if (!tree || typeof tree !== 'object') return [];
    return [tree, ...elements(tree.props?.children)];
}
const common = {
    'react/jsx-runtime': jsx, 'next/link': { default: 'a', __esModule: true },
    '@/lib/net/publicBase': { publicBase: () => 'http://fixture' },
    '@/lib/rankings/registry': registry, '@/lib/rankings/badge': badge,
    '@/lib/marketing/pageViewMark': { markPageView: async () => {} },
    '@/components/share/ShareLanding': {},
    '@/lib/giftShare/config': { giftEnabled: () => false, withGift: x => x },
    '@/lib/share/shareQuery': { readShareQuery: async () => ({ fromShare: false }) },
    '@/lib/rankings/engine': engine,
};
for (const locale of ['ko', 'en', 'ja']) for (const [label, iso, open] of cases.filter(x =>
    ['개장', '마감', '토요일', '노동절 휴장', '조기 폐장'].includes(x[0]))) {
    test(`실제 허브·상세·앱 JSX: ${locale} ${label}, 전체 카드·기존 문구·분류 유지`, async () => {
        now = Date.parse(iso);
        const snap = await presentation(snapshot(now - 600_000)).loadRankingSnapshot();
        const present = { ...presentation(snap), loadRankingSnapshot: async () => snap };
        const webLabels = { ko: ['장중', '마감 후', '상시'], en: ['During the session', 'After the close', 'Any time'], ja: ['取引時間中', '引け後', '常時'] }[locale];
        const appLabels = { ko: ['장중', '장 마감 후', '상시'], en: ['Intraday', 'After close', 'Anytime'], ja: ['ザラ場', '引け後', '常時'] }[locale];
        const expected = (spec, labels) => labels[spec.phase === 'anytime' ? 2 : spec.phase === 'postclose' || !open ? 1 : 0];
        const imports = { ...common, '@/lib/rankings/present': present };
        const hub = compile('src/app/[locale]/rankings/page.tsx', imports);
        const hubTree = await hub.default({ params: Promise.resolve({ locale }) });
        const hubBadges = elements(hubTree).filter(x => x.type === 'span' && x.props.style?.borderRadius === 999);
        assert.deepEqual(hubBadges.map(x => x.props.children), registry.RANKINGS.map(s => expected(s, webLabels)));
        const detail = compile('src/app/[locale]/rankings/[id]/page.tsx', {
            ...imports, 'next/navigation': { notFound: () => assert.fail('notFound') },
        });
        for (const spec of registry.RANKINGS) {
            const tree = await detail.default({ params: Promise.resolve({ locale, id: spec.id }) });
            const spans = elements(tree).filter(x => x.type === 'span' && x.props.style?.borderRadius === 999);
            assert.equal(spans[0].props.children, expected(spec, webLabels), spec.id);
        }
        let stateIndex = 0;
        const app = compile('src/app/[locale]/app-view/rankings/page.tsx', {
            ...imports,
            react: { useEffect: () => {}, useMemo: fn => fn(), useState: initial => {
                const value = [initial, snap.results, { session: snap.session, phase: snap.session.phase }, false, now][stateIndex++];
                return [value, () => {}];
            } },
            'next/navigation': { useRouter: () => ({}), useParams: () => ({ locale }), useSearchParams: () => new URLSearchParams() },
            '@/components/app/AppTickerLogo': {}, '@/components/app/watchlist/StarButton': {},
            '@/components/app/watchlist/useLongPress': { useStarLongPress: () => () => ({}) },
            '@/lib/app/watchlist': { useAppWatchlist: () => ({}) }, '@/components/share/ShareButton': {},
            './rankings.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
            '@/lib/app/requestDeadline': {}, '@/lib/app/rankingFormat': {},
        });
        const nodes = elements(app.default());
        const appBadges = nodes.filter(x => x.props?.className === 'rkCP');
        assert.equal(appBadges.length, registry.RANKINGS.length);
        registry.RANKINGS.forEach((spec, i) => {
            if (snap.results[spec.id].session) assert.match(appBadges[i].props.children, /10[/.]21/);
            else assert.equal(appBadges[i].props.children, expected(spec, appLabels), spec.id);
        });
        const counts = nodes.filter(x => x.type === 'button' && /^ \d+$/.test(x.props.children?.[1])).map(x => x.props.children[1]);
        assert.deepEqual(counts, ['intraday', 'postclose', 'anytime'].map(p => ` ${registry.RANKINGS.filter(s => s.phase === p).length}`));
        const colors = nodes.filter(x => x.props?.style?.['--c']).map(x => x.props.style['--c']);
        assert.deepEqual(colors, registry.RANKINGS.map(s => ({ intraday: '#22d3ee', postclose: '#a78bfa', anytime: '#fbbf24' })[s.phase]));
        assert.deepEqual(plain(snap.results), results);
    });
}

// 같은 컴포넌트를 유지한다. 실제 effect·상태·타이머·탭 클릭을 실행하고 외부 I/O는 대역만 사용한다.
async function mountedApp(locale, payload) {
    const states = [], effects = [], pending = [], timers = new Map();
    let stateIndex, effectIndex, tree, dirty = true, requests = 0, timerId = 0;
    const target = () => {
        const listeners = new Map();
        return {
            listeners,
            addEventListener: (name, fn) => {
                if (!listeners.has(name)) listeners.set(name, new Set());
                listeners.get(name).add(fn);
            },
            removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
            fire: name => { for (const fn of listeners.get(name) || []) fn(); },
        };
    };
    const window = target(), document = { ...target(), visibilityState: 'visible' };
    const app = compile('src/app/[locale]/app-view/rankings/page.tsx', {
        ...common,
        react: {
            useState: initial => {
                const i = stateIndex++;
                if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
                return [states[i], value => {
                    const next = typeof value === 'function' ? value(states[i]) : value;
                    if (!Object.is(states[i], next)) { states[i] = next; dirty = true; }
                }];
            },
            useEffect: (fn, deps) => {
                const i = effectIndex++;
                if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i].deps[j]))) {
                    pending.push(() => {
                        effects[i]?.cleanup?.();
                        effects[i] = { deps, cleanup: fn() };
                    });
                }
            },
            useMemo: fn => fn(),
        },
        'next/navigation': { useRouter: () => ({}), useParams: () => ({ locale }), useSearchParams: () => new URLSearchParams() },
        '@/components/app/AppTickerLogo': {}, '@/components/app/watchlist/StarButton': {},
        '@/components/app/watchlist/useLongPress': { useStarLongPress: () => () => ({}) },
        '@/lib/app/watchlist': { useAppWatchlist: () => ({}) }, '@/components/share/ShareButton': {},
        './rankings.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
        '@/lib/app/requestDeadline': { fetchResponseWithDeadline: async () => {
            requests++;
            return { ok: true, json: async () => payload };
        } },
        '@/lib/app/rankingFormat': {},
    }, {
        window, document, AbortController,
        setTimeout: (fn, delay) => {
            const id = ++timerId;
            timers.set(id, { fn, at: now + delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
    });
    function render() {
        if (!dirty) return;
        stateIndex = effectIndex = 0;
        dirty = false;
        tree = app.default();
        while (pending.length) pending.shift()();
    }
    async function flush() {
        for (let i = 0; i < 8; i++) { render(); await Promise.resolve(); }
    }
    await flush();
    return {
        nodes: () => elements(tree),
        requests: () => requests,
        timers,
        window, document,
        advance: async (iso, wake = 'timer') => {
            now = Date.parse(iso);
            if (wake === 'timer') {
                for (const [id, task] of [...timers]) if (task.at <= now) { timers.delete(id); task.fn(); }
            } else if (wake === 'tab') {
                elements(tree).find(x => x.type === 'button' && x.props.children?.[0] === ({ ko: '장중', en: 'Intraday', ja: 'ザラ場' })[locale]).props.onClick();
            } else if (wake === 'focus') window.fire('focus');
            else document.fire('visibilitychange');
            await flush();
        },
        unmount: () => { for (const effect of effects) effect?.cleanup?.(); },
    };
}

const transitions = [
    ['보고된 마감 누락', '2026-10-22T19:59:30Z', '2026-10-22T20:00:00Z', '2026-10-22T20:10:00Z'],
    ['보고된 개장 누락', '2026-10-22T13:29:30Z', '2026-10-22T13:30:00Z', '2026-10-22T13:40:00Z'],
    ['조기 폐장', '2026-11-27T17:59:30Z', '2026-11-27T18:00:00Z'],
    ['EST 개장', '2026-12-01T14:29:30Z', '2026-12-01T14:30:00Z'],
    ['EST 마감', '2026-12-01T20:59:30Z', '2026-12-01T21:00:00Z'],
    ['휴장 중 09:30', '2026-09-07T13:29:30Z', '2026-09-07T13:30:00Z'],
    ['주말 중 09:30', '2026-10-24T13:29:30Z', '2026-10-24T13:30:00Z'],
    ['DST 종료 후 복귀', '2026-10-30T19:59:30Z', '2026-11-02T14:30:00Z'],
];
for (const locale of ['ko', 'en', 'ja']) for (const [label, start, boundary, reported] of transitions) {
    for (const wake of ['timer', 'tab', 'focus', 'visibility']) test(`마운트 유지: ${locale} ${label} · ${wake}`, async () => {
        now = Date.parse(start);
        const payload = snapshot(now), before = plain(payload);
        const app = await mountedApp(locale, payload);
        const labels = { ko: ['장중', '장 마감 후', '상시'], en: ['Intraday', 'After close', 'Anytime'], ja: ['ザラ場', '引け後', '常時'] }[locale];
        const check = () => {
            const nodes = app.nodes();
            const badges = nodes.filter(x => x.props?.className === 'rkCP');
            const open = engine.sessionPhase().regularOpen;
            const shown = registry.RANKINGS.filter(s => wake !== 'tab' || s.phase === 'intraday');
            assert.equal(badges.length, shown.length);
            shown.forEach((spec, i) => {
                if (payload.results[spec.id].session) assert.match(badges[i].props.children, /10[/.]21/);
                else assert.equal(badges[i].props.children, labels[spec.phase === 'anytime' ? 2 : spec.phase === 'postclose' || !open ? 1 : 0], spec.id);
            });
            assert.ok(nodes.find(x => x.props?.className === 'rkSub').props.children.includes(labels[open ? 0 : 1]), '상단 단계도 현재 세션');
            assert.equal(app.requests(), 1, '배지 갱신은 재조회하지 않는다');
            assert.deepEqual(plain(payload), before, '숫자·원천 날짜·결측을 바꾸지 않는다');
        };
        try {
            if (wake !== 'tab') check();
            await app.advance(wake === 'tab' ? reported || boundary : boundary, wake);
            check();
            if (reported && wake !== 'tab') { await app.advance(reported, wake); check(); }
        } finally { app.unmount(); }
        assert.equal(app.timers.size, 0, '언마운트 시 타이머 해제');
        for (const target of [app.window, app.document]) {
            assert.ok([...target.listeners.values()].every(set => set.size === 0), '언마운트 시 리스너 해제');
        }
    });
}
