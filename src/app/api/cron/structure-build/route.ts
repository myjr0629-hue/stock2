import { NextRequest, NextResponse } from 'next/server';
import { peekStructureData, refreshStructureData, isStructureLiveWindow, LASTGOOD_MAX_SERVE_SEC, envNum } from '@/services/structureService';
import { setInCache, getFromCache } from '@/services/redisClient';
import { sanitizeMaxPain } from '@/services/centralDataHub';
import { batchPutItems } from '@/lib/aws/dynamoClient';
import { lastIntrinioFailure } from '@/services/intrinioClient';
import { getETComponents } from '@/services/marketDaySSOT';
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
 * ⚠️ [2026-09-24 실측으로 정정] 위 가정은 틀렸다. 9/24 15:05 로그 표본에서 계산 608건 중
 *    람다 캐시 적중은 34건(~6%)뿐이었고, 나머지는 계산 1회 = Intrinio 13~19콜이다(아래 [벤더 예산]).
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
// ⚠️ [2026-09-03] 2시간으로 뒀다가 **대부분의 시간 동안 구조 축이 통째로 비었다.**
//    크론은 14/17/19/21 UTC 인데 마지막 굽기와 다음 굽기 사이가 최대 17시간이다
//    (21시 → 다음 날 14시). TTL 이 그보다 짧으면 그 사이 내내 「자료 없음」이다.
//    실측으로 02:53 에 구운 것이 05:53 에 사라져 있었다 — 고장이 아니라 설계 실수다.
//    **TTL 은 굽는 간격의 최대치보다 길어야 한다.** 오래된 값은 지우는 게 아니라
//    `ageMin` 으로 나이를 밝혀 소비처가 판단하게 한다.
/* ★ 26시간이면 «주말에 반드시 비는» TTL 이었다 (2026-09-06 실측).
   크론은 `5 13,15,17,19,21 * * 1-5` — 월~금만 돈다.
   금 21:05 UTC 에 마지막으로 굽고 26h 뒤인 토 23:05 UTC 에 만료되는데,
   다음 실행은 월 13:05 UTC → **1일 14시간** 동안 조각이 하나도 없다.
   그 사이 /api/ranking 의 유니버스가 2,001 → 하드코딩 25종목으로 떨어진다
   (universeSource 가 «구조 캐시 없음» 이라고 정직하게 말해 줘서 찾았다).
   구조 지표는 주말에 바뀌지 않으므로 주말을 넘겨 «들고 있는» 것이 맞다.
   72시간 = 주말(40h) + 월요일 실패 하루치 여유. 그보다 오래 죽으면 스스로 만료된다. */
const PART_TTL = 72 * 3600;
const ORIGIN = 'https://www.signumhq.com';

