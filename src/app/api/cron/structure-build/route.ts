import { NextRequest, NextResponse } from 'next/server';
import { getStructureData } from '@/services/structureService';
import { setInCache } from '@/services/redisClient';
import { sanitizeMaxPain } from '@/services/centralDataHub';
import { batchPutItems } from '@/lib/aws/dynamoClient';
import { TABLES } from '@/lib/aws/dynamoClient';
import UNIVERSE_FILE from '@/../data/stock_universe_us800.json';

/**
 * /api/cron/structure-build — 「오늘 체인에서의 위치」 랭킹용 배치 생산자.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * 랭킹의 «이탈» 축은 이력이 필요해서 수집 커버리지에 인질로 잡힌다
 * (2026-09-03 실측: 1,968종목 중 1,492개가 8/28 에 멈춰 있다 = 최신 23.5%).
 * 그런데 «위치» 축 — 맥스페인·감마플립·콜월/풋플로어 — 은 **이력이 필요 없다.**
 * 오늘 체인만 있으면 계산되고, 실측 표본 60종목에서 커버리지 100% 였다.
 *
 * 문제는 «배치로 읽을 자리»가 없었다는 것이다. 값은 종목별로 계산되는데
 * 2,001번 부를 수는 없다. signum-gex-history 에 필드는 다 있으나 그건
 * 페이지 방문 때만 쓰이는 경로라 표본 120종목 중 112개가 8/28 에 멈춰 있었다.
 * → 여기서 굽어 Redis 에 모아 둔다. 랭킹은 조각 8개만 읽는다.
 *
 * ── 왜 계산을 새로 안 하는가 ──────────────────────────────────────────
 * `getStructureData` 를 그대로 부른다. 맥스페인·감마플립 계산을 두 벌로 만들면
 * 어느 날 조용히 갈라지고, 그때 어느 쪽이 맞는지 알 수 없게 된다. 화면과
 * 랭킹이 **같은 함수**를 쓰는 것이 이 파일의 존재 이유다.
 *
 * ── 비용 ──────────────────────────────────────────────────────────────
 * 체인은 이미 Lambda 가 `polygon:snapshot:probe:{t}` 에 넣어 둔 것을 읽는다
 * (structureService L244). 그래서 새로 드는 것은 종목당 시세 1콜뿐이다.
 * 동시성을 20 으로 둔 이유도 그것이다 — 분당 호출을 밀어 올리지 않는다.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHARDS = 8;
// ⚠️ [2026-09-03 실측] 8조각 × 동시성 20 = 160 동시 호출로 첫 실행이 2,001 중
//    **740행(37%)** 밖에 안 나왔다. 시세 조회가 레이트리밋에 걸려 가격이 0 이
//    되고, 가격 없는 행은 버려지기 때문이다. 수집기에서 이미 겪은 그 문제다
//    (샤드 동시 발화 시 성공률 47% → 1분 스태거 후 98%).
//    → 조각을 계단식으로 띄우고(STAGGER_MS) 동시성을 낮추고, 가격이 안 잡히면
//      한 번 더 시도한다. 셋 다 같은 원인을 다른 각도에서 막는다.
//    → [해결] 시세를 **배치로 한 번에** 받아 `getStructureData` 에 주입한다.
//      `/api/live/quotes` 는 250종목을 1.8초에 98.4% 로 준다. 종목당 시세 콜이
//      사라지므로 한도 문제 자체가 없어지고, 동시성도 올릴 수 있다.
const CONCURRENCY = 24;
const STAGGER_MS = 1200;
const QUOTE_CHUNK = 250;
const PART_TTL = 2 * 3600;          // 2시간 — 굽는 주기보다 넉넉히
const ORIGIN = 'https://www.signumhq.com';

export const partKey = (i: number) => `structure:part:v2:${i}`;

const UNIVERSE: string[] = ((UNIVERSE_FILE as any)?.symbols ?? []) as string[];

async function mapPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(n, items.length) }, async () => {
            while (i < items.length) {
                const k = i++;
                out[k] = await fn(items[k]);
            }
        }),
    );
    return out;
}

/** 랭킹이 쓰는 것만 남긴 한 줄. 2,001개를 합쳐도 가벼워야 한다. */
export type StructRow = {
    t: string;
    px: number;          // 기준가
    mp: number | null;   // 맥스페인
    fl: number | null;   // 감마플립
    cw: number | null;   // 콜월
    pf: number | null;   // 풋플로어
    gex: number | null;
    pcr: number | null;
    cOI: number;         // 콜 미결제약정
    pOI: number;         // 풋 미결제약정
    oi: number;          // 당일 총 미결제약정 — 유동성 게이트용
    s: string | null;    // 세션
};

