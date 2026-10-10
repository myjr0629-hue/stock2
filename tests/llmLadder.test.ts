/**
 * 제공자 사다리 — ①Anthropic 크레딧(Haiku 5.5) → ②Bedrock 5.5 → ③현행 Bedrock Haiku 4.5
 * (src/lib/ai/llmLadder.ts · llmRequest.ts · llmPricing.ts · awsSigV4.ts · bedrockClient.callBedrock)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/llmLadder.test.ts
 *
 * 고정하는 것: 전환 조건(키 없음·월 상한·401/403·429·5xx·시간 초과·refusal·잘림·JSON 불가·가드 실패) · 프리필 제거 · temperature 제거 ·
 *   월 원장 · 허용 목록(비면 예전 그대로) · 킬 스위치 · 저장소 장애 무영향 · SigV4 서명(@smithy/signature-v4 와 대조).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { costOf, periodId, nextRenewal, overCap, LEDGER_CAP_USD } from '@/lib/ai/llmPricing';
import {
    shapeH55Body, h55MaxTokens, normalizeJsonText, parseMessageResponse, classifyHttpFailure, JSON_ONLY_INSTRUCTION,
} from '@/lib/ai/llmRequest';
import { signV4 } from '@/lib/ai/awsSigV4';
import { memoryStore, type LlmStore } from '@/lib/ai/llmStore';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { summarizeCalls } from '@/lib/ai/llmStats';
import { evaluateOutput, waivedBySource, newsDigestGate, jsonKeysGate, triLangGate, textGate, collectLocaleStrings } from '@/lib/ai/ladderGates';
import { tickerNewsGate } from '@/lib/ai/tickerNewsGuard';
import {
    runLadder, LADDER_PURPOSES, TRACKED_PURPOSES, LLM_KEYS, LadderRungError, hourId, interpretGate, ladderStatus, purposeOfLabel,
    _resetLadderStateForTest, type LadderDeps, type RungResult, type LegacyResult, type CallRecord,
} from '@/lib/ai/llmLadder';

const root = path.join(__dirname, '..');
let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { _resetLadderStateForTest(); await fn(); n++; console.log('ok -', name); };

const ok = (text: string, extra: Partial<RungResult['parsed']> = {}): RungResult => ({
    modelUsed: 'claude-haiku-5-5',
    parsed: { text, stopReason: 'end_turn', refusalCategory: null, hadThinking: false, usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 }, ...extra },
});
const legacyOk = (text = 'LEGACY'): (() => Promise<LegacyResult>) => async () => ({
    text, model: 'claude-haiku-4.5', priceModel: 'haiku-4.5', usage: { input: 1000, output: 500, cacheWrite: 0, cacheRead: 0 },
});
const req = (over: Record<string, unknown> = {}) => ({ purpose: 'FlowAI', system: 'SYS', userPrompt: 'USER', maxTokens: 1000, ...over }) as any;

interface Spy { a: number; b: number; bodies: any[]; keys: string[]; store: ReturnType<typeof memoryStore>; deps: Partial<LadderDeps> }
function mk(opts: {
    allow?: Record<string, any>; key?: string | undefined; aws?: boolean;
    a?: (n: number, c: any) => RungResult | Promise<RungResult>;
    b?: (n: number, v: string) => RungResult | Promise<RungResult>;
    store?: LlmStore & { data?: Map<string, any> };
    now?: () => number;
} = {}): Spy {
    const store = (opts.store as any) || memoryStore();
    const spy: Spy = { a: 0, b: 0, bodies: [], keys: [], store, deps: {} };
    spy.deps = {
        store,
        now: opts.now ?? (() => Date.UTC(2026, 9, 10, 12, 0, 0)),
        anthropicKey: () => ('key' in opts ? opts.key : 'sk-test'),
        hasAws: () => opts.aws !== false,
        allowlist: () => opts.allow ?? { FlowAI: {} },
        log: () => undefined,
        callAnthropic: async (c, key) => { spy.a++; spy.bodies.push(c.body); spy.keys.push(key); return (opts.a ?? (() => ok('A55')))(spy.a, c); },
        callBedrock55: async (v, c) => { spy.b++; spy.bodies.push(c.body); return (opts.b ?? (() => { throw new LadderRungError('access', 21600, 'denied'); }))(spy.b, v); },
    };
    return spy;
}
const records = (s: Spy): CallRecord[] => {
    const out: CallRecord[] = [];
    for (const [k, v] of s.store.data) if (k.startsWith('llm:calls:')) for (const x of v) out.push(JSON.parse(x));
    return out;
};

(async () => {
    // ───────────── 순수 함수 ─────────────
    await t('단가: Haiku 5.5 입력 $0.10·출력 $0.50 / 백만 (프롬프트 100K 이하) · Haiku 4.5 는 $1/$5', () => {
        assert.ok(Math.abs(costOf({ input: 100_000, output: 1e6 }, 'haiku-5.5') - (0.01 + 0.5)) < 1e-9);
        assert.ok(Math.abs(costOf({ input: 1000, output: 500 }, 'haiku-5.5') - 0.00035) < 1e-12);
        assert.ok(Math.abs(costOf({ input: 1e6, output: 1e6 }, 'haiku-4.5') - 6) < 1e-9);
        assert.ok(Math.abs(costOf({ cacheRead: 50_000, cacheWrite: 50_000 }, 'haiku-5.5') - (50_000 * 0.125 + 50_000 * 0.01) / 1e6) < 1e-12);
        assert.equal(costOf(null, 'haiku-5.5'), 0);
    });
    await t('단가: 프롬프트 100K 초과는 긴 프롬프트 단가(입력 $0.50·출력 $2.50) — 캐시 읽기도 프롬프트 길이에 센다', () => {
        assert.ok(Math.abs(costOf({ input: 100_001, output: 1e6 }, 'haiku-5.5') - (100_001 * 0.5 / 1e6 + 2.5)) < 1e-9);
        assert.ok(Math.abs(costOf({ input: 50_000, cacheRead: 60_000 }, 'haiku-5.5') - (50_000 * 0.5 + 60_000 * 0.05) / 1e6) < 1e-9);
    });
    await t('원장 주기: 매월 6일(UTC)에 새 주기 — 10/10→2026-10 · 11/5→2026-10 · 11/6→2026-11 · 1/3→전년 12', () => {
        assert.equal(periodId(new Date(Date.UTC(2026, 9, 10))), '2026-10');
        assert.equal(periodId(new Date(Date.UTC(2026, 10, 5, 23, 59))), '2026-10');
        assert.equal(periodId(new Date(Date.UTC(2026, 10, 6, 0, 0))), '2026-11');
        assert.equal(periodId(new Date(Date.UTC(2027, 0, 3))), '2026-12');
        assert.equal(nextRenewal(new Date(Date.UTC(2026, 9, 10))).toISOString(), '2026-11-06T00:00:00.000Z');
        assert.equal(nextRenewal(new Date(Date.UTC(2026, 10, 2))).toISOString(), '2026-11-06T00:00:00.000Z');
    });
    await t('월 상한: $199 이상이면 넘김 · 미만이면 통과 (2026-10-10 대표 «남는 것 없이» 로 190 → 199)', () => {
        assert.equal(LEDGER_CAP_USD, 199);
        assert.equal(overCap(198.99), false); assert.equal(overCap(199), true); assert.equal(overCap(NaN), false);
    });
    await t('요청: temperature·top_p·top_k 키가 «없다» (Haiku 5.5 는 400) · 마지막 turn 은 user(프리필 없음)', () => {
        const b: any = shapeH55Body('claude-haiku-5-5', { system: 'S', userPrompt: 'U', maxTokens: 4000, jsonPrefill: true });
        for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in b), k);
        assert.equal(b.messages.length, 1); assert.equal(b.messages[b.messages.length - 1].role, 'user');
        assert.deepEqual(b.output_config, { effort: 'low' });
        assert.ok(!('thinking' in b), '기본은 thinking 생략(적응형)');
    });
    await t('요청: 프리필 대신 지시로 JSON 요구 — jsonPrefill 이면 system 뒤에 형식 지시가 붙고, 아니면 그대로', () => {
        const j: any = shapeH55Body('m', { system: 'S', userPrompt: 'U', maxTokens: 100, jsonPrefill: true });
        assert.equal(j.system, 'S' + JSON_ONLY_INSTRUCTION); assert.ok(/first character of your reply must be "\{"/.test(j.system));
        const p: any = shapeH55Body('m', { system: 'S', userPrompt: 'U', maxTokens: 100 });
        assert.equal(p.system, 'S');
    });
    await t('요청: max_tokens 는 +30% +1024 (토큰화 증가·사고분), 상한 32,000 · thinking disabled 옵션 · effort 지정', () => {
        assert.equal(h55MaxTokens(4096), Math.ceil(4096 * 1.3) + 1024);
        assert.equal(h55MaxTokens(100000), 32000);
        assert.equal(h55MaxTokens(NaN), Math.ceil(4096 * 1.3) + 1024);
        const b: any = shapeH55Body('m', { system: 'S', userPrompt: 'U', maxTokens: 100, thinking: 'disabled', effort: 'medium' });
        assert.deepEqual(b.thinking, { type: 'disabled' }); assert.equal(b.output_config.effort, 'medium');
    });
    await t('응답: thinking 블록이 앞서도 text 블록만 이어 붙인다 · 펜스 제거 · usage 매핑 · refusal 사유', () => {
        const p = parseMessageResponse({
            content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: '```json\n{"a":1}\n```' }],
            stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 },
        });
        assert.equal(p.text, '{"a":1}'); assert.equal(p.hadThinking, true);
        assert.deepEqual(p.usage, { input: 10, output: 5, cacheWrite: 2, cacheRead: 3 });
        const r = parseMessageResponse({ content: [], stop_reason: 'refusal', stop_details: { category: 'general_harms' }, usage: { input_tokens: 4, output_tokens: 0 } });
        assert.equal(r.stopReason, 'refusal'); assert.equal(r.refusalCategory, 'general_harms'); assert.equal(r.text, '');
    });
    await t('JSON 정리: 앞 군말은 걷고 · 뒤 군말은 자르고 · JSON 아니면 실패', () => {
        assert.deepEqual(normalizeJsonText('{"a":1}'), { ok: true, text: '{"a":1}' });
        assert.deepEqual(normalizeJsonText('Here you go: {"a":1}'), { ok: true, text: '{"a":1}' });
        assert.deepEqual(normalizeJsonText('{"a":1} hope that helps'), { ok: true, text: '{"a":1}' });
        assert.equal(normalizeJsonText('sorry, I cannot').ok, false);
        assert.equal(normalizeJsonText('{"a":').ok, false);
    });
    await t('HTTP 분류: 401/403/404=접근(30분) · 크레딧 소진 문구=1시간 · 429=retry-after · 5xx=120초 · 그 외 400=닫지 않음', () => {
        assert.equal(classifyHttpFailure(401, 'x').kind, 'auth'); assert.equal(classifyHttpFailure(401, 'x').closeSec, 1800);
        assert.equal(classifyHttpFailure(403, 'x').kind, 'access');
        assert.equal(classifyHttpFailure(404, 'x').kind, 'access');
        const c = classifyHttpFailure(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API"}}');
        assert.equal(c.kind, 'credit'); assert.equal(c.closeSec, 3600);
        assert.equal(classifyHttpFailure(429, '{"error_code":"enforced_spend_limit_reached"}').kind, 'credit');
        const r = classifyHttpFailure(429, 'rate', '17'); assert.equal(r.kind, 'rate'); assert.equal(r.closeSec, 17);
        assert.equal(classifyHttpFailure(429, 'rate').closeSec, 60);
        assert.equal(classifyHttpFailure(529, 'overloaded').kind, 'server'); assert.equal(classifyHttpFailure(503, '').closeSec, 120);
        const bad = classifyHttpFailure(400, 'temperature: only 1 allowed'); assert.equal(bad.kind, 'bad-request'); assert.equal(bad.closeSec, 0);
    });
    await t('SigV4: 우리 서명이 @smithy/signature-v4 의 서명과 같다 (Bedrock Mantle 호출용)', async () => {
        const { SignatureV4 } = require('@smithy/signature-v4');
        const { Sha256 } = require('@aws-crypto/sha256-js');
        const { HttpRequest } = require('@smithy/protocol-http');
        const now = new Date(Date.UTC(2026, 9, 10, 12, 34, 56));
        const body = JSON.stringify({ model: 'anthropic.claude-haiku-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
        const host = 'bedrock-mantle.us-east-1.api.aws';
        const mine = signV4({ method: 'POST', host, path: '/anthropic/v1/messages', body, region: 'us-east-1', service: 'bedrock-mantle',
            accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', now,
            headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' } });
        const signer = new SignatureV4({ credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }, region: 'us-east-1', service: 'bedrock-mantle', sha256: Sha256 });
        const signed = await signer.sign(new HttpRequest({ method: 'POST', protocol: 'https:', hostname: host, path: '/anthropic/v1/messages', headers: { host, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, body }), { signingDate: now });
        const theirs = Object.fromEntries(Object.entries(signed.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
        assert.equal(mine.authorization.split('Signature=')[1], theirs.authorization.split('Signature=')[1]);
        assert.equal(mine['x-amz-date'], theirs['x-amz-date']);
    });

    // ───────────── 사다리 ─────────────
    await t('허용 목록이 비면 예전 그대로 — ①② 를 한 번도 부르지 않고 legacy 만 실행한다', async () => {
        const s = mk({ allow: {} });
        const o = await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(o.text, 'OLD'); assert.equal(o.provider, 'legacy'); assert.equal(s.a, 0); assert.equal(s.b, 0);
        assert.equal(records(s)[0].v, 'legacy'); assert.equal(records(s)[0].p, 'FlowAI');
    });
    await t('실제 허용 목록 상수: 마케팅·관리자 label 은 추적 대상에도 없다 · 종목 뉴스(TickerNews, 현행 Nova Lite)는 10/10 대표 결정으로 올라 있다', () => {
        for (const bad of ['MarketingContent', 'RedditComment', 'ContentGen', 'XRay', 'DailyContent', 'RenderVideo', 'Bedrock']) assert.ok(!TRACKED_PURPOSES.includes(bad), bad);
        assert.ok(TRACKED_PURPOSES.includes('TickerNews'));
        // 10/10 오전 품질 비교(UC·번역 보정·뉴스 다이제스트) + 대표 결정(종목 뉴스) + 10/10 저녁 금요일 실데이터 표본 비교(나머지 8개 중 통과한 용도) —
        // 통과율 미달·표본 부족 용도는 예전 그대로(목록에 없다). 근거: HAIKU55-AB-2026-10-10.md 13절
        assert.deepEqual(Object.keys(LADDER_PURPOSES).sort(), ['CrossSector', 'DeepAnalysis', 'EarningsBrief', 'FlowAI', 'Guardian', 'GuardianTranslate', 'IntelSnapshot', 'MorningBriefing', 'NewsDigest', 'SectorHeadlines', 'TickerNews', 'UC', 'UCTranslate']);
        assert.equal(LADDER_PURPOSES.TickerNews.thinking, 'disabled');
        assert.ok(LADDER_PURPOSES.TickerNews.timeoutMs! <= 15_000, '종목 뉴스: ① 시간(14초) + Nova 가 라우트 한도(45초) 안');
        for (const off of ['WIM', 'Disclosures', 'IntelAnalysis']) assert.ok(!(off in LADDER_PURPOSES), off);
        for (const [k, v] of Object.entries(LADDER_PURPOSES)) assert.ok((v.timeoutMs ?? 30000) <= 30000 && v.effort === 'low', k);
        assert.equal(LADDER_PURPOSES.UC.thinking, 'disabled'); assert.equal(LADDER_PURPOSES.NewsDigest.thinking, 'disabled'); assert.equal(LADDER_PURPOSES.UCTranslate.thinking, undefined);
        assert.ok(LADDER_PURPOSES.NewsDigest.timeoutMs! + 19_000 <= 45_000 + 1000, '뉴스 다이제스트: ① 시간 + 현행 나머지가 라우트 한도 안');
        // 10/10 저녁 전환 용도: 전부 사고 끔(적응형·중간 사고는 같은 표본에서 통과율이 같거나 낮고 느렸다) · ① 시간은 «현행이 이어받을 시간»을 남긴다(라우트 한도 안)
        for (const k of ['SectorHeadlines', 'MorningBriefing', 'EarningsBrief', 'IntelSnapshot', 'Guardian', 'GuardianTranslate', 'FlowAI', 'CrossSector', 'DeepAnalysis']) assert.equal((LADDER_PURPOSES as any)[k].thinking, 'disabled', k);
        assert.equal(LADDER_PURPOSES.CrossSector.retries, 1, '크로스섹터만: 현행이 한도 안에 못 끝난다'); assert.equal(Object.values(LADDER_PURPOSES).filter((v) => v.retries).length, 1);
        assert.ok(LADDER_PURPOSES.IntelSnapshot.timeoutMs! <= 14_000, '스냅샷: 라우트 30초 중 ① 14초 + 현행 이어받기 16초');
        assert.ok(LADDER_PURPOSES.EarningsBrief.timeoutMs! + 15_000 <= 40_000, '실적 브리핑: 라우트 40초 중 ① + 현행 15초');
        assert.ok(LADDER_PURPOSES.Guardian.timeoutMs! <= 14_000, '가디언: 첫 호출 32초 중 ① 14초 + 현행 이어받기 18초');
        for (const k of Object.keys(LADDER_PURPOSES)) assert.ok(TRACKED_PURPOSES.includes(k), `허용 목록 ${k} 는 추적 용도여야 한다`);
    });
    await t('retries: ① 가 JSON 깨짐이면 같은 ① 을 한 번 더(크로스섹터) — 두 번째가 통과하면 ① 로 끝, 현행·② 는 부르지 않는다', async () => {
        const s = mk({ allow: { FlowAI: { retries: 1 } }, a: (n) => (n === 1 ? ok('{"a":1}}') : ok('{"a":1}')) });
        const o = await runLadder(req({ expectJson: true }), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'a55'); assert.equal(s.a, 2); assert.equal(s.b, 0);
        assert.deepEqual(o.trail, ['a55:json', 'a55:ok']);
        assert.ok(o.costUsd > 0 && records(s)[0].c > o.costUsd * 1.5, '실패한 첫 시도의 비용도 센다');
    });
    await t('retries: 두 번 다 깨지면 그때 현행으로 · 시간 초과·거절·429 는 다시 부르지 않는다 · retries 가 없으면 예전처럼 한 번', async () => {
        const s = mk({ allow: { FlowAI: { retries: 1 } }, a: () => ok('not json') });
        const o = await runLadder(req({ expectJson: true }), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.equal(s.a, 2);
        const s2 = mk({ allow: { FlowAI: { retries: 1 } }, a: () => { throw new LadderRungError('timeout', 0, 't'); } });
        const o2 = await runLadder(req({ expectJson: true }), legacyOk('OLD'), s2.deps);
        assert.equal(o2.provider, 'legacy'); assert.equal(s2.a, 1);
        const s3 = mk({ allow: { FlowAI: { retries: 1 } }, a: () => ok('x', { stopReason: 'refusal', refusalCategory: 'cyber' }) });
        await runLadder(req({ expectJson: true }), legacyOk('OLD'), s3.deps); assert.equal(s3.a, 1);
        const s4 = mk({ allow: { FlowAI: {} }, a: () => ok('not json') });
        await runLadder(req({ expectJson: true }), legacyOk('OLD'), s4.deps); assert.equal(s4.a, 1);
    });
    await t('retries: 다시 부를 시간이 라우트 남은 시간에 안 들어오면 곧바로 현행으로', async () => {
        let clock = Date.UTC(2026, 9, 10, 12, 0, 0);
        const s = mk({ allow: { FlowAI: { retries: 1 } }, now: () => clock, a: () => { clock += 30_000; return ok('not json'); } });
        const o = await runLadder(req({ expectJson: true, timeoutMs: 55_000 }), legacyOk('OLD'), s.deps);
        assert.equal(s.a, 1, '30초 걸린 시도 + 1.2배(36초) > 라우트 55초 → 재시도 없음'); assert.equal(o.provider, 'legacy');
    });
    await t('추적 밖 용도(마케팅 등)는 사다리·기록 없이 곧장 legacy', async () => {
        const s = mk({ allow: { Marketing: {} } });
        const o = await runLadder(req({ purpose: 'Marketing' }), legacyOk('M'), s.deps);
        assert.equal(o.text, 'M'); assert.equal(s.a, 0); assert.equal(records(s).length, 0);
    });
    await t('① 성공: Haiku 5.5 응답을 쓴다 · legacy 는 부르지 않는다 · 월 원장에 비용이 쌓인다 · 호출 기록', async () => {
        let legacyCalls = 0;
        const s = mk({});
        const o = await runLadder(req(), async () => { legacyCalls++; return legacyOk()(); }, s.deps);
        assert.equal(o.provider, 'a55'); assert.equal(o.text, 'A55'); assert.equal(o.model, 'claude-haiku-5.5'); assert.equal(legacyCalls, 0);
        const cost = (1000 * 0.1 + 500 * 0.5) / 1e6;
        assert.ok(Math.abs(Number(s.store.data.get(LLM_KEYS.cost('2026-10'))) - cost) < 1e-12);
        const r = records(s)[0]; assert.equal(r.v, 'a55'); assert.equal(r.ok, 1); assert.equal(r.i, 1000); assert.equal(r.o, 500); assert.ok(Math.abs(r.ca - cost) < 1e-12);
        assert.equal(s.keys[0], 'sk-test');
    });
    await t('① 요청 본문에 temperature·top_p·top_k 가 없고 마지막 turn 이 user 다', async () => {
        const s = mk({});
        await runLadder(req({ temperature: 0.9, jsonPrefill: true }), legacyOk(), mk({ a: () => ok('{"x":1}') }).deps);
        const s2 = mk({ a: () => ok('{"x":1}') });
        await runLadder(req({ temperature: 0.9, jsonPrefill: true }), legacyOk(), s2.deps);
        const b = s2.bodies[0];
        for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in b), k);
        assert.equal(b.messages[b.messages.length - 1].role, 'user'); assert.ok(b.system.endsWith(JSON_ONLY_INSTRUCTION));
        void s;
    });
    await t('429 → ② Bedrock 5.5 로(① 문은 retry-after 동안 닫힘)', async () => {
        const s = mk({ a: () => { throw new LadderRungError('rate', 17, '429'); }, b: () => ok('B55') });
        const o = await runLadder(req(), legacyOk(), s.deps);
        assert.equal(o.provider, 'b55'); assert.equal(o.text, 'B55'); assert.deepEqual(o.trail, ['a55:rate', 'b55i:ok']);
        const o2 = await runLadder(req(), legacyOk(), s.deps);   // 문이 닫혀 있으니 ① 은 다시 부르지 않는다
        assert.equal(s.a, 1); assert.equal(o2.provider, 'b55');
    });
    await t('401/403 → 30분 닫힘 · ②③ 으로 · 다음 호출은 ① 을 건너뛴다', async () => {
        const s = mk({ a: () => { throw new LadderRungError('auth', 1800, '401'); } });
        const o = await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.equal(o.text, 'OLD'); assert.equal(o.usedFallback, true);
        await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(s.a, 1, '문이 닫힌 ① 은 다시 두드리지 않는다');
        assert.ok(Number(s.store.data.get(LLM_KEYS.breaker('a55'))) > 0);
    });
    await t('② 모델 접근 없음(403/404) → 6시간 닫힘 → ③ (현재 이 계정의 상태)', async () => {
        const s = mk({ a: () => { throw new LadderRungError('server', 0, '503'); } });   // ① 실패, ② 기본 동작 = access 거부
        const o = await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.deepEqual(o.trail, ['a55:server', 'b55i:access', 'b55m:access', 'legacy:ok']);
        await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(s.b, 2, '닫힌 ② 는 다시 부르지 않는다(지연 0)');
    });
    await t('5xx·시간 초과·네트워크 → 다음 단', async () => {
        for (const kind of ['server', 'timeout', 'network'] as const) {
            const s = mk({ a: () => { throw new LadderRungError(kind, 0, kind); }, b: () => ok('B55') });
            const o = await runLadder(req(), legacyOk(), s.deps);
            assert.ok(o.provider === 'b55' || o.provider === 'legacy', kind);
        }
    });
    await t('refusal(HTTP 200) → 같은 5.5 분류기라 ② 도 건너뛰고 곧장 ③ · 거절된 요청의 비용도 원장에 센다', async () => {
        const s = mk({ a: () => ok('', { stopReason: 'refusal', refusalCategory: 'general_harms' }), b: () => ok('B55') });
        const o = await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.equal(s.b, 0); assert.equal(o.trail[0], 'a55:refusal:general_harms');
        assert.ok(Number(s.store.data.get(LLM_KEYS.cost('2026-10'))) > 0);
    });
    await t('잘림(max_tokens)·빈 응답 → 다음 단', async () => {
        const s = mk({ a: () => ok('partial…', { stopReason: 'max_tokens' }), b: () => ok('') });
        const o = await runLadder(req(), legacyOk('OLD'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.equal(o.trail[0], 'a55:truncated'); assert.equal(o.trail[1], 'b55i:empty');
    });
    await t('JSON 기대(jsonPrefill)인데 JSON 이 아니면 다음 단 · 앞 군말은 걷어 호환', async () => {
        const bad = mk({ a: () => ok('죄송합니다 요청을 처리할 수 없습니다') });
        assert.equal((await runLadder(req({ jsonPrefill: true }), legacyOk('OLD'), bad.deps)).provider, 'legacy');
        const pre = mk({ a: () => ok('Here: {"k":"v"}') });
        const o = await runLadder(req({ jsonPrefill: true }), legacyOk('OLD'), pre.deps);
        assert.equal(o.provider, 'a55'); assert.equal(o.text, '{"k":"v"}'); assert.ok(o.text.startsWith('{'));
    });
    await t('출구 품질 가드 실패 → 다음 단 · 통과하면 그대로 · 가드가 던져도 통과로 본다', async () => {
        const failing = mk({ a: () => ok('영어 거절문 I cannot help'), b: () => ok('여전히 실패') });
        const o = await runLadder(req({ validate: (x: string) => (/[가-힣]/.test(x) ? false : 'refusal') }), legacyOk('OLD'), failing.deps);
        assert.equal(o.provider, 'legacy'); assert.ok(o.trail[0].startsWith('a55:guard:'));
        const pass = mk({ a: () => ok('좋은 한국어 문장') });
        assert.equal((await runLadder(req({ validate: (x: string) => /[가-힣]/.test(x) }), legacyOk(), pass.deps)).provider, 'a55');
        const thrower = mk({ a: () => ok('text') });
        assert.equal((await runLadder(req({ validate: () => { throw new Error('boom'); } }), legacyOk(), thrower.deps)).provider, 'a55');
        assert.deepEqual([interpretGate(true).ok, interpretGate(false).ok, interpretGate('x').ok, interpretGate({ ok: false, reasons: ['a'] }).ok, interpretGate(undefined).ok], [true, false, false, false, true]);
    });
    await t('③ legacy 응답의 가드 결과는 «기록만» 한다(막지 않는다)', async () => {
        const s = mk({ allow: {} });
        const o = await runLadder(req({ validate: () => false }), legacyOk('OLD'), s.deps);
        assert.equal(o.text, 'OLD'); assert.equal(records(s)[0].g, 0);
    });
    await t('월 상한: 원장이 $199 이상이면 ① 을 건너뛰고(② 는 시도) · 미만이면 ① 사용', async () => {
        const s = mk({ b: () => ok('B55') });
        s.store.data.set(LLM_KEYS.cost('2026-10'), '199.5');
        const o = await runLadder(req(), legacyOk(), s.deps);
        assert.equal(s.a, 0); assert.equal(o.provider, 'b55'); assert.equal(o.trail[0], 'a55:cap');
        _resetLadderStateForTest();   // 인스턴스 안 30초 캐시를 비운다
        const s2 = mk({}); s2.store.data.set(LLM_KEYS.cost('2026-10'), '198.99');
        assert.equal((await runLadder(req(), legacyOk(), s2.deps)).provider, 'a55');
    });
    await t('월 상한: 갱신일(11/6) 이후에는 새 주기 키라 원장이 0 에서 다시 시작한다', async () => {
        const s = mk({ now: () => Date.UTC(2026, 10, 6, 1, 0, 0) });
        s.store.data.set(LLM_KEYS.cost('2026-10'), '199.5');
        assert.equal((await runLadder(req(), legacyOk(), s.deps)).provider, 'a55');
        assert.ok(s.store.data.has(LLM_KEYS.cost('2026-11')));
    });
    await t('키가 없으면 ① 을 건너뛴다(오류 없이)', async () => {
        const s = mk({ key: undefined, b: () => ok('B55') });
        const o = await runLadder(req(), legacyOk(), s.deps);
        assert.equal(s.a, 0); assert.equal(o.trail[0], 'a55:nokey');
    });
    await t('킬 스위치(llm:ladder:off): "*" 또는 용도 목록이면 즉시 예전 그대로', async () => {
        const s = mk({}); s.store.data.set(LLM_KEYS.off, '*');
        assert.equal((await runLadder(req(), legacyOk('OLD'), s.deps)).provider, 'legacy'); assert.equal(s.a, 0);
        _resetLadderStateForTest();
        const s2 = mk({}); s2.store.data.set(LLM_KEYS.off, JSON.stringify(['FlowAI']));
        assert.equal((await runLadder(req(), legacyOk('OLD'), s2.deps)).provider, 'legacy');
        _resetLadderStateForTest();
        const s3 = mk({}); s3.store.data.set(LLM_KEYS.off, JSON.stringify(['DeepAnalysis']));
        assert.equal((await runLadder(req(), legacyOk('OLD'), s3.deps)).provider, 'a55');
    });
    await t('legacy 가 던지면 그대로 던진다(호출 지점이 기대하던 실패 모양) · 실패도 기록', async () => {
        const s = mk({ allow: {} });
        await assert.rejects(runLadder(req(), async () => { throw new Error('All Bedrock attempts exhausted'); }, s.deps), /All Bedrock attempts exhausted/);
        assert.equal(records(s)[0].ok, 0);
    });
    await t('저장소가 죽어도(모든 연산 예외/무응답) AI 호출은 정상 — 원장을 못 읽으면 한도 미만으로 본다', async () => {
        const dead: LlmStore = {
            get: async () => null, setEx: async () => undefined, incrByFloat: async () => null,
            rpush: async () => undefined, lrange: async () => [], lpushTrim: async () => undefined, del: async () => undefined,
        };
        const s = mk({ store: dead as any });
        const o = await runLadder(req(), legacyOk(), s.deps);
        assert.equal(o.provider, 'a55');
    });
    await t('호출 기록 키는 시간 단위(UTC) · 기록은 용도·제공자·지연·비용·가드를 담는다', async () => {
        const s = mk({});
        await runLadder(req({ validate: () => true }), legacyOk(), s.deps);
        const key = LLM_KEYS.calls(hourId(Date.UTC(2026, 9, 10, 12)));
        assert.equal(key, 'llm:calls:2026101012');
        const r = JSON.parse(s.store.data.get(key)[0]);
        assert.equal(r.g, 1); assert.ok(r.ms >= 0 && r.c > 0 && r.p === 'FlowAI');
    });
    await t('운영 상태: 원장·잔여·주기·갱신일·허용 목록·킬 스위치·브레이커를 키 없이 돌려준다', async () => {
        const s = mk({ allow: { FlowAI: {}, UC: {} } });
        s.store.data.set(LLM_KEYS.cost('2026-10'), '12.5');
        const st = await ladderStatus(s.deps);
        assert.equal(st.period, '2026-10'); assert.equal(st.spentUsd, 12.5); assert.equal(st.remainingUsd, 186.5);
        assert.equal(st.renewsAt, '2026-11-06T00:00:00.000Z'); assert.deepEqual(st.allowlist, ['FlowAI', 'UC']); assert.equal(st.keyConfigured, true);
        assert.ok(!JSON.stringify(st).includes('sk-test'), '키 값은 응답에 없다');
    });


    await t('현행(③)은 ①② 가 쓴 시간을 알고 그만큼 줄인다 — 사다리를 안 쓰면 0(예전 시간 제한 그대로)', async () => {
        let seen = -1;
        await runLadder(req(), async (ctx) => { seen = ctx.elapsedMs; return { text: 'OLD', model: 'm' }; }, mk({ allow: {} }).deps);
        assert.equal(seen, 0);
        let clock = Date.UTC(2026, 9, 10, 12);
        const s = mk({ now: () => clock, a: () => { clock += 7000; throw new LadderRungError('timeout', 0, 'slow'); } });
        await runLadder(req(), async (ctx) => { seen = ctx.elapsedMs; return { text: 'OLD', model: 'm' }; }, s.deps);
        assert.ok(seen >= 7000, `elapsed ${seen}`);
        const src = fs.readFileSync(path.join(root, 'src/services/bedrockClient.ts'), 'utf8');
        assert.ok(/Math\.max\(8000, \(options\.timeoutMs \?\? 55000\) - ctx\.elapsedMs\)/.test(src));
    });

    // ───────────── 부가: 라벨 매핑·가드·집계·인증 ─────────────
    await t('label → 용도: 호출 지점의 제각각 label 을 한 곳에서 묶는다 · 모르는 label(마케팅 등)은 그대로(= 추적 밖)', () => {
        assert.equal(purposeOfLabel('FlowAI'), 'FlowAI'); assert.equal(purposeOfLabel('DeepAnalysis'), 'DeepAnalysis');
        assert.equal(purposeOfLabel('Guardian/TACTICAL_ko'), 'Guardian'); assert.equal(purposeOfLabel('Guardian/ROTATION_TRI/retry'), 'Guardian');
        assert.equal(purposeOfLabel('Translate/gamma/ko->ja'), 'GuardianTranslate');
        assert.equal(purposeOfLabel('NewsDigest-Batch5'), 'NewsDigest'); assert.equal(purposeOfLabel('SectorHeadlines'), 'SectorHeadlines');
        assert.equal(purposeOfLabel('CrossSectorBrief'), 'CrossSector'); assert.equal(purposeOfLabel('IntelAI'), 'IntelAnalysis');
        assert.equal(purposeOfLabel('Snapshot/News'), 'IntelSnapshot');
        for (const l of ['RedditComment', 'ContentGen', 'Bedrock', 'XRay']) assert.ok(!TRACKED_PURPOSES.includes(purposeOfLabel(l)), l);
    });
    await t('가드: 영어 거절문이 한국어 글에 새면 실패 · 정상 한국어 문장은 통과', () => {
        assert.equal(evaluateOutput({ purpose: 'Guardian', locale: 'ko', text: "I apologize, but I cannot provide this analysis.", source: '', expectJson: false }).ok, false);
        const good = '나스닥 선물이 장 초반 소폭 상승했고 VIX 는 18 수준에서 안정적으로 관찰됨. 감마 노출은 양(+)의 영역에 머물러 변동성이 눌린 상태로 확인됨.';
        assert.equal(evaluateOutput({ purpose: 'Guardian', locale: 'ko', text: good, source: '', expectJson: false }).ok, true);
    });
    await t('가드: 금융 공통어 음차(맥스 페인·マックスペイン) 실패 · JSON 키별 언어(KR/EN/JP) 검사 · 잘림/거절 stop 은 실패', () => {
        const bad = evaluateOutput({ purpose: 'UC', locale: 'ko', text: '이번 만기의 맥스 페인 수준에 가격이 끌려가는 흐름이 관찰됨. 콜 매수세가 이어졌음.', source: '', expectJson: false });
        assert.ok(bad.reasons.some((r) => r.includes('transliterated')), bad.reasons.join('|'));
        const okTxt = JSON.stringify({ summaryKR: '반도체 업종 전반이 강세를 보인 하루로 관찰되었습니다.', summaryEN: 'Semiconductors led the session with broad participation.', summaryJP: '半導体セクター全体が堅調に推移した一日と観測されました。' });
        assert.equal(evaluateOutput({ purpose: 'NewsDigest', locale: 'multi', text: okTxt, source: '', expectJson: true }).ok, true);
        const swapped = JSON.stringify({ summaryKR: 'Semiconductors led the session with broad participation.', summaryEN: '반도체 업종 전반이 강세를 보인 하루로 관찰되었습니다.', summaryJP: '半導体セクター全体が堅調に推移した一日と観測されました。' });
        assert.equal(evaluateOutput({ purpose: 'NewsDigest', locale: 'multi', text: swapped, source: '', expectJson: true }).ok, false);
        assert.ok(evaluateOutput({ purpose: 'UC', locale: 'ko', text: '정상 문장 정상 문장 정상 문장 정상 문장입니다.', source: '', expectJson: false, truncated: true }).reasons.includes('truncated'));
        assert.ok(evaluateOutput({ purpose: 'UC', locale: 'ko', text: '', source: '', expectJson: false, refusal: true }).reasons.includes('stop:refusal'));
        assert.equal(collectLocaleStrings({ a: { insightKR: '한국어 문장이 열다섯 글자를 넘습니다 충분히' } }, null)[0].loc, 'ko');
    });
    await t('비교 가드 거짓 양성 제거: 재료에 있는 연도·표현은 통과 · 짧은 한글 필드(비율 정상)는 통과 · 재료에 없는 연도는 실패', () => {
        assert.equal(waivedBySource('year:2032', 'target by 2032 announced'), true);
        assert.equal(waivedBySource('year:2019', 'nothing here'), false);
        assert.equal(waivedBySource('refusal:ko:"AI 모델"', 'new AI 모델 launched'), true);
        assert.equal(waivedBySource('language:ko-hangul=1.00', ''), true);
        assert.equal(waivedBySource('language:ko-hangul=0.20', ''), false);
        assert.equal(waivedBySource('language:ja-kana+kanji=0.90,kana=2', ''), true);
        const r = evaluateOutput({ purpose: 'UC', locale: 'ko', text: '2019년 이후 처음으로 분기 실적이 시장 예상을 웃돌았음이 관찰됨.', source: 'plain text', expectJson: false });
        assert.ok(r.reasons.some((x) => x.includes('year:2019')), r.reasons.join('|'));
        const r2 = evaluateOutput({ purpose: 'UC', locale: 'ko', text: '2019년 이후 처음으로 분기 실적이 시장 예상을 웃돌았음이 관찰됨.', source: 'since 2019 the company', expectJson: false });
        assert.equal(r2.ok, true, r2.reasons.join('|'));
    });
    await t('가드: 금액 자릿수 — 원문 $1 billion 을 «10억 달러» 가 아니라 «100억 달러»로 옮기면 실패', () => {
        const src = 'The company announced a $1 billion buyback.';
        assert.equal(evaluateOutput({ purpose: 'UCTranslate', locale: 'ko', text: '회사는 10억 달러 규모의 자사주 매입을 발표했음.', source: src, expectJson: false }).ok, true);
        assert.equal(evaluateOutput({ purpose: 'UCTranslate', locale: 'ko', text: '회사는 100억 달러 규모의 자사주 매입을 발표했음.', source: src, expectJson: false }).ok, false);
    });
    await t('가드 함수: 뉴스 다이제스트 배열 80% · 필수 키 · 세 언어 칸', () => {
        const item = (kr: string, en: string, jp: string) => ({ summaryKR: kr, summaryEN: en, summaryJP: jp });
        const good = item('반도체 강세가 이어졌음', 'Chips extended gains', '半導体の上昇が続いた');
        assert.equal(newsDigestGate(JSON.stringify([good, good, good, good, good])), true);
        assert.notEqual(newsDigestGate(JSON.stringify([good, good, item('English only', 'English', 'English')])), true);
        assert.notEqual(newsDigestGate('not json'), true);
        assert.equal(jsonKeysGate(['a', 'b'])('{"a":1,"b":2}'), true); assert.notEqual(jsonKeysGate(['a', 'b'])('{"a":1}'), true);
        assert.equal(triLangGate()(JSON.stringify({ ko: '한국어 분석 문장이 충분히 길게 관찰된 구조를 설명합니다.', en: 'English analysis sentence long enough to be read as a normal paragraph.', ja: '日本語の分析文が十分な長さで構造を観測として説明しています。' })), true);
        assert.notEqual(textGate('ja')('한국어로 쓴 문장이 일본어 자리에 들어왔습니다. 이것은 실패여야 합니다.'), true);
    });
    await t('집계: 용도별 p50/p95·전환율·가드 통과율·토큰·비용 (변경 전/후 비교표의 원천)', () => {
        const rec = (o: Partial<CallRecord>): CallRecord => ({ t: 1, p: 'UC', v: 'legacy', m: 'm', ms: 1000, tr: 'legacy:ok', i: 2000, o: 800, c: 0.006, ca: 0, ch: 500, g: 1, ok: 1, ...o });
        const rs = [
            rec({ ms: 1000 }), rec({ ms: 2000 }), rec({ ms: 3000, g: 0 }), rec({ ms: 4000 }),
            rec({ v: 'a55', ms: 500, tr: 'a55:ok', c: 0.0006, ca: 0.0006 }),
            rec({ v: 'legacy', ms: 6000, tr: 'a55:rate,b55i:access,legacy:ok' }),
        ];
        const [u] = summarizeCalls(rs);
        assert.equal(u.purpose, 'UC'); assert.equal(u.n, 6); assert.equal(u.okRate, 1);
        assert.equal(u.transitionRate, 0.167); assert.equal(u.reasons['a55:rate'], 1); assert.equal(u.reasons['b55i:access'], 1);
        assert.equal(u.byProvider.legacy.n, 5); assert.equal(u.byProvider.legacy.p50Ms, 3000); assert.equal(u.byProvider.legacy.p95Ms, 6000);
        assert.equal(u.byProvider.legacy.guardPass, 0.8); assert.equal(u.byProvider.a55.avgCostUsd, 0.0006); assert.equal(u.byProvider.a55.totalCreditUsd, 0.0006);
    });
    await t('관리자 인증: CRON_SECRET 을 헤더로만 · 틀리면 거부 · 운영에서 비밀이 없으면 닫힘(fail closed)', () => {
        const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
        const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
        assert.equal(adminAuthorized(h({ authorization: 'Bearer s3cret' }), env({ CRON_SECRET: 's3cret', NODE_ENV: 'production' })), true);
        assert.equal(adminAuthorized(h({ 'x-cron-secret': 's3cret' }), env({ CRON_SECRET: 's3cret', NODE_ENV: 'production' })), true);
        assert.equal(adminAuthorized(h({ authorization: 'Bearer wrong' }), env({ CRON_SECRET: 's3cret', NODE_ENV: 'production' })), false);
        assert.equal(adminAuthorized(h({}), env({ CRON_SECRET: 's3cret', NODE_ENV: 'production' })), false);
        assert.equal(adminAuthorized(h({ authorization: 'Bearer x' }), env({ NODE_ENV: 'production' })), false);
        assert.equal(adminAuthorized(h({}), env({ NODE_ENV: 'development' })), true);
    });
    await t('관리자 엔드포인트는 쿼리스트링 비밀을 받지 않는다(로그에 남는다) · 응답에 키 환경변수 이름이 값으로 나가지 않는다', () => {
        for (const f of ['src/app/api/admin/ai-ladder/route.ts', 'src/app/api/admin/ai-ab/route.ts', 'src/lib/ai/adminAuth.ts']) {
            const src = fs.readFileSync(path.join(root, f), 'utf8');
            assert.ok(!/searchParams\.get\(['"]secret['"]\)/.test(src), f);
        }
    });

    // ───────────── 소스 불변식 ─────────────
    await t('callBedrock: 현행 호출(legacy)은 그대로 temperature 를 보낸다 — 5.5 규칙(temperature 제거)은 ①② 본문에만 적용', () => {
        const src = fs.readFileSync(path.join(root, 'src/services/bedrockClient.ts'), 'utf8');
        assert.ok(/temperature,\s*\n\s*\/\/ ★2026-10-08/.test(src), 'InvokeModel 본문의 temperature 유지');
        assert.ok(/runLadder\(/.test(src));
        const lad = fs.readFileSync(path.join(root, 'src/lib/ai/llmLadder.ts'), 'utf8');
        assert.ok(/const body = shapeH55Body\(/.test(lad), '①② 본문은 shapeH55Body 한 곳에서만 만든다');
        const reqSrc = fs.readFileSync(path.join(root, 'src/lib/ai/llmRequest.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.ok(!/\b(temperature|top_p|top_k)\s*:/.test(reqSrc), 'shapeH55Body 는 sampling 키를 만들지 않는다');
    });
    await t('직접 호출 3곳(UC·모닝 브리핑·실적 브리핑)이 사다리 입구를 지난다', () => {
        for (const f of ['src/app/api/undercurrent/shared.ts', 'src/app/api/guardian/briefing/generate/route.ts', 'src/app/api/cron/earnings-brief/route.ts']) {
            assert.ok(/runLadder\(/.test(fs.readFileSync(path.join(root, f), 'utf8')), f);
        }
    });
    await t('종목 뉴스: 사다리 입구를 지나고, 현행 Nova Lite 호출이 대체(legacy)로 그대로 남아 있다', () => {
        const src = fs.readFileSync(path.join(root, 'src/app/api/live/ticker-news/route.ts'), 'utf8');
        assert.ok(/runLadder\(/.test(src) && /purpose: 'TickerNews'/.test(src));
        assert.ok(/modelId: LIGHT_MODEL/.test(src) && /us\.amazon\.nova-lite-v1:0/.test(src), 'Nova Lite 대체 경로 유지');
        assert.ok(/validate: tickerNewsGate\(/.test(src), '출구 가드(checked) 연결');
    });

    // ── 2026-10-10 잘림 표지·종목 뉴스 ─────────────────────────────────────────
    await t('현행(③) 응답이 max_tokens 에서 잘렸으면 기록은 가드 실패(truncated)로 남고 호출 지점에는 truncated 표지가 간다', async () => {
        const s = mk({ allow: {} });
        const cut: () => Promise<LegacyResult> = async () => ({ text: '{"analyses":[{"ticker":"A"', model: 'claude-haiku-4.5', priceModel: 'haiku-4.5', usage: { input: 10, output: 5600, cacheWrite: 0, cacheRead: 0 }, truncated: true });
        const o = await runLadder(req({ purpose: 'IntelAnalysis', validate: jsonKeysGate(['analyses']) }), cut, s.deps);
        assert.equal(o.truncated, true); assert.equal(o.provider, 'legacy');
        const r = records(s)[0]; assert.equal(r.g, 0); assert.ok(/^truncated/.test(r.gr || ''), r.gr);
        const ok = await runLadder(req({ purpose: 'IntelAnalysis' }), legacyOk('{}'), s.deps);
        assert.equal(ok.truncated, false); assert.equal(records(s)[1].g, -1);
    });
    await t('종목 뉴스 사다리: ① 가 5건 모두 통과하면 ① 만 쓰고, 묶음의 40% 넘게 오염되면 현행(Nova)으로 넘긴다', async () => {
        const titles = ['Micron posts record quarterly revenue on AI memory demand', 'Nvidia to invest in Groq in new deal', 'Delta CEO says no tit for tat'];
        const good = JSON.stringify({ items: titles.map((tt, i) => ({ id: i + 1, ko: `마이크론 관련 보도: ${tt.slice(0, 18)} 내용을 전한 기사다`, ja: 'マイクロンに関する報道で、業績の内容を伝える記事です', impact: 'NEUTRAL' })) });
        const bad = JSON.stringify({ items: titles.map((_, i) => ({ id: i + 1, ko: 'Short', ja: 'x', impact: 'NEUTRAL' })) });
        const base = { purpose: 'TickerNews', expectJson: true, validate: tickerNewsGate(titles) };
        const s1 = mk({ allow: { TickerNews: { effort: 'low', thinking: 'disabled', timeoutMs: 14000 } }, a: () => ok(good) });
        const o1 = await runLadder(req(base), legacyOk('NOVA'), s1.deps);
        assert.equal(o1.provider, 'a55'); assert.equal(s1.a, 1);
        const s2 = mk({ allow: { TickerNews: { effort: 'low', thinking: 'disabled', timeoutMs: 14000 } }, a: () => ok(bad) });
        const o2 = await runLadder(req(base), legacyOk('NOVA'), s2.deps);
        assert.equal(o2.provider, 'legacy'); assert.equal(o2.text, 'NOVA'); assert.ok(o2.trail[0].startsWith('a55:guard'), o2.trail.join());
    });
    await t('종목 뉴스: 킬 스위치(TickerNews) 한 줄이면 재배포 없이 Nova Lite 만 쓴다', async () => {
        const s = mk({ allow: { TickerNews: { effort: 'low', thinking: 'disabled', timeoutMs: 14000 } }, a: () => ok('{"items":[]}') });
        await s.store.setEx(LLM_KEYS.off, JSON.stringify(['TickerNews']), 3600);
        const o = await runLadder(req({ purpose: 'TickerNews', expectJson: true }), legacyOk('NOVA'), s.deps);
        assert.equal(o.provider, 'legacy'); assert.equal(s.a, 0);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
