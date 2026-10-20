import { cachedEvidence } from '@/lib/ai/tacticalPrompt';
import { newsForStock } from '@/lib/ai/stockEvidence';
import { createHash } from 'node:crypto';
import { checkDepthLine } from '@/lib/ai/watchlistDepth';
import { textIntegrityReasons } from '@/lib/ai/textIntegrity';
/**
 * «내 종목» AI 한 줄 — 저장·읽기·생성 (서버). 글은 «종목 단위»로 한 번 만들고 모든 사용자가 같이 읽는다(사용자 수와 무관한 비용).
 *
 *   읽기  GET /api/watchlist/ai-line  → readLines (EC2 레디스 mget 한 번 · AI 호출 없음 · 기다리지 않는다)
 *   생성  응답 «뒤»(after) 또는 장전 크론 → generateLines
 *         재료: processWatchlistBatch(종목, 'price') — 앱 «내 종목»이 레벨을 읽는 그 묶음 응답(새 데이터 없음)
 *         모델: 사다리 ① Anthropic 크레딧 Haiku 5.5 만(withFreshTier — 크레딧이 안 되면 AWS 로 넘기지 않고 «건너뜀», 옛 글 유지)
 *         가드: lib/ai/watchlistLine.checkLineOutput(사다리 validate 와 저장 직전 두 번)
 *
 * 비용 상한(대표 «월 $3~15»): 하루 생성 시도 WL_AI_LINE_DAILY_CAP(기본 1,200회 ≈ $0.25/일 — 호출당 약 $0.0002) · 종목 잠금 2분 ·
 *   실패한 종목은 30분 쉬기 · 같은 지형(체인 날짜·레벨·가격의 쪽)이면 다시 만들지 않는다.
 * 끄기(줄도 생성도 0): 레디스 키 wlai:off 에 아무 값(재배포 없이 즉시) 또는 환경변수 WL_AI_LINE_OFF=1(재배포 필요).
 * 키: wlai:* — TTL 이 있고 복제 접두사 밖이라 EC2 레디스에만 쓴다(Upstash 명령 0, EC2 장애 때만 폴백 — redisClient.decideReplicate).
 */
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';
import { processWatchlistBatch } from '@/services/watchlistBatchService';
import { callBedrock } from '@/services/bedrockClient';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { buildLineFacts, buildLineUserPrompt, checkLineOutput, lineLocaleReasons, WL_LINE_LOCALES, WL_LINE_PURPOSE, WL_LINE_SYSTEM, type LineFacts } from '@/lib/ai/watchlistLine';
import { aiLineState, type AiLineEntry, type AiLineLevels, type AiLevelKey, type AiLineLocale, type AiSide } from '@/lib/app/watchlistAiLine';
import { etDateOf } from '@/lib/marketCalendar';

export const WL_AI_TTL_SEC = 36 * 3600;
const LOCK_SEC = 120;
const FAIL_SEC = 30 * 60;
const SKIP_SEC = 5 * 60;            // 크레딧 불가(건너뜀) — 짧게 쉰다
/** 화면이 «지형이 바뀌었다»고 알려도 이보다 최근에 만든 글이면 다시 만들지 않는다(가격이 레벨 언저리에서 오갈 때 되먹임 방지) */
export const WL_AI_REGEN_MIN_AGE_MS = 10 * 60_000;
const GEN_CONCURRENCY = 4;
const BATCH_CHUNK = 30;              // 묶음 서비스: 30개 이하만 종목별 실시간 스냅샷(useWatchlistData BATCH_MAX 와 같다)

export const lineKey = (t: string) => `wlai:v1:${t}`;
const lockKey = (t: string) => `wlai:lock:${t}`;
export const failKey = (t: string) => `wlai:fail:${t}`;
const dayKey = (d: string) => `wlai:n:${d}`;
/** 끄기 스위치 — 값이 있으면 읽기는 빈 응답, 생성은 0(재배포 없이) */
export const OFF_KEY = 'wlai:off';

export function aiLineOff(): boolean { return process.env.WL_AI_LINE_OFF === '1'; }
export function dailyCap(): number {
    const n = Number(process.env.WL_AI_LINE_DAILY_CAP);
    return Number.isFinite(n) && n >= 0 ? n : 1200;
}

