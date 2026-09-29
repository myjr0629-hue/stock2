/**
 * 알림 자료 제공자(운영) — 이미 있는 서비스만 다시 쓴다(새 벤더·새 계산 없음, 기획 §1-3).
 *
 *   5분 봉        intrinioClient.getIntradayAggregates   (종목당 벤더 1콜 — 실행기가 «레벨 근처 우선 + 상한»으로 고른다)
 *   레벨          structureService.getStructureData       (단일 출처 — 화면과 같은 함수·같은 캐시)
 *   맥스페인 분포  DynamoDB signum-flow-history 의 structure-build 행(같은 getStructureData 정의로 하루 5번 굽는 이력)
 *   장외 비중      darkPool.getDarkPoolWithSeries (FINRA 최신 + 25일 이력, EC2 Redis 2회·20초)
 *   고래 신규      institutionalFlow.getNewPositionsForTickers  (옵션 EOD 스냅샷 1회)
 *   실적 D-1      Redis market:earnings-calendar:v4 + FMP 하루치 1콜(유니버스 밖 종목) + Finnhub(발표 시각) +
 *                 실적 뒤 만기 체인(intrinioClient.getOptionChainSnapshotIntrinio) → alphaEngine.computeImpliedMovePct
 *                 ※ 옵션 가격은 «실시간 중간값»만(_rtGreeks 계약의 last_quote.midpoint). 전일 종가로 메우지 않는다
 *                   (메모리: chain-day-fields-are-eod-not-live) — 없으면 내재 변동을 싣지 않는다.
 *
 * 쿼터: callIntrinio 가 인스턴스당 동시 4·재시도·공유 응답 캐시를 이미 건다. 여기서는 동시성을 그 이하로 두고,
 *       실행기의 시간 예산(마감)이 지나면 새 호출을 시작하지 않는다.
 */
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getIntradayAggregates, getOptionChainSnapshotIntrinio } from '@/services/intrinioClient';
import { getStructureData } from '@/services/structureService';
import { getDarkPoolWithSeries } from '@/services/darkPool';
import { getNewPositionsForTickers } from '@/services/institutionalFlow';
import { getFromCache } from '@/services/redisClient';
import { getEarningsCalendar } from '@/services/finnhubClient';
import { computeImpliedMovePct } from '@/services/alphaEngine';
import { getDynamoClient, TABLES } from '@/lib/aws/dynamoClient';
import { etDateOf, etMinutesOf, isTradingDate, shiftCalendarDay } from './calendar';
import { maxPainDivergenceP90 } from './detect';
import { expiryAfterEarnings, lastCompletedRegularBar, levelSetFromStructure, realtimeImpliedMove } from './inputs';
import type { AlertDataProvider, Budget, LevelsResult } from './run';
import type { Bar5, DarkPoolInput, EarningsInput, MaxPainStats, WhaleInput } from './types';

const REG_OPEN = 9 * 60 + 30;
const REG_CLOSE = 16 * 60;

export const PROVIDER_DEFAULTS = {
    barConcurrency: 4,
    levelConcurrency: 4,
    callTimeoutMs: 12_000,
    /** 구조 결과가 이보다 오래됐으면(또는 나이를 모르면) 한 번 «강제 계산» */
    forceRefreshAgeMs: 15 * 60_000,
    maxForcedPerRun: 10,
    maxPainLookbackDays: 30,
    earningsMaxTickers: 25,
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        p.catch(() => null),
        new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function pool<T>(items: T[], limit: number, budget: Budget, fn: (x: T) => Promise<void>): Promise<void> {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length && Date.now() < budget.deadline) {
            const x = items[i++];
            try { await fn(x); } catch { /* 한 종목 실패가 나머지를 막지 않는다 */ }
        }
    }));
}

/** 정규장 시간(ET)인가 — 구조 서비스의 인메모리 캐시 TTL 이 60초인 구간 */
function inRegularHours(nowMs: number): boolean {
    const d = etDateOf(nowMs), m = etMinutesOf(nowMs);
    return isTradingDate(d) && m >= REG_OPEN && m < REG_CLOSE;
}

