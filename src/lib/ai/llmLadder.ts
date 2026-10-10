/**
 * 제공자 사다리 — 모든 Claude 호출의 «입구 아래» 한 층 (2026-10-10, 대표: «1차적으로 엔트로픽 크레딧을 사용하고 AWS 도 5.5»).
 *
 *   ① Anthropic API  claude-haiku-5-5            (Max 구독 월 API 크레딧 — 크레딧 키 ANTHROPIC_API_KEY_CREDITS)
 *   ② Bedrock        Haiku 5.5                   (AWS — 모델 접근이 열려 있을 때만)
 *   ③ 현행(legacy)                               (Bedrock Haiku 4.5 …, 호출 지점이 넘겨준 함수 — 마지막 안전망)
 *
 * 다음 단으로 넘어가는 조건: 키 없음 · 월 상한($190) · 서킷 열림 · 401/403/404 · 429 · 5xx · 시간 초과 · 네트워크 ·
 *   stop_reason:'refusal' · 잘림(max_tokens) · 빈 응답 · JSON 불가 · 출구 품질 가드(validate) 실패.
 *
 * 안전 원칙 («최악이 현재 상태»):
 *   · 허용 목록(LADDER_PURPOSES)에 없는 용도, 허용 목록이 비어 있을 때, 킬 스위치가 켜졌을 때 = ③ 만 부른다(예전과 같은 코드·같은 순서).
 *   · 저장소(Upstash)가 죽어도 호출은 그대로 간다(원장을 못 읽으면 «한도 미만»으로 본다).
 *   · ③ 은 예외를 그대로 던진다 — 호출 지점이 기대하던 실패 모양이 바뀌지 않는다.
 *   · 키 값은 어디에도 기록하지 않는다(로그·응답·원장 모두).
 */
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { signV4 } from '@/lib/ai/awsSigV4';
import {
    classifyHttpFailure, normalizeJsonText, parseMessageResponse, shapeH55Body,
    type Effort, type FailKind, type ParsedMessage,
} from '@/lib/ai/llmRequest';
import { costOf, LEDGER_CAP_USD, nextRenewal, overCap, periodId, type PriceModel, type TokenUsage } from '@/lib/ai/llmPricing';
import { upstashStore, type LlmStore } from '@/lib/ai/llmStore';
import { financeTermsRule } from '@/lib/ai/commonTerms';

// ─────────────────────────────────────────────────────────────────────────────
// 1) 용도(label) 목록 · 허용 목록
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 측정·캡처 대상 용도 — 사용자에게 나가는 AI 화면/크론만. 여기에 없는 label(마케팅·관리자 등)은
 * 사다리·기록·캡처 어디에도 걸리지 않고 곧장 ③(예전 코드)으로 간다.
 */
export const TRACKED_PURPOSES: readonly string[] = [
    'FlowAI', 'DeepAnalysis',
    'Guardian', 'GuardianTranslate',
    'NewsDigest', 'UC', 'UCTranslate', 'WIM', 'Disclosures',
    'SectorHeadlines', 'CrossSector', 'EarningsBrief',
    'IntelAnalysis', 'IntelSnapshot', 'MorningBriefing',
];

/**
 * callBedrock 의 label → 사다리 용도. label 은 호출 지점마다 제각각이라(`Guardian/TACTICAL_ko`, `Translate/…`) 한 곳에서 묶는다.
 * 여기서 못 알아본 label(마케팅·관리자 등)은 그대로 돌려줘 TRACKED 밖 = 예전 그대로가 된다.
 */
