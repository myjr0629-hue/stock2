import { NextRequest, NextResponse } from 'next/server';
import { queryItems, TABLES } from '@/lib/aws/dynamoClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getDarkPoolBatch } from '@/services/darkPool';

// ============================================================================
// /api/ranking/deviation — 「평소 대비 이탈」 랭킹.
//
// 왜 API 로 여는가 (2026-09-01 대표 질문: 「윈도우 에이전트에게 알려주려면?」):
//   생성기가 DynamoDB 를 직접 읽으므로, 코드를 넘기면 AWS 키까지 넘어간다.
//   그건 하면 안 된다. 대신 여기 한 곳에만 구현을 두고 로컬 스크립트·윈도우·
//   영상 파이프라인이 «같은 주소»를 부르게 한다. 두 벌로 갈라지면 어느 날
//   조용히 달라지고, 그때 어느 쪽이 맞는지 알 수 없게 된다.
//
// 왜 이 랭킹인가:
//   절대 순위(옵션 프리미엄 TOP)는 시가총액을 따라가서 NVDA·TSLA·AAPL 이 거의
//   매일 상위다. 답을 미리 아는 랭킹은 정보가 없다. 정보는 «그 종목 자신의
//   평소 대비 이탈»에만 있다.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ⚠️ [2026-09-02] 하드코딩 25종목 → **수집 유니버스 전체(2,001)**.
//    Lambda(signum-flow-harvest)가 2,001종목을 모으는데 랭킹은 25종목만 보고
//    있었다. 「평소 대비 이탈」은 넓을수록 강해지는 랭킹인데 후보군이 좁으면
//    매일 같은 대형주만 나온다 — 이 랭킹을 만든 이유 자체가 무력화된다.
//
//    정본은 `data/stock_universe_us800.json` 하나다. Lambda 의 UNIVERSE 와
//    **바이트 단위로 같은 목록**임을 확인했다(2,001 / 차집합 0).
//    두 곳에 적어 두면 어느 날 조용히 갈라진다.
import UNIVERSE_FILE from '@/../data/stock_universe_us800.json';
const UNIVERSE: string[] = (UNIVERSE_FILE as any).symbols;

// 2,001종목을 한 요청에 다 훑을 수는 없다(실측: 종목당 186ms · 동시성 80
// → 전체 약 370초, maxDuration 은 60초다). 그래서 **샤드로 나눠 굽고**
// 결과를 Redis 에 모아 둔 뒤, 일반 요청은 그것을 합쳐서 답한다.
const SHARDS = 8;                 // 2,001 ÷ 8 ≈ 251종목 · 실측 약 47초
const CONCURRENCY = 80;           // 실측 40→289ms, 80→186ms (종목당)
const PART_TTL = 6 * 3600;        // 부분 결과 보관 6시간
const partKey = (days: number, i: number) => `ranking:deviation:part:v9:${days}:${i}`;

/** 배열을 동시성 n 으로 훑는다. 하나가 실패해도 나머지를 죽이지 않는다. */
async function mapPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        for (;;) {
            const i = cursor++;
            if (i >= items.length) return;
            try { out[i] = await fn(items[i]); } catch { out[i] = undefined as any; }
        }
    }));
    return out;
}

// kind — 「감소」를 신호로 볼 수 있는 축인지 구분한다.
//   magnitude(크기: 미결제약정·프리미엄): 감소는 대개 **수집이 덜 된 것**이다
//     (harvest 가 만기를 일부만 받아오면 총량이 통째로 준다 — partial 플래그가
//      있는 이유다). 시장 사건으로 보고 1위에 올리면 오보가 된다. → 급증만.
//   ratio/score(풋콜·델타·점수): 감소도 그 자체로 정보다. → 양방향.
type Metric = { key: string; label: { ko: string; en: string; ja: string }; kind: 'magnitude' | 'ratio' };
// ivSkew 는 뺐다 — 실측 300행 전부 0 이다(생산자가 채우지 않는다).
// ══════════════════════════════════════════════════════════════════════
// [2026-09-03] 축을 실측으로 골라냈다 (10종목·30일, scripts/_axis-quality.js).
//
//   지표                하루안범위/중앙  날짜간변화  비율   동조율
//   pcr                      0.08         0.06     1.5    18%   ✅
//   totalCallOI              0.16         0.10     1.6    76%   ⚠️
//   totalPutOI               0.14         0.09     1.6    90%   ⚠️
//   whaleScore               0.55         0.05    10.5     0%   ❌
//   dex                      0.75         0.19     4.0    33%   ❌
//   squeezeProbability       0.49         0.21     2.3    57%   ❌
//
// 「하루안범위 ÷ 날짜간변화」가 크면 **그날의 값이 존재하지 않는다** — 어느
// 스냅샷을 집었느냐가 값을 정한다. whaleScore 는 하루 안에서 중앙값의 55%를
// 오가는데 날짜 간 변화는 5% 뿐이다(10.5배). 그걸로 「평소 대비 이탈」을 재면
// 재는 것은 시장이 아니라 **뽑기**다.
//
// squeezeProbability 는 세 가지가 겹쳤다:
//   ① 하루 안 0~80 을 오간다(실측 RTX 08-30 범위 0~70)
//   ② 09-02 에 RTX·GS·MRVL·TSM 이 **동시에** 60~70 으로 뛰었다(동조율 57%)
//      — 네 종목이 같은 말을 하면 그건 개별 종목 이야기가 아니다
//   ③ 랭킹은 60 이라 하는데 **앱 화면은 같은 종목을 15 로 보여준다**.
//      사용자가 앱에서 확인할 수 없는 순위는 오보다.
//
// ivSkew 는 예전에 뺐다 — 실측 300행 전부 0 이다(생산자가 채우지 않는다).
// ══════════════════════════════════════════════════════════════════════
const METRICS: Metric[] = [
    // ⚠️ 생산자에서 pcr = totalPutOI / totalCallOI 다 — «거래량» PCR 이 아니라
    //    «미결제약정» PCR 이다. 그냥 「풋콜 비율」이라고 쓰면 시청자는 그날의
    //    거래량 쏠림으로 읽는다. 라벨이 데이터와 어긋나면 그게 곧 오보다.
    { key: 'pcr', label: { ko: '풋콜 비율(미결제약정)', en: 'Put/call ratio (open interest)', ja: 'プットコール比率(建玉)' }, kind: 'ratio' },
    { key: 'totalCallOI', label: { ko: '콜 미결제약정', en: 'Call open interest', ja: 'コール建玉' }, kind: 'magnitude' },
    { key: 'totalPutOI', label: { ko: '풋 미결제약정', en: 'Put open interest', ja: 'プット建玉' }, kind: 'magnitude' },
    // 이력이 3~4일뿐이라 아직 MIN_SESSIONS(8)를 못 넘는다. 선언만 해 두면
    // 자료가 쌓이는 날 저절로 켜진다 — readiness 로 상태를 보고한다.
    { key: 'totalPremium', label: { ko: '옵션 자금', en: 'Options premium', ja: 'オプション資金' }, kind: 'magnitude' },
];

