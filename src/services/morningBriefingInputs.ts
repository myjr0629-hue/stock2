/**
 * 모닝 브리핑 입력 수집(서버) — 옛 프롬프트(v1)와 새 사실 계약(v2)이 «같은 원자료»를 쓰게 한 곳에서 모은다(TRACKER T7, 2026-10-25).
 *   · 읽기만 한다(외부 API·Redis 읽기). 저장·생성 없음.
 *   · v2 사실은 lib/ai/morningBriefingV2 의 순수 함수로 만든다 — 드라이런·시험이 같은 함수를 쓴다.
 */
import { fmpFetch } from '@/lib/fmpClient';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache } from '@/services/redisClient';
import { getYahooDataSSOT } from '@/services/yahooFinanceHub';
import { getMacroSnapshotSSOT, MACRO_REDIS_KEY } from '@/services/macroHubProvider';
import { loadMarketIndexBasis } from '@/services/marketIndexBasis';
import { getOvernightHighlights } from '@/services/disclosures';
import { buildIndexFacts, tacticalSessionAt, INDEX_NAMES, type IndexFact, type TacticalSession } from '@/lib/ai/tacticalIndexFacts';
import { evidenceTime } from '@/lib/ai/evidenceTime';
import { yieldChangeBp } from '@/lib/yieldChange';
import { etDateOf } from '@/lib/marketCalendar';
import {
    morningNewsLines, morningCalendarLines, morningMetrics,
    type MorningFacts, type RawNewsItem, type RawCalendarEvent,
} from '@/lib/ai/morningBriefingV2';
import type { MarketIndexBasis } from '@/lib/marketIndexBasis';

export interface MorningRaw {
    nowMs: number;
    snapshot: any;
    rlsiHistory: any[];
    polygonNews: Array<{ title?: string; description?: string; published_utc?: string }>;
    fmpNews: Array<{ title?: string; text?: string; publishedDate?: string }>;
    calendar: RawCalendarEvent[];
    disclosures: Array<{ ticker: string; date: string; primary: string; tertiary: string; text: string }>;
    yahoo: any | null;
    macro: any | null;
    indexBasis: MarketIndexBasis | null;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch (e: any) { console.warn(`[Briefing Inputs] ${label} failed:`, e?.message || e); return fallback; }
}

/**
 * 매크로 스냅샷을 «읽기만» — 공유 캐시가 없거나 낡아도 다시 계산하지 않는다(재계산 경로는 시세 수집·뉴스 긴급 갱신까지 부를 수 있다).
 * 드라이런 전용(관문 10250345 ①). 운영 생성은 getMacroSnapshotSSOT 그대로.
 */
export async function peekMacroSnapshot(): Promise<any | null> {
    const cached = await getFromCache<any>(MACRO_REDIS_KEY).catch(() => null);
    if (!cached?.data) return null;
    return { ...cached.data, indexBasis: await loadMarketIndexBasis().catch(() => null) };
}