export function createServiceProvider(overrides: Partial<typeof PROVIDER_DEFAULTS> = {}): AlertDataProvider {
    const cfg = { ...PROVIDER_DEFAULTS, ...overrides };

    return {
        async getBars(tickers, session, nowMs, budget) {
            const out: Record<string, Bar5 | null> = {};
            await pool(tickers, cfg.barConcurrency, budget, async (t) => {
                const r: any = await withTimeout(getIntradayAggregates(t, 5, 'minute', session, session, { sort: 'desc', limit: 4 }), cfg.callTimeoutMs);
                out[t] = lastCompletedRegularBar(r?.results ?? [], session, nowMs);
            });
            return out;
        },

        async getLevels(tickers, _spots, nowMs, budget) {
            // 시세를 주입하지 않는다 — 주입하면 전일 종가 없이 계산된 결과가 화면과 공유하는 구조 캐시에 들어간다.
            const out: Record<string, LevelsResult> = {};
            const cachedAgeSec = inRegularHours(nowMs) ? 60 : null;
            let forced = 0;
            await pool(tickers, cfg.levelConcurrency, budget, async (t) => {
                let d: any = await withTimeout(getStructureData(t), cfg.callTimeoutMs);
                let r = levelSetFromStructure(d, Date.now(), { cachedAgeSec });
                const old = r.ageSec == null || r.ageSec * 1000 > cfg.forceRefreshAgeMs;
                if (old && r.levels && forced < cfg.maxForcedPerRun && Date.now() < budget.deadline) {
                    forced++;
                    d = await withTimeout(getStructureData(t, null, null, true), cfg.callTimeoutMs);
                    if (d) r = levelSetFromStructure(d, Date.now(), { cachedAgeSec });
                }
                out[t] = { levels: r.levels, expirations: r.expirations };
            });
            return out;
        },

        async getMaxPainStats(tickers, session, budget) {
            const out: Record<string, MaxPainStats | null> = {};
            const db = getDynamoClient();
            if (!db) return out;
            const since = Date.parse(`${shiftCalendarDay(session, -cfg.maxPainLookbackDays)}T00:00:00Z`);
            await pool(tickers, 4, budget, async (t) => {
                const rows: Array<{ session: string; price: number | null; maxPain: number | null }> = [];
                let startKey: Record<string, any> | undefined;
                let pages = 0;
                do {
                    const res: any = await db.send(new QueryCommand({
                        TableName: TABLES.FLOW_HISTORY,
                        KeyConditionExpression: 'ticker = :t AND #ts > :since',
                        // 같은 표에 다른 모양의 행(수집 Lambda·다른 정의)이 섞여 있다 — 구조 굽기 행만
                        FilterExpression: '#src = :sb',
                        ProjectionExpression: '#ts, maxPain, price',
                        ExpressionAttributeNames: { '#ts': 'timestamp', '#src': '_source' },
                        ExpressionAttributeValues: { ':t': t, ':since': since, ':sb': 'structure-build' },
                        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
                    }));
                    for (const it of res.Items ?? []) {
                        const ts = Number(it.timestamp);
                        if (!Number.isFinite(ts)) continue;
                        rows.push({ session: etDateOf(ts), price: Number(it.price) || null, maxPain: Number(it.maxPain) || null });
                    }
                    startKey = res.LastEvaluatedKey;
                } while (startKey && ++pages < 20 && Date.now() < budget.deadline);
                const st = maxPainDivergenceP90(rows, session);
                out[t] = st ? { date: session, p90: st.p90, n: st.n } : null;
            });
            return out;
        },

        async getDarkPool(tickers) {
            const { latest, series } = await getDarkPoolWithSeries(tickers);
            const out: Record<string, DarkPoolInput | null> = {};
            for (const t of tickers) {
                const row = latest[t];
                const pct = series?.pct?.[t];
                out[t] = row
                    ? { date: row.date ?? null, pct: row.pct ?? null, series: series && pct ? { dates: series.dates, pct } : null }
                    : null;
            }
            return out;
        },

        async getWhales(tickers) {
            const today = etDateOf(Date.now());
            const res = await getNewPositionsForTickers(tickers, today);
            const out: Record<string, WhaleInput | null> = {};
            for (const t of tickers) {
                // 스냅샷을 읽었으면 유니버스 밖 종목도 «날짜 + 빈 목록» — 실행기가 «오늘 자료로 돌았다»를 알 수 있게
                out[t] = res ? { date: res.date ?? null, contracts: res.byTicker?.[t] ?? [] } : null;
            }
            return out;
        },

        async getEarnings(tickers, date, hint, budget) {
            const want = new Set(tickers);
            const found = new Map<string, EarningsInput['timing']>();
            let sourceOk = false;

            // ① 앱의 실적 달력 캐시(유니버스 약 160종목, 가까운 12건은 발표 시각까지)
            try {
                const cal: any = await getFromCache<any>('market:earnings-calendar:v4');
                const rows: any[] = Array.isArray(cal?.rows) ? cal.rows : [];
                if (rows.length) sourceOk = true;
                for (const r of rows) {
                    const t = String(r?.ticker || '').toUpperCase();
                    if (r?.date === date && want.has(t)) found.set(t, r.hour === 'amc' || r.hour === 'bmo' ? r.hour : 'unknown');
                }
            } catch { /* 캐시가 없으면 ②가 채운다 */ }

            // ② FMP 하루치 1콜 — 유니버스 밖 종목까지(앱 달력과 같은 엔드포인트)
            const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
            if (key) {
                try {
                    const res = await fetch(`https://financialmodelingprep.com/stable/earnings-calendar?from=${date}&to=${date}&apikey=${key}`, {
                        signal: AbortSignal.timeout(12_000), cache: 'no-store',
                    });
                    const j: any = res.ok ? await res.json() : null;
                    if (Array.isArray(j)) {
                        sourceOk = true;
                        for (const r of j) {
                            const t = String(r?.symbol || '').toUpperCase();
                            if (String(r?.date || '').slice(0, 10) === date && want.has(t) && !found.has(t)) found.set(t, 'unknown');
                        }
                    }
                } catch { /* 한 번 실패는 다음 실행이 다시 */ }
            }

            // 달력 원천을 하나도 못 읽었으면 «실적 없음»이 아니라 «모름» — 던져서 완료 표식을 남기지 않는다(다음 실행이 다시)
            if (!sourceOk) throw new Error('earnings_sources_unavailable');

            const out: Record<string, EarningsInput | null> = {};
            const list = Array.from(found.keys()).slice(0, cfg.earningsMaxTickers);
            await pool(list, 2, budget, async (t) => {
                let timing = found.get(t) ?? 'unknown';
                // ③ 발표 시각(Finnhub) — 달력에 없을 때만
                if (timing === 'unknown') {
                    const ev: any[] = (await withTimeout(getEarningsCalendar(t, date, date), 8000)) ?? [];
                    const hit = ev.find((e) => String(e?.symbol || '').toUpperCase() === t && e?.date === date);
                    if (hit?.hour === 'bmo' || hit?.hour === 'amc' || hit?.hour === 'dmh') timing = hit.hour;
                }
                // ④ 실적 뒤 첫 만기의 ATM 스트래들(실시간 중간값만)
                let impliedMovePct: number | null = null;
                const spot = hint.spots[t];
                if (spot > 0) {
                    let exps = hint.expirations[t];
                    if (!exps?.length) {
                        const d: any = await withTimeout(getStructureData(t), cfg.callTimeoutMs);
                        exps = Array.isArray(d?.availableExpirations) ? d.availableExpirations : [];
                    }
                    const exp = expiryAfterEarnings(exps ?? [], date, timing);
                    if (exp) {
                        const chain: any = await withTimeout(getOptionChainSnapshotIntrinio(t, { expiration: exp, underlyingPrice: spot }), cfg.callTimeoutMs);
                        impliedMovePct = realtimeImpliedMove(chain?.results ?? [], spot, computeImpliedMovePct);
                    }
                }
                out[t] = { date, timing, impliedMovePct };
            });
            return out;
        },
    };
}
