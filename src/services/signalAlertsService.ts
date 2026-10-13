/**
 * «내 종목 이상 신호» — 운영 배선(저장소·읽기·AI·발송을 lib/signals/run 의 실행기에 꽂는다).
 *
 * 재료는 전부 저장소에 «이미 있는 값»(공급사 호출 0 — 소스에 벤더 클라이언트 import 가 없다는 것을 시험이 고정):
 *   · 기기·내 종목 사본   Upstash push:tokens:{token}.watchlist (푸시 토큰 레코드)
 *   · 레벨 교차·맥스페인  EC2 structure:v2:{T}(+ lastgood) — 구조 굽기가 하루 5번 구워 두는 판본
 *   · 맥스페인 이력       DynamoDB signum-flow-history (structure-build 행 · 종목당 하루 1번만 읽어 캐시)
 *   · 다크풀              EC2 finra:offexchange (services/darkPool.getDarkPoolBatchChecked — 앱 칩이 읽는 그 읽기)
 *   · OI                  EC2 intrinio:options:eod 묶음 (services/todayPicksService.loadBundle)
 *   · 실적 D-1            lib/earningsConfirmed(회사 공지) + services/impliedMoveService.readImpliedMoveRows(읽기 전용)
 *   · AI 한 줄            크레딧 Haiku 5.5 만(withFreshTier — 크레딧이 안 되면 AWS 로 넘기지 않고 줄 없이 보낸다)
 * 끄는 법(재배포 없이): GET /api/cron/signal-alerts?mode=off (Bearer CRON_SECRET) → Redis push:sig:mode='off'. 환경변수 WL_SIGNALS_MODE=off 도 같다(재배포 필요).
 * 모드: off | dry(기본 — 탐지·상태 기록만, 보내지 않음) | live(보냄).
 */
import 'server-only';
import { Redis } from '@upstash/redis';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';
import { getDarkPoolBatchChecked } from '@/services/darkPool';
import { loadBundle } from '@/services/todayPicksService';
import { readImpliedMoveRows } from '@/services/impliedMoveService';
import { callBedrock } from '@/services/bedrockClient';
import { withFreshTier, isFreshTierSkipped } from '@/lib/ai/freshTier';
import { buildSignalUserPrompt, checkSignalWhy, sigSystemFor, SIG_PURPOSE } from '@/lib/ai/signalLine';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { isEtf } from '@/lib/seo/etfSet';
import { getDynamoClient, TABLES } from '@/lib/aws/dynamoClient';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { etDateOf } from '@/lib/marketCalendar';
import { freshestStored, maxPainDivergenceP90, type DarkRow, type EarnEntry } from '@/lib/signals/detect';
import { shiftCalendarDay } from '@/lib/signals/calendar';
import { SIG_KEYS, SIG_KV } from '@/lib/signals/plan';
import {
    runSignals, type AiLineResult, type OptionsBundle, type RunOpts, type SigAi, type SigDeps, type SigKv, type SigMode, type SigReaders, type SigStore, type SignalReport,
} from '@/lib/signals/run';
import type { DetectedSignal, LocText } from '@/lib/signals/types';

// ── 저장소 어댑터 ─────────────────────────────────────────────────────────────────

export function upstashStore(redis: Redis = Redis.fromEnv()): SigStore {
    return {
        smembers: async (k) => ((await redis.smembers(k)) as string[]) || [],
        mget: async (keys) => (keys.length ? ((await redis.mget(...keys)) as unknown[]) : []),
        get: (k) => redis.get(k),
        setNx: async (k, v, ex) => (await redis.set(k, v, { nx: true, ex })) === 'OK',
        set: async (k, v, ex) => { if (ex) await redis.set(k, v, { ex }); else await redis.set(k, v); },
        incr: async (k, ex) => { const r = await redis.pipeline().incr(k).expire(k, ex).exec(); return Number(r?.[0]) || 0; },
        decr: (k) => redis.decr(k),
        del: async (keys) => { if (keys.length) await redis.del(...keys); },
        srem: async (k, members) => { if (members.length) await redis.srem(k, ...members); },
    };
}

export const ec2Kv: SigKv = {
    get: <T,>(k: string) => getFromCache<T>(k),
    mget: <T,>(keys: string[]) => mgetFromCache<T>(keys),
    set: async (k, v, ttl) => { await setInCache(k, v, ttl); },
};

// ── 읽기 ───────────────────────────────────────────────────────────────────────

const STRUCT_KEY = (t: string) => `structure:v2:${t}`;
const STRUCT_LASTGOOD = (t: string) => `structure:lastgood:${t}:auto`;