const MIN_SESSIONS = 8;
const REGIME_LO = 0.5, REGIME_HI = 2.0;   // 오늘 총 OI 대비 «같은 규모»로 볼 범위
const MIN_REGIME_DAYS = 6;
const MIN_REL_DISPERSION = 0.03;
const MIN_Z = 3;
const MIN_RATIO = 1.35;

// ══════════════════════════════════════════════════════════════════════
// [2026-09-02] 유니버스를 25 → 2,001 로 넓히자 **바로 무너졌다.**
//
// 실측 상위 10의 총 미결제약정: 335 · 465 · 1,207 · 2,206 · 2,446 · 3,807 …
// 유니버스 OI 분포(표본 118종목): 중앙값 4,781 · 75분위 15,321 · 90분위 43,824
//                                (NVDA 는 350만이다)
// → 랭킹이 **가장 얇은 66%(OI 1만 미만)에게 점령됐다.**
//   계약 몇 개가 움직이면 풋콜 비율이 0.4 → 6.55(16배)로 튄다. 그건 시장
//   이야기가 아니라 «호가창이 비어 있다»는 이야기다.
//   25종목 시절엔 전부 대형주라 이 문제가 존재하지 않았다.
//
// ① 유동성 하한 — 75분위 위. 「이탈」이 의미를 가지려면 한 건의 거래로
//    지표가 흔들리지 않을 만큼은 두꺼워야 한다.
const MIN_TODAY_OI = 20000;
// ② z 상한 — z 138 · 92 · 45 가 실제로 나왔다. 정규분포에서 z 25 는
//    사실상 불가능하다. 그런 값은 신호가 아니라 **산포 추정이 붕괴했다는
//    표시**다(몇 주 평평하다가 한 번 뛴 계열). 게이트로 쓰되 버린다.
const MAX_Z = 25;

// ══════════════════════════════════════════════════════════════════════
// [2026-09-03] 다크풀 축이 랭킹을 오염시키고 있었다 (대표: 「부정확한 것 같아」).
//
// 실측 9,943종목 (2026-09-02):
//   장외 거래량   중앙값 53,039 · 75분위 310,383 · 90분위 1,051,819
//   volRatio     중앙값 **0.73** · 10분위 0.15 · 90분위 1.42
//
// ★ 시장 중앙 volRatio 가 0.73 이다. 즉 «평소보다 적음»이 종목의 **절반
//   (5,058/9,797 = 52%)** 이 처한 정상 상태다. 기준선이 장기 평균이라
//   구조적으로 그렇게 나온다. 그런데 랭킹은 `|log(ratio)|` 로 급증과 붕괴를
//   **대칭 취급**했다 — log(0.01)=4.6 이 log(5.7)=1.74 를 이긴다.
//   그래서 「평소의 1%」짜리가 1위, 「평소의 24%」가 7위로 올라왔다.
//   그건 시장 이야기가 아니라 **그날 FINRA 행이 부실하다**는 이야기다.
//
// ③ 거래량 하한 — 옵션의 MIN_TODAY_OI 와 같은 논리(75분위). CRWU 는 장외
//    27,007주(거래량 41.9분위)로 1위였다. 2만7천 주가 시장 1위일 수는 없다.
const DP_MIN_VOLUME = 300_000;
// ④ 자기 이력 백분위 — 옵션이 |z|≥3 을 요구하는 것의 다크풀판. volRatio 만
//    보면 이력이 짧은 종목이 통과한다.
const DP_MIN_VOL_PCTL = 90;
// ⑤ 거래량 축은 «급증만» 랭킹한다. 붕괴는 (a) 절반의 정상 상태이고
//    (b) volRatio 가 소수 2자리로 반올림돼 0.01 이면 기준선 역산 오차가 50%를
//    넘는다(실측 494종목이 ≤0.05). 잴 수 없는 것을 1위로 올리지 않는다.
//    ※ 비율형 지표(풋콜·델타 등)는 감소도 정보이므로 양방향을 유지한다.
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════

const median = (a: number[]): number | null => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const etDay = (ms: number) => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);

type Row = { timestamp: number; totalCallOI?: number; totalPutOI?: number;[k: string]: any };

async function history(ticker: string, days: number): Promise<Row[]> {
    // ⚠️ [2026-09-02 실측 2건으로 교정]
    //  ① `limit` 은 **페이지 크기**다. 400 이면 3,000행에 8번 왕복해 7.9초가
    //     걸렸다. 행은 269바이트뿐이라 한 페이지(1MB)에 3,000행이 다 들어간다.
    //     3000 으로 올리니 **2.6초**(3배). 조회 조건은 그대로다.
    //  ② `maxItems: 3000` 이 **최신 행을 버리고 있었다.** NVDA 30일 실제 행이
    //     3,150개라 오름차순으로 3,000개만 받으면 **가장 최근 150행이 잘린다** —
    //     하필 그게 「오늘」이다. 랭킹의 today 가 오늘이 아니게 된다.
    //     (오름차순+Limit 은 가장 «오래된» N 을 준다 — 반복해서 당한 함정이다.)
    return queryItems<Row>(
        TABLES.FLOW_HISTORY,
        'ticker = :t AND #ts > :since',
        { ':t': ticker, ':since': Date.now() - days * 86400e3 },
        { limit: 3000, scanForward: true, maxItems: 20000, expressionNames: { '#ts': 'timestamp' } },
    );
}

// 하루의 «대표 스냅샷»을 고른다.
//
// ⚠️ [2026-09-01 실측으로 발견 — 이게 가장 큰 함정이었다]
//    같은 날 NVDA 콜 미결제약정이 이렇게 찍힌다:
//      1,985,592 → 883,089 → 1,923,222 → 107,121 → 633,626 → 1,825,631
//    미결제약정은 하루 한 번 갱신되므로 이건 장중 변화가 아니다.
//    harvest 가 매 실행마다 «맨 앞 만기»를 다시 고르는데 그게 실행마다
//    달라져서, 어느 만기를 봤느냐로 20배씩 널뛴다.
//
//    그래서 「그날의 마지막 값」을 쓰면 안 된다 — 마지막 실행에 어떤 만기가
//    걸렸느냐는 사실상 동전 던지기다. 대신 **그날 총 OI 가 가장 큰 스냅샷**
//    하나를 골라 «모든 지표를 거기서» 읽는다. 이러면
//      ① 날마다 같은 성격(가장 큰 만기)을 보므로 비교가 성립하고
//      ② 한 카드 안의 지표들이 서로 같은 체인에서 나온다.
function dailySnapshots(items: Row[]) {
    const byDay = new Map<string, Row>();
    for (const it of items) {
        const ts = Number(it.timestamp);
        if (!Number.isFinite(ts)) continue;
        const d = etDay(ts);
        const oi = Number(it.totalCallOI || 0) + Number(it.totalPutOI || 0);
        const prev = byDay.get(d);
        const prevOi = prev ? Number(prev.totalCallOI || 0) + Number(prev.totalPutOI || 0) : -1;
        // OI 가 없는 행(프리미엄 전용 행 등)은 대표가 될 수 없다 — 비교 기준을 못 준다.
        if (oi > 0 && oi > prevOi) byDay.set(d, { ...it, _oi: oi, _d: d });
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, r]) => r);
}

