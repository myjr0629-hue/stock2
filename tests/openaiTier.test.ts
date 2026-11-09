/**
 * OpenAI 단 (src/lib/ai/openaiTier.ts · llmLadder.ts 의 'oa' 단) — 2026-11-07
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/openaiTier.test.ts
 *
 * 고정하는 것: 순서(① → OpenAI → Bedrock → 현행 · primary 면 OpenAI 먼저) · 증가분에서도 OpenAI 시도(AWS 는 안 감) ·
 *   insufficient_quota/401/404 → 다음 단 + 6시간 서킷 + 경보 한 번 · 월 원장·연성 상한 · 끄기 스위치 · 같은 출구 가드·JSON 정리 ·
 *   설정 없는 용도는 예전과 같다 · Responses API 요청 모양(temperature 없음·store:false) · 응답 파싱(잘림·거절·캐시 토큰).
 */
import assert from 'node:assert/strict';
import { memoryStore } from '@/lib/ai/llmStore';
import { withFreshTier } from '@/lib/ai/freshTier';
import { _flushCreditAlertsForTest, _resetCreditAlertForTest } from '@/lib/ai/creditAlert';
import { runLadder, LadderRungError, LLM_KEYS, ladderStatus, LADDER_PURPOSES, _resetLadderStateForTest, type LadderDeps, type RungResult } from '@/lib/ai/llmLadder';
import {
    classifyOaFailure, oaCost, oaMonthId, OA_KEYS, OA_DEFAULT_MONTHLY_CAP_USD, OaCallError, parseOaResponse, shapeOaBody, type OaParsed,
} from '@/lib/ai/openaiTier';
import { JSON_ONLY_INSTRUCTION } from '@/lib/ai/llmRequest';
import { OA_PRICES } from '@/lib/ai/openaiTier';
import { V4_SERVE_PROVIDERS } from '@/lib/ai/crossBriefServe';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { _resetLadderStateForTest(); _resetCreditAlertForTest(); await fn(); n++; console.log('ok -', name); };
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const a55ok = (text: string): RungResult => ({ modelUsed: 'claude-haiku-5-5', parsed: { text, stopReason: 'end_turn', refusalCategory: null, hadThinking: false, usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 } } });
const oaOk = (text: string, extra: Partial<OaParsed> = {}): OaParsed => ({ text, stop: 'end', usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 }, reasoningTokens: 0, ...extra });
const legacy = (calls: string[]) => async () => { calls.push('legacy'); return { text: 'LEGACY', model: 'claude-haiku-4.5', priceModel: 'haiku-4.5' as const, usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 } }; };

function mk(o: {
    allow?: Record<string, any>; a?: () => RungResult; oa?: () => OaParsed; b?: () => RungResult; oaKey?: string | undefined;
}) {
    const store = memoryStore();
    const calls: string[] = [];
    const alerts: string[] = [];
    const oaBodies: any[] = [];
    const deps: Partial<LadderDeps> = {
        store, now: () => NOW,
        anthropicKey: () => 'sk-a',
        hasAws: () => true,
        allowlist: () => o.allow ?? { CrossSector: { openai: { model: 'gpt-6.1-terra', timeoutMs: 30_000 } } },
        log: () => undefined,
        callAnthropic: async () => { calls.push('a55'); return (o.a ?? (() => { throw new LadderRungError('rate', 60, '429'); }))(); },
        callBedrock55: async (v) => { calls.push(`b55:${v}`); return (o.b ?? (() => { throw new LadderRungError('access', 21600, 'denied'); }))(); },
        openaiKey: () => ('oaKey' in o ? o.oaKey : 'sk-oa'),
        callOpenAI: async (c) => { calls.push('oa'); oaBodies.push(c); return (o.oa ?? (() => oaOk('OA')))(); },
        alert: async (subject) => { alerts.push(subject); return true; },
    };
    return { store, calls, alerts, oaBodies, deps };
}
const req = (over: Record<string, unknown> = {}) => ({ purpose: 'CrossSector', system: 'SYS', userPrompt: 'USER', maxTokens: 1000, timeoutMs: 120_000, ...over }) as any;