/** 원자료 수집 — 실패한 칸은 비운다(사실이 없으면 그 문장은 «미확인»으로 쓰인다). readOnly = 드라이런(공유 캐시 재계산 없음) */
export async function collectMorningRaw(snapshot: any, rlsiHistory: any[], nowMs = Date.now(), opts: { readOnly?: boolean } = {}): Promise<MorningRaw> {
    const [polygonNews, fmpNews, calRaw, disclosures, yahoo, macro] = await Promise.all([
        safe('polygon news', async () => {
            const d = await fetchMassive('/v2/reference/news', { ticker: 'SPY,QQQ,DIA,TLT,GLD', limit: '10', order: 'desc', sort: 'published_utc' }, true);
            return Array.isArray(d?.results) ? d.results : [];
        }, [] as any[]),
        safe('fmp general news', async () => {
            const key = process.env.FMP_API_KEY;
            if (!key) return [];
            const r = await fmpFetch(`https://financialmodelingprep.com/stable/news/general-latest?limit=8&apikey=${key}`, 'news', { timeoutMs: 6000 });
            if (!r?.ok) return [];
            const j = await r.json();
            return Array.isArray(j) ? j : [];
        }, [] as any[]),
        safe('econ calendar', () => getFromCache<any>('fmp:econ-calendar'), null),
        safe('disclosures', () => getOvernightHighlights(3), [] as any[]),
        safe('yahoo', () => getYahooDataSSOT(), null),
        safe('macro', () => (opts.readOnly ? peekMacroSnapshot() : getMacroSnapshotSSOT()), null),
    ]);
    return {
        nowMs, snapshot, rlsiHistory: Array.isArray(rlsiHistory) ? rlsiHistory : [],
        polygonNews, fmpNews, calendar: Array.isArray(calRaw?.events) ? calRaw.events : [],
        disclosures, yahoo, macro, indexBasis: macro?.indexBasis ?? null,
    };
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const okFactor = (f: any) => f && f.status === 'OK' && fin(f.level) && f.level > 0;

/** 드라이런 세션 흉내(주말에 장전·장중 문장을 시험) — 시세 값은 실제 관측 그대로, 세션 표지·관측 시각만 바꾼다 */
export type MorningSim = 'pre' | 'pre-nofut' | 'reg' | null;

function simIndexFacts(b: MarketIndexBasis | null, sim: Exclude<MorningSim, null>, asOfMs: number): IndexFact[] {
    if (!b) return [];
    const out: IndexFact[] = [];
    const c = (iso: string | null) => { const ms = iso ? Date.parse(iso) : asOfMs; const d = new Date(ms); const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d); const p = Object.fromEntries(et.map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ET`; };
    const simDate = etDateOf(asOfMs);
    for (const id of ['nasdaq', 'spx'] as const) {
        const p = b.cash?.[id];
        if (!p || p.price == null || !fin(p.changePct)) continue;
        if (sim === 'reg') out.push({ id, name: INDEX_NAMES[id], kind: 'spot', chgPct: p.changePct, asOfET: c(new Date(asOfMs - 5 * 60_000).toISOString()), sessionDate: simDate,
            basis: { ko: `${simDate} 정규장: 전 거래일 종가 대비`, en: `${simDate} cash session vs previous trading close`, ja: `${simDate}通常取引: 前営業日終値比` } });
        else out.push({ id, name: INDEX_NAMES[id], kind: 'spot', chgPct: p.changePct, asOfET: c(p.asOf), sessionDate: p.sessionDate,
            basis: { ko: `${p.sessionDate} 정규장: 전 거래일 종가 대비`, en: `${p.sessionDate} cash session vs previous trading close`, ja: `${p.sessionDate}通常取引: 前営業日終値比` } });
    }
    if (sim === 'pre') for (const id of ['nq', 'es'] as const) {
        const p = b.futures?.[id];
        if (!p || p.price == null || !fin(p.changePct)) continue;
        out.push({ id, name: INDEX_NAMES[id], kind: 'futures', chgPct: p.changePct, asOfET: c(new Date(asOfMs - 2 * 60_000).toISOString()), sessionDate: null,
            basis: { ko: '직전 정규장 마감 무렵(정산) 대비', en: 'vs prior settlement near previous cash close', ja: '前回通常取引終了頃の清算値比' } });
    }
    return sim === 'pre' ? [...out.filter(f => f.kind === 'futures'), ...out.filter(f => f.kind === 'spot')] : out;
}

/** 원자료 → v2 사실. opts.sim/asOfMs 는 드라이런 전용(운영 경로는 지금 시각·실제 세션) */
export function morningFactsFromRaw(raw: MorningRaw, opts: { sim?: MorningSim; asOfMs?: number; newsMaxAgeH?: number } = {}): MorningFacts {
    const asOfMs = opts.asOfMs ?? raw.nowMs;
    const session: TacticalSession = opts.sim === 'reg' ? 'REG' : opts.sim ? 'PRE' : tacticalSessionAt(asOfMs);
    const indexFacts = opts.sim ? simIndexFacts(raw.indexBasis, opts.sim, asOfMs) : buildIndexFacts(raw.indexBasis ?? undefined, session, asOfMs);
    const items: RawNewsItem[] = [
        ...raw.polygonNews.map(n => ({ title: n.title, description: n.description, publishedIso: n.published_utc ?? null })),
        // FMP 뉴스 publishedDate = 뉴욕 벽시계(lib/ai/evidenceTime 계약)
        ...raw.fmpNews.map(n => ({ title: n.title, description: undefined, publishedIso: evidenceTime('fmp:news', n.publishedDate)?.iso ?? null })),
    ];
    const news = morningNewsLines(items, asOfMs, { maxAgeH: opts.newsMaxAgeH ?? 18, max: 10 });
    const cal = morningCalendarLines(raw.calendar, asOfMs, etDateOf(asOfMs));
    const disclosures = raw.disclosures.slice(0, 3).map(h => `[filing; ${h.date}] ${h.ticker}: ${String(h.text || '').replace(/\s+/g, ' ').slice(0, 160)}`.replace(/"/g, "'"));
    const s = raw.snapshot || {};
    const g = s.gammaShield || {};
    const f = raw.macro?.factors || {};
    const y = raw.yahoo || {};
    const us10y = okFactor(f.us10y) ? { level: f.us10y.level, bp: yieldChangeBp(f.us10y), asOf: f.us10y.marketTime ?? null } : null;
    const asset = (x: any) => (okFactor(x) ? { level: x.level, chgPct: fin(x.chgPct) ? x.chgPct : null } : null);
    const vix = fin(s?.rlsi?.components?.vix) ? s.rlsi.components.vix : okFactor(f.vix) ? f.vix.level : null;
    const vix3m = y?.vix3m && y.vix3m.source !== 'DEFAULT' && fin(y.vix3m.price) ? y.vix3m.price : null;
    const metrics = morningMetrics({
        rlsi: fin(s?.rlsi?.score) ? s.rlsi.score : null,
        rlsiTrend: raw.rlsiHistory.map((h: any) => Number(h?.score)).filter(fin),
        vix, vix3m,
        gexIndex: fin(g.gexIndex) ? g.gexIndex : null,
        gexLevel: typeof g.gexLevel === 'string' ? g.gexLevel : null,
        breadthPct: fin(s?.breadth?.breadthPct) ? s.breadth.breadthPct : null,
        putFloor: g.supportWall, callWall: g.resistanceWall, gammaFlip: g.gammaFlipPoint,
        us10y, dxy: asset(f.dxy), oil: asset(f.oil), gold: asset(f.gold), btc: asset(f.btc),
    });
    return { v: 2, asOf: new Date(asOfMs).toISOString(), session, indexFacts, news, events: cal.upcoming, released: cal.released, disclosures, metrics };
}
