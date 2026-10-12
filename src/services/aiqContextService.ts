/**
 * aiq55 — AI 분석 입력 보강의 «읽기» 층(서버). 사실은 lib/ai/aiqContext(순수)가 만든다. 여기는 읽기와 끄기 스위치뿐이다.
 *
 *   원천(모두 읽기 전용 · 벤더 호출 0 · Redis 쓰기 0):
 *     · 옵션 구조 사본 structure:v2:{T} (+ 옛 lastgood) → 체인 날짜 · 만기 · Max Pain · 옵션이 반영한 변동폭(lib/impliedMove 정의 한 벌)
 *     · FINRA 장외 비중 → 앱 칩이 읽는 /api/flow/dark-pool?t= (CDN 15분)  ※ 호출자가 이미 읽은 행을 주면 읽지 않는다
 *     · 13F → cache:13f:cusip:{CUSIP} (SEC Form 13F Data Sets 색인; 소표본이면 버린다)
 *     · 랭킹 → ranking:v9:all:30:5 (app-warm 이 굽는 사본)
 *   실패는 조용히 뺀다(보강 실패가 분석을 막으면 안 된다). 전체 예산 2.5초.
 *
 * 끄기(재배포 없이): Redis 키 aiq55:off 에 아무 값 → 새 입력·새 지시문·새 가드가 모두 빠지고 옛 동작으로 돌아간다(45초 안에 전 인스턴스).
 *   환경변수 AIQ55_OFF=1 (재배포 필요) 도 같다. 켜짐 확인: GET /api/admin/ai-ladder 응답과 별개로 키 하나만 본다.
 */
import { getFromCache, mgetFromCache } from '@/services/redisClient';
import { upstashStore } from '@/lib/ai/llmStore';
import { cusipForTicker, isPartialIndex } from '@/lib/holders13f';
import { etDateOf } from '@/lib/marketCalendar';
import { buildAiqFacts, type AiqFacts } from '@/lib/ai/aiqContext';

export const AIQ_OFF_KEY = 'aiq55:off';
export const AIQ_RANK_KEY = 'ranking:v9:all:30:5';
/** structureService.structureV2Key / structureLastGoodKey 와 같은 키(그 모듈은 무거워서 문자열만 복제 — tests/aiqContext.test.ts 가 일치를 고정한다) */
export const AIQ_STRUCTURE_V2 = (t: string) => `structure:v2:${t}`;
export const AIQ_STRUCTURE_LASTGOOD = (t: string) => `structure:lastgood:${t}:auto`;

const OFF_MEMO_MS = 45_000;
let offMemo: { at: number; v: boolean } | null = null;

export function _resetAiqMemoForTest(): void { offMemo = null; factsMemo.clear(); rankMemo = null; }

/** 새 입력을 끄는가 — 환경변수 또는 Redis 키(45초 인스턴스 메모). 읽기에 실패하면 «켜짐»으로 본다(저장소 장애가 개선을 끄지 않는다). */
export async function aiqOff(now = Date.now()): Promise<boolean> {
    if (process.env.AIQ55_OFF === '1') return true;
    if (offMemo && now - offMemo.at < OFF_MEMO_MS) return offMemo.v;
    let v = false;
    // Upstash 를 직접 읽는다(llm:ladder:off 와 같은 길) — getFromCache 는 EC2 의 «정상 null» 이면 Upstash 를 묻지 않아, 운영자가 Upstash 에 SET 한 스위치를 못 본다
    try { v = !!(await upstashStore.get(AIQ_OFF_KEY)); } catch { v = false; }
    offMemo = { at: now, v };
    return v;
}

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const t = setTimeout(() => resolve(fallback), ms);
        p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
    });
}

let rankMemo: { at: number; v: any } | null = null;
async function rankingBlob(): Promise<any | null> {
    const now = Date.now();
    if (rankMemo && now - rankMemo.at < 60_000) return rankMemo.v;
    const v = await getFromCache<any>(AIQ_RANK_KEY).catch(() => null);
    rankMemo = { at: now, v };
    return v;
}