export interface StoredLine {
    v: 1;
    t: string;
    at: number;
    chain: string;
    lv: AiLineLevels;
    sides: Partial<Record<AiLevelKey, AiSide>>;
    spot: number;
    text: Record<AiLineLocale, string>;
    insight?: Record<AiLineLocale, string>;
    revision?: 2;
    source?: string;
    inputHash?: string;
    cachedContextHash?: string;
    checkedAt?: number;
    /** 생성 지연(ms) · 응답한 단 — 실측용 */
    ms: number;
    provider?: string;
}

export function entryOf(s: StoredLine | null | undefined, loc: AiLineLocale): AiLineEntry | null {
    if (!s || s.v !== 1 || !s.text || typeof s.text[loc] !== 'string' || !s.text[loc]) return null;
    if (textIntegrityReasons(s.text[loc]).length || lineLocaleReasons(s.text[loc], loc).length) return null;
    const candidate = s.insight?.[loc];
    const insight = candidate && Date.now() - (s.checkedAt || s.at) < 15 * 60_000 && !checkDepthLine(candidate, loc, s.source || '').length ? candidate : undefined;
    return { text: s.text[loc], insight, chain: s.chain, lv: s.lv, sides: s.sides, at: s.at };
}

/** 이미 있는 글이 지금 행(가격·레벨)에도 맞나 — 화면과 같은 판정(aiLineState)을 서버 가격으로 */
export function storedMatchesFacts(s: StoredLine | null | undefined, f: LineFacts): boolean {
    if (!WL_LINE_LOCALES.every(loc => entryOf(s, loc))) return false;
    const e = entryOf(s, 'en');
    return aiLineState(e, { price: f.spot, maxPain: f.lv.mp, callWall: f.lv.cw, putFloor: f.lv.pf, gammaFlipLevel: f.lv.gf, chainDate: f.chain }) === 'ok';
}

export interface ReadResult { lines: Record<string, StoredLine | null>; failed: Set<string>; off: boolean }

/** 글·«쉬는 중» 표식·끄기 스위치를 한 번에(mget 한 번) */
export async function readLines(tickers: string[]): Promise<ReadResult> {
    const lines: Record<string, StoredLine | null> = {};
    const failed = new Set<string>();
    const keys = [OFF_KEY, ...tickers.map(lineKey), ...tickers.map(failKey)];
    const vals = await mgetFromCache<any>(keys).catch(() => keys.map(() => null));
    const off = !!vals[0];
    tickers.forEach((t, i) => {
        const v = vals[1 + i];
        lines[t] = v && typeof v === 'object' && v.v === 1 ? (v as StoredLine) : null;
        if (vals[1 + tickers.length + i]) failed.add(t);
    });
    return { lines, failed, off };
}

/**
 * 하루 상한 안이면 한 번을 «예약»한다(세고 나서 부른다). 한 인스턴스 안에서는 줄을 세워 동시 호출이 같은 값을 읽지 않게 한다
 * (인스턴스 사이는 근사 — 상한은 비용 안전망이지 정확한 계량기가 아니다).
 */
let dayChain: Promise<unknown> = Promise.resolve();
function reserveCall(): Promise<boolean> {
    const p = dayChain.then(async () => {
        const k = dayKey(etDateOf(Date.now()));
        const cur = Number(await getFromCache<number>(k).catch(() => 0)) || 0;
        if (cur >= dailyCap()) return false;
        await setInCache(k, cur + 1, 3 * 24 * 3600).catch(() => false);
        return true;
    });
    dayChain = p.catch(() => undefined);
    return p;
}
export async function callsToday(): Promise<number> {
    return Number(await getFromCache<number>(dayKey(etDateOf(Date.now()))).catch(() => 0)) || 0;
}

export type GenOutcome = 'generated' | 'fresh' | 'nodata' | 'guard' | 'skipped' | 'error' | 'locked' | 'cooling' | 'capped' | 'off';
const inputHashOf = (f: LineFacts) => createHash('sha256').update(WL_LINE_SYSTEM).update('\0').update(buildLineUserPrompt(f)).digest('hex');

