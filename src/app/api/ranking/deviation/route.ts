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

const UNIVERSE = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'AMD', 'MU',
    'NFLX', 'PLTR', 'COIN', 'SMCI', 'INTC', 'JPM', 'UNH', 'XOM', 'LLY', 'COST',
    'BA', 'CAT', 'QQQ', 'SPY', 'IWM',
];

type Metric = { key: string; label: { ko: string; en: string; ja: string } };
// ivSkew 는 뺐다 — 실측 300행 전부 0 이다(생산자가 채우지 않는다).
const METRICS: Metric[] = [
    { key: 'pcr', label: { ko: '풋콜 비율', en: 'Put/call ratio', ja: 'プットコール比率' } },
    { key: 'totalCallOI', label: { ko: '콜 미결제약정', en: 'Call open interest', ja: 'コール建玉' } },
    { key: 'totalPutOI', label: { ko: '풋 미결제약정', en: 'Put open interest', ja: 'プット建玉' } },
    { key: 'whaleScore', label: { ko: '대형거래 지표', en: 'Large-trade score', ja: '大口取引スコア' } },
    { key: 'dex', label: { ko: '델타 노출', en: 'Delta exposure', ja: 'デルタ・エクスポージャー' } },
    { key: 'squeezeProbability', label: { ko: '스퀴즈 확률', en: 'Squeeze probability', ja: 'スクイーズ確率' } },
    { key: 'totalPremium', label: { ko: '옵션 자금', en: 'Options premium', ja: 'オプション資金' } },
];

const MIN_SESSIONS = 8;
const REGIME_LO = 0.5, REGIME_HI = 2.0;   // 오늘 총 OI 대비 «같은 규모»로 볼 범위
const MIN_REGIME_DAYS = 6;
const MIN_REL_DISPERSION = 0.03;
const MIN_Z = 3;
const MIN_RATIO = 1.35;

const median = (a: number[]): number | null => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const etDay = (ms: number) => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);

type Row = { timestamp: number; totalCallOI?: number; totalPutOI?: number;[k: string]: any };

async function history(ticker: string, days: number): Promise<Row[]> {
    return queryItems<Row>(
        TABLES.FLOW_HISTORY,
        'ticker = :t AND #ts > :since',
        { ':t': ticker, ':since': Date.now() - days * 86400e3 },
        { limit: 400, scanForward: true, maxItems: 3000, expressionNames: { '#ts': 'timestamp' } },
    );
}

// 하루에 여러 스냅샷이 있다 — «그날의 마지막 값»을 그날 값으로 삼는다.
function daily(items: Row[], key: string) {
    const byDay = new Map<string, { ts: number; v: number; oi: number }>();
    for (const it of items) {
        const v = Number(it[key]);
        if (!Number.isFinite(v)) continue;
        const ts = Number(it.timestamp);
        const d = etDay(ts);
        // 총 OI 는 «어느 만기를 보고 있었나»의 대리 지표다.
        const oi = Number(it.totalCallOI || 0) + Number(it.totalPutOI || 0);
        const prev = byDay.get(d);
        if (!prev || ts > prev.ts) byDay.set(d, { ts, v, oi });
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, x]) => ({ d, ...x }));
}

