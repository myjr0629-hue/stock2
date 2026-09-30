/**
 * «지금 시장» 배경의 원자료를 캐시에서 모은다 (서버 전용).
 *
 *   · 현물 지수 ^IXIC·^DJI·^GSPC, 지수 선물 NQ=F·ES=F — market-feed 크론이 매분 쓰는 야후 시세
 *   · 10년물 — SIGNUM 대시보드(/api/market/macro)와 «같은 함수»(getMacroSnapshotSSOT)의 통일본.
 *     예전 UC·WIM 은 /api/live/treasury(FRED·재무부 일간, T+1)를 «지금 값»으로 썼다
 *     (9/23 +11bp 급등일에 «보합», 9/28 월 08:56 에 금요일 값 5.17%).
 *
 * 판정(세션 꼬리표·모드)은 src/lib/marketBackdrop.ts 의 순수 함수가 한다.
 */
import { getFromCache } from './redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from './yahooFinanceHub';
import { getMacroSnapshotSSOT, type MacroSnapshot } from './macroHubProvider';
import { buildBackdrop, type BackdropInputs, type MarketBackdrop, type RawQuote, type RawUs10y } from '@/lib/marketBackdrop';

/** 매크로 스냅샷이 차가울 때(상류 전체 재조회) 사용자를 기다리게 하지 않는다 */
const MACRO_WAIT_MS = 2500;

function toRaw(q: YahooQuote | null): RawQuote | null {
    if (!q || q.source === 'DEFAULT' || typeof q.price !== 'number') return null;
    return { price: q.price, changePct: q.changePct, marketTime: q.marketTime ?? null, lastChangeAt: q.lastChangeAt ?? null };
}

export async function loadBackdropInputs(nowMs: number = Date.now()): Promise<BackdropInputs> {
    const get = (k: string) => getFromCache<YahooQuote>(k).catch(() => null);
    const macroP: Promise<MacroSnapshot | null> = Promise.race([
        getMacroSnapshotSSOT().catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), MACRO_WAIT_MS)),
    ]);
    const [nasdaq, dow, spx, nq, es, tnx, macro] = await Promise.all([
        get(YAHOO_CACHE_KEYS.IDX_NASDAQ), get(YAHOO_CACHE_KEYS.IDX_DOW), get(YAHOO_CACHE_KEYS.IDX_SPX),
        get(YAHOO_CACHE_KEYS.NQ), get(YAHOO_CACHE_KEYS.SPX), // YAHOO_CACHE_KEYS.SPX = ES=F (선물)
        get(YAHOO_CACHE_KEYS.TNX), macroP,
    ]);

    let us10y: RawUs10y | null = null;
    const f = macro?.factors?.us10y;
    if (f && f.status === 'OK' && typeof f.level === 'number') {
        us10y = {
            level: f.level, chgAbs: f.chgAbs ?? null, symbolUsed: f.symbolUsed,
            marketTime: f.marketTime ?? null, curveDate: macro?.yieldCurve?.date ?? null, source: f.source,
        };
    } else if (tnx && tnx.source !== 'DEFAULT' && typeof tnx.price === 'number') {
        // 스냅샷이 늦거나 실패 → 대시보드 통일본의 «실시간 쪽» 원천(^TNX)을 그대로. 날짜는 TNX 자신의 것.
        us10y = { level: tnx.price, chgAbs: tnx.change, symbolUsed: '^TNX', marketTime: tnx.marketTime ?? null, curveDate: null, source: 'YAHOO' };
    }

    return { nowMs, nasdaq: toRaw(nasdaq), dow: toRaw(dow), spx: toRaw(spx), nq: toRaw(nq), es: toRaw(es), us10y };
}

export async function loadBackdrop(nowMs: number = Date.now()): Promise<MarketBackdrop> {
    return buildBackdrop(await loadBackdropInputs(nowMs));
}

/**
 * 프리뷰 전용 시뮬레이션 — `?sim=<base64url JSON BackdropInputs>` 로 «그 시각의 원자료»를 넣어
 * 운영과 같은 코드 경로(판정 → 프롬프트 → AI → 검사)를 돌려 본다. 개장 전·주말 상태를 장중에 검증하려고 둔다.
 * 운영(VERCEL_ENV=production)에서는 무시한다. 응답은 공유 캐시에 읽지도 쓰지도 않는다(호출한 쪽이 보장).
 */
export function simInputsFrom(url: URL): BackdropInputs | null {
    if (process.env.VERCEL_ENV === 'production') return null;
    const raw = url.searchParams.get('sim');
    if (!raw) return null;
    try {
        const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (typeof j?.nowMs !== 'number') return null;
        const q = (x: any): RawQuote | null => (x && typeof x.price === 'number' ? {
            price: x.price, changePct: typeof x.changePct === 'number' ? x.changePct : null,
            marketTime: x.marketTime ?? null, lastChangeAt: x.lastChangeAt ?? null,
        } : null);
        return {
            nowMs: j.nowMs, nasdaq: q(j.nasdaq), dow: q(j.dow), spx: q(j.spx), nq: q(j.nq), es: q(j.es),
            us10y: j.us10y && typeof j.us10y.level === 'number' ? {
                level: j.us10y.level, chgAbs: j.us10y.chgAbs ?? null, symbolUsed: j.us10y.symbolUsed ?? null,
                marketTime: j.us10y.marketTime ?? null, curveDate: j.us10y.curveDate ?? null, source: j.us10y.source ?? null,
            } : null,
        };
    } catch {
        return null;
    }
}