/* ★★ [2026-09-24] «굽기»와 «갱신»을 나누고, 갱신을 장중 «매분 한 조각»으로 편다.
 *
 * [실측]  예전엔 5회/일, 종목마다 getStructureData 를 불렀다. 대부분 마지막 정상본이 즉시 돌아오고
 *   종목마다 배경 계산이 «기다리지 않고» 떴다 → 한 번에 최대 ~2,001개.
 *   ① 운영 로그: 9/24 15:05 조각 8개 전부 504(60초 초과), 9/23 17:05 3/8 504, 팬아웃도 19:05·15:05 504.
 *      죽는 순간 배경 계산도 같이 죽어 JNJ 는 크론이 돈 뒤에도 42시간 전 값이었다.
 *   ② 같은 분에 사용자 경로가 Intrinio 429 를 맞았다(분당 한도 2,000):
 *      «Status: 429» 로그 줄 — 크론 분 13:05 185 · 15:05~06 94 · 17:05 152 · 21:05 201,
 *      크론 없는 :05 분 14:05 15 · 16:05 8 · 18:05 6. /api/live/ticker·/api/chart·가디언이 맞았다.
 *   ③ 행의 rt 는 «구운 시각»이었다(9/24 16:13 UTC 저장 행 2,000/2,000 이 rt=13:05 굽기 시각).
 *      정상본 시각을 복원할 수 있는 1,271행 중 1,108행이 굽는 순간 이미 6시간 이상 된 값이었다.
 *
 * [고침]
 *   굽기 — «가진 정상본을 읽기만»(부작용 없음) + 행에 «데이터 시각»(rt)을 싣는다.
 *   갱신 — 매분(vercel.json `* 11-21 * * 1-5` = 개장 2.5시간 전~마감 후, ?rotate=1) 한 조각씩 돌며(8분에 한 바퀴)
 *          그 조각에서 «가중 나이»가 큰 순으로 REFRESH_PER_RUN 개를 실제로 다시 계산한다.
 *          가중치: 랭킹에 오를 수 있는 종목(px≥15·당일 OI≥20,000 — 맥스페인·감마플립·이탈 랭킹의
 *          필터, 실측 200종목)은 나이를 ×4 로 본다 = 화면에 보이는 것 먼저.
 *   나머지는 사용자 경로의 안전망(15분 상한 + 3초 동기 시도 + after())이 맡는다.
 *
 * [벤더 예산 — 계산]  계산 1회 = Intrinio 13콜(중소형 체인)~19콜(대형), 시세 주입 기준.
 *   (실제 코드 경로를 가짜 HTTP 로 돌려 센 값: 만기목록 1 + 시세 1 + 만기별 체인 ≤8 + 그릭스 페이지.)
 *   매분 24계산 × 13콜 ≈ 312콜/분 = 한도 2,000 의 ~16% (대형 위주면 ~23%), 분마다 고르게.
 *   예전: 2시간마다 최대 ~2,001계산 ≈ 26,000콜을 한 번에 요청 → 위 ②.
 *   처리량 24/분 → 가중 나이 균형점 H = (4×200 + 1,800)/24 ≈ 108분. 9/24 16:13 UTC 실측 나이에서 출발한
 *   모의(9시간, 전부 성공 가정): 2시간 뒤부터 랭킹 대상 최대 ~32분(p50 ~15)·그 밖 최대 ~117분(p50 ~53).
 *   (실측 당시: 1,977개 p50 12.2시간·최대 67시간, 랭킹 대상 200개 중 101개가 6시간 이상)
 *   5회/일로는 불가능하다 — 한 번에 한도 안에서 계산할 수 있는 건 ~24~30개라 하루 ~150개뿐이다.
 *   REFRESH_PER_RUN 은 환경변수 STRUCTURE_REFRESH_PER_RUN 으로 조절한다(429 가 늘면 내린다; 16 → 각 ~40분·~168분).
 */
const REFRESH_PER_RUN = envNum('STRUCTURE_REFRESH_PER_RUN', 24, 0, 40);
const FANOUT_REFRESH_PER_SHARD = 3;       // 수동 팬아웃(8조각 동시)일 때는 조각당 이만큼만 — 합쳐도 ~24계산
const REFRESH_CONCURRENCY = 4;            // 인스턴스당 Intrinio 동시 호출 상한(4)과 같게
const REFRESH_MIN_AGE_MS = LASTGOOD_MAX_SERVE_SEC * 1000; // 15분 — 이보다 신선하면 건드리지 않는다(사용자 경로 상한과 같은 값)
const RANK_ELIGIBLE_AGE_WEIGHT = 4;       // 랭킹에 오를 수 있는 종목은 나이를 ×4 로 본다
const REFRESH_START_BUDGET_MS = 25_000;   // 조각 시작 후 이 시간이 지나면 새 계산을 시작하지 않는다
const SHARD_DEADLINE_MS = 40_000;         // 늦어도 이때는 굽고 반환한다(maxDuration 60s, 팬아웃 계단 8.4s 포함)

/** 랭킹(맥스페인 이격·감마플립·이탈 구조 축)의 공통 필터 — /api/ranking·/api/ranking/deviation 과 같은 값 */
const isRankEligible = (r: { px: number; oi: number } | null) => !!r && r.px >= 15 && r.oi >= 20000;

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
    // 스퀴즈 점수 — 랭킹은 안 쓰지만 **가디언 감마쉴드**가 쓴다(2026-09-03 추가).
    // 이게 없으면 감마쉴드가 SPY·QQQ 를 매번 콜드로 다시 긁어야 하고,
    // 그 호출이 실패하면 0 이 캐시에 박혀 화면이 «감마 0»으로 굳는다.
    sq: number | null;
    cOI: number;         // 콜 미결제약정
    pOI: number;         // 풋 미결제약정
    oi: number;          // 당일 총 미결제약정 — 유동성 게이트용
    s: string | null;    // 세션 — rt 시각의 세션(가격과 같은 순간의 라벨)
    // ★ [2026-09-24] 이 행의 «데이터가 계산된 시각»(구조 정상본의 timestamp).
    //   예전엔 «구운 시각»이라 42시간 된 값도 방금 것처럼 보였다. 소비처는
    //   now - rt 로 나이를 판단할 수 있다. 부분 실패 때 직전 행을 들고 가는 규칙도 이 값으로 잰다.
    rt?: number;
};

