import { NextRequest, NextResponse } from 'next/server';
import { queryItems, TABLES } from '@/lib/aws/dynamoClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getDarkPoolBatch } from '@/services/darkPool';
import {
    Row, dailySnapshots, deviationOf, median, ratioDistance, sessionPhase, latestWith, readinessOf, dailyValues,
} from '@/lib/rankings/engine';
import { RANKINGS, byId } from '@/lib/rankings/registry';
import { fetchInsiderBuys, fetchFundamentals } from '@/lib/rankings/sources';

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
// ⚠️ [2026-09-03] 축을 실측으로 골랐다 (scripts/_axis-quality.js · 10종목 30일).
//    「하루안 범위 ÷ 날짜간 변화」가 크면 **그날의 값이 존재하지 않는다** —
//    어느 스냅샷을 집었느냐가 값을 정한다. 그래서 아래 셋을 뺐다:
//      whaleScore 10.5배 · dex 4.0배 · squeezeProbability 2.3배(+동조율 57%)
//    특히 squeezeProbability 는 랭킹이 60 이라 할 때 **앱 화면은 15** 였다 —
//    사용자가 앱에서 확인 못 하는 순위는 오보다.
//    ivSkew 도 예전에 뺐다 — 실측 300행 전부 0(생산자가 안 채운다).
//    ※ 이 목록은 /api/ranking/deviation 의 METRICS 와 **같아야 한다.**
//      갈라지면 두 주소가 다른 답을 주고, 그때 어느 쪽이 맞는지 알 수 없다.
const DEV_AXES: Array<{ key: string; label: { ko: string; en: string; ja: string } }> = [
    { key: 'pcr', label: { ko: '풋콜 비율(미결제약정)', en: 'Put/call ratio (OI)', ja: 'プットコール比率(建玉)' } },
    { key: 'totalCallOI', label: { ko: '콜 미결제약정', en: 'Call open interest', ja: 'コール建玉' } },
    { key: 'totalPutOI', label: { ko: '풋 미결제약정', en: 'Put open interest', ja: 'プット建玉' } },
    { key: 'totalPremium', label: { ko: '옵션 자금', en: 'Options premium', ja: 'オプション資金' } },
];

const hist = (table: string, ticker: string, days: number) => queryItems<Row>(
    table, 'ticker = :t AND #ts > :since',
    { ':t': ticker, ':since': Date.now() - days * 86400e3 },
    { limit: 400, scanForward: true, maxItems: 3000, expressionNames: { '#ts': 'timestamp' } },
);

