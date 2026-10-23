import type { SessionQuote } from './preMarketContext';
import { lastClosedSessionDate } from '@/lib/marketSession';
import type { OptionsEodBundle } from '@/lib/todayPicks/select';

export const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    silicon_core: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'],
    quantum_edge: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    fintech_pulse: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
};

export const SECTOR_LABEL: Record<string, string> = {
    m7: 'Magnificent 7 (mega-cap tech)',
    physical_ai: 'Physical AI / robotics',
    silicon_core: 'Semiconductors',
    power_matrix: 'Power & nuclear infrastructure',
    bio_pulse: 'Biotech / pharma',
    cyber_shield: 'Cybersecurity',
    orbit_defense: 'Defense & space',
    quantum_edge: 'AI infrastructure / quantum',
    fintech_pulse: 'Fintech / crypto-adjacent',
    cloud_fortress: 'Enterprise software / cloud',
};


export interface SectorFact {
    id: string; label: string; priceBasis: SessionQuote['basis']; priceDate: string;
    measured: number; total: number; up: number; down: number; flat: number; avgChangePct: number;
    leader: { t: string; c: number }; laggard: { t: string; c: number }; spreadPct: number;
    members?: Array<{ t: string; c: number }>; exLeaderAvgChangePct?: number;
    priorOptions?: { recordDate: string | null; openedOn: string | null; lastRegularDate: string; measured: number; callOI: number | null; putOI: number | null };
}

/** Same session selection as the cron; no network or writes. Stock-list mean is not an ETF/index return. */
export function buildSectorFacts(quotes: Record<string, SessionQuote>, regularQuotes: Record<string, SessionQuote>,
    quoteSession: string, preOpen: boolean, todayET: string, now: number,
    bundle: OptionsEodBundle | null = null): SectorFact[] {
    const facts: SectorFact[] = [];
    for (const [id, tickers] of Object.entries(SECTOR_TICKERS)) {
        let rows = tickers.map((t) => quotes[t]).filter((q): q is SessionQuote => !!q && q.changePct != null);
        const extendedBasis = preOpen ? 'PRE' : quoteSession === 'post' ? 'POST' : null;
        if (extendedBasis) {
            const measured = rows.filter(q => q.basis === extendedBasis && q.date === todayET);
            // PRE·POST 모두 REG와 섞지 않는다. 해당 세션 표본 부족이면 섹터 전체를
            // 직전 정규장 값+날짜로 계산한다(POST에는 방금 끝난 당일·조기 폐장 포함).
            rows = measured.length >= Math.ceil(tickers.length / 2) ? measured
                : tickers.map(t => regularQuotes[t]).filter((q): q is SessionQuote => !!q && q.changePct != null);
        }
        // 절반도 못 재면 그 섹터는 넘긴다 — 반쪽 자료로 «판정»을 만들면 틀린 말이 나간다.
        if (rows.length < Math.ceil(tickers.length / 2)) continue;
        const sorted = [...rows].sort((a, b) => (b.changePct as number) - (a.changePct as number));
        const up = rows.filter((r) => (r.changePct as number) > 0).length;
        const down = rows.filter((r) => (r.changePct as number) < 0).length;
        const avg = rows.reduce((s, r) => s + (r.changePct as number), 0) / rows.length;
        const optionsRows = tickers.map(t => bundle?.tickers?.[t]).filter(r => r && typeof r.callOI === 'number' && typeof r.putOI === 'number');
        const members = sorted.map(q => ({ t: q.ticker, c: Number(q.changePct!.toFixed(2)) }));
        facts.push({
            id,
            label: SECTOR_LABEL[id],
            priceBasis: rows[0].basis,
            priceDate: rows[0].date,
            ...(bundle ? { priorOptions: { recordDate: bundle.date ?? null, openedOn: bundle.prevDate ?? null,
                lastRegularDate: lastClosedSessionDate(now),
                measured: optionsRows.length,
                callOI: optionsRows.length ? optionsRows.reduce((n, r) => n + r!.callOI!, 0) : null,
                putOI: optionsRows.length ? optionsRows.reduce((n, r) => n + r!.putOI!, 0) : null,
            } } : {}),
            members,
            exLeaderAvgChangePct: Number((sorted.slice(1).reduce((n, q) => n + q.changePct!, 0) / (rows.length - 1)).toFixed(2)),
            measured: rows.length,
            total: tickers.length,
            up,
            down,
            flat: rows.length - up - down,
            avgChangePct: Number(avg.toFixed(2)),
            leader: { t: sorted[0].ticker, c: Number((sorted[0].changePct as number).toFixed(2)) },
            laggard: { t: sorted[sorted.length - 1].ticker, c: Number((sorted[sorted.length - 1].changePct as number).toFixed(2)) },
            spreadPct: Number(((sorted[0].changePct as number) - (sorted[sorted.length - 1].changePct as number)).toFixed(2)),
        });
    }
    return facts;
}