function seriesOf(snaps: Row[], key: string) {
    return snaps
        .map((r) => ({ d: r._d as string, v: Number(r[key]), oi: r._oi as number }))
        .filter((x) => Number.isFinite(x.v));
}

export async function GET(req: NextRequest) {
    const days = Math.min(90, Math.max(10, Number(req.nextUrl.searchParams.get('days')) || 30));
    const top = Math.min(25, Math.max(1, Number(req.nextUrl.searchParams.get('top')) || 5));
    const CACHE = `ranking:deviation:v9:${days}:${top}`;
    const refresh = req.nextUrl.searchParams.get('refresh') === '1';

    // ── 샤드 굽기 모드 ────────────────────────────────────────────────
    // `?build=<i>` 로 부르면 i번째 조각만 계산해 Redis 에 넣고 요약만 돌려준다.
    // 크론이 0..7 을 부르면 전체 2,001종목이 채워진다. 사람이 부를 일은 없다.
    const buildParam = req.nextUrl.searchParams.get('build');
    const buildShard = buildParam === null ? null : Math.max(0, Math.min(SHARDS - 1, Number(buildParam) || 0));

    // ── 읽기 모드: 구워 둔 조각을 합친다 ──────────────────────────────
    if (buildShard === null && !refresh) {
        const hit = await getFromCache<any>(CACHE);
        if (hit) return NextResponse.json({ ...hit, _cache: 'hit' });
    }

    let found: any[] = [];
    // ⚠️ [2026-09-03] 옵션 축에 «시장 정규화»가 없었다. 실측 동조율이
    //    풋 미결제약정 90% · 콜 76% 다 — 만기 주기 때문에 대부분의 종목이
    //    같은 날 같이 오르내린다. 그걸 그대로 재면 「평소의 2배」가 사실은
    //    「오늘 시장 전체가 2배」인 날의 이야기가 된다. 다크풀 축은 이미
    //    시장 중앙 배수로 나눠 이 문제를 풀고 있었다 — 옵션도 같게 만든다.
    //    ※ 표본은 «게이트를 통과한 것»이 아니라 «배수를 계산한 전부»여야 한다.
    //      통과분만 모으면 생존편향으로 중앙값이 위로 밀린다.
    const ratioPool: Record<string, number[]> = {};
    const coverage: { fresh: number; lastSeen: Record<string, number> } = { fresh: 0, lastSeen: {} };
    const skipped: Record<string, number> = {};
    const bump = (r: string) => { skipped[r] = (skipped[r] || 0) + 1; };

    // 이 요청이 실제로 훑을 종목.
    //   · 굽기 모드  → 그 조각
    //   · 읽기 모드  → 구워 둔 조각을 쓰고, 없으면 **첫 조각만** 즉석 계산한다.
    //     (2,001종목을 요청 안에서 다 훑으면 60초를 넘겨 통째로 죽는다.
    //      빈 응답을 주느니 일부라도 정확히 주고 partial 을 명시한다.)
    let slice: string[] = [];
    let partialReason: string | null = null;

    if (buildShard !== null) {
        const per = Math.ceil(UNIVERSE.length / SHARDS);
        slice = UNIVERSE.slice(buildShard * per, (buildShard + 1) * per);
    } else {
        type Part = { found: any[]; ratioPool: Record<string, number[]>; coverage?: typeof coverage };
        const parts = await Promise.all(
            Array.from({ length: SHARDS }, (_, i) => getFromCache<Part>(partKey(days, i)).catch(() => null)),
        );
        const have = parts.filter((x): x is Part => !!x && Array.isArray(x.found));
        for (const pt of have) {
            found.push(...pt.found);
            for (const [k, arr] of Object.entries(pt.ratioPool || {})) {
                (ratioPool[k] = ratioPool[k] || []).push(...arr);
            }
            if (pt.coverage) {
                coverage.fresh += pt.coverage.fresh;
                for (const [d, n] of Object.entries(pt.coverage.lastSeen)) {
                    coverage.lastSeen[d] = (coverage.lastSeen[d] || 0) + n;
                }
            }
        }
        if (have.length !== SHARDS) {
            const per = Math.ceil(UNIVERSE.length / SHARDS);
            slice = UNIVERSE.slice(0, per);
            partialReason = `구워진 조각 ${have.length}/${SHARDS} — 첫 조각만 즉석 계산했다`;
        }
    }

    const histories = await mapPool(slice, CONCURRENCY, async (t) => {
        try { return { t, items: await history(t, days) }; }
        catch { return { t, items: null as Row[] | null }; }
    });

    // ── 신선도 게이트 ────────────────────────────────────────────────
    // ⚠️ [2026-09-02 실측으로 발견 — 2,001종목으로 넓히자 바로 드러났다]
    //    한 조각 251종목 중 **201종목의 최신 세션이 2026-08-28** 이었다.
    //    벤더 권한 상실일이다. 그 뒤로 수집이 끊겼다가 최근에야 돌아왔다.
    //    이대로 두면 5일 전 스냅샷이 「오늘의 이탈」로 1위에 올라간다 —
    //    다크풀 날짜를 맞추는 것과 **같은 이유로** 종목에도 게이트가 필요하다.
    //
    //    기준선은 이 조각에서 관측된 «가장 최근 세션»이다. 달력으로 못 정한다
    //    — 휴장·조기폐장이 있고, 수집 재개 시점도 우리가 정하는 게 아니다.
    //    관측값을 기준으로 삼으면 시장이 쉬는 날에도 저절로 맞는다.
    type Prepared = { t: string; snaps: Row[]; last: string };
    const prepared: Prepared[] = [];
    for (const h of histories) {
        if (!h) { bump('조회실패'); continue; }
        if (h.items === null) { bump('조회실패'); continue; }
        if (!h.items.length) { bump('이력없음'); continue; }
        const snaps = dailySnapshots(h.items);
        if (!snaps.length) { bump('스냅샷없음'); continue; }
        prepared.push({ t: h.t, snaps, last: snaps[snaps.length - 1]._d as string });
    }
    const shardSession = prepared.reduce<string | null>((m, p) => (!m || p.last > m ? p.last : m), null);

    // ⚠️ [2026-09-03] 커버리지를 보고한다 — 이게 안 보여서 「랭킹이 부정확하다」의
    //    진짜 이유를 오래 못 봤다. 실측: 표본 300종목 중 **75.7% 가 마지막 수집일
    //    2026-08-28** 이다(메시브 차단일). 랭킹이 읽는 필드(pcr·미결제약정 등)를
    //    쓰던 옛 경로가 그때 멈췄고, 지금 harvest 는 **다른 모양의 행**을 쓴다
    //    (darkPoolPercent 계열). 즉 랭킹은 유니버스의 1/4 만 보고 순위를 매긴다.
    //    후보가 적은 것은 게이트가 엄해서가 아니라 **볼 자료가 없어서**다.
    for (const pr of prepared) {
        (coverage.lastSeen[pr.last] = (coverage.lastSeen[pr.last] || 0) + 1);
        if (shardSession && pr.last !== shardSession) { bump(`세션낡음(${pr.last})`); continue; }
        coverage.fresh++;
        const t = pr.t;
        const snaps = pr.snaps;

        for (const m of METRICS) {
            const series = seriesOf(snaps, m.key);
            if (series.length < MIN_SESSIONS + 1) { bump('이력부족'); continue; }
            const today = series[series.length - 1];

            // ⚠️ 만기 롤오버 방어. harvest 는 «맨 앞 만기» 하나만 본다. 앞 만기가
            //    바뀌는 날 미결제약정이 통째로 갈아엎어져(MSFT 70k→404k→55k→494k)
            //    그냥 재면 「평소의 6배」라는 22σ 가 나온다. 시장이 아니라 «다른
            //    만기를 본 것»이다. 오늘과 같은 규모의 날하고만 비교한다.
            const cmp = series.slice(0, -1).filter(
                (x) => today.oi > 0 && x.oi > 0 && x.oi >= today.oi * REGIME_LO && x.oi <= today.oi * REGIME_HI,
            );
            if (cmp.length < MIN_REGIME_DAYS) { bump('비교일부족(만기롤오버)'); continue; }

            const past = cmp.map((x) => x.v);
            const med = median(past);
            if (med === null || !(med > 0)) { bump('기준선없음'); continue; }
            const sp = median(past.map((v) => Math.abs(v - med)));
            const scale = 1.4826 * (sp ?? 0);
            if (!(scale > 0)) { bump('산포0'); continue; }
            // 산포가 중앙값 대비 지나치게 작으면 분모 붕괴로 z 가 폭발한다(42σ 가 나왔었다).
            if (sp! / Math.abs(med) < MIN_REL_DISPERSION) { bump('너무안변함'); continue; }

            // 얇은 종목은 지표 자체가 잡음이다 — 재기 전에 거른다.
            if (!(today.oi >= MIN_TODAY_OI)) { bump('유동성부족'); continue; }

            const z = (today.v - med) / scale;
            if (!Number.isFinite(z) || Math.abs(z) < MIN_Z) { bump('유의하지않음'); continue; }
            if (Math.abs(z) > MAX_Z) { bump('산포붕괴(z과대)'); continue; }
            // 점수류에서 오늘이 «정확히 0» 이면 측정된 0 인지 미계산인지 모른다.
            if (today.v === 0 && /Score|Probability/i.test(m.key)) { bump('0값모호'); continue; }

            const ratio = today.v / med;
            // ⚠️ [2026-09-03] 음수 배수가 그냥 통과하고 있었다. dex(델타 노출)나
            //    점수류는 음수가 될 수 있는데 `ratio <= 0.74` 를 만족하므로
            //    게이트를 지나고, 그러면 `rank = |log(음수)| = NaN` 이 된다.
            //    **NaN 이 비교자에 들어가면 정렬 전체가 무너진다** — 실측:
            //    [1.2, NaN, 2.5, 0.4] 를 정렬하면 그대로 [1.2, NaN, 2.5, 0.4] 다.
            //    즉 어느 날 음수 하나만 섞이면 순위가 통째로 뒤죽박죽이 된다.
            //    에러도 안 나고 목록은 그럴듯해 보인다. 가장 위험한 종류다.
            if (!Number.isFinite(ratio) || ratio <= 0) { bump('배수무효(음수·비유한)'); continue; }
            (ratioPool[m.key] = ratioPool[m.key] || []).push(ratio);   // 게이트 이전에 담는다
            const twoSided = m.kind === 'ratio';
            const passes = twoSided
                ? (ratio >= MIN_RATIO || ratio <= 1 / MIN_RATIO)
                : ratio >= MIN_RATIO;   // 크기형은 급증만 (위 kind 주석)
            if (!passes) { bump(twoSided ? '배수작음' : '배수작음(크기형은 급증만)'); continue; }

            found.push({
                ticker: t, metric: m.key, label: m.label,
                today: today.v, baseline: med, ratio, z,
                // 「평소의 0.4배」와 「평소의 2.5배」는 둘 다 이탈이지만 읽는 법이
                // 정반대다. 방향을 안 주면 소비처(윈도우 에이전트·영상)가
                // 배수만 보고 카드를 그려 「0.011배 1위」 같은 게 나온다.
                direction: ratio >= 1 ? 'surge' : 'collapse',
                sessions: cmp.length, date: today.d, totalOI: today.oi,
                rank: Math.abs(Math.log(ratio)),
            });
        }
    }

    // ── 굽기 모드는 여기서 끝 ─────────────────────────────────────────
    // 다크풀은 종목별이 아니라 «시장 전체»를 한 번에 읽어 상대화하는 축이라
    // 조각마다 계산하면 시장 중앙값이 조각별로 달라져 서로 다른 자로 잰다.
    // 그래서 다크풀은 **병합 시점에 한 번만** 계산한다.
    if (buildShard !== null) {
        await setInCache(partKey(days, buildShard), { found, ratioPool, coverage }, PART_TTL);
        return NextResponse.json({
            ok: true, mode: 'build', shard: buildShard, shards: SHARDS,
            tickers: slice.length, candidates: found.length, skipped,
            generatedAt: new Date().toISOString(),
        });
    }

    // ── 다크풀 (FINRA) ────────────────────────────────────────────────────
    // [2026-09-01 대표 제안] 「유의미한 다크풀 랭킹을 넣어도 될 듯한데,
    //  자료 들어오고 나서 작동하는」 — 맞다. 그리고 여기서도 «절대값 금지»가
    //  그대로 적용된다: 시장 전체 공매도 비중 중앙값이 49% 다. 도매업자가
    //  소매 매수의 상대가 될 때 일단 공매도로 팔고 되사기 때문에 절반은
    //  구조적으로 찍힌다. 그래서 «그 종목의 평소 대비»만 쓴다.
    //
    //  ⚠️ 계산을 새로 하지 않는다. finra-offexchange.js 가 이미 volRatio·
    //     shortAvg·shortDev 를 만들어 저장한다. 두 벌로 만들면 조용히 갈라진다.
    //  ⚠️ 마감 후 약 90분(17:30 ET)에야 그날 자료가 뜬다. 없으면 «없음»으로
    //     보고하고 랭킹에서 빠진다 — 어제 것을 오늘인 척하지 않는다.
    const DP_ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD']);  // ETF 는 이탈 상위를 오염시킨다
    // 옵션 지표가 보고 있는 «최신 세션». 다크풀 신선도 판정의 기준이 된다.
    const optionSession = found.reduce<string | null>(
        (m, f) => (f.date && (!m || f.date > m) ? f.date : m), null);

    let darkPool: any = { available: false, reason: '자료 없음' };
    try {
        // ⚠️ 다크풀은 «EC2 Redis 프록시»로 읽힌다. getFromCache 로 같은 키를 찍으면
        //    빈 값이 온다(실제로 그래서 available:false 가 나왔다). 앱의 정본
        //    접근자를 그대로 쓴다 — 저장 경로가 바뀌어도 여기가 따라 깨지지 않는다.
        // ⚠️ 이 키는 2.19MB 이고 읽기 타임아웃이 5초다(실측 5.2초 — 코드 주석에
        //    경고가 있다). getDarkPoolMarket 과 «동시에» 부르면 둘 다 넘겨서
        //    다크풀이 에러 없이 사라진다(실제로 그랬다). 한 번만 읽는다 —
        //    date·marketAvg 는 어차피 각 종목 행에 실려 온다.
        // ⚠️ 2,001종목을 그대로 넘기면 응답이 커지고 상위가 잡종목으로 채워진다.
        //    다크풀 순위는 «이미 옵션 축에서 후보에 오른 종목» + 유동성 상위를
        //    대상으로 본다. getDarkPoolBatch 는 한 덩어리를 읽어 걸러 주므로
        //    호출 비용은 목록 길이와 무관하다(2.19MB 키 · 읽기 타임아웃 5초).
        const dpTargets = [...new Set([...found.map((f) => f.ticker), ...UNIVERSE])]
            .filter((t) => !DP_ETF.has(t));
        const rows = await getDarkPoolBatch(dpTargets);
        const list = Object.values(rows);
        const n = list.length;
        const dpDate = n > 0 ? (list[0].date ?? null) : null;
        // ⚠️ 날짜가 어긋나면 랭킹에 넣지 않는다.
        //    옵션은 오늘(장중), 다크풀은 마감 후 90분에 들어온다. 아직 안 들어온
        //    날 어제 것을 그대로 섞으면 「오늘의 랭킹」에 3일 전 숫자가 1위로
        //    올라간다 — 라벨과 데이터가 어긋나는 전형이다. 실제로 8/31 랭킹에
        //    8/28 다크풀이 3·4·5위로 들어왔다.
        const fresh = !!(dpDate && optionSession && dpDate === optionSession);
        if (n > 0 && !fresh) {
            darkPool = {
                available: false, stale: true, date: dpDate, expected: optionSession,
                reason: `아직 안 들어옴 — 보유분은 ${dpDate}, 옵션은 ${optionSession} 세션 (마감 후 약 90분에 갱신)`,
            };
        } else if (n > 0) {
            darkPool = {
                available: true, date: dpDate,
                marketAvg: list[0].marketAvg ?? null, covered: n,
            };
            // ⚠️ 시장 전체가 조용한 날엔 «모든» 종목의 장외 물량이 같이 준다.
            //    그걸 그대로 재면 「SMCI 평소의 43%」 같은 게 1위로 올라오는데,
            //    그건 SMCI 이야기가 아니라 그날 시장 이야기다(실제로 상위 6 중
            //    4개가 그렇게 채워졌다). 만기 롤오버와 같은 종류의 교란이다.
            //    → 그날 시장의 중앙 배수로 나눠, «시장 대비» 이탈만 남긴다.
            const volRatios = list.map((x) => x.volRatio).filter((v): v is number => typeof v === 'number' && v > 0);
            const mktVolRatio = median(volRatios) ?? 1;
            darkPool.marketVolRatio = Math.round(mktVolRatio * 100) / 100;

            for (const [t, r] of Object.entries(rows)) {
                // ① 장외 물량이 «시장 대비» 평소의 몇 배
                const rel = typeof r.volRatio === 'number' && r.volRatio > 0 && mktVolRatio > 0
                    ? r.volRatio / mktVolRatio : null;
                // 급증만 · 유동성 하한 · 자기 이력 백분위 (위 주석의 실측 근거)
                if (rel !== null && rel >= MIN_RATIO
                    && r.volume >= DP_MIN_VOLUME
                    && typeof r.volP === 'number' && r.volP >= DP_MIN_VOL_PCTL) {
                    found.push({
                        ticker: t, metric: 'dpVolRatio', source: 'finra', date: r.date,
                        label: { ko: '장외 거래량(시장 대비)', en: 'Off-exchange volume (vs market)', ja: '取引所外の出来高(市場比)' },
                        today: r.volume, baseline: Math.round(r.volume / r.volRatio!), ratio: rel,
                        direction: 'surge',
                        rawRatio: r.volRatio, marketRatio: Math.round(mktVolRatio * 100) / 100,
                        percentile: r.volP, regime: r.regime ?? null,
                        rank: Math.abs(Math.log(rel)),
                    });
                }
                // ② 장외 «비중» 이탈 — 거래량이 아니라 «어디로 갔나»
                //    거래량은 거래소에서도 늘 수 있다. 비중이 35%→60% 로 뛰면
                //    그건 기관이 «경로»를 바꿨다는 뜻이라 다른 신호다.
                //    ⚠️ 자기 이력 백분위(pctP)로 잰다 — 절대 비중은 시장 중앙값이
                //       39% 라 매일 같은 배관 종목만 나온다(기록된 함정).
                //    ⚠️ [2026-09-03] pct 이력은 아직 4/23일치다(vol·short 는 23일).
                //       생산자가 「과거 통합거래량이 없어 소급 불가」라 오늘부터
                //       쌓는다. pctP 가 null 이면 조용히 빠지고, 이력이 차면
                //       **손대지 않아도 저절로 켜진다.**
                if (typeof r.pctP === 'number' && r.pctP >= 95
                    && typeof r.pct === 'number' && r.volume >= DP_MIN_VOLUME) {
                    found.push({
                        ticker: t, metric: 'dpShareSpike', source: 'finra', date: r.date,
                        label: { ko: '장외 비중 급등', en: 'Off-exchange share spike', ja: '取引所外シェア急騰' },
                        today: r.pct, baseline: r.marketAvg ?? null,
                        percentile: r.pctP, direction: 'surge',
                        volume: r.volume, regime: r.regime ?? null,
                        rank: (r.pctP - 90) / 10,
                    });
                }

                // ③ 은밀 매집·분산 (stealth)
                //    stealth = volP×0.6 + (100−shortP)×0.4  (finra-offexchange.js L289)
                //    「거래량은 많은데 공매도는 적다」 = 진짜 매수자가 장외에서 물량을
                //    담았다는 뜻이다. 반대면 분산이다. 이미 계산해 두고 랭킹에 안 쓰던
                //    값이고, 무료로 이 조합을 주는 곳이 없어 이 엔진의 «우리만» 축이다.
                //    ⚠️ 예전 dpShortDev 를 대체한다 — stealth 가 shortP 를 이미 품고
                //       있어 같은 말을 두 번 했고, 실측 상위 25 에 한 번도 못 들었다.
                if (typeof r.stealth === 'number' && Math.abs(r.stealth - 50) >= 20
                    && r.volume >= DP_MIN_VOLUME) {
                    const dev = Math.abs(r.stealth - 50) / 50;   // 0..1
                    found.push({
                        ticker: t, metric: 'dpStealth', source: 'finra', date: r.date,
                        label: { ko: r.stealth >= 70 ? '은밀 매집' : '은밀 분산',
                                 en: r.stealth >= 70 ? 'Stealth accumulation' : 'Stealth distribution',
                                 ja: r.stealth >= 70 ? '静かな買い集め' : '静かな分散' },
                        today: r.stealth, baseline: 50, ratio: r.stealth / 50,
                        direction: r.stealth >= 70 ? 'surge' : 'collapse',
                        volume: r.volume, volPercentile: r.volP, shortPercentile: r.shortP,
                        regime: r.regime ?? null,
                        rank: dev,
                    });
                }
            }
        } else {
            darkPool = { available: false, reason: '아직 안 들어옴 (마감 후 약 90분)' };
        }
    } catch {
        darkPool = { available: false, reason: '조회 실패' };
    }

    // ── 장중 «위치» 축 (오늘 체인) ────────────────────────────────────
    // 이탈 축은 이력이 필요해 수집 커버리지(23.5%)에 인질로 잡힌다. 위치 축은
    // 오늘 체인만 있으면 되므로 **2,001종목 전부**에 계산된다.
    // 값은 /api/cron/structure-build 가 `getStructureData` 로 구워 둔 것을 읽는다 —
    // 화면과 **같은 함수**를 쓴다. 계산을 두 벌로 만들면 조용히 갈라진다.
    //
    // 순위 점수(rank)는 축마다 «0..1 로 정규화된 근접도/이탈도»다. 축을 하나로
    // 섞어 비교하지 않고 `groups` 로 축별 목록을 따로 준다 — 그게 소비처가
    // 실제로 쓰는 모양이고(「감마플립 위 5」「맥스페인에 묶인 5」), 축 간 점수를
    // 억지로 같은 자로 재려다 생기는 왜곡도 없앤다.
    const STRUCT_MIN_OI = MIN_TODAY_OI;      // 옵션 축과 같은 유동성 기준
    const NEAR = 0.02;                        // 「경계에 붙었다」로 볼 범위 2%
    const STRUCT_MIN_PRICE = 15;              // 행사가 간격이 잡음이 되는 저가주 제외
    const MAX_SANE_GAP = 0.5;                 // 이보다 벌어지면 체인 고장이지 사건이 아니다
    let structRows: any[] = [];
    let structure: any = { available: false, reason: '아직 안 구워짐' };
    try {
        const parts = await Promise.all(
            Array.from({ length: SHARDS }, (_, i) =>
                getFromCache<{ rows: any[]; ts: number }>(`structure:part:v2:${i}`).catch(() => null)),
        );
        const have = parts.filter((x): x is { rows: any[]; ts: number } => !!x && Array.isArray(x.rows));
        for (const pt of have) structRows.push(...pt.rows);
        const ageMin = have.length
            ? Math.round((Date.now() - Math.max(...have.map((h) => h.ts || 0))) / 60000) : null;
        structure = {
            available: structRows.length > 0,
            parts: `${have.length}/${SHARDS}`,
            tickers: structRows.length,
            ageMin,
            // 나이를 숨기지 않는다. 장중이면 4시간 지난 구조는 「지금」이 아니다.
            // 지우지는 않는다 — 마감 후에는 그날 종가 구조가 정답이기 때문이다.
            stale: ageMin !== null && ageMin > 240,
        };
    } catch {
        structure = { available: false, reason: '조회 실패' };
    }

    if (structRows.length) {
        const liquid = structRows.filter((r) => r && r.px > 0 && (r.oi ?? 0) >= STRUCT_MIN_OI);
        structure.liquid = liquid.length;
        const pushStruct = (o: any) => found.push({ source: 'chain', ...o });

        for (const r of liquid) {
            // ④ 감마플립 경계 — 딜러 헤지가 «완충»에서 «증폭»으로 바뀌는 선.
            //    이 엔진에서 가장 «우리만»인 축이다.
            // ⚠️ 저가주는 뺀다. $6 짜리에서 「플립까지 0.02%」는 0.1센트라
            //    행사가 간격(보통 $0.5~1) 안의 우연이지 «붙었다»가 아니다.
            if (r.fl !== null && r.fl > 0 && r.px >= STRUCT_MIN_PRICE) {
                const d = Math.abs(r.px - r.fl) / r.px;
                if (d <= NEAR) pushStruct({
                    ticker: r.t, metric: 'gammaFlipEdge',
                    label: { ko: '감마플립 경계', en: 'At the gamma flip', ja: 'ガンマフリップ際' },
                    today: r.px, level: r.fl, distancePct: Math.round(d * 10000) / 100,
                    direction: r.px >= r.fl ? 'above' : 'below',
                    gex: r.gex, totalOI: r.oi, session: r.s,
                    rank: 1 - d / NEAR,
                });
            }
            // ⑤⑥ 맥스페인 — 「묶였다」와 「벗어났다」는 서로 다른 이야기라 목록도 둘이다.
            if (r.mp !== null && r.mp > 0) {
                const gap = (r.px - r.mp) / r.mp;
                const a = Math.abs(gap);
                if (a <= 0.005 && r.px >= STRUCT_MIN_PRICE) pushStruct({
                    ticker: r.t, metric: 'maxPainPin',
                    label: { ko: '맥스페인 핀', en: 'Pinned to max pain', ja: 'マックスペインに固定' },
                    today: r.px, level: r.mp, gapPct: Math.round(gap * 10000) / 100,
                    totalOI: r.oi, session: r.s,
                    rank: 1 - a / 0.005,
                });
                if (a >= 0.03 && a <= MAX_SANE_GAP && r.px >= STRUCT_MIN_PRICE) pushStruct({
                    ticker: r.t, metric: 'maxPainGap',
                    label: { ko: '맥스페인 이탈', en: 'Far from max pain', ja: 'マックスペイン乖離' },
                    today: r.px, level: r.mp, gapPct: Math.round(gap * 10000) / 100,
                    direction: gap >= 0 ? 'above' : 'below',
                    totalOI: r.oi, session: r.s,
                    // ⚠️ 상한을 두면 상위가 전부 1.0 으로 동점이 되어 **정렬이
                    //    무의미해진다**(실측: 22%·20%·2217%·33% 가 뒤죽박죽으로 나왔다).
                    //    괴리 그대로 쓴다 — 위에서 이미 말이 되는 범위로 잘랐다.
                    rank: a,
                });
            }
            // ⑦ 벽 압착 — 콜월과 풋플로어 사이가 가장 좁은 종목 =「상자에 갇혔다」
            if (r.cw !== null && r.pf !== null && r.cw > r.pf && r.pf > 0 && r.px >= STRUCT_MIN_PRICE) {
                const w = (r.cw - r.pf) / r.px;
                if (w <= 0.06 && r.px >= r.pf && r.px <= r.cw) pushStruct({
                    ticker: r.t, metric: 'wallSqueeze',
                    label: { ko: '벽 압착(콜월↔풋플로어)', en: 'Squeezed between walls', ja: '壁に挟まれている' },
                    today: r.px, callWall: r.cw, putFloor: r.pf,
                    widthPct: Math.round(w * 10000) / 100,
                    totalOI: r.oi, session: r.s,
                    rank: 1 - w / 0.06,
                });
            }
        }
    }

    // ── 옵션 축 시장 정규화 ──────────────────────────────────────────
    // 다크풀이 이미 쓰는 방식과 같다. 그 종목의 배수를 «그날 시장의 중앙 배수»로
    // 나눠, 시장 전체가 같이 움직인 몫을 걷어낸다. 남는 것만 그 종목 이야기다.
    const OPT_KEYS = new Set(METRICS.map((m) => m.key));
    const mktRatio: Record<string, number> = {};
    for (const [k, arr] of Object.entries(ratioPool)) {
        const mm = median(arr);
        // 표본이 얇으면 중앙값이 곧 잡음이다 — 그런 날은 정규화하지 않는다(=1).
        mktRatio[k] = arr.length >= 30 && mm !== null && mm > 0 ? mm : 1;
    }
    found = found.flatMap((f) => {
        if (!OPT_KEYS.has(f.metric) || typeof f.ratio !== 'number') return [f];
        const mk = mktRatio[f.metric] ?? 1;
        const rel = f.ratio / mk;
        if (!Number.isFinite(rel) || rel <= 0) return [];
        // 정규화한 값으로 게이트를 다시 건다. 시장이 같이 오른 몫을 뺐더니
        // 기준에 못 미치는 종목은 「그 종목 이야기」가 아니었다는 뜻이다.
        const twoSided = METRICS.find((m) => m.key === f.metric)?.kind === 'ratio';
        const passes = twoSided ? (rel >= MIN_RATIO || rel <= 1 / MIN_RATIO) : rel >= MIN_RATIO;
        if (!passes) return [];
        return [{
            ...f,
            ratio: rel,                                   // 표시·정렬은 시장 대비
            rawRatio: f.ratio,                            // 자기 기준선 대비(원본)
            marketRatio: Math.round(mk * 1000) / 1000,
            direction: rel >= 1 ? 'surge' : 'collapse',
            rank: Math.abs(Math.log(rel)),
        }];
    });

    // ⚠️ 마지막 방어망. rank 에 NaN 이 하나라도 있으면 비교자가 NaN 을 뱉고
    //    **정렬이 통째로 무의미해진다**(자바스크립트는 조용히 원래 순서를 남긴다).
    //    위에서 원인을 막았지만, 새 축을 추가한 사람이 또 만들 수 있는 실수다.
    //    여기서 한 번 더 걸러 «순위가 조용히 틀리는» 일이 다시 없게 한다.
    const dropped = found.length;
    found = found.filter((f) => Number.isFinite(f.rank));
    const nanDropped = dropped - found.length;
    found.sort((a, b) => b.rank - a.rank);

    // ── 축별 목록 (`groups`) ──────────────────────────────────────────
    // 소비처가 실제로 쓰는 모양은 「감마플립 위 5」「은밀 매집 5」 같은 **축별
    // 목록**이지 하나로 섞은 순위가 아니다. 그리고 축을 섞으면 점수 자를 억지로
    // 통일해야 하는데(배수 vs %p vs 근접도) 그 과정에서 왜곡이 생긴다.
    // 축 안에서는 같은 자로 재므로 순위가 정확하다 — 그래서 이쪽이 정본이다.
    const AXIS_ORDER = [
        'dpStealth', 'dpShareSpike', 'dpVolRatio',                   // 마감 · 다크풀
        'gammaFlipEdge', 'maxPainPin', 'maxPainGap', 'wallSqueeze',  // 장중 · 위치
        'pcr', 'totalCallOI', 'totalPutOI', 'totalPremium',          // 장중 · 이탈
    ];
    const groups: Record<string, any[]> = {};
    for (const k of AXIS_ORDER) {
        const list = found.filter((f) => f.metric === k).slice(0, top);
        if (list.length) groups[k] = list.map((f, i) => ({ ...f, rank: i + 1 }));
    }

    // ── 합본 목록 ─────────────────────────────────────────────────────
    // 하위호환 + 「오늘 한 장」용. 한 종목이 여러 축으로 독식하지 않게 티커를
    // 한 번만 쓰고, **축 하나가 목록을 통째로 먹지 않게 축별 상한**을 둔다
    // (실측: 상한이 없을 때 dpVolRatio 가 25칸 중 24칸을 먹었다).
    const perAxisCap = Math.max(2, Math.ceil(top / Math.max(1, Object.keys(groups).length) * 1.5));
    const seen = new Set<string>(); const axisCount: Record<string, number> = {};
    const picked: any[] = [];
    for (const f of found) {
        if (seen.has(f.ticker)) continue;
        if ((axisCount[f.metric] || 0) >= perAxisCap) continue;
        seen.add(f.ticker); axisCount[f.metric] = (axisCount[f.metric] || 0) + 1;
        picked.push(f);
        if (picked.length >= top) break;
    }

    const payload = {
        ok: true, _v: 6,
        // 어떤 에이전트가 읽어도 쓰는 법을 알 수 있게 — 응답 자체가 사용법을 가리킨다
        docs: 'https://www.signumhq.com/ranking-api.md',
        generatedAt: new Date().toISOString(),
        method: {
            baseline: `최근 ${days}일 중앙값(평균 아님)`,
            snapshot: '하루에 여러 스냅샷이 있고 실행마다 다른 만기가 걸린다(같은 날 OI 가 20배까지 널뛴다). 그래서 마지막 값이 아니라 «총 OI 가 가장 큰 스냅샷» 하나를 골라 모든 지표를 거기서 읽는다.',
            dispersion: 'MAD',
            // ⚠️ 축마다 게이트가 다르다. 하나로 뭉뚱그려 적으면 문서가 거짓말이 된다
            //    (예전엔 z 게이트가 다크풀에도 걸리는 것처럼 적혀 있었다 — 안 걸린다).
            guards: {
                옵션: [
                    '시장 정규화 — 그날 시장의 중앙 배수로 나눈다(풋 미결제약정 동조율 90%·콜 76% 실측). 표본 30개 미만인 날은 정규화하지 않는다.',
                    '축은 실측으로 골랐다 — 「하루안 범위 ÷ 날짜간 변화」가 큰 축(whaleScore 10.5배·dex 4.0배·squeezeProbability 2.3배)은 그날의 값이 존재하지 않아 제외했다.',
                    '만기 롤오버(같은 규모 체인만 비교)',
                    `최소 비교 ${MIN_REGIME_DAYS}일`,
                    `${MIN_Z} ≤ |z| ≤ ${MAX_Z} (상한은 산포 붕괴 탐지용)`,
                    `배수 ≥ ${MIN_RATIO} 또는 ≤ ${(1 / MIN_RATIO).toFixed(2)} (양방향)`,
                    `당일 총 미결제약정 ≥ ${MIN_TODAY_OI.toLocaleString()} (얇은 종목의 지표는 잡음이다)`,
                    '수집 최신 세션과 다른 종목 제외',
                ],
                다크풀_거래량: [
                    `장외 거래량 ≥ ${DP_MIN_VOLUME.toLocaleString()}주 (실측 75분위)`,
                    `자기 이력 백분위 ≥ ${DP_MIN_VOL_PCTL}`,
                    `시장 대비 배수 ≥ ${MIN_RATIO} — **급증만**`,
                    '시장 중앙 배수가 0.73 이라 «평소보다 적음»은 종목 절반의 정상 상태다. 붕괴를 같이 재면 그게 1위를 먹는다.',
                ],
                다크풀_공매도: ['평소 대비 |%p 이탈| ≥ 8 (양방향)'],
            },
            note: '순위는 «평소의 몇 배»(비율). σ 는 게이트로만 쓴다. 각 항목의 `direction` 이 surge/collapse 를 알려 준다 — 배수만 보고 카드를 그리면 안 된다.',
            darkPool: 'FINRA 장외. 마감 후 약 90분(17:30 ET)에 들어온다. 없으면 랭킹에서 빠지고 available:false 로 보고한다. 공매도는 시장 중앙값이 49% 라 절대값이 아니라 그 종목의 평소 대비 %p 이탈로 잰다.',
        },
        universe: UNIVERSE.length,
        // 응답이 스스로 «얼마나 봤는지» 밝힌다. partial 을 숨기면 25종목짜리
        // 결과가 2,001종목 랭킹인 척하게 된다 — 라벨과 데이터가 어긋나는 전형이다.
        // 이 랭킹이 «어느 세션» 이야기인지 응답이 직접 밝힌다.
        session: (found.reduce<string | null>((m, f) => (f.date && (!m || f.date > m) ? f.date : m), null)),
        scanned: partialReason ? slice.length : UNIVERSE.length,
        partial: partialReason ?? false,
        shards: SHARDS,
        darkPool,
        candidates: found.length, nanDropped,
        // ★ 정본은 `groups` 다 — 축별 목록. `ranking` 은 합본(하위호환·요약용).
        groups,
        structure,
        // 축이 «왜 비어 있는지»가 밖에서 보여야 한다. 안 보이면 켜진 줄 안다.
        axesStatus: [
            { metric: 'dpStealth', ready: !!groups.dpStealth, note: 'FINRA stealth — 즉시' },
            { metric: 'dpShareSpike', ready: !!groups.dpShareSpike,
              note: 'pct 이력 10일 필요(생산자가 오늘부터 쌓는 중) — 차면 자동 활성' },
            { metric: 'dpVolRatio', ready: !!groups.dpVolRatio, note: 'FINRA volRatio — 즉시' },
            { metric: 'gammaFlipEdge', ready: !!groups.gammaFlipEdge, note: '오늘 체인 — 이력 불필요' },
            { metric: 'maxPainPin', ready: !!groups.maxPainPin, note: '오늘 체인 — 이력 불필요' },
            { metric: 'maxPainGap', ready: !!groups.maxPainGap, note: '오늘 체인 — 이력 불필요' },
            { metric: 'wallSqueeze', ready: !!groups.wallSqueeze, note: '오늘 체인 — 이력 불필요' },
            { metric: 'pcr', ready: !!groups.pcr, note: '이력 8세션 · 수집 커버리지에 의존' },
        ],
        // 유니버스 중 «오늘 자료가 있는» 비율. 낮으면 순위가 좁은 표본에서 나온다.
        coverage: (() => {
            const tot = Object.values(coverage.lastSeen).reduce((a, b) => a + b, 0);
            return {
                withHistory: tot, fresh: coverage.fresh,
                freshPct: tot ? Math.round((coverage.fresh / tot) * 1000) / 10 : null,
                lastSeen: Object.fromEntries(
                    Object.entries(coverage.lastSeen).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6)),
            };
        })(),
        // 축별 «준비 상태». 어떤 축이 살아 있고 어떤 축이 자료를 기다리는지
        // 밖에서 보이게 한다 — 안 보이면 「켜져 있는 줄 알았는데 아니었다」가 된다.
        axes: METRICS.map((m) => ({
            metric: m.key, kind: m.kind,
            samples: (ratioPool[m.key] || []).length,
            marketRatio: mktRatio[m.key] ?? null,
            normalized: (ratioPool[m.key] || []).length >= 30,
            ranked: found.filter((f) => f.metric === m.key).length,
        })),
        skipped,
        ranking: picked,
    };
    await setInCache(CACHE, payload, 600).catch(() => { });
    return NextResponse.json({ ...payload, _cache: 'miss' });
}
