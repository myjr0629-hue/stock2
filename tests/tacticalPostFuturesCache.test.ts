/**
 * T2 10/28 — 장후 Tactical 글이 «종가 이후 선물 사실 없이» 만들어졌는데 지금 프롬프트엔 그 사실이 있으면 TTL 안이어도 재사용하지 않는다.
 * 10/27 실측 재현: 16:01 ET 생성 «미확인» 글 → 기준 키 16:10 ET 저장 → 장후 내내 그대로. 모델·Redis 는 메모리 모의.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { buildIndexFacts, promptHasFuturesFacts } from '@/lib/ai/tacticalIndexFacts';
import { buildTacticalPrompt } from '@/lib/ai/tacticalPrompt';

type Locale = 'ko' | 'en' | 'ja';
const store = new Map<string, any>();
const mockModule = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
let clock = Date.parse('2026-10-27T20:01:10Z');   // 16:01 ET (POST)
mockModule('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set(key: string, value: string) { const row = JSON.parse(value); row.updatedAt = new Date(clock).toISOString(); store.set(key, row); }
} });
mockModule('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');

// 운영 10/27 값(EC2·Upstash 기준 키·야후 캐시 실측)
const cash = (symbol: string, price: number, changePct: number) => ({ symbol, price, changePct, marketTime: '2026-10-27T19:59:00.000Z', lastChangeAt: '2026-10-27T19:59:00.000Z', source: 'YAHOO' });
const fut = (symbol: string, price: number, at: string) => ({ symbol, price, changePct: 1.2, marketTime: at, lastChangeAt: at, source: 'YAHOO' });
const refs = { nq: { symbol: 'NQ=F' as const, sessionDate: '2026-10-27', price: 29816.5, asOf: '2026-10-27T20:00:06.000Z' },
    es: { symbol: 'ES=F' as const, sessionDate: '2026-10-27', price: 7758.25, asOf: '2026-10-27T19:59:59.000Z' } };
const factsAt = (now: number, withRef: boolean) => {
    const futAt = new Date(now - 10 * 60_000).toISOString();   // 야후 약 10분 지연
    const b = buildMarketIndexBasis({ nasdaq: cash('^IXIC', 23000, 1.2), spx: cash('^GSPC', 6900, 0.6), nq: fut('NQ=F', 29797.5, futAt), es: fut('ES=F', 7760.5, futAt) },
        now, withRef ? refs : {});
    return buildIndexFacts(b, 'POST', now);
};
const noFut = {
    ko: '10/27(화) 정규장에서 나스닥 종합은 1.2%, S&P 500은 0.6% 올랐고, 종가 이후 선물 변화는 미확인입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 미확인입니다.',
    en: 'In the 10/27 (Tue) cash session the Nasdaq Composite rose 1.2% and the S&P 500 rose 0.6%, and the futures change since that close is unconfirmed. The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is unconfirmed.',
    ja: '10/27(火)の通常取引でナスダック総合は1.2%、S&P 500は0.6%上昇し、終値以降の先物の変化は未確認です。今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認基準は未確認です。',
};
const withFut = {
    ko: '10/27(화) 정규장에서 나스닥 종합은 1.2%, S&P 500은 0.6% 올랐고, 그 종가 이후 지금 나스닥 100 선물은 보합, S&P 500 선물도 보합입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 미확인입니다.',
    en: 'In the 10/27 (Tue) cash session the Nasdaq Composite rose 1.2% and the S&P 500 rose 0.6%, and since that close Nasdaq 100 futures are now flat and S&P 500 futures are flat. The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is unconfirmed.',
    ja: '10/27(火)の通常取引でナスダック総合は1.2%、S&P 500は0.6%上昇し、その終値以降、ナスダック100先物は現在横ばい、S&P 500先物も横ばいです。今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認基準は未確認です。',
};
let reply: any = noFut;
let calls = 0;
let failModel = false;
let withRef = false;
const ctx = (locale: Locale) => ({ locale, rlsiScore: 38, nasdaqChange: 1.2, vectors: [], vix: 17.5, asOf: new Date(clock).toISOString(), indexFacts: factsAt(clock, withRef) });

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    const realNow = Date.now;
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async () => { calls++; if (failModel) throw new Error('offline model failure'); return { text: JSON.stringify(reply), model: 'mock', usedFallback: false, elapsedMs: 0 } as any; });
    try {
        // 재료 전제: 기준 전엔 선물 사실 없음, 기준 뒤엔 nq·es 두 줄(10/27 실측 −0.06%·+0.03%)
        assert.equal(factsAt(Date.parse('2026-10-27T20:01:10Z'), false).some(f => f.kind === 'futures'), false);
        const later = factsAt(Date.parse('2026-10-27T20:24:13Z'), true).filter(f => f.kind === 'futures');
        assert.deepEqual(later.map(f => [f.id, Number(f.chgPct.toFixed(2))]), [['nq', -0.06], ['es', 0.03]]);
        assert.equal(promptHasFuturesFacts(buildTacticalPrompt(ctx('ko'), 'ko')), false);

        for (const cold of [false, true]) {
            _resetInsightStateForTest(); store.clear(); calls = 0; reply = noFut; withRef = false; failModel = false;
            clock = Date.parse('2026-10-27T20:01:10Z');
            assert.equal(await N.generateRealityInsight(ctx('ko')), noFut.ko, '16:01 ET 생성(기준 결측 → 미확인)');
            assert.equal(calls, 1);
            assert.equal(store.get('guardian:gemini:v3:reality:ko').futures, false, '저장본에 «선물 사실 없음» 표식');
            assert.equal(N.tacticalHasFutures('ko', noFut.ko), false);
            // 16:05 ET 아직 기준 없음 → TTL 안 재사용
            clock = Date.parse('2026-10-27T20:05:00Z');
            if (cold) _resetInsightStateForTest();
            assert.equal(await N.generateRealityInsight(ctx('en')), noFut.en);
            assert.equal(calls, 1, '기준 전 재사용');
            // 16:10:30 ET 기준 저장됨 → TTL(10분) 안이어도 재생성
            withRef = true; reply = withFut;
            clock = Date.parse('2026-10-27T20:10:30Z');
            if (cold) _resetInsightStateForTest();
            assert.ok(promptHasFuturesFacts(buildTacticalPrompt(ctx('ko'), 'ko')));
            assert.equal(await N.generateRealityInsight(ctx('ko')), withFut.ko, `선물 사실이 생기면 재생성(${cold ? '콜드 스타트 Redis' : '메모리'})`);
            assert.equal(calls, 2);
            assert.equal(N.tacticalHasFutures('ko', withFut.ko), true);
            assert.equal(store.get('guardian:gemini:v3:reality:ja').futures, true);
            clock = Date.parse('2026-10-27T20:15:00Z');
            if (cold) _resetInsightStateForTest();
            assert.equal(await N.generateRealityInsight(ctx('ja')), withFut.ja, '선물 사실로 만든 글은 TTL 안 재사용(반복 없음)');
            assert.equal(calls, 2);
        }

        // 재생성 실패 → 직전 정상본 복구 · 표식 없음(스냅샷이 다시 시도하게)
        _resetInsightStateForTest(); store.clear(); calls = 0; reply = noFut; withRef = false; failModel = false;
        clock = Date.parse('2026-10-27T20:01:10Z');
        assert.equal(await N.generateRealityInsight(ctx('ko')), noFut.ko);
        withRef = true; failModel = true;
        clock = Date.parse('2026-10-27T20:10:30Z');
        const recovered = await N.generateRealityInsight(ctx('ko'));
        assert.equal(recovered, noFut.ko, '실패 시 직전 정상본(빈칸 금지)');
        assert.equal(N.tacticalHasFutures('ko', recovered), false);
        failModel = false;

        // 정규장(REG)은 무관 — 10분 TTL 그대로
        _resetInsightStateForTest(); store.clear(); calls = 0; withRef = false;
        reply = { ko: '나스닥 현물 관측은 미확인입니다. 오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 미확인입니다.',
            en: 'Nasdaq spot observations are unavailable. The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is unconfirmed.',
            ja: 'ナスダック現物の観測は未確認です。今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認基準は未確認です。' };
        clock = Date.parse('2026-10-27T18:00:00Z');
        const reg = (l: Locale) => ({ locale: l, rlsiScore: 38, nasdaqChange: 1.2, vectors: [], vix: 17.5, asOf: new Date(clock).toISOString() });
        const first = await N.generateRealityInsight(reg('ko'));
        assert.equal(first, reply.ko);
        const before = calls;
        clock = Date.parse('2026-10-27T18:09:00Z');
        assert.equal(await N.generateRealityInsight(reg('ko')), first);
        assert.equal(calls, before, 'REG TTL 안 재사용 유지');
    } finally { Date.now = realNow; _setModelCallerForTest(null); _setMarketClockForTest(null); }
    console.log('통과 장후 Tactical 선물 사실 생기면 재생성(메모리·Redis)·반복 없음·실패 복구 표식 없음·REG 무영향');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
