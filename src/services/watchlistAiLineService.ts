import { WL_V3_SYSTEM, buildWatchlistV3Prompt, checkWatchlistV3Output, checkWatchlistV3Insight, factChips } from '@/lib/ai/watchlistV3';
import { quoteSessionLive, quoteSessionValidUntil } from '@/lib/ai/watchlistStockFacts';
import { cachedEvidence } from '@/lib/ai/tacticalPrompt';
import { evidenceValidUntil } from '@/lib/ai/evidenceTime';
import { newsForStock } from '@/lib/ai/stockEvidence';
import { createHash } from 'node:crypto';
import { checkDepthLine, flowSummary, rankStockContext, type StockContextInput } from '@/lib/ai/watchlistDepth';
import { readSessionArchiveMany } from '@/lib/sessionArchive';
import { textIntegrityReasons } from '@/lib/ai/textIntegrity';
/**
 * «내 종목» AI 한 줄 — 저장·읽기·생성 (서버). 글은 «종목 단위»로 한 번 만들고 모든 사용자가 같이 읽는다(사용자 수와 무관한 비용).
 *
 *   읽기  GET /api/watchlist/ai-line  → readLines (EC2 레디스 mget 한 번 · AI 호출 없음 · 기다리지 않는다)
 *   생성  응답 «뒤»(after) 또는 장전 크론 → generateLines
 *         재료: processWatchlistBatch(종목, 'price') — 앱 «내 종목»이 레벨을 읽는 그 묶음 응답(새 데이터 없음)
 *         모델: 사다리 ① Anthropic 크레딧 Haiku 5.5 만(withFreshTier — 크레딧이 안 되면 AWS 로 넘기지 않고 «건너뜀», 옛 글 유지)
 *         가드: lib/ai/watchlistV3.checkWatchlistV3Output(사다리 validate 와 저장 직전 두 번)
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
import { buildLineFacts, checkLineOutput, lineLocaleReasons, WL_LINE_LOCALES, WL_LINE_PURPOSE, type LineFacts } from '@/lib/ai/watchlistLine';
import { aiLineState, type AiLineEntry, type AiLineLevels, type AiLevelKey, type AiLineLocale, type AiSide } from '@/lib/app/watchlistAiLine';
import { etDateOf } from '@/lib/marketCalendar';

export const WL_AI_TTL_SEC = 36 * 3600;
const LOCK_SEC = 120;
const FAIL_SEC = 30 * 60;
const SKIP_SEC = 5 * 60;            // 크레딧 불가(건너뜀) — 짧게 쉰다
/** 화면이 «지형이 바뀌었다»고 알려도 이보다 최근에 만든 글이면 다시 만들지 않는다(가격이 레벨 언저리에서 오갈 때 되먹임 방지) */
export const WL_AI_REGEN_MIN_AGE_MS = 10 * 60_000;
const GEN_CONCURRENCY = 4;
/** 같은 입력인데 해석이 내려간 저장본(세션 경계·근거 기한) — 이 시간 안에는 같은 입력으로 다시 부르지 않는다 */
const SAME_INPUT_RETRY_MS = 30 * 60_000;
const BATCH_CHUNK = 30;              // 묶음 서비스: 30개 이하만 종목별 실시간 스냅샷(useWatchlistData BATCH_MAX 와 같다)

export const lineKey = (t: string) => `wlai:v2:${t}`;
export const legacyLineKey = (t: string) => `wlai:v1:${t}`;
const lockKey = (t: string) => `wlai:lock:${t}`;
export const failKey = (t: string) => `wlai:fail:v2:${t}`;
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
    insight?: Partial<Record<AiLineLocale, string>>;
    revision?: 2 | 3;
    facts?: LineFacts;
    source?: string;
    inputHash?: string;
    cachedContextHash?: string;
    checkedAt?: number;
    /** 해석 탈락 사유·원문(실측용 · entryOf 가 내보내지 않는다) */
    insightWhy?: string[];
    insightRaw?: Partial<Record<AiLineLocale, string>> | null;
    /** v3: 칩 줄을 사실 그대로의 칩 줄로 대신했다(실측용) */
    chipFallback?: boolean;
    /** 생성 지연(ms) · 응답한 단 — 실측용 */
    ms: number;
    provider?: string;
}

/**
 * 저장된 해석이 «지금» 내보낼 수 있는가 — 생성 때 근거(source)로 출구 검사 + 근거 속 예정 시각이 지나지 않았는지(evidenceTime 정본).
 * 08:29 에 «08:30 CPI 예정»으로 쓴 해석은 08:30 부터 나가지 않는다(관문 10/20 4차). 뉴스·일정 변화는 15분 확인의 해시가 잡는다.
 */