/** 한 종목 생성 — 사실이 이미 있을 때. 저장까지. */
export async function generateOne(f: LineFacts, cachedContextHash?: string): Promise<{ outcome: GenOutcome; line?: StoredLine; reasons?: string[] }> {
    const t0 = Date.now();
    let last: string[] = [];
    try {
        const res = await withFreshTier(() => callBedrock({
            system: WL_LINE_SYSTEM,
            userPrompt: buildLineUserPrompt(f),
            maxTokens: 700,
            temperature: 0.2,
            timeoutMs: 15_000,
            label: WL_LINE_PURPOSE,
            purpose: WL_LINE_PURPOSE,
            expectJson: true,
            locale: 'multi',
            validate: (text: string) => { const c = checkLineOutput(text, f, { requireInsight: true }); last = c.reasons; return { ok: c.ok, reasons: c.reasons }; },
        }));
        const c = checkLineOutput(res.text, f, { requireInsight: true });
        if (!c.ok || !c.text) {
            await setInCache(failKey(f.ticker), { at: Date.now(), why: c.reasons.slice(0, 6) }, FAIL_SEC).catch(() => false);
            return { outcome: 'guard', reasons: c.reasons };
        }
        const line: StoredLine = {
            v: 1, t: f.ticker, at: Date.now(), chain: f.chain, lv: f.lv, sides: f.sides, spot: f.spot,
            text: c.text, insight: c.insight, revision: 2, source: buildLineUserPrompt(f), inputHash: inputHashOf(f), cachedContextHash, checkedAt: Date.now(), ms: Date.now() - t0, provider: res.provider,
        };
        await setInCache(lineKey(f.ticker), line, WL_AI_TTL_SEC);
        return { outcome: 'generated', line };
    } catch (e) {
        if (isFreshTierSkipped(e)) {
            // 크레딧 불가(상한·차단기·킬 스위치) 또는 가드를 두 번 못 넘음 — 옛 글은 그대로 두고 잠시 쉰다
            const guard = last.length > 0;
            await setInCache(failKey(f.ticker), { at: Date.now(), why: guard ? last.slice(0, 6) : ['credit-skip'] }, guard ? FAIL_SEC : SKIP_SEC).catch(() => false);
            return { outcome: guard ? 'guard' : 'skipped', reasons: guard ? last : ['credit-skip'] };
        }
        await setInCache(failKey(f.ticker), { at: Date.now(), why: ['error'] }, SKIP_SEC).catch(() => false);
        return { outcome: 'error', reasons: [String((e as Error)?.message || e).slice(0, 120)] };
    }
}

async function pool<T>(items: T[], n: number, deadline: number, fn: (x: T) => Promise<void>): Promise<void> {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length && Date.now() < deadline) await fn(items[i++]);
    }));
}

export interface GenSummary {
    asked: number; out: Record<string, GenOutcome>; reasons: Record<string, string[]>; ms: number;
    /** opts.detail — 만든 글과 그 사실(점검·표본 검토용, 인증된 크론 응답에만) */
    detail?: Record<string, { facts: string; text?: Record<AiLineLocale, string>; ms?: number; provider?: string }>;
}

/**
 * 여러 종목 생성 — 잠금·쉬기·하루 상한·«같은 지형이면 그대로»를 지난 종목만 AI 를 부른다.
 * opts.force = 같은 지형이어도 다시(점검용 — 크론 ?force=1 에서만).
 */