export async function GET(req: NextRequest) {
    const days = Math.min(90, Math.max(10, Number(req.nextUrl.searchParams.get('days')) || 30));
    const top = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get('top')) || 5));
    const CACHE = `ranking:deviation:v1:${days}:${top}`;

    if (req.nextUrl.searchParams.get('refresh') !== '1') {
        const hit = await getFromCache<any>(CACHE);
        if (hit) return NextResponse.json({ ...hit, _cache: 'hit' });
    }

    const found: any[] = [];
    const skipped: Record<string, number> = {};
    const bump = (r: string) => { skipped[r] = (skipped[r] || 0) + 1; };

    for (const t of UNIVERSE) {
        let items: Row[] = [];
        try { items = await history(t, days); } catch { bump('조회실패'); continue; }
        if (!items.length) { bump('이력없음'); continue; }

        for (const m of METRICS) {
            const series = daily(items, m.key);
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

            const z = (today.v - med) / scale;
            if (!Number.isFinite(z) || Math.abs(z) < MIN_Z) { bump('유의하지않음'); continue; }
            // 점수류에서 오늘이 «정확히 0» 이면 측정된 0 인지 미계산인지 모른다.
            if (today.v === 0 && /Score|Probability/i.test(m.key)) { bump('0값모호'); continue; }

            const ratio = today.v / med;
            if (!(ratio >= MIN_RATIO || ratio <= 1 / MIN_RATIO)) { bump('배수작음'); continue; }

            found.push({
                ticker: t, metric: m.key, label: m.label,
                today: today.v, baseline: med, ratio, z,
                sessions: cmp.length, date: today.d, totalOI: today.oi,
                rank: Math.abs(Math.log(ratio)),
            });
        }
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
    let darkPool: any = { available: false, reason: '자료 없음' };
    try {
        // ⚠️ 다크풀은 «EC2 Redis 프록시»로 읽힌다. getFromCache 로 같은 키를 찍으면
        //    빈 값이 온다(실제로 그래서 available:false 가 나왔다). 앱의 정본
        //    접근자를 그대로 쓴다 — 저장 경로가 바뀌어도 여기가 따라 깨지지 않는다.
        // ⚠️ 이 키는 2.19MB 이고 읽기 타임아웃이 5초다(실측 5.2초 — 코드 주석에
        //    경고가 있다). getDarkPoolMarket 과 «동시에» 부르면 둘 다 넘겨서
        //    다크풀이 에러 없이 사라진다(실제로 그랬다). 한 번만 읽는다 —
        //    date·marketAvg 는 어차피 각 종목 행에 실려 온다.
        const rows = await getDarkPoolBatch(UNIVERSE.filter((t) => !DP_ETF.has(t)));
        const list = Object.values(rows);
        const n = list.length;
        if (n > 0) {
            darkPool = {
                available: true, date: list[0].date ?? null,
                marketAvg: list[0].marketAvg ?? null, covered: n,
            };
            for (const [t, r] of Object.entries(rows)) {
                // ① 장외 물량이 평소의 몇 배 — 이미 계산돼 있다
                if (typeof r.volRatio === 'number' && r.volRatio > 0
                    && (r.volRatio >= MIN_RATIO || r.volRatio <= 1 / MIN_RATIO)) {
                    found.push({
                        ticker: t, metric: 'dpVolRatio', source: 'finra', date: r.date,
                        label: { ko: '장외 거래량', en: 'Off-exchange volume', ja: '取引所外の出来高' },
                        today: r.volume, baseline: Math.round(r.volume / r.volRatio), ratio: r.volRatio,
                        percentile: r.volP, regime: r.regime ?? null,
                        rank: Math.abs(Math.log(r.volRatio)),
                    });
                }
                // ② 공매도 «비중» 이탈 — 여기서는 배수가 아니라 %p 로 잰다.
                //    49%→65% 는 배수로 1.33 밖에 안 되지만 실제로는 큰 이탈이다.
                if (typeof r.shortDev === 'number' && typeof r.shortAvg === 'number'
                    && typeof r.shortPct === 'number' && r.shortAvg > 0 && Math.abs(r.shortDev) >= 8) {
                    found.push({
                        ticker: t, metric: 'dpShortDev', source: 'finra', date: r.date,
                        label: { ko: '장외 공매도 비중', en: 'Off-exchange short share', ja: '取引所外の空売り比率' },
                        today: r.shortPct, baseline: r.shortAvg, ratio: r.shortPct / r.shortAvg,
                        deviationPp: r.shortDev, percentile: r.shortP, regime: r.regime ?? null,
                        // %p 이탈을 시장 중앙값(49%) 기준으로 정규화해 다른 축과 같은 자로 잰다
                        rank: Math.abs(r.shortDev) / 49,
                    });
                }
            }
        } else {
            darkPool = { available: false, reason: '아직 안 들어옴 (마감 후 약 90분)' };
        }
    } catch {
        darkPool = { available: false, reason: '조회 실패' };
    }

    found.sort((a, b) => b.rank - a.rank);
    // 한 종목이 여러 축으로 상위를 독식하면 랭킹이 아니라 한 종목 소개가 된다.
    const seen = new Set<string>(); const picked: any[] = [];
    for (const f of found) {
        if (seen.has(f.ticker)) continue;
        seen.add(f.ticker); picked.push(f);
        if (picked.length >= top) break;
    }

    const payload = {
        ok: true, _v: 2,
        generatedAt: new Date().toISOString(),
        method: {
            baseline: `최근 ${days}일 중앙값(평균 아님)`,
            dispersion: 'MAD',
            guards: ['만기 롤오버(같은 규모 체인만 비교)', `최소 비교 ${MIN_REGIME_DAYS}일`, `|z| ≥ ${MIN_Z}`, `배수 ≥ ${MIN_RATIO}`],
            note: '순위는 «평소의 몇 배»(비율). σ 는 게이트로만 쓴다.',
            darkPool: 'FINRA 장외. 마감 후 약 90분(17:30 ET)에 들어온다. 없으면 랭킹에서 빠지고 available:false 로 보고한다. 공매도는 시장 중앙값이 49% 라 절대값이 아니라 그 종목의 평소 대비 %p 이탈로 잰다.',
        },
        universe: UNIVERSE.length,
        darkPool,
        candidates: found.length,
        skipped,
        ranking: picked,
    };
    await setInCache(CACHE, payload, 600).catch(() => { });
    return NextResponse.json({ ...payload, _cache: 'miss' });
}