export function insightLiveAt(s: StoredLine, loc: AiLineLocale, nowMs: number): string | undefined {
    const candidate = s.insight?.[loc];
    if (!candidate || !s.source || (s.revision === 3 && !s.facts?.quote)) return undefined;
    // v3 해석은 세션 표현(«NVDA 장전 …»)으로 시작한다 — 세션이 바뀌면 내보내지 않는다(관문 10241926 ②)
    if (s.revision === 3 && !quoteSessionLive(s.facts!.quote, s.at, nowMs)) return undefined;
    if (nowMs >= evidenceValidUntil(s.source.split('\n'), s.at, { dayEnd: false })) return undefined;
    return (s.revision === 3 && s.facts ? checkWatchlistV3Insight(candidate, loc, s.facts, nowMs) : checkDepthLine(candidate, loc, s.source, nowMs)).length ? undefined : candidate;
}

export function entryOf(s: StoredLine | null | undefined, loc: AiLineLocale, nowMs: number = Date.now()): AiLineEntry | null {
    if (!s || s.v !== 1 || !s.text || typeof s.text[loc] !== 'string' || !s.text[loc]) return null;
    if (textIntegrityReasons(s.text[loc]).length || lineLocaleReasons(s.text[loc], loc).length) return null;
    const insight = insightLiveAt(s, loc, nowMs);
    const until = insight ? Math.min(evidenceValidUntil(s.source!.split('\n'), s.at, { dayEnd: false }), s.revision === 3 && s.facts?.quote ? quoteSessionValidUntil(s.facts.quote, s.at) : Infinity) : Infinity;
    return { text: s.text[loc], insight, ...(insight && Number.isFinite(until) ? { insightUntil: until } : {}), chain: s.chain, lv: s.lv, sides: s.sides, at: s.at };
}

/** 저장본에 해석이 있었는데 지금은 못 내보낸다(예정 시각 경과 등) — 다시 만들 대상. */
export function insightExpired(s: StoredLine | null | undefined, nowMs: number = Date.now()): boolean {
    if (s?.revision === 3) return WL_LINE_LOCALES.some(loc => !s.insight?.[loc] || !insightLiveAt(s, loc, nowMs));
    return !!s?.insight && WL_LINE_LOCALES.some(loc => !!s.insight?.[loc] && !insightLiveAt(s, loc, nowMs));
}

/**
 * 해석이 내려간 저장본을 «지금» 다시 확인할 때인가 — 기한이 지난 뒤 아직 확인한 적이 없으면 바로, 확인했으면 2분에 한 번.
 * (세션 경계에서 시세 원천의 세션이 늦게 넘어가면 같은 입력이 계속 들어온다 — 매 요청 배치를 부르지 않게)
 */
