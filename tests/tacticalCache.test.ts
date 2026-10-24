/** 지난 발표가 예정으로 재사용되는 관문 재현. 모델·Redis·세션 보관은 전부 메모리 모의 구현. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildTacticalPrompt, cachedEvidence, checkTacticalOutput, datedHeadline } from '../src/lib/ai/tacticalPrompt';

type Locale = 'ko' | 'en' | 'ja';
const store = new Map<string, any>();
let archive: any = null;
const mockModule = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mockModule('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set(key: string, value: string) {
        // TTL 나이도 시험 시계에 맞춘다(실제 Date 생성자는 건드리지 않는다).
        const row = JSON.parse(value);
        row.updatedAt = new Date(clock).toISOString();
        store.set(key, row);
    }
} });
mockModule('../src/lib/sessionArchive', {
    readSessionArchive: async () => archive,
    saveSessionArchive: async () => false,
});
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');

const realNow = Date.now;
let clock = Date.parse('2026-10-20T12:29:00Z');
let calls: string[] = [];
let reply: (opts: any) => Promise<string>;
let count = 0;
let failures = 0;
const key = (locale: Locale) => `guardian:gemini:v3:reality:${locale}`;
const stale = {
    ko: '나스닥 현물 관측은 미확인입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인은 10/20(화) 08:30 ET(한국 21:30) CPI 예정입니다.',
    en: 'Nasdaq spot observations are unavailable. The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is CPI scheduled on 10/20 (Tue) at 08:30 ET.',
    ja: 'ナスダック現物の観測は未確認です。今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認は10/20(火) 08:30 ET(日本時間 21:30)のCPI発表予定です。',
};
const fresh = {
    ko: '나스닥 현물 관측은 미확인입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 미확인입니다.',
    en: 'Nasdaq spot observations are unavailable. The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is unconfirmed.',
    ja: 'ナスダック現物の観測は未確認です。今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認基準は未確認です。',
};
const ctx = (locale: Locale, iso = new Date(clock).toISOString()) => ({
    locale, rlsiScore: 34, nasdaqChange: -0.3, vectors: [], vix: 18.4,
    asOf: iso, scheduledEvents: cachedEvidence(null, {
        updatedAt: iso, events: [{ date: '2026-10-20', time: '12:30', event: 'CPI' }],
    }, null, new Date(iso)).events,
});
const reset = () => {
    _resetInsightStateForTest(); store.clear(); archive = null; calls = [];
    clock = Date.parse('2026-10-20T12:29:00Z');
    reply = async opts => String(opts.label).includes('_TRI') ? JSON.stringify(stale) : stale[opts.locale as Locale];
};
const test = async (name: string, fn: () => Promise<void> | void) => {
    if (process.argv.includes('--gate-only') && !/08:29 생성|콜드 스타트|08:42 모델 실패/.test(name)) return;
    reset();
    try { await fn(); count++; console.log(`ok - ${name}`); }
    catch (e) { failures++; console.error(`FAIL - ${name}`, e); }
};
async function seed(locale: Locale) {
    assert.equal(await N.generateRealityInsight(ctx(locale)), stale[locale]);
    assert.equal(Date.parse(store.get(key(locale)).updatedAt), clock);
    const before = calls.length;
    assert.equal(await N.generateRealityInsight(ctx(locale)), stale[locale]);
    assert.equal(calls.length, before, '발표 전 동일 입력은 캐시 재사용');
}

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async opts => {
        calls.push(String(opts.label));
        return { text: await reply(opts), model: 'mock', usedFallback: false, elapsedMs: 0 } as any;
    });
    for (const locale of ['ko', 'en', 'ja'] as const) {
        await test(`${locale}: 08:29 생성 → 08:31 메모리 TTL 안이어도 지난 CPI 제외`, async () => {
            await seed(locale);
            clock = Date.parse('2026-10-20T12:31:00Z');
            const before = calls.length;
            reply = async () => JSON.stringify(fresh);
            assert.equal(await N.generateRealityInsight(ctx(locale)), fresh[locale]);
            assert.ok(calls.length > before);
        });
        await test(`${locale}: 콜드 스타트 Redis TTL 안에서도 현재 일정 대조`, async () => {
            await seed(locale); _resetInsightStateForTest();
            clock = Date.parse('2026-10-20T12:31:00Z');
            reply = async () => JSON.stringify(fresh);
            assert.equal(await N.generateRealityInsight(ctx(locale)), fresh[locale]);
        });
        await test(`${locale}: 08:42 모델 실패 복구·쿨다운에서 지난 일정 부활 없음`, async () => {
            await seed(locale);
            const stored = JSON.stringify(store.get(key(locale)));
            clock = Date.parse('2026-10-20T12:42:00Z');
            reply = async () => { throw new Error('offline model failure'); };
            const out = await N.generateRealityInsight(ctx(locale));
            assert.ok(N.isPlaceholderInsight(out), out);
            assert.equal(JSON.stringify(store.get(key(locale))), stored, '실패로 기존 캐시 덮지 않음');
            const before = calls.length;
            assert.ok(N.isPlaceholderInsight(await N.generateRealityInsight(ctx(locale))));
            assert.equal(calls.length, before, '기존 실패 쿨다운 유지');
        });
    }
    await test('CPI 이름·08:30 숫자가 뉴스에 남아도 NEXT의 예정 근거로 재사용 불가', () => {
        clock = Date.parse('2026-10-20T12:31:00Z');
        const c = { ...ctx('en'), marketNewsHeadlines: [datedHeadline({ title: 'CPI release at 08:30 ET', published_utc: '2026-10-20T12:30:00Z' }, 'WIRE', new Date(clock))!] };
        const text = 'WIRE 12:30 UTC reported CPI at 08:30 ET. Dealer gamma absorption is unconfirmed. The next test is CPI scheduled at 08:30 ET.';
        const reasons = checkTacticalOutput(text, 'en', buildTacticalPrompt(c, 'en'));
        assert.ok(reasons.some(r => r.startsWith('schedule:')), reasons.join(','));
        assert.ok(reasons.some(r => r.startsWith('event:unsupported:')));
    });
    await test('일정이 입력에 남아도 발표 순간부터 예정 근거 거부·미래 일정 허용', () => {
        const c = ctx('en');
        assert.deepEqual(checkTacticalOutput(stale.en, 'en', buildTacticalPrompt(c, 'en')), []);
        for (const asOf of ['2026-10-20T12:30:00Z', '2026-10-20T12:31:00Z']) {
            assert.ok(checkTacticalOutput(stale.en, 'en', buildTacticalPrompt({ ...c, asOf }, 'en')).some(r => r.startsWith('schedule:')));
        }
    });
    await test('복구 번역: 현재 근거 없는 다른 언어 원본은 모델 호출 전 거부', async () => {
        await seed('ko'); store.delete(key('en')); _resetInsightStateForTest();
        clock = Date.parse('2026-10-20T12:42:00Z');
        calls = [];
        const out = await N.recoverInsight('reality', 'en', { tacticalPrompts: l => buildTacticalPrompt(ctx(l), l) });
        assert.ok(N.isPlaceholderInsight(out));
        assert.equal(calls.length, 0);
    });
    await test('복구 번역: 정상 원본을 지난 일정으로 번역하면 저장·반환 거부', async () => {
        clock = Date.parse('2026-10-20T12:42:00Z');
        store.set(key('ko'), { text: fresh.ko, updatedAt: new Date(clock).toISOString() });
        reply = async () => stale.en;
        const out = await N.recoverInsight('reality', 'en', { tacticalPrompts: l => buildTacticalPrompt(ctx(l), l) });
        assert.ok(N.isPlaceholderInsight(out));
        assert.equal(store.has(key('en')), false);
        assert.equal(calls.length, 1);
    });
    await test('장외 세션 보관 복구도 현재 근거 검사·모델 호출 0', async () => {
        clock = Date.parse('2026-10-21T01:00:00Z'); // 21:00 ET
        archive = { value: { text: stale.en, basis: null }, stamp: { observedAt: clock - 3600_000 } };
        assert.ok(N.isPlaceholderInsight(await N.generateRealityInsight(ctx('en'))));
        assert.equal(calls.length, 0);
    });
    await test('단일 언어 재시도에도 Tactical 검사 사유 전달', async () => {
        clock = Date.parse('2026-10-20T12:31:00Z');
        reply = async opts => {
            if (String(opts.label).includes('_TRI')) throw new Error('offline tri failure');
            if (String(opts.label).includes('/retry')) {
                assert.match(opts.userPrompt, /schedule:/);
                return fresh.en;
            }
            return stale.en;
        };
        assert.equal(await N.generateRealityInsight(ctx('en')), fresh.en);
    });
    await test('같은 시장 숫자의 발표 전/후 동시 요청은 생성 결과를 공유하지 않음', async () => {
        const cBefore = ctx('en');
        const cAfter = ctx('en', '2026-10-20T12:31:00Z');
        let unblock!: () => void;
        const blocked = new Promise<void>(r => { unblock = r; });
        let ready!: () => void;
        const started = new Promise<void>(r => { ready = r; });
        reply = async opts => {
            if (opts.userPrompt.includes('AS_OF: 2026-10-20T12:29:00.000Z')) {
                ready(); await blocked; return JSON.stringify(stale);
            }
            return JSON.stringify(fresh);
        };
        const first = N.generateRealityInsight(cBefore);
        await started;
        clock = Date.parse(cAfter.asOf);
        const second = N.generateRealityInsight(cAfter);
        // 두 번째 요청이 첫 생성에 묶였는지는 두 요청을 함께 완료한 뒤 확인한다.
        await new Promise<void>(r => setImmediate(r));
        unblock();
        const result = await Promise.all([first, second]);
        assert.deepEqual(result, [stale.en, fresh.en]);
    });
    await test('공유 생성 중 일정이 지나면 낡은 코어 입력으로 온 요청도 재검사', async () => {
        const old = ctx('en');
        let unblock!: () => void;
        const blocked = new Promise<void>(r => { unblock = r; });
        let ready!: () => void;
        const started = new Promise<void>(r => { ready = r; });
        let n = 0;
        reply = async () => { if (n++ > 0) return JSON.stringify(fresh); ready(); await blocked; return JSON.stringify(stale); };
        const first = N.generateRealityInsight(old);
        await started;
        clock = Date.parse('2026-10-20T12:31:00Z');
        const second = N.generateRealityInsight(old);
        await new Promise<void>(r => setImmediate(r));
        unblock();
        const result = await Promise.all([first, second]);
        assert.equal(result[0], stale.en);
        // 발표 시각이 지난 요청은 지난 예정이 빠진 근거로 따로 생성한다(지난 예정 문장 재사용 0 · 근거가 바뀐 만큼만 호출).
        assert.equal(result[1], fresh.en);
        assert.equal(calls.length, 2);
    });
    await test('언어별 요청 시각이 밀리초 단위로 달라도 같은 근거면 모델 1회', async () => {
        let unblock!: () => void;
        const blocked = new Promise<void>(r => { unblock = r; });
        let ready!: () => void;
        const started = new Promise<void>(r => { ready = r; });
        reply = async () => { ready(); await blocked; return JSON.stringify(stale); };
        const ko = N.generateRealityInsight(ctx('ko'));
        await started;
        clock++;
        const en = N.generateRealityInsight(ctx('en'));
        clock++;
        const ja = N.generateRealityInsight(ctx('ja'));
        await new Promise<void>(r => setImmediate(r));
        unblock();
        assert.deepEqual(await Promise.all([ko, en, ja]), [stale.ko, stale.en, stale.ja]);
        assert.equal(calls.length, 1);
    });
    await test('공유 코어의 asOf가 08:29에 멈춰도 08:31 요청은 현재 시각으로 검사', async () => {
        const old = ctx('en');
        await seed('en');
        clock = Date.parse('2026-10-20T12:31:00Z');
        reply = async () => JSON.stringify(fresh);
        assert.equal(await N.generateRealityInsight(old), fresh.en);
    });
    await test('판정 복구·이전 정상본 보존도 지난 예정 문장을 살리지 않음', async () => {
        await seed('en');
        clock = Date.parse('2026-10-20T12:42:00Z');
        const prompts = (l: Locale) => buildTacticalPrompt(ctx(l), l);
        const previous = { realityInsight: stale.en };
        reply = async () => { throw new Error('offline model failure'); };
        const repaired = await N.repairVerdictTexts(previous, 'en', 'test', null, prompts);
        assert.ok(N.isPlaceholderInsight(repaired.verdict.realityInsight));
        assert.ok(repaired.repaired.includes('realityInsight'));
        const unchanged = await N.repairVerdictTexts(repaired.verdict, 'en', 'test', null, prompts);
        assert.equal(unchanged.changed, false, '고정 안내 문구는 계속 복구하지 않음');
        const kept = N.keepRealTextOverPlaceholders(repaired.verdict, previous, 'en', null, prompts);
        assert.equal(kept.realityInsight, repaired.verdict.realityInsight);
        // 같은 슬롯에 현재 근거와 맞는 정상문은 보존한다.
        const valid = N.keepRealTextOverPlaceholders(repaired.verdict, { realityInsight: fresh.en }, 'en', null, prompts);
        assert.equal(valid.realityInsight, fresh.en);
    });
    await test('실제 스냅샷 출구: 코어 일정이 낡아도 08:31에 08:30 예정 재반환 없음', async () => {
        // 숫자 엔진/벤더/저장소는 로드하지 않는다. 실제 getGuardianSnapshot의 출구만 실행한다.
        for (const id of [
            '../src/services/guardian/rlsiEngine', '../src/services/guardian/sectorEngine',
            '../src/services/macroHubProvider', '../src/services/guardian/rvolEngine',
            '../src/services/massiveClient', '../src/services/guardian/gammaShieldEngine',
            '../src/services/guardian/breadthEngine', '../src/services/indexBreadth',
            'next/server', '../src/lib/cache/staleLock', '../src/services/redisClient',
        ]) mockModule(id, {});
        const basis = { cash: { nasdaq: { changePct: -0.3 } } };
        mockModule('../src/services/marketIndexBasis', { loadMarketIndexBasis: async () => basis });
        const core = { news: [], scheduledEvents: ctx('en').scheduledEvents };
        mockModule('../src/services/guardian/guardianCore', {
            getSharedCore: async () => core, overlayCore: (c: unknown) => c,
            withCashIndexBasis: (c: any, indexBasis: any) => ({ ...c, market: { ...c.market, indexBasis } }),
        });
        const { GuardianDataHub } = require('../src/services/guardian/unifiedDataStream');
        const saved = GuardianDataHub.computeGuardianSnapshot;
        GuardianDataHub.computeGuardianSnapshot = async () => ({
            rlsi: { score: 34 }, market: { nqChangePercent: -0.3, vix: 18.4 },
            verdict: { realityInsight: stale.en },
        });
        try {
            const before = await GuardianDataHub.getGuardianSnapshot(false, 'en');
            assert.equal(before.verdict.realityInsight, stale.en);
            clock = Date.parse('2026-10-20T12:31:00Z');
            const after = await GuardianDataHub.getGuardianSnapshot(false, 'en');
            assert.ok(N.isPlaceholderInsight(after.verdict.realityInsight));
            assert.equal(calls.length, 0);
        } finally { GuardianDataHub.computeGuardianSnapshot = saved; }
    });
    await test('v3: 지수 직접 표기는 유지하며 선물 낡음은 재생성만 유도, 실패 시 기존 글 보존', async () => {
        const { buildMarketIndexBasis } = require('../src/lib/marketIndexBasis');
        const basis = (change: number) => buildMarketIndexBasis({
            nasdaq: { symbol: '^IXIC', price: 100, changePct: -1.2, marketTime: '2026-10-19T19:59:00Z', source: 'YAHOO' },
            nq: { symbol: 'NQ=F', price: 100, changePct: change, marketTime: new Date(clock).toISOString(), lastChangeAt: new Date(clock).toISOString(), source: 'YAHOO' },
        }, clock);
        const pre = {
            ko: '어제 정규장에서 나스닥 종합은 1.2% 내렸고, 지금 개장 전 나스닥100 선물은 직전 정산 대비 0.2% 올랐습니다. 오늘 시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 34점으로 약하고 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.',
            en: 'Nasdaq Composite fell 1.2% in the previous cash session, while now premarket Nasdaq 100 futures rose 0.2% vs prior settlement. The market driver is unconfirmed. Market health (RLSI) is weak at 34 and options positioning (GEX) is unconfirmed. The next test is unconfirmed.',
            ja: '前回通常取引でナスダック総合は1.2%下落し、現在の取引開始前のナスダック100先物は前回清算値比0.2%上昇です。市場全体の材料は未確認です。市場の健全度(RLSI)は34点と弱く、オプション(GEX)は未確認です。次の分岐点は未確認です。',
        };
        reply = async () => JSON.stringify(pre);
        const first = await N.generateRealityInsight({ ...ctx('ko'), nasdaqChange: 0.2, indexBasis: basis(0.2), scheduledEvents: [] });
        assert.equal(first, pre.ko);
        assert.ok(!store.get(key('ko')).text.includes('{NDX_CHG}'));
        clock += 60_000;
        reply = async () => { throw new Error('offline model failure'); };
        const second = await N.generateRealityInsight({ ...ctx('ko'), nasdaqChange: -0.7, indexBasis: basis(-0.7), scheduledEvents: [] });
        assert.equal(second, pre.ko, '재생성 실패 시 저장 글 보존');
        assert.ok(calls.length > 1, '기존 상태 낡음 규칙으로 재생성 시도');
    });
    await test('10/21 관문 10211022: 동시 요청으로 마지막 글이 바뀌어도 앞선 Tactical 화면 글의 생성 기준값을 찾는다(자리표 없는 글)', async () => {
        const textA = fresh.ko;
        const textB = '나스닥 현물 관측은 미확인입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 아직 미확인입니다.';
        reply = async () => JSON.stringify({ ko: textA, en: fresh.en, ja: fresh.ja });
        const shownA = await N.generateRealityInsight({ ...ctx('ko'), nasdaqChange: 0.78 });
        assert.equal(shownA, textA);
        clock += 11 * 60_000;   // TTL(10분) 지남 → 새 생성
        reply = async () => JSON.stringify({ ko: textB, en: fresh.en, ja: fresh.ja });
        const shownB = await N.generateRealityInsight({ ...ctx('ko'), nasdaqChange: 0.15, scheduledEvents: [] });
        assert.equal(shownB, textB);
        assert.equal(N.numbersFor('reality', 'ko', shownA)?.basis?.NDX_CHG, 0.78);   // 마지막 글(B)에 덮이지 않는다
        assert.equal(N.numbersFor('reality', 'ko', shownB)?.basis?.NDX_CHG, 0.15);
        assert.equal(N.numbersFor('reality', 'ko', '모르는 글'), null);
    });
    console.log(`${count} passed, ${failures} failed`);
    assert.equal(failures, 0);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = realNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
