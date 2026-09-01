import { NextRequest, NextResponse } from 'next/server';
import { queryItems, TABLES } from '@/lib/aws/dynamoClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getDarkPoolBatch } from '@/services/darkPool';
import {
    Row, dailySnapshots, deviationOf, median, ratioDistance, sessionPhase,
} from '@/lib/rankings/engine';
import { RANKINGS, byId } from '@/lib/rankings/registry';

// ============================================================================
// /api/ranking — 랭킹 엔진.
//
//   GET /api/ranking                → 어떤 랭킹이 있고 지금 무엇이 되는지
//   GET /api/ranking?run=all        → 전부 실행
//   GET /api/ranking?run=stealth    → 하나만 실행
//
// 장중(intraday)과 마감 후(postclose)를 구분한다. 마감 후 랭킹은 FINRA 자료가
// 들어와야(마감 +약 90분) 작동하고, 그 전에는 «없음»으로 보고한다 —
// 어제 것을 오늘인 척 내보내지 않는다.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UNIVERSE = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AVGO', 'AMD', 'MU',
    'NFLX', 'PLTR', 'COIN', 'SMCI', 'INTC', 'JPM', 'UNH', 'XOM', 'LLY', 'COST',
    'BA', 'CAT', 'QQQ', 'SPY', 'IWM',
];
const ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD']);

// ivSkew 는 뺐다 — 실측 300행 전부 0 이다(생산자가 채우지 않는다).
const DEV_AXES: Array<{ key: string; label: { ko: string; en: string; ja: string } }> = [
    { key: 'pcr', label: { ko: '풋콜 비율(미결제약정)', en: 'Put/call ratio (OI)', ja: 'プットコール比率(建玉)' } },
    { key: 'totalCallOI', label: { ko: '콜 미결제약정', en: 'Call open interest', ja: 'コール建玉' } },
    { key: 'totalPutOI', label: { ko: '풋 미결제약정', en: 'Put open interest', ja: 'プット建玉' } },
    { key: 'whaleScore', label: { ko: '대형거래 지표', en: 'Large-trade score', ja: '大口取引スコア' } },
    { key: 'dex', label: { ko: '델타 노출', en: 'Delta exposure', ja: 'デルタ・エクスポージャー' } },
    { key: 'squeezeProbability', label: { ko: '스퀴즈 확률', en: 'Squeeze probability', ja: 'スクイーズ確率' } },
    { key: 'totalPremium', label: { ko: '옵션 자금', en: 'Options premium', ja: 'オプション資金' } },
];