export async function generateLines(tickers: string[], opts: { deadline?: number; force?: boolean; detail?: boolean; cachedContextOnly?: string[] } = {}): Promise<GenSummary> {
    const t0 = Date.now();
    const deadline = opts.deadline ?? t0 + 45_000;
    const out: Record<string, GenOutcome> = {};
    const reasons: Record<string, string[]> = {};
    const detail: NonNullable<GenSummary['detail']> = {};
    const uniq = [...new Set(tickers.map((t) => String(t || '').toUpperCase()).filter(Boolean))];
    if (aiLineOff()) { uniq.forEach((t) => { out[t] = 'off'; }); return { asked: uniq.length, out, reasons, ms: 0 }; }

    const { lines, failed, off } = await readLines(uniq);
    if (off) { uniq.forEach((t) => { out[t] = 'off'; }); return { asked: uniq.length, out, reasons, ms: Date.now() - t0 }; }
    const locks = await mgetFromCache<any>(uniq.map(lockKey)).catch(() => uniq.map(() => null));
    const todo: string[] = [];
    uniq.forEach((t, i) => {
        if (locks[i]) { out[t] = 'locked'; return; }
        if (failed.has(t) && !opts.force) { out[t] = 'cooling'; return; }
        todo.push(t);
    });
    if (!todo.length) return { asked: uniq.length, out, reasons, ms: Date.now() - t0 };
    await Promise.all(todo.map((t) => setInCache(lockKey(t), { at: Date.now() }, LOCK_SEC).catch(() => false)));

    // 화면이 이미 쓰는 캐시만 읽는다. 이 경로에서 뉴스/캘린더를 새로 만들지 않는다.
    const evidenceValues = await mgetFromCache<any>(['guardian:news:digest:v2', 'fmp:econ-calendar', 'market:earnings-calendar:v4']).catch(() => []);
    const evidence = cachedEvidence(evidenceValues[0], evidenceValues[1], evidenceValues[2], new Date(Date.now()));
    const contextFor = (t: string) => [
        ...evidence.stockNews.filter(n => newsForStock(n, t)).slice(0, 6).map(n => n.text),
        ...evidence.stockEvents.filter(e => e.ticker === t).map(e => e.text),
        ...evidence.marketEvents.map(e => `MARKET CONTEXT ONLY (not company evidence): ${e}`),
    ];
    const contextHashFor = (t: string) => createHash('sha256').update(WL_LINE_SYSTEM).update(JSON.stringify(contextFor(t))).digest('hex');
    const batchTodo: string[] = [];
    for (const t of todo) {
        const saved = lines[t];
        // 지형 변경 힌트가 없는 정기 확인은 기존 뉴스/일정 캐시만 비교한다.
        // 가격·포지셔닝은 종전처럼 지형 변경 힌트 또는 크론이 들어올 때 배치로 다시 확인한다.
        if (!opts.force && opts.cachedContextOnly?.includes(t) && saved?.revision === 2 && saved.inputHash && saved.cachedContextHash === contextHashFor(t) && WL_LINE_LOCALES.every(loc => entryOf(saved, loc))) {
            await setInCache(lineKey(t), { ...saved, checkedAt: Date.now() }, WL_AI_TTL_SEC);
            out[t] = 'fresh';
        } else batchTodo.push(t);
    }
    for (let c = 0; c < batchTodo.length && Date.now() < deadline; c += BATCH_CHUNK) {
        const chunk = batchTodo.slice(c, c + BATCH_CHUNK);
        let rows: Record<string, any> = {};
        try {
            const payload = await processWatchlistBatch(chunk, 'price');
            for (const r of (payload?.results || []) as any[]) if (r?.ticker && r.realtime) rows[String(r.ticker).toUpperCase()] = r.realtime;
        } catch (e) {
            chunk.forEach((t) => { out[t] = 'error'; reasons[t] = [`batch:${String((e as Error)?.message || e).slice(0, 80)}`]; });
            continue;
        }
        const work: LineFacts[] = [];
        for (const t of chunk) {
            const f = buildLineFacts(t, rows[t]);
            if (!f) {
                out[t] = 'nodata';
                await setInCache(failKey(t), { at: Date.now(), why: ['nodata'] }, FAIL_SEC).catch(() => false);
                continue;
            }
            f.contextText = [
                ...contextFor(t),
                f.darkPool ? `FINRA off-exchange share on ${f.darkPool.date}: ${f.darkPool.pct}% (not net buying)` : '',
                f.implied ? `Options implied move to ${f.implied.expiry}: ±${f.implied.pct}% (not a forecast)` : '',
            ].filter(Boolean).join('\n');
            if (!opts.force && lines[t]?.revision === 2 && lines[t]?.inputHash === inputHashOf(f) && storedMatchesFacts(lines[t], f)) {
                // 15분은 입력 재확인 주기다. 같은 입력으로 모델을 다시 부르지 않는다.
                await setInCache(lineKey(t), { ...lines[t]!, cachedContextHash: contextHashFor(t), checkedAt: Date.now() }, WL_AI_TTL_SEC);
                out[t] = 'fresh'; continue;
            }
            work.push(f);
        }
        await pool(work, GEN_CONCURRENCY, deadline, async (f) => {
            if (!(await reserveCall())) { out[f.ticker] = 'capped'; return; }
            const r = await generateOne(f, contextHashFor(f.ticker));
            out[f.ticker] = r.outcome;
            if (r.reasons?.length) reasons[f.ticker] = r.reasons;
            if (opts.detail) detail[f.ticker] = { facts: f.factsText, text: r.line?.text, ms: r.line?.ms, provider: r.line?.provider };
        });
    }
    return { asked: uniq.length, out, reasons, ms: Date.now() - t0, ...(opts.detail ? { detail } : {}) };
}