export function purposeOfLabel(label: string): string {
    const l = String(label || '');
    if (/^FlowAI/.test(l)) return 'FlowAI';
    if (/^DeepAnalysis/.test(l)) return 'DeepAnalysis';
    if (/^Translate\//.test(l)) return 'GuardianTranslate';
    if (/^Guardian\//.test(l)) return 'Guardian';
    if (/^NewsDigest/.test(l)) return 'NewsDigest';
    if (/^SectorHeadlines/.test(l)) return 'SectorHeadlines';
    if (/^CrossSectorBrief/.test(l)) return 'CrossSector';
    if (/^IntelAI/.test(l)) return 'IntelAnalysis';
    if (/^Snapshot\/News/.test(l)) return 'IntelSnapshot';
    return l;
}

export interface LadderConfig {
    /** 사고 강도 — 기본 low (지연·토큰 억제) */
    effort?: Effort;
    thinking?: 'disabled' | 'adaptive';
    /** ① 한 번의 시간 제한(ms). 기본 30초 */
    timeoutMs?: number;
}

/**
 * ★ 허용 목록 — 여기에 올라간 용도만 ①② 를 시도한다. 비어 있으면 모든 용도가 예전 그대로 ③ 만 쓴다.
 * 용도를 올리는 기준: tests·품질 비교(HAIKU55-AB-2026-10-10.md)에서 가드 통과율이 현행 이상. 못 미친 용도는 올리지 않는다.
 * 되돌리기: 이 객체를 비우거나, 관리자 엔드포인트로 킬 스위치(`llm:ladder:off`)를 켠다(재배포 없이 즉시).
 */
export const LADDER_PURPOSES: Record<string, LadderConfig> = {
    // ── 2026-10-10 품질 비교(운영 실입력 재생, HAIKU55-AB-2026-10-10.md)에서 가드 통과율이 현행 이상이었던 용도만 ──
    //   UC 카드(뉴스×자금 한 줄 읽기): 사고 끔 14/14 vs 현행 10/14 · p50 5.6s vs 12.1s · 호출당 $0.0010 vs $0.0090
    //   (적응형 사고 low 는 37/40 vs 33/40 으로 통과했지만 느리고 출력 토큰이 1.7배 — 사고를 끄면 숫자 밀도도 현행에 가깝다)
    UC: { effort: 'low', thinking: 'disabled', timeoutMs: 20_000 },
    //   UC 번역 보정(enforceLanguage): 8/8 vs 8/8 · p50 1.5s vs 5.9s
    UCTranslate: { effort: 'low', timeoutMs: 12_000 },
    //   뉴스 다이제스트(5건×3개 언어): 운영 가드(newsDigestGate) 8/8 vs 8/8 · 사고 끔 p50 13s vs 26s.
    //   라우트 한도 60초: ① 26초 + 현행 나머지(45−26=19초). 사고를 켜면 p95 22초로 ① 시간 초과가 잦아 끈다.
    NewsDigest: { effort: 'low', thinking: 'disabled', timeoutMs: 26_000 },
    // 못 올린 용도(표본 부족·통과율 미달)와 이유는 HAIKU55-AB-2026-10-10.md «전환 판정» 표. 그 용도들은 예전 그대로 Bedrock Haiku 4.5.
};

// ─────────────────────────────────────────────────────────────────────────────
// 2) 타입
// ─────────────────────────────────────────────────────────────────────────────

export type GateResult = boolean | string | { ok: boolean; reasons?: string[] } | null | undefined;

export interface LadderRequest {
    /** 용도(label) */
    purpose: string;
    /** 모델이 받는 «완성된» system (날짜 앵커·금융 공통어 포함) */
    system: string;
    userPrompt: string;
    maxTokens: number;
    /** 호출 지점이 JSON 응답을 기대한다(예전 프리필 '{' 사용처) */
    jsonPrefill?: boolean;
    /** JSON 응답을 기대하지만 예전에도 프리필은 쓰지 않던 호출 — ①② 에서 JSON 으로 읽히는지 검사하고 형식 지시를 붙인다 */
    expectJson?: boolean | 'array';
    /** 현행 호출의 temperature — 캡처(재생)용 기록. ①② 에는 절대 보내지 않는다 */
    temperature?: number;
    locale?: 'ko' | 'en' | 'ja' | 'multi';
    timeoutMs?: number;
    /** 출구 품질 가드 — true/undefined=통과, false 또는 사유 문자열=실패. ①② 에서 실패하면 다음 단으로. ③ 에서는 기록만 한다. */
    validate?: (text: string) => GateResult;
}

/** 현행(③) 호출이 받는 문맥 — ①② 가 이미 쓴 시간(ms). 허용 목록 밖이면 항상 0 이라 예전 시간 제한 그대로다. */
export interface LegacyCtx { elapsedMs: number }

export interface LegacyResult {
    text: string;
    model: string;
    usage?: Partial<TokenUsage> | null;
    /** 비용 환산에 쓸 단가표 */
    priceModel?: PriceModel;
}

export type ProviderId = 'a55' | 'b55' | 'legacy';

export interface LadderOutcome {
    text: string;
    /** 실제 응답한 모델(정직하게) */
    model: string;
    provider: ProviderId;
    usedFallback: boolean;
    elapsedMs: number;
    usage: Partial<TokenUsage> | null;
    costUsd: number;
    /** 시도 기록 — 예: ['a55:rate', 'b55:access', 'legacy:ok'] */
    trail: string[];
}

export class LadderRungError extends Error {
    constructor(public kind: FailKind, public closeSec: number, public detail: string) { super(`${kind}: ${detail}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 의존성(시험에서 갈아 끼운다)
// ─────────────────────────────────────────────────────────────────────────────

export interface RungCall { body: Record<string, unknown>; timeoutMs: number }
export interface RungResult { parsed: ParsedMessage; modelUsed: string }

export interface LadderDeps {
    store: LlmStore;
    now: () => number;
    /** 크레딧 키. 없으면 ① 을 건너뛴다 */
    anthropicKey: () => string | undefined;
    hasAws: () => boolean;
    callAnthropic: (c: RungCall, key: string) => Promise<RungResult>;
    /** variant: 'invoke'(InvokeModel, 추론 프로필) | 'mantle'(Messages API 엔드포인트) */
    callBedrock55: (variant: B55Variant, c: RungCall) => Promise<RungResult>;
    allowlist: () => Record<string, LadderConfig>;
    log: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

export type B55Variant = 'invoke' | 'mantle';

export const A55_MODEL = 'claude-haiku-5-5';
export const B55_INVOKE_MODEL = 'global.anthropic.claude-haiku-5-5';
export const B55_MANTLE_MODEL = 'anthropic.claude-haiku-5-5';

export async function defaultCallAnthropic(c: RungCall, key: string): Promise<RungResult> {
    let res: Response;
    try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(c.body),
            signal: AbortSignal.timeout(c.timeoutMs),
        });
    } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        throw new LadderRungError(timedOut ? 'timeout' : 'network', timedOut ? 0 : 60, String(e?.message || e).slice(0, 160));
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
        const f = classifyHttpFailure(res.status, text, res.headers.get('retry-after'));
        throw new LadderRungError(f.kind, f.closeSec, f.detail);
    }
    let json: any;
    try { json = JSON.parse(text); } catch { throw new LadderRungError('server', 120, 'non-json body'); }
    return { parsed: parseMessageResponse(json), modelUsed: A55_MODEL };
}

let _b55Client: BedrockRuntimeClient | null = null;
function b55Client(): BedrockRuntimeClient {
    if (_b55Client) return _b55Client;
    _b55Client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
        maxAttempts: 1,   // SDK 재시도는 스로틀을 증폭한다 — 사다리가 다음 단으로 넘긴다
    });
    return _b55Client;
}

function bedrockErrorToRung(e: any): LadderRungError {
    const name = String(e?.name || '');
    const msg = String(e?.message || '').slice(0, 200);
    if (name === 'AccessDeniedException' || name === 'ResourceNotFoundException' || /not available for this account/i.test(msg)) {
        return new LadderRungError('access', 6 * 3600, `${name} ${msg}`);   // 모델 접근 신청이 필요 — 6시간 닫는다
    }
    if (name.includes('Throttling') || e?.$metadata?.httpStatusCode === 429) return new LadderRungError('rate', 60, `${name} ${msg}`);
    if (name === 'ValidationException') return new LadderRungError('bad-request', 0, `${name} ${msg}`);
    if (/timeout/i.test(name + msg)) return new LadderRungError('timeout', 0, msg);
    return new LadderRungError('server', 120, `${name} ${msg}`);
}

export async function defaultCallBedrock55(variant: B55Variant, c: RungCall): Promise<RungResult> {
    if (variant === 'invoke') {
        // InvokeModel 은 model 을 본문이 아니라 modelId 로 받는다
        const { model: _m, ...rest } = c.body as Record<string, unknown>;
        void _m;
        try {
            const res = await Promise.race([
                b55Client().send(new InvokeModelCommand({
                    modelId: B55_INVOKE_MODEL, contentType: 'application/json', accept: 'application/json',
                    body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', ...rest }),
                })),
                new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), c.timeoutMs)),
            ]);
            return { parsed: parseMessageResponse(JSON.parse(new TextDecoder().decode(res.body))), modelUsed: B55_INVOKE_MODEL };
        } catch (e: any) {
            throw e instanceof LadderRungError ? e : bedrockErrorToRung(e);
        }
    }
    // mantle: https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages (SigV4, 서비스명 bedrock-mantle)
    const region = process.env.AWS_REGION || 'us-east-1';
    const host = `bedrock-mantle.${region}.api.aws`;
    const body = JSON.stringify({ ...c.body, model: B55_MANTLE_MODEL });
    const headers = signV4({
        method: 'POST', host, path: '/anthropic/v1/messages', body, region, service: 'bedrock-mantle',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    });
    let res: Response;
    try {
        res = await fetch(`https://${host}/anthropic/v1/messages`, { method: 'POST', headers, body, signal: AbortSignal.timeout(c.timeoutMs) });
    } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        throw new LadderRungError(timedOut ? 'timeout' : 'network', timedOut ? 0 : 60, String(e?.message || e).slice(0, 160));
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
        const f = classifyHttpFailure(res.status, text, res.headers.get('retry-after'));
        // Mantle 의 403(«not available for this account»)·404(«model does not exist») = 접근 신청 필요 → 6시간
        throw new LadderRungError(f.kind, f.kind === 'access' ? 6 * 3600 : f.closeSec, f.detail);
    }
    let json: any;
    try { json = JSON.parse(text); } catch { throw new LadderRungError('server', 120, 'non-json body'); }
    return { parsed: parseMessageResponse(json), modelUsed: B55_MANTLE_MODEL };
}

export function defaultDeps(): LadderDeps {
    return {
        store: upstashStore,
        now: () => Date.now(),
        // 크레딧 키 — 대표가 Vercel 운영 환경변수(Secret)로 등록. 값은 어디에도 출력하지 않는다.
        anthropicKey: () => (process.env.ANTHROPIC_API_KEY_CREDITS || '').trim() || undefined,
        hasAws: () => !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
        callAnthropic: defaultCallAnthropic,
        callBedrock55: defaultCallBedrock55,
        allowlist: () => LADDER_PURPOSES,
        log: (level, msg) => { (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(msg); },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 상태 캐시(인스턴스 안) — 저장소 읽기를 30초에 한 번으로 묶는다
// ─────────────────────────────────────────────────────────────────────────────

const STATE_TTL_MS = 30_000;
interface Cached<T> { v: T; at: number }
const _cache = new Map<string, Cached<any>>();

async function cached<T>(key: string, now: number, load: () => Promise<T>): Promise<T> {
    const hit = _cache.get(key);
    if (hit && now - hit.at < STATE_TTL_MS) return hit.v as T;
    const v = await load();
    _cache.set(key, { v, at: now });
    return v;
}
export function _resetLadderStateForTest(): void { _cache.clear(); _localBreaker.clear(); _captureAt.clear(); }

const K = {
    cost: (period: string) => `llm:cost:${period}`,
    breaker: (id: string) => `llm:cb:${id}`,
    off: 'llm:ladder:off',
    capOn: 'llm:cap:on',
    capList: (purpose: string) => `llm:cap:${purpose}`,
    calls: (hour: string) => `llm:calls:${hour}`,
};
export const LLM_KEYS = K;

export const hourId = (ms: number): string => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');

const _localBreaker = new Map<string, number>();   // id → 닫힘 해제 시각(ms)

async function breakerOpenUntil(id: string, d: LadderDeps): Promise<number> {
    const now = d.now();
    const local = _localBreaker.get(id) || 0;
    if (local > now) return local;
    const remote = await cached(`cb:${id}`, now, async () => {
        const v = await d.store.get(K.breaker(id));
        const until = Number(v);
        return Number.isFinite(until) ? until : 0;
    });
    return remote > now ? remote : 0;
}

async function openBreaker(id: string, sec: number, reason: string, d: LadderDeps): Promise<void> {
    if (sec <= 0) return;
    const until = d.now() + sec * 1000;
    _localBreaker.set(id, Math.min(until, d.now() + 600_000));   // 인스턴스 안 기억은 최대 10분 — 그 뒤엔 저장소의 «진짜 해제 시각»을 다시 읽는다(관리자 해제 반영)
    _cache.delete(`cb:${id}`);
    await d.store.setEx(K.breaker(id), String(until), sec);
    d.log('warn', `[Ladder] ${id} 문을 ${sec}초 닫는다 — ${reason.slice(0, 160)}`);
}

async function monthSpent(d: LadderDeps): Promise<number> {
    const now = d.now();
    return cached(`cost`, now, async () => {
        const v = await d.store.get(K.cost(periodId(new Date(now))));
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    });
}

async function killSwitch(purpose: string, d: LadderDeps): Promise<boolean> {
    if (process.env.AI_LADDER_OFF === '1') return true;
    const raw = await cached('off', d.now(), () => d.store.get(K.off));
    if (!raw) return false;
    if (raw === '*') return true;
    try { const arr = JSON.parse(raw); return Array.isArray(arr) && (arr.includes('*') || arr.includes(purpose)); } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) 가드 결과 해석
// ─────────────────────────────────────────────────────────────────────────────

export function interpretGate(r: GateResult): { ok: boolean; reason: string } {
    if (r === undefined || r === null || r === true) return { ok: true, reason: '' };
    if (r === false) return { ok: false, reason: 'guard' };
    if (typeof r === 'string') return r ? { ok: false, reason: r.slice(0, 80) } : { ok: true, reason: '' };
    if (typeof r === 'object') return r.ok ? { ok: true, reason: '' } : { ok: false, reason: (r.reasons || []).slice(0, 2).join(',').slice(0, 80) || 'guard' };
    return { ok: true, reason: '' };
}

function runGate(req: LadderRequest, text: string, d: LadderDeps): { ok: boolean; reason: string } {
    if (!req.validate) return { ok: true, reason: '' };
    try { return interpretGate(req.validate(text)); } catch (e: any) {
        d.log('warn', `[Ladder] ${req.purpose} validate 예외 — 통과로 본다: ${String(e?.message || e).slice(0, 100)}`);
        return { ok: true, reason: '' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) 호출 기록 · 캡처
// ─────────────────────────────────────────────────────────────────────────────

export interface CallRecord {
    t: number;            // epoch ms
    p: string;            // 용도
    v: ProviderId;        // 최종 응답 제공자
    m: string;            // 모델
    ms: number;           // 사용자가 기다린 총 시간
    tr: string;           // 시도 기록 'a55:rate,legacy:ok'
    i: number | null;     // 입력 토큰(최종 단)
    o: number | null;     // 출력 토큰
    c: number;            // 이 호출이 낸 비용 합(USD, 단가표 환산)
    ca: number;           // 그중 크레딧(Anthropic 직접) 몫
    ch: number;           // 출력 글자 수
    g: 1 | 0 | -1;        // 가드 통과(1)/실패(0)/가드 없음(-1) — 최종 응답 기준
    gr?: string;          // 가드 실패 사유
    ok: 1 | 0;            // 사용자에게 답이 갔나(예외 없이)
}

async function recordCall(rec: CallRecord, d: LadderDeps): Promise<void> {
    try {
        await d.store.rpush(K.calls(hourId(rec.t)), JSON.stringify(rec), 9 * 24 * 3600);
    } catch { /* 기록 실패는 호출에 영향 없음 */ }
}

const _captureAt = new Map<string, number>();
const CAPTURE_GAP_MS = 6_000;      // 같은 인스턴스·같은 용도 최소 간격(캡처 스위치가 켜진 동안만 — 스위치는 기본 꺼짐·최대 48시간)
const CAPTURE_KEEP = 40;
async function maybeCapture(req: LadderRequest, d: LadderDeps): Promise<void> {
    try {
        const now = d.now();
        const on = await cached('capOn', now, () => d.store.get(K.capOn));
        if (!on) return;
        if (now - (_captureAt.get(req.purpose) || 0) < CAPTURE_GAP_MS) return;
        _captureAt.set(req.purpose, now);
        await d.store.lpushTrim(K.capList(req.purpose), JSON.stringify({
            t: now, purpose: req.purpose, system: req.system, userPrompt: req.userPrompt, maxTokens: req.maxTokens,
            temperature: req.temperature ?? null, jsonPrefill: !!req.jsonPrefill, expectJson: req.expectJson ?? null, locale: req.locale ?? null,
        }), CAPTURE_KEEP, 4 * 24 * 3600);
    } catch { /* 캡처 실패는 무시 */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) 사다리 본체
// ─────────────────────────────────────────────────────────────────────────────

const A55_DEFAULT_TIMEOUT = 30_000;
const B55_DEFAULT_TIMEOUT = 25_000;

interface RungTry { ok: true; text: string; model: string; usage: TokenUsage; cost: number }
interface RungFail { ok: false; why: string; skip?: boolean; /** 응답이 왔다면 그 비용(거절·가드 실패도 과금된다) */ cost?: number }

async function tryRung(
    id: 'a55' | 'b55i' | 'b55m', req: LadderRequest, cfg: LadderConfig, d: LadderDeps, started: number,
): Promise<RungTry | RungFail> {
    const now = d.now();
    if (id === 'a55') {
        if (!d.anthropicKey()) return { ok: false, why: 'nokey', skip: true };
        if (overCap(await monthSpent(d))) return { ok: false, why: 'cap', skip: true };
    } else if (!d.hasAws()) return { ok: false, why: 'noaws', skip: true };
    if (await breakerOpenUntil(id, d) > now) return { ok: false, why: 'breaker', skip: true };

    const remaining = Math.max(5_000, (req.timeoutMs ?? 55_000) - (now - started));
    const timeoutMs = Math.min(cfg.timeoutMs ?? (id === 'a55' ? A55_DEFAULT_TIMEOUT : B55_DEFAULT_TIMEOUT), remaining);
    const body = shapeH55Body(A55_MODEL, { system: req.system, userPrompt: req.userPrompt, maxTokens: req.maxTokens, jsonPrefill: !!(req.jsonPrefill || req.expectJson), jsonArray: req.expectJson === 'array', effort: cfg.effort, thinking: cfg.thinking });

    let r: RungResult;
    try {
        r = id === 'a55'
            ? await d.callAnthropic({ body, timeoutMs }, d.anthropicKey()!)
            : await d.callBedrock55(id === 'b55i' ? 'invoke' : 'mantle', { body, timeoutMs });
    } catch (e: any) {
        const re = e instanceof LadderRungError ? e : new LadderRungError('network', 60, String(e?.message || e).slice(0, 160));
        if (re.kind === 'bad-request') d.log('error', `[Ladder] ${req.purpose} ${id} 400 — 요청 모양 점검 필요: ${re.detail.slice(0, 200)}`);
        else if (re.kind === 'auth' || re.kind === 'access' || re.kind === 'credit') d.log('error', `[Ladder] ${req.purpose} ${id} ${re.kind}: ${re.detail.slice(0, 200)}`);
        await openBreaker(id, re.closeSec, `${re.kind} ${re.detail}`, d);
        return { ok: false, why: re.kind };
    }

    const p = r.parsed;
    const cost = costOf(p.usage, 'haiku-5.5');
    if (id === 'a55' && cost > 0) {
        // 원장 — 응답이 왔으면(거절·가드 실패 포함) 과금된 것으로 센다
        const total = await d.store.incrByFloat(K.cost(periodId(new Date(d.now()))), cost, 45 * 24 * 3600);
        _cache.set('cost', { v: total ?? ((_cache.get('cost')?.v as number | undefined) ?? 0) + cost, at: d.now() });
    }
    const usage: TokenUsage = p.usage;
    if (p.stopReason === 'refusal') return { ok: false, why: `refusal${p.refusalCategory ? ':' + p.refusalCategory : ''}`, cost };
    if (!p.text) return { ok: false, why: p.stopReason === 'max_tokens' ? 'truncated' : 'empty', cost };
    if (p.stopReason === 'max_tokens') return { ok: false, why: 'truncated', cost };
    let text = p.text;
    if (req.jsonPrefill || req.expectJson) {
        const j = normalizeJsonText(text, req.expectJson === 'array' ? 'array' : 'object');
        if (!j.ok) return { ok: false, why: 'json', cost };
        text = j.text;
    }
    const gate = runGate(req, text, d);
    if (!gate.ok) return { ok: false, why: `guard:${gate.reason}`, cost };
    return { ok: true, text, model: r.modelUsed === A55_MODEL ? 'claude-haiku-5.5' : `claude-haiku-5.5@${id === 'b55i' ? 'bedrock' : 'mantle'}`, usage, cost };
}

/**
 * 사다리 실행. legacy 는 «예전 코드 그대로» — 허용 목록 밖이면 이것만 실행한다.
 */
export async function runLadder(
    req: LadderRequest, legacy: (ctx: LegacyCtx) => Promise<LegacyResult>, deps?: Partial<LadderDeps>,
): Promise<LadderOutcome> {
    const d: LadderDeps = { ...defaultDeps(), ...(deps || {}) };
    const started = d.now();
    // 금융 공통어 규칙(번역·음차 금지)은 ①②③ 모두 받는다 — 호출 지점이 빠뜨려도 여기서 한 번 더 보장한다(이미 있으면 그대로).
    if (!req.system.includes('<finance_terms>')) req = { ...req, system: financeTermsRule() + req.system };
    const tracked = TRACKED_PURPOSES.includes(req.purpose);
    if (!tracked) {
        const r = await legacy({ elapsedMs: 0 });
        return { text: r.text, model: r.model, provider: 'legacy', usedFallback: false, elapsedMs: d.now() - started, usage: r.usage ?? null, costUsd: 0, trail: ['legacy:ok'] };
    }

    await maybeCapture(req, d);

    const trail: string[] = [];
    let spent = 0, spentCredit = 0;
    const cfg = d.allowlist()[req.purpose];
    const laddered = !!cfg && !(await killSwitch(req.purpose, d));

    if (laddered) {
        let skipB55 = false;
        const rungs: Array<'a55' | 'b55i' | 'b55m'> = ['a55', 'b55i', 'b55m'];
        for (const id of rungs) {
            if (id !== 'a55' && skipB55) continue;
            const rungStart = d.now();
            const r = await tryRung(id, req, cfg!, d, started);
            if (r.ok) {
                trail.push(`${id}:ok`);
                spent += r.cost; if (id === 'a55') spentCredit += r.cost;
                const g = req.validate ? 1 : -1;
                const out: LadderOutcome = {
                    text: r.text, model: r.model, provider: id === 'a55' ? 'a55' : 'b55', usedFallback: false,
                    elapsedMs: d.now() - started, usage: r.usage, costUsd: r.cost, trail,
                };
                await recordCall({
                    t: d.now(), p: req.purpose, v: out.provider, m: r.model, ms: out.elapsedMs, tr: trail.join(','),
                    i: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, o: r.usage.output, c: spent, ca: spentCredit,
                    ch: r.text.length, g, ok: 1,
                }, d);
                return out;
            }
            trail.push(`${id}:${r.why}`);
            if (r.cost) { spent += r.cost; if (id === 'a55') spentCredit += r.cost; }
            // 같은 5.5 분류기 — 거절이면 Bedrock 5.5 도 같은 결과다. 시간 초과도 같은 모델이라 건너뛴다.
            if (id === 'a55' && (/^refusal/.test(r.why) || r.why === 'timeout' || d.now() - rungStart > 20_000)) skipB55 = true;
        }
    }

    // ③ 현행 — 예외는 그대로 던진다(호출 지점이 기대하던 실패 모양)
    let lr: LegacyResult;
    try {
        lr = await legacy({ elapsedMs: d.now() - started });   // ①② 가 쓴 시간을 알려 준다 — 현행(③)이 남은 시간 안에서 끝나게(라우트 60초 한도)
    } catch (e) {
        trail.push('legacy:throw');
        await recordCall({ t: d.now(), p: req.purpose, v: 'legacy', m: 'error', ms: d.now() - started, tr: trail.join(','), i: null, o: null, c: spent, ca: spentCredit, ch: 0, g: -1, ok: 0 }, d);
        throw e;
    }
    trail.push('legacy:ok');
    const lcost = costOf(lr.usage, lr.priceModel ?? 'haiku-4.5');
    spent += lcost;
    const gate = req.validate ? runGate(req, lr.text, d) : null;
    await recordCall({
        t: d.now(), p: req.purpose, v: 'legacy', m: lr.model, ms: d.now() - started, tr: trail.join(','),
        i: lr.usage ? (lr.usage.input ?? 0) + (lr.usage.cacheRead ?? 0) + (lr.usage.cacheWrite ?? 0) : null, o: lr.usage?.output ?? null,
        c: spent, ca: spentCredit, ch: lr.text.length, g: gate ? (gate.ok ? 1 : 0) : -1, gr: gate && !gate.ok ? gate.reason : undefined, ok: 1,
    }, d);
    return { text: lr.text, model: lr.model, provider: 'legacy', usedFallback: trail.length > 1, elapsedMs: d.now() - started, usage: lr.usage ?? null, costUsd: lcost, trail };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) 운영 상태 (관리자 엔드포인트용)
// ─────────────────────────────────────────────────────────────────────────────

export interface LadderStatus {
    period: string;
    renewsAt: string;
    spentUsd: number;
    capUsd: number;
    remainingUsd: number;
    overCap: boolean;
    allowlist: string[];
    killSwitch: string | null;
    captureOn: boolean;
    keyConfigured: boolean;
    breakers: Record<string, string | null>;
}

export async function ladderStatus(deps?: Partial<LadderDeps>): Promise<LadderStatus> {
    const d: LadderDeps = { ...defaultDeps(), ...(deps || {}) };
    const now = d.now();
    const period = periodId(new Date(now));
    const spent = Number(await d.store.get(K.cost(period))) || 0;
    const breakers: Record<string, string | null> = {};
    for (const id of ['a55', 'b55i', 'b55m']) {
        const until = Number(await d.store.get(K.breaker(id)));
        breakers[id] = Number.isFinite(until) && until > now ? new Date(until).toISOString() : null;
    }
    return {
        period, renewsAt: nextRenewal(new Date(now)).toISOString(),
        spentUsd: Math.round(spent * 10000) / 10000, capUsd: LEDGER_CAP_USD, remainingUsd: Math.round((LEDGER_CAP_USD - spent) * 10000) / 10000,
        overCap: overCap(spent), allowlist: Object.keys(d.allowlist()), killSwitch: await d.store.get(K.off),
        captureOn: !!(await d.store.get(K.capOn)), keyConfigured: !!d.anthropicKey(), breakers,
    };
}