async function readStructure(tickers: string[]): Promise<Map<string, { data?: any; timestamp?: number } | null>> {
    const out = new Map<string, { data?: any; timestamp?: number } | null>();
    const chunks: string[][] = [];
    for (let i = 0; i < tickers.length; i += 40) chunks.push(tickers.slice(i, i + 40));
    let next = 0;
    const worker = async () => {
        while (next < chunks.length) {
            const part = chunks[next++];
            const keys = [...part.map(STRUCT_KEY), ...part.map(STRUCT_LASTGOOD)];
            const vals = await mgetFromCache<{ data: any; timestamp: number }>(keys).catch(() => keys.map(() => null));
            part.forEach((t, i) => out.set(t, freshestStored(vals[i], vals[part.length + i])));
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));
    return out;
}

/** 이 종목의 최근 20거래일 맥스페인 괴리 분포 — 종목당 하루 1번만 DynamoDB 를 읽고 EC2 에 캐시한다(없음도 캐시) */
async function readMaxPainStats(ticker: string, today: string): Promise<{ p90: number; n: number } | null> {
    const ck = SIG_KV.mps(ticker, today);
    const cached = await getFromCache<{ p90?: number; n?: number; none?: boolean }>(ck).catch(() => null);
    if (cached) return cached.none || !(cached.p90 && cached.n) ? null : { p90: cached.p90, n: cached.n };
    const db = getDynamoClient();
    if (!db) return null;
    const since = Date.parse(`${shiftCalendarDay(today, -32)}T00:00:00Z`);
    const rows: Array<{ session: string; price: number | null; maxPain: number | null }> = [];
    let startKey: Record<string, any> | undefined;
    let pages = 0;
    try {
        do {
            const res: any = await db.send(new QueryCommand({
                TableName: TABLES.FLOW_HISTORY,
                KeyConditionExpression: 'ticker = :t AND #ts > :since',
                // 같은 표에 다른 모양의 행(수집 Lambda·다른 정의)이 섞여 있다 — 구조 굽기 행만
                FilterExpression: '#src = :sb',
                ProjectionExpression: '#ts, maxPain, price',
                ExpressionAttributeNames: { '#ts': 'timestamp', '#src': '_source' },
                ExpressionAttributeValues: { ':t': ticker, ':since': since, ':sb': 'structure-build' },
                ...(startKey ? { ExclusiveStartKey: startKey } : {}),
            }));
            for (const it of res.Items ?? []) {
                const ts = Number(it.timestamp);
                if (!Number.isFinite(ts)) continue;
                rows.push({ session: etDateOf(ts), price: Number(it.price) || null, maxPain: Number(it.maxPain) || null });
            }
            startKey = res.LastEvaluatedKey;
        } while (startKey && ++pages < 10);
    } catch {
        return null;     // 읽기 실패는 캐시하지 않는다(다음 실행이 다시)
    }
    const st = maxPainDivergenceP90(rows, today);
    await setInCache(ck, st ? { p90: st.p90, n: st.n } : { none: true }, 36 * 3600).catch(() => false);
    return st;
}

export const prodReaders: SigReaders = {
    structure: readStructure,
    maxPainStats: readMaxPainStats,
    async darkRows(tickers) {
        const r = await getDarkPoolBatchChecked(tickers);
        if (!r.ok) return { ok: false, rows: new Map<string, DarkRow>() };
        const rows = new Map<string, DarkRow>();
        for (const [t, d] of Object.entries(r.map)) {
            rows.set(t, { ticker: t, pct: d.pct, volume: d.volume, volRatio: d.volRatio, volP: d.volP, date: d.date, marketAvg: d.marketAvg });
        }
        return { ok: true, rows };
    },
    async optionsBundle(): Promise<OptionsBundle | null> {
        return (await loadBundle()) as OptionsBundle | null;
    },
    async earningsOn(date, tickers): Promise<EarnEntry[]> {
        const want = new Set(tickers);
        return CONFIRMED_EARNINGS.filter((e) => e.date === date && want.has(e.ticker)).map((e) => ({ ticker: e.ticker, date: e.date, hour: e.hour === 'bmo' || e.hour === 'amc' ? e.hour : '', etTime: e.etTime ?? null }));
    },
    async implied(entries, today) {
        const rows = await readImpliedMoveRows(entries.map((e) => ({ ticker: e.ticker, after: e.date, timing: e.hour === 'bmo' ? 'bmo' as const : e.hour === 'amc' ? 'amc' as const : 'unknown' as const })), today);
        const out = new Map<string, { pct: number | null; expiry: string | null }>();
        rows.forEach((r) => out.set(r.ticker, { pct: r.impliedMovePct, expiry: r.expiry }));
        return out;
    },
    isEtf,
};

// ── AI 한 줄 ───────────────────────────────────────────────────────────────────