(async () => {
    // ───────────── 순수 함수 ─────────────
    await t('단가: terra 입력 $1·캐시 $0.05·출력 $5 · luna $0.10/$0.50 · 모르는 모델 0', () => {
        assert.ok(Math.abs(oaCost({ input: 1e6, output: 1e6, cacheRead: 1e6 }, 'gpt-6.1-terra') - 6.05) < 1e-9);
        assert.ok(Math.abs(oaCost({ input: 1e6, output: 1e6 }, 'gpt-6-luna') - 0.6) < 1e-9);
        assert.equal(oaCost({ input: 1e6 }, 'gpt-x'), 0);
        assert.equal(oaCost(null, 'gpt-6-luna'), 0);
    });
    await t('요청 모양: Responses API · instructions/input · temperature 없음 · store:false · JSON 은 같은 형식 지시 · 기본 effort none', () => {
        const b = shapeOaBody({ model: 'gpt-6-luna', system: 'S', userPrompt: 'U', maxTokens: 1000, json: true, timeoutMs: 1 });
        assert.equal(b.model, 'gpt-6-luna'); assert.equal(b.input, 'U'); assert.equal(b.instructions, 'S' + JSON_ONLY_INSTRUCTION);
        assert.equal((b as any).reasoning.effort, 'none'); assert.equal(b.store, false); assert.ok(!('temperature' in b));
        assert.ok((b.max_output_tokens as number) >= 1000);
    });
    await t('응답 파싱: output_text 합치기 · 캐시 토큰은 cacheRead · incomplete=max_tokens · 거절', () => {
        const p = parseOaResponse({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] }], usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 10 } } });
        assert.equal(p.text, '{"a":1}'); assert.equal(p.stop, 'end'); assert.deepEqual(p.usage, { input: 600, cacheRead: 400, cacheWrite: 0, output: 50 }); assert.equal(p.reasoningTokens, 10);
        assert.equal(parseOaResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).stop, 'max_tokens');
        assert.equal(parseOaResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }).stop, 'refusal');
    });
    await t('오류 분류: 429 insufficient_quota = credit 6시간 · 429 일반 = rate · 401 auth 6시간 · 404 access · 500 server', () => {
        const q = classifyOaFailure(429, '{"error":{"message":"You exceeded your current quota","type":"insufficient_quota","code":"insufficient_quota"}}');
        assert.equal(q.kind, 'credit'); assert.equal(q.closeSec, 6 * 3600);
        assert.equal(classifyOaFailure(429, '{"error":{"code":"rate_limit_exceeded"}}', '7').kind, 'rate');
        assert.equal(classifyOaFailure(401, 'bad key').closeSec, 6 * 3600);
        assert.equal(classifyOaFailure(404, 'model_not_found').kind, 'access');
        assert.equal(classifyOaFailure(503, 'x').kind, 'server');
    });

    // ───────────── 사다리 순서 ─────────────
    await t('순서: ① 실패 → OpenAI 성공(Bedrock·현행 안 부름) · provider oa · 원장은 OpenAI 쪽에만', async () => {
        const m = mk({});
        const out = await runLadder(req(), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55', 'oa']);
        assert.equal(out.provider, 'oa'); assert.equal(out.model, 'gpt-6.1-terra'); assert.equal(out.text, 'OA');
        assert.deepEqual(out.trail, ['a55:rate', 'oa:ok']);
        const oaSpent = Number(await m.store.get(OA_KEYS.cost(oaMonthId(NOW))));
        assert.ok(Math.abs(oaSpent - oaCost({ input: 1000, output: 500 }, 'gpt-6.1-terra')) < 1e-12);
    });
    await t('순서: ① 성공이면 OpenAI 를 부르지 않는다', async () => {
        const m = mk({ a: () => a55ok('A') });
        const out = await runLadder(req(), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55']); assert.equal(out.provider, 'a55');
    });
    await t('순서: OpenAI 도 실패하면 Bedrock 5.5 → 현행(예전 순서 그대로)', async () => {
        const m = mk({ oa: () => { throw new OaCallError('server', 120, '500'); } });
        const out = await runLadder(req(), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55', 'oa', 'b55:invoke', 'b55:mantle', 'legacy']);
        assert.equal(out.provider, 'legacy');
    });
    await t('순서: primary 면 OpenAI 먼저 · 실패하면 ① 부터', async () => {
        const allow = { UC: { openai: { model: 'gpt-6-luna', timeoutMs: 10_000, primary: true } } };
        const m1 = mk({ allow, a: () => a55ok('A') });
        const o1 = await runLadder(req({ purpose: 'UC' }), legacy(m1.calls), m1.deps);
        assert.deepEqual(m1.calls, ['oa']); assert.equal(o1.provider, 'oa');
        const m2 = mk({ allow, a: () => a55ok('A'), oa: () => oaOk('', { stop: 'max_tokens' }) });
        const o2 = await runLadder(req({ purpose: 'UC' }), legacy(m2.calls), m2.deps);
        assert.deepEqual(m2.calls, ['oa', 'a55']); assert.equal(o2.provider, 'a55'); assert.deepEqual(o2.trail, ['oa:truncated', 'a55:ok']);
    });
    await t('순서: primaryWhen — 그 문자열이 있는 요청만 OpenAI 먼저, 나머지는 ① 다음(2026-11-10 Tactical)', async () => {
        const allow = { Guardian: { openai: { model: 'gpt-6.1-terra', timeoutMs: 16_000, primary: true, primaryWhen: 'Write a SIGNUM Tactical Insight' } } };
        const m1 = mk({ allow, a: () => a55ok('A') });
        const o1 = await runLadder(req({ purpose: 'Guardian', userPrompt: 'blocks… Write a SIGNUM Tactical Insight entirely in 한국어 …' }), legacy(m1.calls), m1.deps);
        assert.deepEqual(m1.calls, ['oa']); assert.equal(o1.provider, 'oa');
        const m2 = mk({ allow, a: () => a55ok('A') });
        const o2 = await runLadder(req({ purpose: 'Guardian', userPrompt: 'Write the SIGNUM sector-rotation read …' }), legacy(m2.calls), m2.deps);
        assert.deepEqual(m2.calls, ['a55']); assert.equal(o2.provider, 'a55');
    });
    await t('Tactical: OpenAI 정책 거절(400 flagged)이면 서킷을 닫지 않고 곧바로 Haiku 5.5 · 다음 요청도 OpenAI 먼저', async () => {
        const logs: string[] = [];
        const m1 = mk({ allow: LADDER_PURPOSES, a: () => a55ok('{"ko":"A"}'), oa: () => { throw new OaCallError('bad-request', 0, "400 Invalid prompt: we've limited access to this content for safety reasons. This type of information may be used to benefit or to harm people… flagged as potentially violating our usage policy"); } });
        m1.deps.log = (_l: any, msg: string) => { logs.push(msg); };
        const tac = req({ purpose: 'Guardian', userPrompt: 'Write a SIGNUM Tactical Insight entirely in English.', expectJson: true, timeoutMs: 32_000 });
        const o1 = await runLadder(tac, legacy(m1.calls), m1.deps);
        assert.deepEqual(m1.calls, ['oa', 'a55']); assert.equal(o1.provider, 'a55'); assert.deepEqual(o1.trail, ['oa:bad-request', 'a55:ok']);
        assert.equal(m1.oaBodies[0].model, 'gpt-6.1-terra');
        assert.ok(logs.some((x) => x.includes('정책 거절')), logs.join('|'));
        const m2 = mk({ allow: LADDER_PURPOSES, a: () => a55ok('{"ko":"A"}'), oa: () => oaOk('{"ko":"O"}') });
        m2.deps.store = m1.deps.store;
        const o2 = await runLadder(tac, legacy(m2.calls), m2.deps);
        assert.deepEqual(m2.calls, ['oa']); assert.equal(o2.provider, 'oa');
    });
    await t('관문 11100248 ② Guardian 순환매·감마는 대체 단 모델·상한이 예전 그대로(luna·12s) · Tactical 만 terra·13s', async () => {
        const m1 = mk({ allow: LADDER_PURPOSES, a: () => { throw new LadderRungError('server', 60, '500'); }, oa: () => oaOk('{"ko":"O"}') });
        await runLadder(req({ purpose: 'Guardian', userPrompt: 'Write the SIGNUM sector-rotation read …', timeoutMs: 32_000 }), legacy(m1.calls), m1.deps);
        assert.deepEqual(m1.calls, ['a55', 'oa']);
        assert.equal(m1.oaBodies[0].model, 'gpt-6-luna'); assert.equal(m1.oaBodies[0].timeoutMs, 12_000);
        const m2 = mk({ allow: LADDER_PURPOSES, a: () => a55ok('{"ko":"A"}'), oa: () => oaOk('{"ko":"O"}') });
        await runLadder(req({ purpose: 'Guardian', userPrompt: 'Write a SIGNUM Tactical Insight entirely in English.', expectJson: true, timeoutMs: 32_000 }), legacy(m2.calls), m2.deps);
        assert.equal(m2.oaBodies[0].model, 'gpt-6.1-terra'); assert.equal(m2.oaBodies[0].timeoutMs, 13_000);
    });
    await t('설정 없는 용도는 예전과 같다(OpenAI 안 부름)', async () => {
        const m = mk({ allow: { FlowAI: {} } });
        await runLadder(req({ purpose: 'FlowAI' }), legacy(m.calls), m.deps);
        assert.ok(!m.calls.includes('oa'));
    });
    await t('키 없음 → OpenAI 건너뜀(skip) · 예전 순서', async () => {
        const m = mk({ oaKey: undefined });
        const out = await runLadder(req(), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55', 'b55:invoke', 'b55:mantle', 'legacy']);
        assert.ok(out.trail.includes('oa:nokey'));
    });
    await t('① 거절·시간 초과로 Bedrock 5.5 를 건너뛰어도 OpenAI(다른 모델)는 시도한다', async () => {
        const m = mk({ a: () => { throw new LadderRungError('timeout', 0, 't'); } });
        const out = await runLadder(req(), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55', 'oa']); assert.equal(out.provider, 'oa');
    });

    // ───────────── 증가분(freshTier) ─────────────
    await t('증가분: ① 실패 → OpenAI 시도 · 그래도 실패면 AWS 로 가지 않고 건너뜀', async () => {
        const allow = { WatchlistLine: { openai: { model: 'gpt-6-luna', timeoutMs: 10_000 } } };
        const m1 = mk({ allow });
        const o1 = await withFreshTier(() => runLadder(req({ purpose: 'WatchlistLine' }), legacy(m1.calls), m1.deps));
        assert.deepEqual(m1.calls, ['a55', 'oa']); assert.equal(o1.provider, 'oa');
        _resetLadderStateForTest();   // m1 의 ① 429 가 인스턴스 서킷을 열었다
        const m2 = mk({ allow, oa: () => { throw new OaCallError('server', 120, '500'); } });
        await assert.rejects(() => withFreshTier(() => runLadder(req({ purpose: 'WatchlistLine' }), legacy(m2.calls), m2.deps)), /fresh-tier skipped/);
        assert.deepEqual(m2.calls, ['a55', 'oa']);
    });

    // ───────────── 가드·JSON ─────────────
    await t('같은 출구 가드: OpenAI 글이 가드를 못 넘으면 다음 단(Bedrock)으로', async () => {
        const m = mk({ oa: () => oaOk('BAD'), b: () => a55ok('B55') });
        const out = await runLadder(req({ validate: (x: string) => (x === 'BAD' ? 'bad-number' : true) }), legacy(m.calls), m.deps);
        assert.deepEqual(m.calls, ['a55', 'oa', 'b55:invoke']); assert.equal(out.text, 'B55');
        assert.ok(out.trail.includes('oa:guard:bad-number'));
        assert.ok(Number(await m.store.get(OA_KEYS.cost(oaMonthId(NOW)))) > 0, '가드 실패도 과금된 것으로 센다');
    });
    await t('JSON: 군말·코드펜스를 걷어 내고 가드에 넘긴다 · JSON 불가는 다음 단', async () => {
        const m1 = mk({ oa: () => oaOk('```json\n{"ko":"가"}\n```') });
        const o1 = await runLadder(req({ jsonPrefill: true }), legacy(m1.calls), m1.deps);
        assert.equal(JSON.parse(o1.text).ko, '가');
        assert.equal(m1.oaBodies[0].json, true);
        const m2 = mk({ oa: () => oaOk('not json at all') });
        const o2 = await runLadder(req({ jsonPrefill: true }), legacy(m2.calls), m2.deps);
        assert.ok(o2.trail.includes('oa:json'));
    });
    await t('거절·잘림 = 다음 단', async () => {
        const m = mk({ oa: () => oaOk('', { stop: 'refusal' }) });
        const o = await runLadder(req(), legacy(m.calls), m.deps);
        assert.ok(o.trail.includes('oa:refusal:refusal'));
    });

    // ───────────── 크레딧·상한·스위치 ─────────────
    await t('insufficient_quota → 다음 단 · 서킷 6시간 · 경보 한 번(두 번째 호출은 서킷으로 OpenAI 를 부르지 않음)', async () => {
        const m = mk({ oa: () => { throw new OaCallError('credit', 6 * 3600, '429 insufficient_quota'); }, b: () => a55ok('B55') });
        const o = await runLadder(req(), legacy(m.calls), m.deps);
        assert.equal(o.text, 'B55'); assert.ok(o.trail.includes('oa:credit'));
        const until = Number(await m.store.get(LLM_KEYS.breaker('oa')));
        assert.equal(until, NOW + 6 * 3600 * 1000);
        await _flushCreditAlertsForTest();
        assert.equal(m.alerts.length, 1); assert.match(m.alerts[0], /OpenAI/);
        m.calls.length = 0;
        const o2 = await runLadder(req(), legacy(m.calls), m.deps);
        assert.ok(!m.calls.includes('oa')); assert.ok(o2.trail.includes('oa:breaker'));
        await _flushCreditAlertsForTest();
        assert.equal(m.alerts.length, 1);
    });
    await t(`월 연성 상한(기본 $${OA_DEFAULT_MONTHLY_CAP_USD}) 이상이면 OpenAI 를 부르지 않는다 · 경보 한 번`, async () => {
        const m = mk({ b: () => a55ok('B55') });
        await m.store.setEx(OA_KEYS.cost(oaMonthId(NOW)), String(OA_DEFAULT_MONTHLY_CAP_USD + 0.01), 3600);
        const o = await runLadder(req(), legacy(m.calls), m.deps);
        assert.ok(!m.calls.includes('oa')); assert.ok(o.trail.includes('oa:cap'));
        await _flushCreditAlertsForTest();
        assert.equal(m.alerts.length, 1);
    });
    await t('환경변수 OPENAI_MONTHLY_CAP_USD 가 상한을 바꾼다', async () => {
        process.env.OPENAI_MONTHLY_CAP_USD = '5';
        try {
            const m = mk({ b: () => a55ok('B55') });
            await m.store.setEx(OA_KEYS.cost(oaMonthId(NOW)), '5.5', 3600);
            const o = await runLadder(req(), legacy(m.calls), m.deps);
            assert.ok(o.trail.includes('oa:cap'));
        } finally { delete process.env.OPENAI_MONTHLY_CAP_USD; }
    });
    await t('끄기 스위치 llm:oa:off — "*"·"1"·용도 배열', async () => {
        for (const v of ['*', '1', '["CrossSector"]']) {
            _resetLadderStateForTest();
            const m = mk({ b: () => a55ok('B55') });
            await m.store.setEx(OA_KEYS.off, v, 3600);
            const o = await runLadder(req(), legacy(m.calls), m.deps);
            assert.ok(!m.calls.includes('oa'), v); assert.ok(o.trail.includes('oa:oa-off'), v);
        }
        _resetLadderStateForTest();
        const m = mk({});
        await m.store.setEx(OA_KEYS.off, '["UC"]', 3600);
        const o = await runLadder(req(), legacy(m.calls), m.deps);
        assert.equal(o.provider, 'oa');
    });
    await t('사다리 상태: OpenAI 용도·원장·상한·키 유무(값 없음)', async () => {
        const m = mk({});
        await runLadder(req(), legacy(m.calls), m.deps);
        const s = await ladderStatus(m.deps);
        assert.equal(s.openai.purposes.CrossSector, 'gpt-6.1-terra'); assert.ok(s.openai.spentUsd > 0);
        assert.equal(s.openai.capUsd, OA_DEFAULT_MONTHLY_CAP_USD); assert.equal(s.openai.keyConfigured, true);
        assert.ok(!JSON.stringify(s).includes('sk-oa'));
    });

    await t('시간 예산: ① 이 예산을 거의 다 쓰면 OpenAI 를 부르지 않는다(3초 미만) · 부를 때는 남은 시간만큼만', async () => {
        let clock = NOW;
        const m = mk({ a: () => { clock += 13_000; throw new LadderRungError('timeout', 0, 't'); }, b: () => a55ok('B') });
        m.deps.now = () => clock;
        const o = await withFreshTier(() => runLadder(req({ purpose: 'CrossSector', timeoutMs: 15_000 }), legacy(m.calls), m.deps)).catch((e) => e);
        assert.ok(!m.calls.includes('oa'));
        assert.match(String(o?.message ?? o?.trail), /oa:notime/);
        _resetLadderStateForTest();
        let clock2 = NOW;
        const m2 = mk({ a: () => { clock2 += 9_000; throw new LadderRungError('server', 0, 's'); } });
        m2.deps.now = () => clock2;
        await runLadder(req({ timeoutMs: 15_000 }), legacy(m2.calls), m2.deps);
        assert.equal(m2.oaBodies[0].timeoutMs, 6_000);
    });

    // ───────────── 운영 설정(2026-11-07 품질 측정으로 켠 것만) ─────────────
    await t('운영 설정: 측정을 통과한 용도만 OpenAI — UC·Tactical(primaryWhen)만 primary · 모델은 단가표에 있다 · sol 은 effort none 금지', () => {
        const on = Object.fromEntries(Object.entries(LADDER_PURPOSES).filter(([, c]) => c.openai).map(([k, c]) => [k, `${c.openai!.model}${c.openai!.primary ? '!' : ''}`]));
        assert.deepEqual(on, {
            UC: 'gpt-6-luna!', MorningBriefing: 'gpt-5.4-mini', Guardian: 'gpt-6-luna!', CrossSector: 'gpt-6.1-sol',
            WatchlistLine: 'gpt-6.1-terra', TodayPicks: 'gpt-6.1-terra',
        });
        for (const [k, c] of Object.entries(LADDER_PURPOSES)) {
            if (!c.openai) continue;
            assert.ok(OA_PRICES[c.openai.model], k);
            if (c.openai.primaryModel) assert.ok(OA_PRICES[c.openai.primaryModel], `${k} primaryModel`);
            if (/sol/.test(c.openai.model)) assert.notEqual(c.openai.effort ?? 'none', 'none', `${k}: sol 은 none 을 받지 않는다(400)`);
        }
        assert.ok((V4_SERVE_PROVIDERS as readonly string[]).includes('oa'), '장마감 리포트: OpenAI 결과도 서빙');
    });
    await t('운영 설정: UC 는 OpenAI 먼저, 실패하면 Haiku 5.5 · 장마감 리포트는 Haiku 다음 OpenAI', async () => {
        const m1 = mk({ allow: LADDER_PURPOSES, a: () => a55ok('{"a":1}'), oa: () => oaOk('{"o":1}') });
        const o1 = await runLadder(req({ purpose: 'UC', jsonPrefill: true }), legacy(m1.calls), m1.deps);
        assert.equal(o1.provider, 'oa'); assert.equal(m1.oaBodies[0].model, 'gpt-6-luna');
        _resetLadderStateForTest();
        const m2 = mk({ allow: LADDER_PURPOSES, a: () => { throw new LadderRungError('credit', 3600, 'cap'); } });
        const o2 = await runLadder(req({ purpose: 'CrossSector' }), legacy(m2.calls), m2.deps);
        assert.deepEqual(m2.calls, ['a55', 'oa']); assert.equal(o2.model, 'gpt-6.1-sol'); assert.equal(m2.oaBodies[0].effort, 'low');
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