async function structureOf(T: string, todayEt: string): Promise<{ chainDate: string | null; expiry: string | null; maxPain: number | null; callWall: number | null; putFloor: number | null; implied: any } | null> {
    const [fresh, last] = await mgetFromCache<{ data: any; timestamp: number }>([AIQ_STRUCTURE_V2(T), AIQ_STRUCTURE_LASTGOOD(T)]).catch(() => [null, null] as const);
    const cands = [fresh, last]
        .filter((v): v is { data: any; timestamp: number } => !!v?.data && !(typeof v.data.expiration === 'string' && v.data.expiration < todayEt))
        .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    const d = cands[0]?.data;
    if (!d) return null;
    return {
        chainDate: typeof d.chainDate === 'string' ? d.chainDate : null,
        expiry: typeof d.expiration === 'string' ? d.expiration : null,
        maxPain: typeof d.maxPain === 'number' ? d.maxPain : null,
        callWall: typeof d.levels?.callWall === 'number' ? d.levels.callWall : null,
        putFloor: typeof d.levels?.putFloor === 'number' ? d.levels.putFloor : null,
        implied: d.impliedMove ?? null,
    };
}

async function holdersOf(T: string): Promise<{ entry: any; partial: boolean } | null> {
    const cusip = cusipForTicker(T);
    if (!cusip) return null;
    const entry = await getFromCache<any>(`cache:13f:cusip:${cusip}`).catch(() => null);
    if (!entry || !Array.isArray(entry.holders) || !entry.holders.length) return null;
    return { entry, partial: isPartialIndex(entry) };
}

function publicOrigin(origin?: string): string {
    return /^https:\/\/(www\.)?signumhq\.com/.test(origin || '') ? (origin as string).replace('https://signumhq.com', 'https://www.signumhq.com') : (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.signumhq.com');
}

async function offExOf(T: string, origin?: string): Promise<any | null> {
    try {
        const r = await fetch(`${publicOrigin(origin)}/api/flow/dark-pool?t=${encodeURIComponent(T)}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (!r.ok) return null;
        const j: any = await r.json();
        return j?.available === true ? j : null;
    } catch { return null; }
}

export interface LoadOpts {
    origin?: string;
    /** 호출자가 이미 읽은 FINRA 행(예: UC fetchMoney 의 money) — 있으면 다시 읽지 않는다 */
    offEx?: unknown;
    /** 호출자가 이미 가진 다음 실적일(Flow·딥 분석) — 새 표면에는 주지 않는다(원천 캘린더가 FMP 우선) */
    earningsDate?: string | null;
    withHolders?: boolean;
    withRanks?: boolean;
    now?: number;
}

const factsMemo = new Map<string, { at: number; v: AiqFacts | null }>();
const FACTS_MEMO_MS = 90_000;

/** 한 종목의 새 입력 사실. 꺼져 있거나 아무것도 못 읽으면 null → 호출자는 옛 프롬프트 그대로. */
export async function loadAiqFacts(ticker: string, o: LoadOpts = {}): Promise<AiqFacts | null> {
    const now = o.now ?? Date.now();
    if (await aiqOff(now)) return null;
    const T = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!T) return null;
    const todayEt = etDateOf(now);
    const memoKey = `${T}|${o.withHolders ? 1 : 0}${o.withRanks ? 1 : 0}|${o.earningsDate ?? ''}|${o.offEx ? 'x' : ''}`;
    const hit = factsMemo.get(memoKey);
    if (hit && now - hit.at < FACTS_MEMO_MS) return hit.v;
    const [st, off, h, rk] = await Promise.all([
        within(structureOf(T, todayEt), 1800, null),
        o.offEx ? Promise.resolve(o.offEx) : within(offExOf(T, o.origin), 3200, null),
        o.withHolders ? within(holdersOf(T), 1800, null) : Promise.resolve(null),
        o.withRanks ? within(rankingBlob(), 1800, null) : Promise.resolve(null),
    ]);
    const facts = buildAiqFacts({
        ticker: T, todayEt,
        offEx: off, implied: st?.implied ?? null,
        levels: st ? { chainDate: st.chainDate, expiry: st.expiry, maxPain: st.maxPain, callWall: st.callWall, putFloor: st.putFloor } : null,
        earnings: o.earningsDate ? { date: o.earningsDate } : null,
        holders13f: h, rankings: rk,
    });
    if (factsMemo.size > 400) factsMemo.clear();
    factsMemo.set(memoKey, { at: now, v: facts });
    return facts;
}