const hist = (table: string, ticker: string, days: number) => queryItems<Row>(
    table, 'ticker = :t AND #ts > :since',
    { ':t': ticker, ':since': Date.now() - days * 86400e3 },
    { limit: 400, scanForward: true, maxItems: 3000, expressionNames: { '#ts': 'timestamp' } },
);

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams;
    const run = q.get('run');
    const days = Math.min(90, Math.max(10, Number(q.get('days')) || 30));
    const top = Math.min(10, Math.max(1, Number(q.get('top')) || 5));
    const sess = sessionPhase();

    const catalog = RANKINGS.map((r) => ({
        id: r.id, phase: r.phase, name: r.name, what: r.what, why: r.why,
        source: r.source, guards: r.guards, direction: r.direction,
    }));

    if (!run) {
        return NextResponse.json({
            ok: true, docs: 'https://www.signumhq.com/ranking-api.md',
            session: sess, rankings: catalog,
            usage: 'run=all 또는 run=<id> 로 실행. 각 랭킹의 what/why 가 그대로 쓰는 법이다.',
        });
    }

    const wanted = run === 'all' ? RANKINGS : (byId(run) ? [byId(run)!] : []);
    if (!wanted.length) {
        return NextResponse.json({ ok: false, error: `모르는 랭킹: ${run}`, available: RANKINGS.map((r) => r.id) }, { status: 400 });
    }

    const CACHE = `ranking:v1:${run}:${days}:${top}`;
    if (q.get('refresh') !== '1') {
        const hit = await getFromCache<any>(CACHE);
        if (hit) return NextResponse.json({ ...hit, _cache: 'hit' });
    }

    const needFlow = wanted.some((r) => ['deviation', 'multi-axis', 'money-vs-oi'].includes(r.id));
    const needGex = wanted.some((r) => ['maxpain-gap', 'gamma-flip'].includes(r.id));
    const needDp = wanted.some((r) => r.needsPostClose);

    // ── 자료 수집 ────────────────────────────────────────────────────────
    const flowSnaps: Record<string, any[]> = {};
    const gexSnaps: Record<string, any[]> = {};
    for (const t of UNIVERSE) {
        if (needFlow) { try { flowSnaps[t] = dailySnapshots(await hist(TABLES.FLOW_HISTORY, t, days)); } catch { } }
        if (needGex) { try { gexSnaps[t] = dailySnapshots(await hist('signum-gex-history', t, days)); } catch { } }
    }

    // 옵션이 보고 있는 최신 세션 — 다크풀 신선도 판정의 기준
    const optionSession = [...Object.values(flowSnaps), ...Object.values(gexSnaps)]
        .flat().reduce<string | null>((m, s: any) => (s?._d && (!m || s._d > m) ? s._d : m), null);

    let dp: Record<string, any> = {};
    let dpMeta: any = { available: false, reason: '요청되지 않음' };
    if (needDp) {
        try {
            // ⚠️ 이 키는 2.19MB 다. 두 번 동시에 읽으면 5초 타임아웃을 넘겨
            //    다크풀이 «에러 없이» 사라진다. 한 번만 읽는다.
            dp = await getDarkPoolBatch(UNIVERSE.filter((t) => !ETF.has(t)));
            const list = Object.values(dp);
            const dpDate = list.length ? (list[0] as any).date ?? null : null;
            if (!list.length) dpMeta = { available: false, reason: '자료 없음' };
            else if (optionSession && dpDate !== optionSession) {
                dpMeta = { available: false, stale: true, date: dpDate, expected: optionSession,
                    reason: `아직 안 들어옴 — 보유분 ${dpDate}, 옵션은 ${optionSession} 세션 (마감 후 약 90분에 갱신)` };
                dp = {};
            } else {
                dpMeta = { available: true, date: dpDate, covered: list.length };
            }
        } catch { dpMeta = { available: false, reason: '조회 실패' }; }
    }

    // ── 랭킹별 계산 ──────────────────────────────────────────────────────
    const results: Record<string, any> = {};
    const devByTicker: Record<string, any[]> = {};

    for (const spec of wanted) {
        const rows: any[] = [];
        const skipped: Record<string, number> = {};
        const bump = (r: string) => { skipped[r] = (skipped[r] || 0) + 1; };

        if (spec.id === 'deviation' || spec.id === 'multi-axis') {
            for (const t of UNIVERSE) {
                const snaps = flowSnaps[t]; if (!snaps?.length) { bump('이력없음'); continue; }
                for (const ax of DEV_AXES) {
                    const { ok, reason } = deviationOf(snaps, ax.key);
                    if (!ok) { bump(reason || '제외'); continue; }
                    // 점수류에서 오늘이 «정확히 0» 이면 측정된 0 인지 미계산인지 모른다.
                    if (ok.today === 0 && /Score|Probability/i.test(ax.key)) { bump('0값모호'); continue; }
                    const item = { ticker: t, metric: ax.key, label: ax.label, ...ok, rank: ratioDistance(ok.ratio) };
                    rows.push(item);
                    (devByTicker[t] ||= []).push(item);
                }
            }
        }

        if (spec.id === 'maxpain-gap' || spec.id === 'gamma-flip') {
            const field = spec.id === 'maxpain-gap' ? 'maxPain' : 'flipLevel';
            const bound = spec.id === 'maxpain-gap' ? 0.35 : 0.25;
            for (const t of UNIVERSE) {
                const s = gexSnaps[t]?.[gexSnaps[t].length - 1]; if (!s) { bump('이력없음'); continue; }
                const price = Number(s.price), lvl = Number(s[field]);
                if (!(price > 0) || !(lvl > 0)) { bump('값없음'); continue; }
                const gap = (price - lvl) / price;
                // 계산이 어긋난 값은 지어내지 말고 버린다
                if (Math.abs(gap) > bound) { bump('범위밖(계산오류 의심)'); continue; }
                rows.push({
                    ticker: t, metric: spec.id, label: spec.name,
                    price, level: lvl, gapPct: Math.round(gap * 1000) / 10, date: s._d,
                    // 이격도는 «먼» 순, 감마플립은 «가까운» 순
                    rank: spec.direction === 'proximity' ? -Math.abs(gap) : Math.abs(gap),
                });
            }
        }

        if (spec.id === 'money-vs-oi') {
            for (const t of UNIVERSE) {
                const s = flowSnaps[t]?.[flowSnaps[t].length - 1]; if (!s) { bump('이력없음'); continue; }
                const cp = Number(s.callPremium), pp = Number(s.putPremium);
                const co = Number(s.totalCallOI), po = Number(s.totalPutOI);
                if (!(cp > 0 && pp > 0 && co > 0 && po > 0)) { bump('같은 스냅샷에 둘 다 없음'); continue; }
                const dollarRatio = cp / pp, oiRatio = co / po;
                const disagree = Math.abs(Math.log(dollarRatio) - Math.log(oiRatio));
                if (disagree < Math.log(1.5)) { bump('불일치 작음'); continue; }
                rows.push({
                    ticker: t, metric: 'money-vs-oi', label: spec.name, date: s._d,
                    dollarRatio: Math.round(dollarRatio * 100) / 100,
                    oiRatio: Math.round(oiRatio * 100) / 100,
                    callPremium: cp, putPremium: pp, callOI: co, putOI: po,
                    rank: disagree,
                });
            }
        }

        if (spec.needsPostClose) {
            if (!dpMeta.available) { results[spec.id] = { available: false, reason: dpMeta.reason, items: [] }; continue; }
            const list = Object.values(dp) as any[];
            const mktVolRatio = median(list.map((x) => x.volRatio).filter((v) => typeof v === 'number' && v > 0)) ?? 1;

            for (const [t, r] of Object.entries(dp) as [string, any][]) {
                if (spec.id === 'darkpool-volume') {
                    const rel = typeof r.volRatio === 'number' && r.volRatio > 0 ? r.volRatio / mktVolRatio : null;
                    if (rel === null || (rel < 1.35 && rel > 1 / 1.35)) { bump('배수작음'); continue; }
                    rows.push({ ticker: t, metric: spec.id, label: spec.name, date: r.date,
                        today: r.volume, baseline: Math.round(r.volume / r.volRatio), ratio: rel,
                        rawRatio: r.volRatio, marketRatio: Math.round(mktVolRatio * 100) / 100,
                        percentile: r.volP, rank: ratioDistance(rel) });
                }
                if (spec.id === 'darkpool-short') {
                    if (typeof r.shortDev !== 'number' || Math.abs(r.shortDev) < 8) { bump('이탈작음'); continue; }
                    rows.push({ ticker: t, metric: spec.id, label: spec.name, date: r.date,
                        today: r.shortPct, baseline: r.shortAvg, deviationPp: r.shortDev,
                        percentile: r.shortP, rank: Math.abs(r.shortDev) / 49 });
                }
                if (spec.id === 'stealth') {
                    if (typeof r.stealth !== 'number') { bump('표본부족'); continue; }
                    if (Math.abs(r.stealth - 50) < 20) { bump('중립'); continue; }
                    rows.push({ ticker: t, metric: 'stealth', label: spec.name, date: r.date,
                        stealth: r.stealth, regime: r.regime, volP: r.volP, shortP: r.shortP,
                        rank: Math.abs(r.stealth - 50) / 50 });
                }
            }
        }

        if (spec.id === 'multi-axis') {
            const grouped = Object.entries(devByTicker)
                .map(([t, axes]) => ({
                    ticker: t, axisCount: axes.length,
                    axes: axes.map((a) => ({ metric: a.metric, label: a.label, ratio: Math.round(a.ratio * 100) / 100, today: a.today, baseline: a.baseline })),
                    date: axes[0]?.date ?? null,
                    rank: axes.length + axes.reduce((s, a) => s + a.rank, 0) / 10,
                }))
                .filter((g) => g.axisCount >= 2);
            rows.length = 0; rows.push(...grouped);
        }

        rows.sort((a, b) => b.rank - a.rank);
        // 한 종목이 상위를 독식하면 랭킹이 아니라 한 종목 소개가 된다.
        const seen = new Set<string>(); const picked: any[] = [];
        for (const r of rows) { if (seen.has(r.ticker)) continue; seen.add(r.ticker); picked.push(r); if (picked.length >= top) break; }

        results[spec.id] = {
            available: picked.length > 0, phase: spec.phase,
            name: spec.name, what: spec.what, why: spec.why, guards: spec.guards,
            candidates: rows.length, skipped, items: picked,
        };
    }

    const payload = {
        ok: true, _v: 1, docs: 'https://www.signumhq.com/ranking-api.md',
        generatedAt: new Date().toISOString(), session: sess,
        optionSession, darkPool: dpMeta, universe: UNIVERSE.length, results,
    };
    await setInCache(CACHE, payload, 600).catch(() => { });
    return NextResponse.json({ ...payload, _cache: 'miss' });
}