export async function GET(req: NextRequest) {
    const shardParam = req.nextUrl.searchParams.get('shard');

    // ── 팬아웃 모드 ───────────────────────────────────────────────────
    // 크론 한 개가 8조각을 동시에 던진다. 각 조각은 자기만의 60초 예산을 가진
    // 별도 실행이므로 여기서는 끝나기를 기다리기만 하면 된다.
    if (shardParam === null) {
        const started = Date.now();
        const results = await Promise.all(
            Array.from({ length: SHARDS }, async (_, i) => {
                await new Promise((r) => setTimeout(r, i * STAGGER_MS));   // 계단식 발화
                const t0 = Date.now();
                try {
                    const res = await fetch(`${ORIGIN}/api/cron/structure-build?shard=${i}`, {
                        cache: 'no-store', signal: AbortSignal.timeout(55000),
                    });
                    const j: any = await res.json().catch(() => null);
                    return { shard: i, ok: res.ok, ms: Date.now() - t0, rows: j?.rows ?? null, tickers: j?.tickers ?? null };
                } catch (e: any) {
                    return { shard: i, ok: false, ms: Date.now() - t0, error: e?.message ?? 'failed' };
                }
            }),
        );
        const ok = results.filter((r) => r.ok).length;
        return NextResponse.json({
            ok: ok === SHARDS, shards: SHARDS, built: ok,
            rows: results.reduce((a, r) => a + (r.rows ?? 0), 0),
            totalMs: Date.now() - started, results,
        });
    }

    // ── 조각 굽기 ─────────────────────────────────────────────────────
    const shard = Math.max(0, Math.min(SHARDS - 1, Number(shardParam) || 0));
    const per = Math.ceil(UNIVERSE.length / SHARDS);
    const slice = UNIVERSE.slice(shard * per, (shard + 1) * per);
    const started = Date.now();

    // ── 시세를 먼저 «한 번에» 받는다 ─────────────────────────────────
    const quotes: Record<string, { price: number; prevClose?: number | null }> = {};
    for (let i = 0; i < slice.length; i += QUOTE_CHUNK) {
        const chunk = slice.slice(i, i + QUOTE_CHUNK);
        try {
            const res = await fetch(`${ORIGIN}/api/live/quotes?symbols=${chunk.join(',')}`, {
                cache: 'no-store', signal: AbortSignal.timeout(20000),
            });
            const j: any = await res.json().catch(() => null);
            for (const [k, v] of Object.entries((j?.data ?? {}) as Record<string, any>)) {
                const px = Number((v as any)?.price);
                if (px > 0) quotes[k] = { price: px, prevClose: Number((v as any)?.prevClose) || null };
            }
        } catch { /* 조각 일부가 없어도 나머지는 굽는다 */ }
    }

    const rows = await mapPool(slice, CONCURRENCY, async (t): Promise<StructRow | null> => {
        try {
            const q = quotes[t];
            const d: any = await getStructureData(t, null, q ?? null);
            const px = Number(d?.underlyingPrice);
            // 가격이 없으면 「위치」를 잴 수 없다. 0 으로 채우지 않고 버린다 —
            // 없는 값을 0 으로 쓰면 랭킹이 그 종목을 1위로 올린다(오늘 겪었다).
            if (!Number.isFinite(px) || px <= 0) return null;
            const st = d?.structure ?? {};
            const cOI = Array.isArray(st.callsOI) ? st.callsOI.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
            const pOI = Array.isArray(st.putsOI) ? st.putsOI.reduce((a: number, b: number) => a + (b || 0), 0) : 0;
            const oi = cOI + pOI;
            const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
            return {
                t, px,
                // ⚠️ 화면이 쓰는 것과 **같은 가드**를 통과시킨다. 안 걸면 체인이
                //    깨진 종목(실측 BYND: 현재가 11.6 에 맥스페인 0.5)이 「괴리
                //    2217%」로 랭킹 상위에 올라온다. 그건 시장이 아니라 고장이다.
                mp: sanitizeMaxPain(num(d?.maxPain), px),
                fl: num(d?.gammaFlipLevel),
                cw: num(d?.levels?.callWall),
                pf: num(d?.levels?.putFloor),
                gex: num(d?.netGex),
                pcr: num(d?.pcr),
                cOI, pOI, oi,
                s: typeof d?.session === 'string' ? d.session : null,
            };
        } catch {
            return null;
        }
    });

    const clean = rows.filter((r): r is StructRow => r !== null);
    await setInCache(partKey(shard), { rows: clean, ts: Date.now() }, PART_TTL).catch(() => { });

    // ── «이탈» 축의 이력도 여기서 남긴다 ──────────────────────────────
    // 랭킹이 읽는 필드(pcr·미결제약정)를 쓰던 옛 경로가 2026-08-28 에 멈췄고
    // (실측: 1,968종목 중 1,492개가 그날에 고정), 지금 harvest 는 같은 테이블에
    // **다른 모양의 행**(darkPoolPercent 계열)만 쓴다. 그래서 이탈 축은
    // 유니버스의 23.5% 만 보고 순위를 매기고 있었다.
    //
    // Lambda 를 고치는 대신 여기서 쓴다 — 이 크론은 이미 2,001종목을 100% 로
    // 계산하고 있고(실측 2,000/2,001), 재배포 위험(환경변수 전체 치환으로 키가
    // 지워지는 사고)이 없다. 계산도 화면과 같은 함수를 쓴 것 그대로다.
    //
    // ⚠️ 최소 8세션이 필요하므로 **약 9거래일 뒤부터** 그 종목들이 랭킹에 든다.
    let wrote = 0;
    try {
        const now = Date.now();
        const items = clean.map((r) => ({
            ticker: r.t, timestamp: now,
            pcr: r.pcr ?? (r.cOI > 0 ? Math.round((r.pOI / r.cOI) * 1000) / 1000 : null),
            totalCallOI: r.cOI, totalPutOI: r.pOI,
            maxPain: r.mp, gammaFlipLevel: r.fl, callWall: r.cw, putFloor: r.pf,
            netGex: r.gex, price: r.px,
            _source: 'structure-build',
        }));
        for (let i = 0; i < items.length; i += 25) {
            const ok = await batchPutItems(TABLES.FLOW_HISTORY, items.slice(i, i + 25));
            if (ok) wrote += Math.min(25, items.length - i);
        }
    } catch { /* 이력 실패가 굽기를 막지는 않는다 */ }

    return NextResponse.json({
        ok: true, shard, shards: SHARDS,
        tickers: slice.length, rows: clean.length,
        withMaxPain: clean.filter((r) => r.mp !== null).length,
        withFlip: clean.filter((r) => r.fl !== null).length,
        historyWrote: wrote,
        ms: Date.now() - started,
    });
}