export function insightRecheckDue(s: StoredLine | null | undefined, nowMs: number = Date.now()): boolean {
    if (!s || !insightExpired(s, nowMs)) return false;
    const checked = s.checkedAt || s.at;
    const until = s.source ? Math.min(evidenceValidUntil(s.source.split('\n'), s.at, { dayEnd: false }), s.revision === 3 && s.facts?.quote ? quoteSessionValidUntil(s.facts.quote, s.at) : Infinity) : s.at;
    return checked < until || nowMs - checked >= 2 * 60_000;
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
    const keys = [OFF_KEY, ...tickers.map(lineKey), ...tickers.map(failKey), ...tickers.map(legacyLineKey)];
    const vals = await mgetFromCache<any>(keys).catch(() => keys.map(() => null));
    const off = !!vals[0];
    tickers.forEach((t, i) => {
        const current = vals[1 + i];
        // 옛 저장본은 복구용으로만 읽는다. 새 키로 승격하거나 현재 사실로 재검사하지 않는다.
        const v = current?.revision === 3 && WL_LINE_LOCALES.every(loc => entryOf(current, loc)) ? current : vals[1 + tickers.length * 2 + i] || current;
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

export type GenOutcome = 'generated' | 'fresh' | 'nodata' | 'guard' | 'skipped' | 'error' | 'locked' | 'cooling' | 'capped' | 'off' | 'session-lag';
/** 모델 입력 그대로의 해시 — 시세 가격·등락·수집 시각은 입력에 없다(세션·지형·근거가 바뀔 때만 다시 만든다 = 옛 판과 같은 호출 수 + 세션 전환). */
export const inputHashOf = (f: LineFacts) => createHash('sha256').update(WL_V3_SYSTEM).update('\0').update(buildWatchlistV3Prompt(f)).digest('hex');

/** 한 종목 생성 — 사실이 이미 있을 때. 저장까지. */
export async function generateOne(f: LineFacts, cachedContextHash?: string, prev?: StoredLine | null): Promise<{ outcome: GenOutcome; line?: StoredLine; reasons?: string[] }> {
    const t0 = Date.now();
    let last: string[] = [];
    /**
     * 해석이 검사를 못 넘었을 때 — 지금 지형에 맞는 저장본(prev)이 있으면 그대로 둔다(정상본 보존).
     * 없으면(첫 생성·체인/쪽이 바뀌어 화면이 옛 줄을 그리지 않는 경우) 사실 그대로의 칩 줄만 저장한다 — 지도 설명은 늘 최신, 해석은 30분 뒤 다시.
     */
    const chipsOnly = async (why: string[], provider?: string): Promise<StoredLine | null> => {
        if (prev && storedMatchesFacts(prev, f)) return null;
        const d = checkLineOutput(JSON.stringify(factChips(f)), f);
        if (!d.ok || !d.text) return null;
        const line: StoredLine = { v: 1, t: f.ticker, at: Date.now(), chain: f.chain, lv: f.lv, sides: f.sides, spot: f.spot, text: d.text, insightWhy: why.slice(0, 8), revision: 3, chipFallback: true, facts: f, source: buildWatchlistV3Prompt(f), inputHash: inputHashOf(f), cachedContextHash, checkedAt: Date.now(), ms: Date.now() - t0, provider };
        return (await setInCache(lineKey(f.ticker), line, WL_AI_TTL_SEC)) === false ? null : line;
    };
    try {
        const res = await withFreshTier(() => callBedrock({
            system: WL_V3_SYSTEM,
            userPrompt: buildWatchlistV3Prompt(f),
            maxTokens: 700,
            temperature: 0.2,
            timeoutMs: 15_000,
            label: WL_LINE_PURPOSE,
            purpose: WL_LINE_PURPOSE,
            expectJson: true,
            locale: 'multi',
            validate: (text: string) => { const c = checkWatchlistV3Output(text, f); last = c.reasons; return { ok: c.ok, reasons: c.reasons }; },
        }));
        const c = checkWatchlistV3Output(res.text, f);
        if (!c.ok || !c.text) {
            await setInCache(failKey(f.ticker), { at: Date.now(), why: c.reasons.slice(0, 6) }, FAIL_SEC).catch(() => false);
            const line = await chipsOnly(c.reasons, res.provider);
            return { outcome: 'guard', reasons: c.reasons, ...(line ? { line } : {}) };
        }
        const dup = await dropDuplicateInsights(f.ticker, c.insight);
        if (dup.length) {
            await setInCache(failKey(f.ticker), { at: Date.now(), why: dup.reasons }, FAIL_SEC).catch(() => false);
            const line = await chipsOnly(dup.reasons, res.provider);
            return { outcome: 'guard', reasons: dup.reasons, ...(line ? { line } : {}) };
        }
        const line: StoredLine = {
            v: 1, t: f.ticker, at: Date.now(), chain: f.chain, lv: f.lv, sides: f.sides, spot: f.spot,
            text: c.text, insight: c.insight, ...(c.insightReasons?.length ? { insightWhy: c.insightReasons.slice(0, 8), insightRaw: c.insightRaw ?? null } : {}), revision: 3, ...(c.chipFallback ? { chipFallback: true } : {}), facts: f, source: buildWatchlistV3Prompt(f), inputHash: inputHashOf(f), cachedContextHash, checkedAt: Date.now(), ms: Date.now() - t0, provider: res.provider,
        };
        const saved = await setInCache(lineKey(f.ticker), line, WL_AI_TTL_SEC);
        if (saved === false) return { outcome: 'error', reasons: ['cache-write'] };
        await setInCache(failKey(f.ticker), null, 1).catch(() => false);
        return { outcome: 'generated', line };
    } catch (e) {
        if (isFreshTierSkipped(e)) {
            // 크레딧 불가(상한·차단기·킬 스위치) 또는 가드를 두 번 못 넘음 — 옛 글은 그대로 두고 잠시 쉰다
            const guard = last.length > 0;
            await setInCache(failKey(f.ticker), { at: Date.now(), why: guard ? last.slice(0, 6) : ['credit-skip'] }, guard ? FAIL_SEC : SKIP_SEC).catch(() => false);
            const line = guard ? await chipsOnly(last) : null;
            return { outcome: guard ? 'guard' : 'skipped', reasons: guard ? last : ['credit-skip'], ...(line ? { line } : {}) };
        }
        await setInCache(failKey(f.ticker), { at: Date.now(), why: ['error'] }, SKIP_SEC).catch(() => false);
        return { outcome: 'error', reasons: [String((e as Error)?.message || e).slice(0, 120)] };
    }
}

/** 내부자 «장내 매수»(SEC Form 4 코드 P) — 랭킹이 만든 캐시가 있을 때만(1시간 TTL · 이 경로에서 새로 부르지 않는다) */
export const INSIDER_CACHE_KEY = 'ranking:insider:v1:4';
export function insiderLineFor(t: string, buys: any[], nowMs: number): string | null {
    const today = etDateOf(nowMs);
    const hit = buys.filter(b => b?.ticker === t && typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date <= today
        && (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`)) <= 7 * 86_400_000)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!hit) return null;
    const role = String(hit.role || '').replace(/[^A-Za-z ,&.-]/g, '').trim().slice(0, 40) || 'insider';
    return `[insider filing; ${hit.date}] ${t} ${role} open-market purchase (SEC Form 4 code P; an observation, not a forecast)`;
}

/**
 * 같은 날 다른 종목과 «같은 해석»이면 후보를 거절한다. 일부 언어만 정상본에 덮어쓰지 않는다.
 * 키 wlai:ins:v2:{ET 날짜} = {정규화 문장: 종목}. 한 인스턴스 안에서는 줄을 세운다(인스턴스 사이는 근사).
 */
const insKey = (d: string) => `wlai:ins:v2:${d}`;
let insChain: Promise<unknown> = Promise.resolve();
export function dropDuplicateInsights(ticker: string, insight: Partial<Record<AiLineLocale, string>> | undefined):
    Promise<{ length: number; kept: Partial<Record<AiLineLocale, string>> | undefined; reasons: string[] }> {
    const p = insChain.then(async () => {
        if (!insight || !Object.keys(insight).length) return { length: 0, kept: insight, reasons: [] };
        const k = insKey(etDateOf(Date.now()));
        const seen: Record<string, string> = (await getFromCache<Record<string, string>>(k).catch(() => null)) || {};
        const draft = { ...seen };
        const { kept, reasons } = dedupeInsights(ticker, insight, draft);
        if (reasons.length) return { length: reasons.length, kept: undefined, reasons };
        await setInCache(k, draft, 30 * 3600).catch(() => false);
        return { length: reasons.length, kept, reasons };
    });
    insChain = p.catch(() => undefined);
    return p;
}

/** 순수 — seen(정규화 문장→종목)을 갱신하고, 다른 종목이 이미 쓴 문장은 뺀다 */
export function dedupeInsights(ticker: string, insight: Partial<Record<AiLineLocale, string>>, seen: Record<string, string>):
    { kept: Partial<Record<AiLineLocale, string>> | undefined; reasons: string[] } {
    // 숫자·기호를 지운 «틀»로 비교 — «예상 변동 ±3.1%가 음감마…»와 «±2.2%가 음감마…»는 같은 일반론이다(10/21 실제 모델 NVDA·AAPL)
    const norm = (x: string) => x.replace(/^[A-Z][A-Z0-9.]{0,6}(?:(?:은|는|이|가|は|が)\s*|\s+)/, '').replace(/[\s.,、。·!?！？±+\-−$%\d]/g, '').toLowerCase();
    const kept: Partial<Record<AiLineLocale, string>> = {};
    const reasons: string[] = [];
    for (const [loc, text] of Object.entries(insight) as Array<[AiLineLocale, string]>) {
        const owner = seen[norm(text)];
        if (owner && owner !== ticker) { reasons.push(`${loc}:insight:duplicate:${owner}`); continue; }
        kept[loc] = text;
    }
    for (const text of Object.values(kept)) if (text) seen[norm(text)] = ticker;
    // 하루 키 크기 상한(먼저 들어온 것부터 덜어 낸다 — 읽기·쓰기 한 번씩이 무거워지지 않게)
    const keys = Object.keys(seen);
    for (let i = 0; i < keys.length - 1500; i++) delete seen[keys[i]];
    return { kept: Object.keys(kept).length ? kept : undefined, reasons };
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

    // 화면이 이미 쓰는 캐시만 읽는다. 이 경로에서 뉴스/캘린더/흐름/내부자를 새로 만들지 않는다(공급사 호출 0).
    //   근거 우선순위(watchlistDepth.rankStockContext): ① 실적 D-5 ② 종목 뉴스 ③ 옵션 흐름(고래 마감 집계 보관본) ④ 내부자(랭킹 캐시) ⑤ 감마·맥스페인
    const evidenceValues = await mgetFromCache<any>(['guardian:news:digest:v2', 'fmp:econ-calendar', 'market:earnings-calendar:v4', INSIDER_CACHE_KEY]).catch(() => []);
    const evidence = cachedEvidence(evidenceValues[0], evidenceValues[1], evidenceValues[2], new Date(Date.now()), { stockDays: 5 });
    const flows = await readSessionArchiveMany<any>('whale', todo, { lookback: 1 }).catch(() => new Map());
    const insiderBuys: any[] = Array.isArray(evidenceValues[3]?.buys) ? evidenceValues[3].buys : [];
    const stockInput = (t: string): StockContextInput => ({
        ticker: t,
        earnings: evidence.stockEvents.filter(e => e.ticker === t).map(e => e.text),
        news: evidence.stockNews.filter(n => newsForStock(n, t)).slice(0, 6).map(n => n.text),
        flow: flowSummary(t, flows.get(t)?.value),
        insider: insiderLineFor(t, insiderBuys, Date.now()),
    });
    const contextFor = (t: string) => { const i = stockInput(t); return [...i.earnings, ...i.news, i.flow?.line ?? '', i.insider ?? ''].filter(Boolean); };
    // 시장 전체 일정은 넣지 않는다 — 종목 근거가 아니고, 일정이 지날 때마다 모든 종목을 다시 만들게 된다(호출 수).
    const contextHashFor = (t: string) => createHash('sha256').update(WL_V3_SYSTEM).update(JSON.stringify(contextFor(t))).digest('hex');
    const batchTodo: string[] = [];
    for (const t of todo) {
        const saved = lines[t];
        // 지형 변경 힌트가 없는 정기 확인은 기존 뉴스/일정 캐시만 비교한다(옛 판과 같다 — 배치 호출 0).
        // v3 는 세션 표현이 있으므로 세션이 아직 맞을 때만(insightExpired 가 세션 경과를 본다). 세션이 바뀌었으면 배치로 다시 확인한다.
        if (!opts.force && opts.cachedContextOnly?.includes(t) && saved?.revision === 3 && saved.inputHash && saved.cachedContextHash === contextHashFor(t) && !insightExpired(saved) && WL_LINE_LOCALES.every(loc => entryOf(saved, loc))) {
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
            const ranked = rankStockContext({ ...stockInput(t), darkPool: f.darkPool, implied: f.implied }, Date.now());
            f.contextText = ranked.lines.join('\n');
            f.topLine = ranked.topLine;
            // 같은 입력이면 모델을 다시 불러도 같은 글이다 — 세션 경계에서 시세 원천(행의 session)이 시계보다 늦게 넘어가도
            // 매 요청 재생성하지 않게, 해석이 내려간 저장본도 30분 안이면 그대로 둔다(행의 세션이 바뀌면 입력이 바뀌어 다시 만든다).
            const savedT = lines[t];
            if (!opts.force && savedT?.revision === 3 && savedT.inputHash === inputHashOf(f) && storedMatchesFacts(savedT, f) && (!insightExpired(savedT) || Date.now() - savedT.at < SAME_INPUT_RETRY_MS)) {
                // 15분은 입력 재확인 주기다. 같은 입력으로 모델을 다시 부르지 않는다.
                await setInCache(lineKey(t), { ...lines[t]!, cachedContextHash: contextHashFor(t), checkedAt: Date.now() }, WL_AI_TTL_SEC);
                out[t] = 'fresh'; continue;
            }
            // 행의 세션이 시계와 안 맞으면(09:30 이 지났는데 아직 'pre' — 시세 원천의 전환 지연) 만들자마자 기한이 지난 글이 된다 → 부르지 않는다(다음 확인에서)
            const nowT = Date.now();
            if (!quoteSessionLive(f.quote, nowT, nowT)) { out[t] = 'session-lag'; continue; }
            work.push(f);
        }
        await pool(work, GEN_CONCURRENCY, deadline, async (f) => {
            if (!(await reserveCall())) { out[f.ticker] = 'capped'; return; }
            const r = await generateOne(f, contextHashFor(f.ticker), lines[f.ticker]);
            out[f.ticker] = r.outcome;
            if (r.reasons?.length) reasons[f.ticker] = r.reasons;
            if (opts.detail) detail[f.ticker] = { facts: f.factsText, text: r.line?.text, ms: r.line?.ms, provider: r.line?.provider };
        });
    }
    return { asked: uniq.length, out, reasons, ms: Date.now() - t0, ...(opts.detail ? { detail } : {}) };
}