function toRow(t: string, d: any, rt: number): StructRow | null {
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
        sq: num(d?.squeezeScore),
        cOI, pOI, oi,
        s: typeof d?.session === 'string' ? d.session : null,
        rt,
    };
}

/** ET 평일 04:00~20:00 안에서 만들어진 데이터인가 — 이력의 «세션 날짜»가 가짜가 되지 않게 */
const inSessionAt = (ts: number) => isStructureLiveWindow(new Date(ts));

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    // ★ [2026-09-24] 장중 크론은 `?rotate=1` 로 매분 부른다 — 조각은 «지금 몇 분인가»로 고른다
    //   (8분에 한 바퀴). 한 번에 한 조각뿐이라 벤더 호출이 분마다 고르게 퍼진다.
    const rotate = sp.get('rotate') === '1';
    const shardParam = rotate ? String(Math.floor(Date.now() / 60000) % SHARDS) : sp.get('shard');
    // 이번 실행에서 새로 계산할 최대 개수(팬아웃은 조각당 작게). 외부에서 키울 수 없게 상한을 둔다.
    const kParam = Number(sp.get('k'));
    const refreshBudget = Math.max(0, Math.min(REFRESH_PER_RUN, Number.isFinite(kParam) && sp.has('k') ? kParam : REFRESH_PER_RUN));

    // ── 팬아웃 모드(수동·예비) ─────────────────────────────────────────
    // 8조각을 동시에 던진다. 각 조각은 자기만의 60초 예산을 가진 별도 실행이므로
    // 여기서는 끝나기를 기다리기만 하면 된다. 8조각이 동시에 계산하므로 조각당 갱신은 작게(k=3).
    if (shardParam === null) {
        const started = Date.now();
        const results = await Promise.all(
            Array.from({ length: SHARDS }, async (_, i) => {
                await new Promise((r) => setTimeout(r, i * STAGGER_MS));   // 계단식 발화
                const t0 = Date.now();
                try {
                    // 마지막 조각은 8.4s 에 출발한다 → 50s 로 끊어야 팬아웃 자신이 60s 안에 끝난다
                    // (예전 55s: 8.4+55=63.4s > 60s → 9/23 19:05·9/24 15:05 팬아웃 504).
                    const res = await fetch(`${ORIGIN}/api/cron/structure-build?shard=${i}&k=${FANOUT_REFRESH_PER_SHARD}`, {
                        cache: 'no-store', signal: AbortSignal.timeout(50000),
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

    // ── ① 가진 정상본을 «읽기만» 한다 — 배경 계산을 띄우지 않는다 ─────────────
    //   (조각당 ~251 읽기, 정상본 p50 1.5KB — 9/24 실측 전체 1,977개 3.2MB)
    const copies = await mapPool(slice, CONCURRENCY, (t) => peekStructureData(t).catch(() => null));

    // ── ② «가중 나이»가 큰 것부터 몇 개만 실제로 다시 계산한다 ──────────────────
    //   15분보다 신선한 것은 건드리지 않는다. 랭킹 대상은 나이 ×4(화면에 보이는 것 먼저).
    //   사본 없는 종목(옵션 없음·계산 실패 반복 등)은 뒤로 — 매번 예산을 태우지 않게.
    const t0 = Date.now();
    const candidates = slice
        .map((t, i) => {
            const cp = copies[i];
            const age = cp ? t0 - cp.timestamp : Number.POSITIVE_INFINITY;
            const w = cp && isRankEligible(toRow(t, cp.data, cp.timestamp)) ? RANK_ELIGIBLE_AGE_WEIGHT : 1;
            return { t, i, age, score: age * w, eligible: w > 1 };
        })
        .filter((c) => c.age > REFRESH_MIN_AGE_MS)
        .sort((a, b) => {
            const aHas = Number.isFinite(a.age), bHas = Number.isFinite(b.age);
            if (aHas !== bHas) return aHas ? -1 : 1;
            return aHas ? b.score - a.score : a.i - b.i;
        })
        // 사본 없는 종목은 실행당 2개까지만 — 실측 24종목이 사본이 없다(대부분 옵션 없음·계산 실패)
        .filter(((missingTaken = 0) => (c: { age: number }) => Number.isFinite(c.age) || missingTaken++ < 2)())
        .slice(0, refreshBudget);

    // 시세는 «계산할 것이 있을 때만» 조각 전체를 한 번에 받는다(>30종목이면 벌크 경로 = 콜 1개).
    // 계산에 주입하면 종목당 시세 2콜이 빠진다.
    const quotes: Record<string, { price: number; prevClose?: number | null }> = {};
    if (candidates.length) {
        for (let i = 0; i < slice.length; i += QUOTE_CHUNK) {
            const chunk = slice.slice(i, i + QUOTE_CHUNK);
            try {
                const res = await fetch(`${ORIGIN}/api/live/quotes?symbols=${chunk.join(',')}`, {
                    cache: 'no-store', signal: AbortSignal.timeout(15000),
                });
                const j: any = await res.json().catch(() => null);
                for (const [k, v] of Object.entries((j?.data ?? {}) as Record<string, any>)) {
                    const px = Number((v as any)?.price);
                    if (px > 0) quotes[k] = { price: px, prevClose: Number((v as any)?.prevClose) || null };
                }
            } catch { /* 시세가 없으면 계산이 스스로 시세를 받는다 */ }
        }
    }

    // 동시 REFRESH_CONCURRENCY 개. 시작 예산(25s)이 지나면 새로 시작하지 않고,
    // 늦어도 40s 에는 기다리기를 멈추고 굽는다(남은 계산은 버려진다 — 다음 실행이 다시 고른다).
    //   벤더가 429 를 내기 시작하면(= 분당 한도가 찼다 — 수집 Lambda 가 5분마다 60~100초씩 돈다,
    //   CloudWatch 9/24 실측) 이번 실행에서는 더 시작하지 않는다. 사용자 경로의 몫을 남긴다.
    let refreshed = 0;
    let refreshTried = 0;
    let refreshedEligible = 0;
    let stoppedBy429 = false;
    const deadline = started + SHARD_DEADLINE_MS;
    let next = 0;
    const vendorSaturated = () => {
        const f = lastIntrinioFailure();
        return !!f && f.at >= started && /HTTP 429/.test(f.reason);
    };
    await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, candidates.length) }, async () => {
        while (next < candidates.length && Date.now() - started < REFRESH_START_BUDGET_MS) {
            if (vendorSaturated()) { stoppedBy429 = true; break; }
            const c = candidates[next++];
            refreshTried++;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const d: any = await Promise.race([
                refreshStructureData(c.t, quotes[c.t] ?? null).catch(() => null),
                new Promise<null>((r) => { timer = setTimeout(() => r(null), Math.max(0, deadline - Date.now())); }),
            ]);
            if (timer) clearTimeout(timer);
            if (d) {
                const ts = Date.parse(d._asOf);
                copies[c.i] = { data: d, timestamp: Number.isFinite(ts) ? ts : Date.now() };
                refreshed++;
                if (c.eligible) refreshedEligible++;
            }
            if (Date.now() >= deadline) break;
        }
    }));

    // ── ③ 굽기 — 행의 rt 는 «데이터 시각» ────────────────────────────────
    const clean: StructRow[] = [];
    slice.forEach((t, i) => {
        const cp = copies[i];
        if (!cp) return;
        const r = toRow(t, cp.data, cp.timestamp);
        if (r) clean.push(r);
    });

    // ── 부분 실패가 «더 완전한 결과»를 덮어쓰지 못하게 한다 ────────────────
    // 2026-09-03 실측: 같은 샤드를 연속으로 돌렸는데 250행 → 154행 → 250행 이었다.
    // 벤더 호출이 간헐적으로 실패하기 때문이다(콜드 인스턴스·순간 레이트리밋).
    // 예전엔 그때마다 통째로 덮어써서, **한 번 부진한 실행이 캐시를 깎아 먹었다.**
    // 실제로 그 154행짜리 실행이 QQQ 를 떨어뜨렸고 가디언 감마쉴드의
    // 신뢰도가 HIGH → MEDIUM 으로 내려갔다.
    //
    // 그래서 «합친다» — 이번에 성공한 행이 이기고, 이번에 실패한 티커는
    // 직전 값을 그대로 들고 간다. 다만 무한히 들고 가면 안 되므로 나이를 박아
    // (rt) 오래된 것은 버린다. 없는 것보다 조금 낡은 것이 낫지만,
    // «어제 것»을 오늘 값인 척하면 안 된다.
    const now = Date.now();
    const CARRY_MAX_MS = 6 * 3600 * 1000;   // 6시간까지만 들고 간다
    // rt 는 이미 «데이터 시각»이다(toRow). 여기서 now 로 덮으면 낡은 값이 신선해 보인다.
    const fresh: StructRow[] = [...clean];
    let carried = 0;
    const prevRt = new Map<string, number | undefined>();   // 직전 굽기의 데이터 시각 — 이력은 «바뀐 행»만 쓴다
    try {
        const prev = await getFromCache<{ rows: StructRow[] }>(partKey(shard));
        if (prev?.rows?.length) {
            for (const r of prev.rows) prevRt.set(r.t, r.rt);
            const have = new Set(fresh.map(r => r.t));
            for (const r of prev.rows) {
                if (have.has(r.t)) continue;
                const age = now - (typeof r.rt === 'number' ? r.rt : 0);
                if (age > CARRY_MAX_MS) continue;   // 너무 낡았다 — 버린다
                fresh.push(r);
                carried++;
            }
        }
    } catch { /* 이전 값을 못 읽어도 이번 결과는 저장한다 */ }

    // 나이 요약 — 조각 ts 는 «구운 시각»일 뿐이라, 데이터가 얼마나 낡았는지는 따로 싣는다.
    const agesMin = fresh
        .map((r) => (typeof r.rt === 'number' ? (now - r.rt) / 60000 : NaN))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    const dataAge = agesMin.length ? {
        p50Min: Math.round(agesMin[Math.floor(agesMin.length / 2)]),
        maxMin: Math.round(agesMin[agesMin.length - 1]),
        over1h: agesMin.filter((m) => m > 60).length,
    } : null;

    await setInCache(partKey(shard), { rows: fresh, ts: now, dataAge }, PART_TTL).catch(() => { });

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
    // ⚠️ [2026-09-03] **장중이 아닐 때는 쓰지 않는다.** 새벽 02:00 ET 에 시험 삼아
    //    돌렸더니 그날(09-03)치 «가짜 세션»이 생겼고, 랭킹의 최신 세션이 09-03 이
    //    되면서 FINRA(09-02)가 신선도 게이트에 걸려 **다크풀 축 두 개가 통째로
    //    사라졌다.** 값은 전날 종가 그대로인데 날짜만 하루 앞선 것이라 더 나쁘다.
    //    프리마켓~애프터마켓(04:00~20:00 ET) 안에서만 이력을 남긴다.
    //    ※ Redis 구조 캐시는 이 밖에도 쓴다 — 위치 축은 「마지막 종가 구조」가
    //      정답이라 새벽에도 있어야 한다. 막는 것은 «세션 이력»뿐이다.
    const et = getETComponents();
    const etMin = et.hour * 60 + et.minute;
    const inSession = et.dayOfWeek >= 1 && et.dayOfWeek <= 5 && etMin >= 240 && etMin <= 1200;
    let wrote = 0;
    const summary = {
        ok: true, shard, shards: SHARDS, mode: rotate ? 'rotate' : 'shard',
        tickers: slice.length, rows: fresh.length, built: clean.length, carried,
        refreshBudget, candidates: candidates.length, refreshTried, refreshed, refreshedEligible, stoppedBy429, dataAge,
        withMaxPain: clean.filter((r) => r.mp !== null).length,
        withFlip: clean.filter((r) => r.fl !== null).length,
    };
    if (!inSession) {
        return NextResponse.json({
            ...summary,
            historyWrote: 0, historySkipped: '장외 시간 — 가짜 세션을 만들지 않는다',
            ms: Date.now() - started,
        });
    }
    try {
        // ★ [2026-09-24] 이력의 timestamp 는 «데이터 시각»(rt)이다. 예전엔 now 라서
        //   42시간 된 정상본이 «오늘 세션» 행으로 기록됐다(이탈 축이 어제 값을 오늘로 비교).
        //   (ticker, timestamp) 가 키라 같은 정상본은 같은 행에 덮어써진다 — 중복이 안 생긴다.
        //   데이터가 세션 밖(ET 04:00~20:00 밖)에서 만들어졌으면 가짜 세션이 되므로 쓰지 않는다.
        //   매분 도는 지금은 «직전 굽기 이후 데이터가 바뀐 행»만 쓴다(같은 행을 8분마다 덮어쓰지 않게).
        const items = clean.filter((r) => typeof r.rt === 'number' && inSessionAt(r.rt) && prevRt.get(r.t) !== r.rt).map((r) => ({
            ticker: r.t, timestamp: r.rt as number,
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
        ...summary,
        historyWrote: wrote,
        ms: Date.now() - started,
    });
}