export function aiDailyCap(): number {
    const n = Number(process.env.WL_SIGNALS_AI_DAILY_CAP);
    return Number.isFinite(n) && n >= 0 ? n : 120;
}

let dayChain: Promise<unknown> = Promise.resolve();
/** 하루 AI 호출 상한 안이면 한 번을 «예약»한다(인스턴스 안에서는 줄을 세운다 — 상한은 비용 안전망이지 정확한 계량기가 아니다) */
function reserveCall(etDate: string): Promise<boolean> {
    const p = dayChain.then(async () => {
        const k = SIG_KV.aiDay(etDate);
        const cur = Number(await getFromCache<number>(k).catch(() => 0)) || 0;
        if (cur >= aiDailyCap()) return false;
        await setInCache(k, cur + 1, 3 * 24 * 3600).catch(() => false);
        return true;
    });
    dayChain = p.catch(() => undefined);
    return p;
}

interface CachedAi { text?: LocText; reason?: string }

export const prodAi: SigAi = {
    async line(sig: DetectedSignal, etDate: string): Promise<AiLineResult> {
        const t0 = Date.now();
        const ck = SIG_KV.ai(sig.event, sig.ticker, sig.key);
        const hit = await getFromCache<CachedAi>(ck).catch(() => null);
        if (hit) return { text: hit.text ?? null, reason: hit.text ? 'cache' : `cache-none:${hit.reason ?? ''}`, cached: true, ms: Date.now() - t0 };
        if (!(await reserveCall(etDate))) return { text: null, reason: 'capped', cached: false, ms: 0 };
        const year = Number(etDate.slice(0, 4));
        let lastReasons: string[] = [];
        try {
            const res = await withFreshTier(() => callBedrock({
                system: sigSystemFor(sig.facts),
                userPrompt: buildSignalUserPrompt(sig.ticker, sig.facts, etDate),
                maxTokens: 400,
                temperature: 0.2,
                timeoutMs: 15_000,
                label: SIG_PURPOSE,
                purpose: SIG_PURPOSE,
                expectJson: true,
                locale: 'multi',
                validate: (text: string) => { const r = checkSignalWhy(text, sig.ticker, sig.facts, year, etDate); lastReasons = r.reasons; return { ok: r.ok, reasons: r.reasons }; },
            }));
            const chk = checkSignalWhy(res.text, sig.ticker, sig.facts, year, etDate);
            if (!chk.ok || !chk.text) {
                await setInCache(ck, { reason: `guard:${(chk.reasons[0] || '').slice(0, 50)}` }, 3 * 3600).catch(() => false);
                return { text: null, reason: `guard:${(chk.reasons[0] || '').slice(0, 50)}`, cached: false, ms: Date.now() - t0 };
            }
            await setInCache(ck, { text: chk.text }, 3 * 24 * 3600).catch(() => false);
            return { text: chk.text, reason: 'ai', cached: false, ms: Date.now() - t0 };
        } catch (e) {
            if (isFreshTierSkipped(e)) return { text: null, reason: lastReasons.length ? `guard:${lastReasons[0].slice(0, 50)}` : 'credit-skip', cached: false, ms: Date.now() - t0 };
            return { text: null, reason: `error:${String((e as Error)?.message || e).slice(0, 60)}`, cached: false, ms: Date.now() - t0 };
        }
    },
};

// ── 조립 ───────────────────────────────────────────────────────────────────────

export function envMode(): SigMode | null {
    const v = (process.env.WL_SIGNALS_MODE || '').trim().toLowerCase();
    return v === 'off' || v === 'dry' || v === 'live' ? v : null;
}

export function prodDeps(): SigDeps {
    return { store: upstashStore(), kv: ec2Kv, readers: prodReaders, ai: prodAi, sender: { send: sendSignalPushes } };
}

export async function runSignalAlerts(o: Omit<RunOpts, 'now' | 'envMode'> & { now?: number }): Promise<SignalReport> {
    return runSignals(prodDeps(), { ...o, now: o.now ?? Date.now(), envMode: envMode() });
}

/** 모드 바꾸기 — 키 하나(Upstash push:sig:mode). dry 는 키를 지운다(기본값) */
export async function setSignalMode(mode: SigMode): Promise<void> {
    const store = upstashStore();
    if (mode === 'dry') await store.del([SIG_KEYS.mode]);
    else await store.set(SIG_KEYS.mode, mode);
}

export async function readSignalMode(): Promise<{ env: SigMode | null; redis: string | null }> {
    const store = upstashStore();
    const v = await store.get(SIG_KEYS.mode).catch(() => null);
    return { env: envMode(), redis: typeof v === 'string' ? v : null };
}