async function pool25<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(5, items.length) }, async () => {
        while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    }));
    return out;
}

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

    // v4 — 미가용 블록에 name/phase/what/why 를 실었다. 옛 페이로드가 200 OK 로 나가면
    //      화면이 카드 제목에 id 를 그대로 찍는다(캐시 10분).
    // v5 — 엔진의 영어 표시명을 줄였다(카드 제목이 잘려서). 이름이 응답에 실려 있으므로
    //      키를 올리지 않으면 옛 긴 이름이 10분 더 나간다.
    const CACHE = `ranking:v5:${run}:${days}:${top}`;
    if (q.get('refresh') !== '1') {
        const hit = await getFromCache<any>(CACHE);
        if (hit) return NextResponse.json({ ...hit, _cache: 'hit' });
    }

    const needFlow = wanted.some((r) => ['deviation', 'multi-axis', 'money-vs-oi'].includes(r.id));
    const needGex = wanted.some((r) => ['maxpain-gap', 'gamma-flip', 'volatility-bet'].includes(r.id));
    const needDp = wanted.some((r) => r.needsPostClose);
    const needInsider = wanted.some((r) => r.id === 'insider-conviction');
    const needFunda = wanted.some((r) => r.id === 'deep-value-fcf');

    // ── 자료 수집 ────────────────────────────────────────────────────────
    const flowSnaps: Record<string, any[]> = {};
    const flowRaw: Record<string, Row[]> = {};
    const gexSnaps: Record<string, any[]> = {};
    const gexRaw: Record<string, Row[]> = {};
    // ⚠️ [2026-09-03] 구조 랭킹(맥스페인·감마플립)이 25종목만 보고 있었다.
    //    읽던 `signum-gex-history` 는 **페이지 방문 때만** 쓰이는 경로라
    //    표본 120종목 중 112개가 2026-08-28 에 멈춰 있었다(사실상 죽은 소스).
    //    `/api/cron/structure-build` 가 2,001종목을 8조각으로 굽는다(실측 100%·10초).
    //    그걸 읽으면 «25 → 2,001» 이 되고, 직렬 루프도 없어진다.
    // 구조 캐시는 «항상» 읽는다. 구조 랭킹의 재료이면서 동시에 **유효 유니버스의
    // 정본**이기도 하다 — 다크풀 랭킹도 이 목록을 써야 25종목에 갇히지 않는다.
    // 조각 8개 읽기라 비용이 거의 없다.
    const structRows: Record<string, any> = {};
    {
        try {
            const parts = await Promise.all(
                Array.from({ length: 8 }, (_, i) =>
                    getFromCache<{ rows: any[]; ts: number }>(`structure:part:v2:${i}`).catch(() => null)),
            );
            for (const pt of parts) {
                for (const r of (pt?.rows ?? [])) if (r?.t) structRows[r.t] = r;
            }
        } catch { }
    }
    const STRUCT_UNIVERSE = Object.keys(structRows);
    for (const t of UNIVERSE) {
        if (needFlow) {
            try {
                const raw = await hist(TABLES.FLOW_HISTORY, t, days);
                flowRaw[t] = raw; flowSnaps[t] = dailySnapshots(raw);
            } catch { }
        }
        if (needGex) {
            try {
                const raw = await hist('signum-gex-history', t, days);
                gexRaw[t] = raw; gexSnaps[t] = dailySnapshots(raw);
            } catch { }
        }
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
            // 다크풀도 25종목만 보고 있었다. FINRA 키는 한 덩어리라 목록 길이와
            // 무관하게 한 번만 읽는다 — 넓혀도 비용이 같다.
            const dpUni = STRUCT_UNIVERSE.length ? STRUCT_UNIVERSE : UNIVERSE;
            dp = await getDarkPoolBatch(dpUni.filter((t) => !ETF.has(t)));
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

    const insider = needInsider ? await fetchInsiderBuys(4).catch(() => null) : null;
    const funda = needFunda ? await fetchFundamentals(UNIVERSE).catch(() => null) : null;

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
            // 구조 캐시가 있으면 그걸 쓴다(2,001종목). 없으면 옛 경로로 물러난다.
            const src = STRUCT_UNIVERSE.length ? STRUCT_UNIVERSE : UNIVERSE;
            const F = field === 'maxPain' ? 'mp' : 'fl';
            for (const t of src) {
                const sr = structRows[t];
                const s = sr
                    ? { price: sr.px, maxPain: sr.mp, flipLevel: sr.fl, _d: null, oi: sr.oi }
                    : gexSnaps[t]?.[gexSnaps[t].length - 1];
                if (!s) { bump('이력없음'); continue; }
                // 저가주는 행사가 간격이 잡음이 된다($6 의 0.02% 는 0.1센트다)
                if (sr && (!(sr.px >= 15) || !(sr.oi >= 20000))) { bump('저가·저유동성'); continue; }
                const price = Number(s.price), lvl = Number(sr ? sr[F] : s[field]);
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
                // 프리미엄과 OI 를 «한 행에» 가진 최신 스냅샷만 쓴다.
                const s = latestWith(flowRaw[t] || [], ['callPremium', 'putPremium', 'totalCallOI', 'totalPutOI']);
                if (!s) { bump('프리미엄+OI 동시 보유 행 없음'); continue; }
                const cp = Number(s.callPremium), pp = Number(s.putPremium);
                const co = Number(s.totalCallOI), po = Number(s.totalPutOI);
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
            if (!dpMeta.available) {
                // ⚠️ 이름·단계를 안 실으면 화면이 카드 제목에 «darkpool-volume» 같은 id 를 그대로 찍고,
                //    phase 가 없어 탭 분류에서도 빠진다(실측: 11종인데 탭 합이 8).
                results[spec.id] = {
                    available: false, phase: spec.phase, name: spec.name, what: spec.what, why: spec.why,
                    reason: dpMeta.reason, items: [],
                };
                continue;
            }
            const list = Object.values(dp) as any[];
            const mktVolRatio = median(list.map((x) => x.volRatio).filter((v) => typeof v === 'number' && v > 0)) ?? 1;
            const mktStealth = median(list.map((x) => x.stealth).filter((v) => typeof v === 'number')) ?? 50;

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
                    // ⚠️ 시장 전체가 조용한 날엔 모든 종목의 volP 가 같이 내려가
                    //    전부 DISTRIBUTION 으로 찍힌다(실측: 상위 3개가 9·10·20점).
                    //    그건 종목 이야기가 아니라 그날 시장 이야기다.
                    //    → 50 이 아니라 «그날 시장 중앙값» 에서 얼마나 벗어났는지로 본다.
                    const dev = r.stealth - mktStealth;
                    if (Math.abs(dev) < 18) { bump('시장과 비슷'); continue; }
                    rows.push({ ticker: t, metric: 'stealth', label: spec.name, date: r.date,
                        stealth: r.stealth, marketStealth: mktStealth, deviation: Math.round(dev),
                        regime: dev > 0 ? 'ACCUMULATION' : 'DISTRIBUTION', rawRegime: r.regime,
                        volP: r.volP, shortP: r.shortP,
                        rank: Math.abs(dev) / 50 });
                }
            }
        }

        if (spec.id === 'volatility-bet') {
            const rd = readinessOf(gexRaw, spec.requires!.field, spec.requires!.sessions);
            // ⚠️ 세션 수가 찼어도 «며칠 전에 멈춘» 자료면 안 된다. 실측: atmIv 가
            //    08-28 에서 끊긴 채 24세션이 차 있었고, 하필 그날이 이상치라
            //    여러 종목이 동시에 IV랭크 100 으로 나왔다 — 3일 전 값을
            //    「오늘」로 쓴 것이다. 다크풀과 같은 신선도 게이트를 건다.
            if (rd.ready && optionSession && rd.lastDate && rd.lastDate !== optionSession) {
                rd.ready = false; rd.stale = true;
                results[spec.id] = {
                    available: false, phase: spec.phase, name: spec.name, what: spec.what, why: spec.why,
                    readiness: { ...rd, note: spec.requires!.why },
                    reason: `자료가 멈춰 있음 — ${rd.field} 마지막 ${rd.lastDate}, 옵션은 ${optionSession} 세션`,
                    items: [],
                };
                continue;
            }
            if (!rd.ready) {
                results[spec.id] = {
                    available: false, phase: spec.phase, name: spec.name, what: spec.what, why: spec.why,
                    readiness: { ...rd, note: spec.requires!.why },
                    reason: `자료 축적 중 — ${rd.field} ${rd.have}/${rd.need} 세션 (약 ${Math.max(1, rd.need - rd.have)}거래일 남음)`,
                    items: [],
                };
                continue;
            }
            // 실적이 가까운 종목은 «달력에 있는 이유»다 — 이 랭킹의 핵심은 그걸 빼는 것.
            const earn = await pool25(UNIVERSE, async (t) => {
                const r = await queryItems<any>('signum-pattern-db', 'pattern = :p', { ':p': `EARNINGS:${t}` }, { limit: 1, scanForward: false });
                return [t, Number(r?.[0]?.daysUntil)] as [string, number];
            });
            const daysToEarnings = Object.fromEntries(earn);
            for (const t of UNIVERSE) {
                // «세션» 시계열 — 원시 행을 그대로 세면 15분 스냅샷이 표본이 된다.
                const series = dailyValues(gexRaw[t] || [], 'atmIv').map((x) => x.v);
                if (series.length < spec.requires!.sessions) { bump('이력부족'); continue; }
                const today = series[series.length - 1];
                const past = series.slice(0, -1);
                const rank = (past.filter((v) => v < today).length / past.length) * 100;
                if (rank < 80) { bump('IV 랭크 80 미만'); continue; }
                const d = daysToEarnings[t];
                if (Number.isFinite(d) && d >= 0 && d <= 14) { bump('실적 D-14 이내(달력에 있는 이유)'); continue; }
                rows.push({
                    ticker: t, metric: 'volatility-bet', label: spec.name,
                    ivRank: Math.round(rank), atmIv: Math.round(today * 100) / 100,
                    daysToEarnings: Number.isFinite(d) ? d : null,
                    sessions: series.length, rank: rank / 100,
                });
            }
        }

        if (spec.id === 'insider-conviction') {
            if (!insider?.buys?.length) { bump('신고 없음'); }
            else {
                // 한 종목에 여러 임원이 사면 «회사 단위»로 합친다 — 그게 신호다.
                const byTicker = new Map<string, any>();
                for (const b of insider.buys) {
                    if (!b.ticker) continue;
                    const g = byTicker.get(b.ticker) || { ticker: b.ticker, company: b.company, usd: 0, buyers: [] as any[], topExec: false, maxIncrease: 0 };
                    g.usd += b.usd; g.topExec = g.topExec || b.isTopExec;
                    if (b.increasePct != null) g.maxIncrease = Math.max(g.maxIncrease, b.increasePct);
                    g.buyers.push({ owner: b.owner, role: b.role, usd: Math.round(b.usd), shares: b.shares, price: b.price, increasePct: b.increasePct != null ? Math.round(b.increasePct * 10) / 10 : null, date: b.date });
                    byTicker.set(b.ticker, g);
                }
                for (const g of byTicker.values()) {
                    if (g.usd < 100000) { bump('금액 10만불 미만'); continue; }
                    g.metric = 'insider-conviction'; g.label = spec.name;
                    g.buyerCount = g.buyers.length;
                    g.date = g.buyers[0]?.date ?? null;
                    // 금액이 기본, «C레벨»과 «지분 증가율»이 가산 —
                    // 대주주가 금액만으로 늘 이기면 랭킹이 매번 같아진다.
                    g.rank = Math.log10(g.usd) + (g.topExec ? 0.8 : 0) + Math.min(1.5, (g.maxIncrease || 0) / 100);
                    rows.push(g);
                }
            }
        }

        if (spec.id === 'deep-value-fcf') {
            const list = Object.values(funda || {}).filter((f) => f.evToEbitda != null && f.fcfYield != null && f.debtToEquity != null);
            if (!list.length) { bump('펀더멘털 없음'); }
            else {
                const medEv = median(list.map((f) => f.evToEbitda!).filter((v) => v > 0)) ?? 0;
                // ⚠️ 두 축을 «각자의 중앙값»으로 정규화한 뒤 곱한다.
                //    안 하면 EV/EBITDA 항(24.5/8.7 = 2.8)이 FCF수익률 항(2.24/10 = 0.22)을
                //    압도해서, 「현금창출 대비 저평가」인데 FCF 7.99% 종목이
                //    2.24% 종목 아래로 간다(실제로 그랬다). 이름과 순위가 어긋난다.
                const medFy = median(list.map((f) => f.fcfYield!).filter((v) => v > 0)) ?? 1;
                for (const f of list) {
                    if (!(f.debtToEquity! <= 0.8)) { bump('부채비율 초과'); continue; }
                    if (!(f.fcfYield! > 0)) { bump('FCF 음수'); continue; }
                    // 「업종 평균 대비 40% 저평가」를 유니버스 중앙값 기준으로 적용한다
                    if (!(medEv > 0 && f.evToEbitda! <= medEv * 0.6)) { bump('저평가 아님'); continue; }
                    rows.push({
                        ticker: f.ticker, metric: 'deep-value-fcf', label: spec.name,
                        fcfYield: Math.round(f.fcfYield! * 100) / 100,
                        evToEbitda: Math.round(f.evToEbitda! * 100) / 100,
                        universeMedianEvToEbitda: Math.round(medEv * 100) / 100,
                        debtToEquity: Math.round(f.debtToEquity! * 100) / 100,
                        operatingMargin: f.operatingMargin != null ? Math.round(f.operatingMargin * 1000) / 10 : null,
                        fcf: f.fcf, marketCap: f.marketCap, fiscalYear: f.fiscalYear,
                        // 현금창출(중앙값 대비) × 싸기(중앙값 대비) — 둘 다 있어야 올라온다
                        rank: (medFy > 0 ? f.fcfYield! / medFy : 1) * (medEv / f.evToEbitda!),
                    });
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
        ok: true, _v: 9, docs: 'https://www.signumhq.com/ranking-api.md',
        generatedAt: new Date().toISOString(), session: sess,
        optionSession, darkPool: dpMeta,
        // 실제로 훑은 종목 수를 말한다. 하드코딩 25 를 그대로 말하면 거짓말이 된다.
        universe: (STRUCT_UNIVERSE.length || UNIVERSE.length),
        universeSource: STRUCT_UNIVERSE.length ? 'structure-build (2,001종목)' : '하드코딩 25종목(구조 캐시 없음)',
        results,
    };
    await setInCache(CACHE, payload, 600).catch(() => { });
    return NextResponse.json({ ...payload, _cache: 'miss' });
}
