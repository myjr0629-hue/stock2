/**
 * AI 분석 «질» 입력 보강(aiq55, 2026-10-12) — 앱·웹의 AI 가 이미 가진 자원 중 프롬프트에 안 들어가던 것을 «기준 시각이 붙은 사실»로 넣는다. 순수 함수만(네트워크·Redis 없음).
 *
 * 왜 (대표 10/12 «ai 분석질을 높여 … 우리 자원을 최대한 차별화하고 인사이트 받을 수 있게»):
 *   경쟁 앱 리뷰의 불만은 slop·환각·낡은 정보다(DIFF-2026-10-12/REPORT.md §2.4). 차별점은 «근거 숫자 + 기준 시각이 보이는 AI».
 *   그런데 우리 AI 는 FINRA 장외 비중(Flow AI 는 틱 플랜 밖이라 항상 빠짐)·옵션이 반영한 변동폭·13F 기관 보유·랭킹을 못 읽었고,
 *   앱 Flow 화면 재료는 Max Pain·변동폭이 비어 있었다(regime.maxPain 0 · impliedMove 'N/A').
 *
 * 원칙
 *   · 숫자는 모델이 만들지 않는다. 한 문구(cite_ko/en/ja)에 «날짜 + 출처 + 숫자»가 이미 들어 있어 모델이 베껴 쓴다 — 기준 시각이 숫자와 떨어지지 않는다.
 *   · 날짜 표기는 앱 화면의 마감 꼬리표(marketSession.closeLabel: «10/9(금) 마감 기준» · «10/9(金) 終値» · «Fri 10/9 close»)와 같다.
 *   · 옵션이 반영한 변동폭 = src/lib/impliedMove.ts 한 정의(ATM 스트래들 중간값 ÷ 현물). 벽 사이 폭이 아니다.
 *   · 13F 는 분기말 스냅샷이다 — 분기 증감은 이 색인에 없다(단일 분기). 증감·매수·매도를 말하지 않게 규칙으로 막는다.
 *   · 뺀 재료: P/C·GEX 크기(정의 결정 대기) · 의회 거래(원천이 FMP — 앱 화면용 AI 입력에 새로 넣지 않는다, 약관 2.2.2).
 *     실적일은 «이미 AI 입력에 있는 표면»(Flow·딥 분석)에서만 D-n 으로 쓴다(원천 캘린더가 FMP 우선이라 새 표면엔 넣지 않는다).
 *   · 끄기: Redis aiq55:off (재배포 없이) · 환경변수 AIQ55_OFF=1 — services/aiqContextService.
 */
import { closeLabel, monthDay } from '@/lib/marketSession';
import { daysBetweenYmd } from '@/lib/marketCalendar';
import { formatLevelPrice } from '@/lib/optionLevelGate';

export type AiqLoc = 'ko' | 'en' | 'ja';
export const AIQ_LOCALES: readonly AiqLoc[] = ['ko', 'en', 'ja'];

export interface AiqOffEx {
    /** 장외 체결 비중 % (FINRA TRF ÷ 통합 거래량, T+1) — 앱 칩 «장외 비중»과 같은 값 */
    pct: number;
    date: string;
    marketAvg: number | null;
    /** 오늘 장외 물량 ÷ 이 종목 자신의 20일 평균 (1.0 = 평소) */
    volRatio: number | null;
    /** 장외 중 공매도 비중 % · 이 종목의 20일 평균 — 구조적 절반이 섞이므로 평소 대비로만 읽는다 */
    shortPct: number | null;
    shortAvg: number | null;
    regime: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null;
}
export interface AiqImplied {
    /** (ATM 콜 중간값 + ATM 풋 중간값) ÷ 현물 × 100 — 소수 1자리 (lib/impliedMove 정의) */
    pct: number;
    expiry: string | null;
    basis: 'live' | 'eod';
    /** 값의 정규장 세션 날짜(ET) — eod 면 그날 종가 값 */
    session: string | null;
    /** 화면의 지금 가격에서 본 두 벽(Call Wall·Put Floor)이 이 변동폭 범위 «안/밖»인가 — 코드가 계산(withReach). 가격을 모르면 없다. */
    reach?: { call?: { level: number; distPct: number; inside: boolean }; put?: { level: number; distPct: number; inside: boolean } };
}
export interface AiqLevelsAsOf {
    chainDate: string | null;
    expiry: string | null;
    /** 서버 구조 사본의 Max Pain($) — 앱 Flow 화면 재료가 비워 보내는 값을 서버가 메운다(숫자 문구에는 쓰지 않는다) */
    maxPain?: number | null;
    callWall?: number | null;
    putFloor?: number | null;
}
export interface AiqEarnings { date: string; days: number }
export interface AiqHolder { name: string; sharePct: number; valueUsd: number }
export interface AiqHolders {
    /** 13F 기준일(분기 말) */
    period: string;
    /** 이 종목을 보고한 기관 수 */
    total: number;
    top: AiqHolder[];
    /** 상위 5곳이 보고된 전체 주식 수에서 차지하는 비중 % — 코드가 계산 */
    top5SharePct: number | null;
}
export interface AiqRank {
    id: string;
    rank: number;
    candidates: number | null;
    /** 랭킹이 쓴 세션 날짜(마감 후 랭킹) 또는 만든 날(ET) */
    asOf: string | null;
    name: Record<AiqLoc, string>;
}

export interface AiqFacts {
    v: 1;
    ticker: string;
    /** 오늘(ET, YYYY-MM-DD) — 상대 날짜를 풀고 D-n 을 세는 기준 */
    todayEt: string;
    offEx?: AiqOffEx;
    implied?: AiqImplied;
    levels?: AiqLevelsAsOf;
    earnings?: AiqEarnings;
    holders?: AiqHolders;
    ranks?: AiqRank[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (x: unknown): string | null => (typeof x === 'string' && YMD.test(x.slice(0, 10)) ? x.slice(0, 10) : null);
const fin = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const posn = (x: unknown): number | null => { const n = fin(x); return n != null && n > 0 ? n : null; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// 1) 원자료 → 사실 (순수)
// ─────────────────────────────────────────────────────────────────────────────

/** FINRA 장외 행 (services/darkPool.DarkPoolTicker 또는 /api/flow/dark-pool 응답과 같은 모양) → 사실. 100% 이상·날짜 없음은 버린다. */
export function offExFrom(row: any): AiqOffEx | null {
    if (!row || typeof row !== 'object') return null;
    const pct = posn(row.pct ?? row.darkPoolPct);
    const date = ymd(row.date ?? row.darkPoolDate);
    if (pct == null || pct >= 100 || !date) return null;
    const reg = row.regime ?? row.darkPoolRegime;
    return {
        pct: r1(pct), date,
        marketAvg: ((v) => (v == null ? null : r1(v)))(posn(row.marketAvg ?? row.darkPoolMarketAvg)),
        volRatio: ((v) => (v == null ? null : r2(v)))(posn(row.volRatio ?? row.darkPoolVolRatio)),
        shortPct: ((v) => (v == null ? null : r1(v)))(posn(row.shortPct ?? row.darkPoolShortPct)),
        shortAvg: ((v) => (v == null ? null : r1(v)))(posn(row.shortAvg ?? row.darkPoolShortAvg)),
        regime: reg === 'ACCUMULATION' || reg === 'DISTRIBUTION' || reg === 'NEUTRAL' ? reg : null,
    };
}

/** 구조 사본의 impliedMove(lib/impliedMove.ImpliedMove) → 사실. 정의 표식이 없으면 버린다. */
export function impliedFrom(im: any, def = 'atm-straddle-mid/1'): AiqImplied | null {
    if (!im || typeof im !== 'object') return null;
    if (im.def != null && im.def !== def) return null;
    const pct = posn(im.pct ?? im.impliedMovePct);
    if (pct == null || pct >= 60) return null;
    const basis = im.basis === 'live' ? 'live' : 'eod';
    return { pct: r1(pct), expiry: ymd(im.expiry ?? im.impliedMoveExpiry), basis, session: ymd(im.session ?? im.impliedMoveSession) };
}

/** 기관 이름 다듬기 — SEC 표지 이름(대문자·법인격 꼬리)을 읽을 만하게. «VANGUARD CAPITAL MANAGEMENT LLC» → «Vanguard Capital Management» */
export function prettyFiler(name: string): string {
    let s = String(name || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/[,.]?\s+(?:L\.?L\.?C\.?|L\.?P\.?|INC\.?|CORP\.?|CORPORATION|CO\.?|LTD\.?|PLC|N\.?A\.?|S\.?A\.?|AG|NV|LLP|TRUST CO)\s*$/i, '').replace(/\s*&\s*$/, '').replace(/[,.]\s*$/, '');
    if (s === s.toUpperCase()) {
        s = s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
            .replace(/\b(Llc|Lp|Fmr|Ubs|Hsbc|Bnp|Tiaa|Abn|Amro|Nv|Ag|Plc|Rbc|Td|Jpmorgan|Bny|Cibc)\b/g, (w) => ({ Jpmorgan: 'JPMorgan', Bny: 'BNY' } as Record<string, string>)[w] ?? w.toUpperCase());
    }
    return s.length > 38 ? s.slice(0, 38).replace(/\s+\S*$/, '') : s;
}

/**
 * 13F 색인 항목(cache:13f:cusip:{CUSIP}) → 사실. 소표본(partial)·기준일 없음·보유자 3 미만은 버린다.
 * 분기 증감은 이 색인에 없다(단일 분기) — 만들지 않는다.
 */
export function holdersFrom(entry: any, partial: boolean): AiqHolders | null {
    if (!entry || typeof entry !== 'object' || partial) return null;
    const list = Array.isArray(entry.holders) ? entry.holders : [];
    const period = ymd(entry.period ?? list[0]?.period);
    const totalShares = posn(entry.totalShares);
    const total = posn(entry.totalHolders ?? list.length);
    if (!period || !total || list.length < 3) return null;
    const top: AiqHolder[] = [];
    for (const h of list.slice(0, 5)) {
        const shares = posn(h?.shares), value = posn(h?.marketValue), nm = prettyFiler(String(h?.name || ''));
        if (!nm || shares == null || value == null) continue;
        top.push({ name: nm, sharePct: totalShares ? r1((shares / totalShares) * 100) : 0, valueUsd: value });
    }
    if (top.length < 3) return null;
    let top5SharePct: number | null = null;
    if (totalShares && top.length === 5) {
        const s5 = list.slice(0, 5).reduce((a: number, h: any) => a + (posn(h?.shares) ?? 0), 0);
        top5SharePct = r1((s5 / totalShares) * 100);
    }
    return { period, total: Math.round(total), top: totalShares ? top : top.map((t) => ({ ...t, sharePct: 0 })), top5SharePct };
}

/** 랭킹 11종 중 제외 — volatility-bet 는 실적 일정(FMP 캘린더)이 정의에 들어 있다 */
export const AIQ_RANK_SKIP = new Set(['volatility-bet']);

/** ranking:{판본}:all:* 응답(lib/rankings/cacheKey) → 이 종목이 든 순위(상위 목록 안에서만). 마감 후 랭킹은 «fresh» 일 때만. */
export function ranksFrom(blob: any, ticker: string): AiqRank[] {
    const T = String(ticker || '').toUpperCase();
    const res = blob?.results;
    if (!res || typeof res !== 'object') return [];
    const gen = typeof blob.generatedAt === 'string' ? ymd(blob.generatedAt) : null;
    const out: AiqRank[] = [];
    for (const [id, b] of Object.entries<any>(res)) {
        if (!b || b.available !== true || AIQ_RANK_SKIP.has(id) || !Array.isArray(b.items)) continue;
        if (b.phase === 'postclose' && b.state && b.state !== 'fresh') continue;
        const idx = b.items.findIndex((it: any) => String(it?.ticker || '').toUpperCase() === T);
        if (idx < 0) continue;
        const nm = b.name || b.items[idx]?.label || {};
        if (!nm.ko || !nm.en || !nm.ja) continue;
        out.push({ id, rank: idx + 1, candidates: posn(b.candidates), asOf: ymd(b.session) ?? gen, name: { ko: nm.ko, en: nm.en, ja: nm.ja } });
    }
    return out.sort((a, b) => a.rank - b.rank).slice(0, 3);
}

/** 사실 묶음 만들기 — 비어 있는 칸은 키 자체를 만들지 않는다. 아무것도 없으면 null. */
export function buildAiqFacts(a: {
    ticker: string; todayEt: string;
    offEx?: any; implied?: any; levels?: { chainDate?: unknown; expiry?: unknown; maxPain?: unknown; callWall?: unknown; putFloor?: unknown } | null;
    earnings?: { date?: unknown } | null; holders13f?: { entry: any; partial: boolean } | null; rankings?: any;
}): AiqFacts | null {
    const f: AiqFacts = { v: 1, ticker: String(a.ticker).toUpperCase(), todayEt: a.todayEt };
    const off = offExFrom(a.offEx); if (off) f.offEx = off;
    const im = impliedFrom(a.implied); if (im) f.implied = im;
    const chain = ymd(a.levels?.chainDate), exp = ymd(a.levels?.expiry);
    if (chain || exp) f.levels = { chainDate: chain, expiry: exp, maxPain: posn(a.levels?.maxPain), callWall: posn(a.levels?.callWall), putFloor: posn(a.levels?.putFloor) };
    const ed = ymd(a.earnings?.date);
    if (ed) { const days = daysBetweenYmd(a.todayEt, ed); if (days != null && days >= 0 && days <= 120) f.earnings = { date: ed, days }; }
    const h = a.holders13f ? holdersFrom(a.holders13f.entry, a.holders13f.partial) : null; if (h) f.holders = h;
    const rk = a.rankings ? ranksFrom(a.rankings, f.ticker) : []; if (rk.length) f.ranks = rk;
    return f.offEx || f.implied || f.levels || f.earnings || f.holders || f.ranks ? f : null;
}

/**
 * 옵션이 반영한 변동폭 범위(현재가 ± pct%)에 두 벽이 «들어오나» — 코드가 계산한다(모델 산수 금지). 거리 식은 화면 토큰(DIST_CALL·DIST_PUT)과 같다: |수준 − 가격| ÷ 가격 × 100, 소수 1자리.
 * 가격이 벽을 이미 넘었으면(콜월 ≤ 가격, 풋플로어 ≥ 가격) 그 벽은 뺀다. 가격·변동폭·벽이 없으면 그대로 돌려준다.
 */
export function withReach(f: AiqFacts | null, spot: unknown): AiqFacts | null {
    const price = posn(typeof spot === 'string' ? Number(spot.replace(/[$,\s]/g, '')) : spot);
    if (!f || !f.implied || !price) return f;
    const reach: NonNullable<AiqImplied['reach']> = {};
    const cw = f.levels?.callWall, pf = f.levels?.putFloor;
    if (cw && cw > price) { const d = r1(((cw - price) / price) * 100); reach.call = { level: cw, distPct: d, inside: d <= f.implied.pct }; }
    if (pf && pf < price) { const d = r1(((price - pf) / price) * 100); reach.put = { level: pf, distPct: d, inside: d <= f.implied.pct }; }
    if (!reach.call && !reach.put) return f;
    return { ...f, implied: { ...f.implied, reach } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 문구 — 날짜·출처·숫자가 한 덩어리 (모델은 베껴 쓴다)
// ─────────────────────────────────────────────────────────────────────────────

const fmtUsdLoc = (n: number, loc: AiqLoc): string => {
    if (loc === 'en') return n >= 1e12 ? `$${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`;
    const big = loc === 'ko' ? { t: '조', o: '억', m: '만', cur: ' 달러', pre: '약 ' } : { t: '兆', o: '億', m: '万', cur: 'ドル', pre: '約' };
    const body = n >= 1e12 ? `${(n / 1e12).toFixed(1).replace(/\.0$/, '')}${big.t}` : n >= 1e8 ? `${Math.round(n / 1e8).toLocaleString('en-US')}${big.o}` : `${Math.max(1, Math.round(n / 1e4)).toLocaleString('en-US')}${big.m}`;
    return `${big.pre}${body}${big.cur}`;
};
const count = (n: number, loc: AiqLoc) => (loc === 'en' ? n.toLocaleString('en-US') : n.toLocaleString('en-US'));
const mdOf = (d: string) => monthDay(d);

/** «10/9(금) 마감 기준» 식 꼬리표 — 앱 화면과 같다 */
export const asOfClose = (d: string, loc: AiqLoc): string => closeLabel(d, loc);

/** 평소 대비 장외 물량 배수 → 말(코드가 정한다 — 모델이 1.11배를 «매집»으로 과해석하지 않게) */
export function volBand(v: number | null): 'surge' | 'above' | 'normal' | 'below' | null {
    return v == null ? null : v >= 1.5 ? 'surge' : v >= 1.2 ? 'above' : v >= 0.8 ? 'normal' : 'below';
}
const VOL_WORD: Record<AiqLoc, Record<'surge' | 'above' | 'normal' | 'below', string>> = {
    ko: { surge: '크게 늘어난 수준', above: '다소 많은 편', normal: '평소 수준', below: '평소보다 적은 편' },
    en: { surge: 'well above normal', above: 'somewhat above normal', normal: 'about normal', below: 'below normal' },
    ja: { surge: '平常を大きく上回る', above: 'やや多め', normal: '平常並み', below: '平常より少なめ' },
};
/** 시장 평균 대비(±3%p 안은 «비슷») */
export function vsMarket(pct: number, avg: number | null): 'higher' | 'similar' | 'lower' | null {
    return avg == null ? null : pct - avg >= 3 ? 'higher' : avg - pct >= 3 ? 'lower' : 'similar';
}
const MKT_WORD: Record<AiqLoc, Record<'higher' | 'similar' | 'lower', string>> = {
    ko: { higher: '시장 평균보다 높음', similar: '시장 평균과 비슷', lower: '시장 평균보다 낮음' },
    en: { higher: 'above the market average', similar: 'about the market average', lower: 'below the market average' },
    ja: { higher: '市場平均より高い', similar: '市場平均並み', lower: '市場平均より低い' },
};

export function citeOffEx(o: AiqOffEx, loc: AiqLoc): string {
    const d = asOfClose(o.date, loc);
    const vb = volBand(o.volRatio), vm = vsMarket(o.pct, o.marketAvg);
    const extra: string[] = [];
    if (loc === 'ko') {
        if (o.marketAvg != null) extra.push(`시장 평균 ${o.marketAvg}%${vm ? `, ${MKT_WORD.ko[vm]}` : ''}`);
        if (o.volRatio != null) extra.push(`이 종목 20일 평균 대비 장외 물량 ${o.volRatio}배${vb ? `로 ${VOL_WORD.ko[vb]}` : ''}`);
        return `${d} FINRA 장외 비중 ${o.pct}%${extra.length ? `(${extra.join(', ')})` : ''}`;
    }
    if (loc === 'ja') {
        if (o.marketAvg != null) extra.push(`市場平均${o.marketAvg}%${vm ? `・${MKT_WORD.ja[vm]}` : ''}`);
        if (o.volRatio != null) extra.push(`この銘柄の20日平均比で場外出来高${o.volRatio}倍${vb ? `・${VOL_WORD.ja[vb]}` : ''}`);
        return `${d}、FINRA場外比率${o.pct}%${extra.length ? `(${extra.join('、')})` : ''}`;
    }
    if (o.marketAvg != null) extra.push(`market average ${o.marketAvg}%${vm ? `, ${MKT_WORD.en[vm]}` : ''}`);
    if (o.volRatio != null) extra.push(`off-exchange volume ${o.volRatio}x its own 20-day average, ${vb ? VOL_WORD.en[vb] : ''}`.replace(/, $/, ''));
    return `FINRA off-exchange share ${o.pct}% (${d}${extra.length ? `; ${extra.join('; ')}` : ''})`;
}

export function citeImplied(m: AiqImplied, loc: AiqLoc): string {
    const when = m.session ? (m.basis === 'live' ? (loc === 'ko' ? `${mdOf(m.session)} 장중` : loc === 'ja' ? `${mdOf(m.session)} 場中` : `${mdOf(m.session)} intraday`) : asOfClose(m.session, loc)) : '';
    const exp = m.expiry ? mdOf(m.expiry) : '';
    const rc = m.reach?.call, rp = m.reach?.put;
    const lv = (n: number) => formatLevelPrice(n);
    let tail = '';
    if (rc || rp) {
        if (loc === 'ko') tail = ` — ${[rc && `Call Wall $${lv(rc.level)}은 현재가에서 ${rc.distPct}% 위로 이 범위 ${rc.inside ? '안' : '밖'}`, rp && `Put Floor $${lv(rp.level)}은 ${rp.distPct}% 아래로 이 범위 ${rp.inside ? '안' : '밖'}`].filter(Boolean).join(', ')}`;
        else if (loc === 'ja') tail = ` — ${[rc && `Call Wall $${lv(rc.level)}は現値の${rc.distPct}%上で範囲${rc.inside ? '内' : '外'}`, rp && `Put Floor $${lv(rp.level)}は${rp.distPct}%下で範囲${rp.inside ? '内' : '外'}`].filter(Boolean).join('、')}`;
        else tail = ` — ${[rc && `the Call Wall $${lv(rc.level)} is ${rc.distPct}% above spot, ${rc.inside ? 'inside' : 'outside'} that range`, rp && `the Put Floor $${lv(rp.level)} is ${rp.distPct}% below, ${rp.inside ? 'inside' : 'outside'} it`].filter(Boolean).join('; ')}`;
    }
    if (loc === 'ko') return `${when ? `${when} ` : ''}옵션이 ${exp ? `${exp} 만기까지 ` : ''}반영한 변동폭 ±${m.pct}%(ATM 스트래들 기준)${tail}`;
    if (loc === 'ja') return `${when ? `${when}、` : ''}オプション市場が${exp ? `${exp}満期までに` : ''}織り込む想定変動幅は±${m.pct}%(ATMストラドル基準)${tail}`;
    return `options price in a ±${m.pct}% move${exp ? ` by the ${exp} expiry` : ''} (ATM straddle${when ? `, ${when}` : ''})${tail}`;
}

export function citeLevels(l: AiqLevelsAsOf, loc: AiqLoc): string {
    const d = l.chainDate ? asOfClose(l.chainDate, loc) : '';
    const exp = l.expiry ? mdOf(l.expiry) : '';
    if (loc === 'ko') return `옵션 레벨(Max Pain·Call Wall·Put Floor·Gamma Flip)은 ${d || '직전 마감'} 미결제약정${exp ? `, ${exp} 만기` : ''} 기준`;
    if (loc === 'ja') return `オプションレベル(Max Pain・Call Wall・Put Floor・Gamma Flip)は${d || '直近終値'}の建玉${exp ? `、${exp}満期` : ''}ベース`;
    return `option levels (Max Pain, Call Wall, Put Floor, Gamma Flip) are open interest as of ${d || 'the last close'}${exp ? `, ${exp} expiry` : ''}`;
}

/**
 * 옵션 지표별 «기준 시각» — 코드 근거(services/centralDataHub dataFreshness): 거래량·프리미엄은 항상 EOD(OPRA 체결 데이터 플랜 밖 — 직전 정규장 하루치),
 * 미결제약정은 OCC 야간 정산(EOD), OPI = 100 − 미결제약정 P/C × 50(앱 Flow 화면). 그릭스·IV 는 실시간이 있으면 실시간. 그래서 고래·순 프리미엄·거래량 P/C·OPI 는 «직전 마감 하루치»다.
 * AI 가 이 숫자들을 «지금»처럼 쓰지 않게 날짜를 한 문구로 준다.
 */
export function citeFreshness(chainDate: string, loc: AiqLoc): string {
    const d = asOfClose(chainDate, loc);
    if (loc === 'ko') return `고래 프리미엄·순 프리미엄·거래량 기준 P/C 같은 옵션 거래 지표는 ${d} 하루치(전일 데이터)이고, OPI와 옵션 레벨은 같은 날 미결제약정 기준이다. 가격과 변동성은 화면의 현재 세션을 따른다`;
    if (loc === 'ja') return `ホエールプレミアム・ネットプレミアム・出来高ベースのP/Cなどオプション取引指標は${d}の1日分(前日データ)で、OPIとオプションレベルは同日の建玉ベース。価格とボラティリティは画面の現在セッションに従う`;
    return `option-trade metrics (whale premium, net premium, put/call by volume) are one day of data from ${d} (previous-session data), and OPI and the option levels rest on open interest of the same day; price and volatility follow the session shown on screen`;
}

export function citeEarnings(e: AiqEarnings, loc: AiqLoc, impliedExpiry: string | null): string {
    const dn = e.days === 0 ? (loc === 'en' ? 'today' : loc === 'ko' ? '오늘' : '本日') : `D-${e.days}`;
    const inside = impliedExpiry && e.date <= impliedExpiry;
    if (loc === 'ko') return `실적 발표 ${mdOf(e.date)}(${dn})${inside ? ' — 위 만기 안에 실적이 들어 있음' : ''}`;
    if (loc === 'ja') return `決算発表${mdOf(e.date)}(${dn})${inside ? ' — 上記の満期内に決算を含む' : ''}`;
    return `earnings ${mdOf(e.date)} (${dn})${inside ? ' — falls inside that expiry' : ''}`;
}

export function citeHolders(h: AiqHolders, loc: AiqLoc): string {
    const names = h.top.slice(0, 3).map((t) => `${t.name}${t.sharePct ? ` ${t.sharePct}%` : ''}`).join(', ');
    const conc = h.top5SharePct != null ? h.top5SharePct : null;
    // 비율의 분모 = 13F 로 보고된 기관 보유분 전체(발행주식 수가 아니다) — 모델이 «기관이 36.5% 보유»로 부풀려 쓰지 않게 문구에 박는다
    if (loc === 'ko') return `${mdOf(h.period)} 분기말 13F 기준 보고 기관 ${count(h.total, loc)}곳, 보고된 기관 보유분 중 상위 ${names}${conc != null ? ` (상위 5곳 합계 ${conc}%, 발행주식 대비 비율 아님)` : ' (발행주식 대비 비율 아님)'}`;
    if (loc === 'ja') return `${mdOf(h.period)}四半期末の13F基準で報告機関${count(h.total, loc)}社、報告された機関保有分のうち上位は${names}${conc != null ? `(上位5社合計${conc}%、発行済株式に対する比率ではない)` : '(発行済株式に対する比率ではない)'}`;
    return `13F as of the ${mdOf(h.period)} quarter-end: ${count(h.total, loc)} institutions report a position; share of all 13F-reported holdings: ${names}${conc != null ? ` (top 5 together ${conc}%; not a share of shares outstanding)` : ' (not a share of shares outstanding)'}`;
}

export function citeRank(r: AiqRank, loc: AiqLoc): string {
    const when = r.asOf ? (loc === 'ko' ? `${mdOf(r.asOf)} 기준 ` : loc === 'ja' ? `${mdOf(r.asOf)}時点の` : `as of ${mdOf(r.asOf)}: `) : '';
    const of = r.candidates ? (loc === 'en' ? ` of ${count(r.candidates, loc)} screened` : loc === 'ko' ? `(${count(r.candidates, loc)}종목 중)` : `(${count(r.candidates, loc)}銘柄中)`) : '';
    if (loc === 'ko') return `${when}«${r.name.ko}» 랭킹 ${r.rank}위${of}`;
    if (loc === 'ja') return `${when}「${r.name.ja}」ランキング${r.rank}位${of}`;
    return `${when}#${r.rank} in the "${r.name.en}" ranking${of}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 프롬프트 조각
// ─────────────────────────────────────────────────────────────────────────────

/** 프롬프트용 글 이스케이프 — «<»·«>» 만(구조 깨짐 방지). «&»·따옴표는 그대로 둔다: 모델이 «&amp;»·«&quot;» 를 글에 베껴 쓰면 화면에 그대로 나간다. */
const esc = (s: string) => s.replace(/</g, '‹').replace(/>/g, '›');

/** 세 언어 글을 한 번에 쓰는 표면(Flow·딥 분석·인텔)용 XML — cite_ko/en/ja 를 베껴 쓰게 한다. 비어 있으면 ''. */
export function contextXml(f: AiqFacts | null, opts: { indent?: string; withEarnings?: boolean } = {}): string {
    if (!f) return '';
    const ind = opts.indent ?? '  ';
    const L: string[] = [];
    const cites = (fn: (l: AiqLoc) => string) => AIQ_LOCALES.map((l) => `${ind}    <cite_${l}>${esc(fn(l))}</cite_${l}>`).join('\n');
    if (f.levels) L.push(`${ind}  <levels_as_of chain_date="${f.levels.chainDate ?? 'N/A'}" expiry="${f.levels.expiry ?? 'N/A'}">\n${cites((l) => citeLevels(f.levels!, l))}\n${ind}  </levels_as_of>`);
    if (f.levels?.chainDate) L.push(`${ind}  <data_freshness last_completed_session="${f.levels.chainDate}">\n${cites((l) => citeFreshness(f.levels!.chainDate!, l))}\n${ind}  </data_freshness>`);
    if (f.offEx) L.push(`${ind}  <off_exchange as_of="${f.offEx.date}" source="FINRA" share_pct="${f.offEx.pct}"${f.offEx.marketAvg != null ? ` market_avg_pct="${f.offEx.marketAvg}"` : ''}${f.offEx.volRatio != null ? ` own_20d_volume_ratio="${f.offEx.volRatio}"` : ''}${f.offEx.regime ? ` read="${f.offEx.regime}"` : ''} note="Share of the day's volume executed off-exchange (dark pools + wholesalers), T+1. The level is structural — judge it against market_avg_pct and the volume ratio, never in isolation. Positioning read, not a forecast.">\n${cites((l) => citeOffEx(f.offEx!, l))}\n${ind}  </off_exchange>`);
    if (f.implied) L.push(`${ind}  <implied_move pct="${f.implied.pct}" expiry="${f.implied.expiry ?? 'N/A'}" basis="${f.implied.basis}" session="${f.implied.session ?? 'N/A'}" definition="(ATM call mid + ATM put mid) / price — the size of move options price in by that expiry. NOT the Call Wall to Put Floor distance.">\n${cites((l) => citeImplied(f.implied!, l))}\n${ind}  </implied_move>`);
    if (f.earnings && opts.withEarnings !== false) L.push(`${ind}  <earnings_countdown date="${f.earnings.date}" days_until="${f.earnings.days}">\n${cites((l) => citeEarnings(f.earnings!, l, f.implied?.expiry ?? null))}\n${ind}  </earnings_countdown>`);
    if (f.holders) L.push(`${ind}  <institutional_13f period="${f.holders.period}" institutions="${f.holders.total}" note="SEC Form 13F quarter-end snapshot, filed up to 45 days after quarter-end. It shows who held, not what they are doing now. Quarter-over-quarter changes are NOT available — never say institutions bought, sold, added or trimmed.">\n${cites((l) => citeHolders(f.holders!, l))}\n${ind}  </institutional_13f>`);
    for (const r of f.ranks ?? []) L.push(`${ind}  <ranking id="${r.id}" rank="${r.rank}"${r.candidates ? ` of="${r.candidates}"` : ''}${r.asOf ? ` as_of="${r.asOf}"` : ''}>\n${cites((l) => citeRank(r, l))}\n${ind}  </ranking>`);
    if (!L.length) return '';
    return `\n${ind}<verified_context today="${f.todayEt}" timezone="America/New_York" rule="Every figure here is source data with its own as-of date. Cite one only together with its date, by copying the cite_* phrase of the language you are writing (you may drop the parenthetical detail but never the date). Use only the few facts that change the read.">\n${L.join('\n')}\n${ind}</verified_context>`;
}

/** 한 언어 카드(UC)용 줄글 — cite 문구만 줄 단위로 */
export function contextLines(f: AiqFacts | null, loc: AiqLoc, opts: { skipOffEx?: boolean; withEarnings?: boolean } = {}): string[] {
    if (!f) return [];
    const out: string[] = [];
    if (f.levels) out.push(citeLevels(f.levels, loc));
    if (f.offEx && !opts.skipOffEx) out.push(citeOffEx(f.offEx, loc));
    if (f.implied) out.push(citeImplied(f.implied, loc));
    if (f.earnings && opts.withEarnings) out.push(citeEarnings(f.earnings, loc, f.implied?.expiry ?? null));
    if (f.holders) out.push(citeHolders(f.holders, loc));
    for (const r of f.ranks ?? []) out.push(citeRank(r, loc));
    return out;
}

/** 근거 텍스트 — 숫자 대조(checkNumberGrounding)의 «근거»로 쓴다. 모든 언어 문구 + 속성 숫자. */
export function groundingText(f: AiqFacts | null): string {
    if (!f) return '';
    const parts: string[] = [];
    for (const l of AIQ_LOCALES) {
        if (f.levels) parts.push(citeLevels(f.levels, l));
        if (f.offEx) parts.push(citeOffEx(f.offEx, l));
        if (f.implied) parts.push(citeImplied(f.implied, l));
        if (f.earnings) parts.push(citeEarnings(f.earnings, l, f.implied?.expiry ?? null));
        if (f.holders) { parts.push(citeHolders(f.holders, l)); for (const t of f.holders.top) parts.push(`${t.name} ${fmtUsdLoc(t.valueUsd, l)} ${t.sharePct}%`); }
        for (const r of f.ranks ?? []) parts.push(citeRank(r, l));
    }
    if (f.offEx) parts.push(`${f.offEx.pct}% ${f.offEx.marketAvg ?? ''} ${f.offEx.volRatio ?? ''} ${f.offEx.shortPct ?? ''} ${f.offEx.shortAvg ?? ''}`);
    return parts.join('\n');
}

/** 분석 규율(사실 → 의미 → 지켜볼 지점) — 새 입력이 있을 때만 system 끝에 붙는다. 매수·매도·목표가·수익 약속은 쓰지 않는다. */
export const AIQ_DISCIPLINE = `<analysis_discipline>
Structure every point as FACT → MEANING → WATCH:
- FACT: one figure from the data with its as-of date (copy the cite_* phrase of the language you write; the date stays attached to the number).
- MEANING: what that fact says about how positioning, liquidity or risk is built (the mechanism) — one clause, no forecast.
- WATCH: one observable condition a reader can check later (a level, an expiry date, a data release), phrased as a state ("a close below the Put Floor"), never as a prediction. If no natural level or date exists for a point (e.g. an off-exchange share), omit WATCH for that point — never pad it with "watch whether the number moves". Natural wording: ko «지켜볼 지점은 종가가 <레벨> 아래로 내려오는지다.» · en «Watch whether it closes below <level>.» · ja «確認点は終値が<レベル>を下回るかどうか。» (use the real level from the data, not the placeholder).
Rules:
- Use only figures that appear in the data blocks. Never compute new numbers (no sums, ratios, differences or percentage changes of your own).
- If a block or field is absent, do not mention that topic at all. Never write that data is "not provided", "unavailable" or "missing".
- Use few facts, chosen because they change the read. Do not list every block.
- Interpret figures; never explain what a metric is or how it differs from another metric (no definitions, no "X is a separate measure from Y"), and never write instructions to the reader about how to read a number ("read it through the state label").
- When a cite phrase says a wall is inside or outside the implied-move range, copy that wording exactly; never work it out yourself.
- Write each language natively — never a word-for-word rendering of the English phrasing (no translationese like «…상태를 표시한다»).
- No buy/sell/hold advice, no price targets, no promises of returns, no forecasts.
</analysis_discipline>`;

/** 한 언어 카드용 짧은 규율(UC) */
export const AIQ_DISCIPLINE_SHORT = `ANALYSIS DISCIPLINE (new data lines below the money block):
- Every new figure comes with its own as-of date inside its line — copy the phrase, keep the date attached to the number.
- Order your sentences FACT → MEANING → WATCH (WATCH = one observable level or date, as a state, never a prediction).
- WATCH wording: ko «지켜볼 지점은 종가가 <레벨> 아래로 내려오는지다.» · en «Watch whether it closes below <level>.» · ja «確認点は終値が<レベル>を下回るかどうか。» (real level from the data). Write each language natively, no translationese.
- Use only figures that appear in the data; never compute new numbers. If a line is absent, skip that topic silently — never say data is missing or not provided.`;

/** 호출자가 이미 가진 다음 실적일을 사실에 붙인다(오늘 ET 기준 D-n). 날짜가 없거나 지났거나 120일 밖이면 그대로. */
export function attachEarnings(f: AiqFacts | null, date: unknown, daysFn: (from: string, to: string) => number | null = daysBetweenYmd): AiqFacts | null {
    const d = ymd(date);
    if (!f || !d) return f;
    const days = daysFn(f.todayEt, d);
    if (days == null || days < 0 || days > 120) return f;
    return { ...f, earnings: { date: d, days } };
}

/**
 * Flow AI 전용 숫자 규칙 — 새 입력이 켜진 때만 system 에 붙는다.
 * 실측(2026-10-12, 운영 FlowAI 72시간 59건 중 첫 시도 탈락 14건): Haiku 5.5 가 «OPI 게이지 63 … 종합에는 +7점만 기여»처럼 요인별 구성 점수(composite_points)를 인용하면
 * 출구 게이트가 라벨 옆 숫자를 종합점수(+46)·OPI(63)로 읽어 `metric:COMPOSITE:+7≠+46` 으로 떨어뜨린다 → 현행 Bedrock Haiku 4.5(p50 24.8초, 품질 낮음)로 넘어간다.
 * 구성 점수는 내부 가중치라 사용자에게 의미가 없다 — 인용하지 않게 한다.
 */
export const AIQ_FLOW_EXTRA = `<flow_number_rules>
- The per-factor "composite_points" / "score" attributes are internal weights. Never quote them and never write that a factor "adds", "contributes" or "carries" N points to the composite. Quote the gauge ({OPI}), its state word, the other number tokens, or plain data figures instead.
- The composite score is only the token {COMPOSITE}. No other number is "the composite".
</flow_number_rules>
<context_usage>
- If <verified_context> has an off_exchange, implied_move, institutional_13f or ranking block, ONE of the factorHighlights must be built from the most informative of them (name that highlight after its topic, e.g. "Off-exchange activity", "Implied move vs levels", "Institutional ownership"), as FACT → MEANING → WATCH in 1-2 sentences. That highlight is a CROSS-READ: say whether the fact agrees with or conflicts with the options read (OPI, whale premium, put/call, gamma zone) and what that implies for how the positioning is built. In structuralThesis mention a block only if it changes the read.
- Dates: whale premium, net premium, put/call by volume, OPI and the option levels belong to the date in <data_freshness> — say "as of <that date>" once in the paragraph that cites them. The price, IV skew, squeeze and the composite follow the screen's session: never attach a <verified_context> date to those.
</context_usage>`;

/** 딥 분석 전용 — 새 입력이 켜진 때만 system 에 붙는다(섹션 구조는 그대로). */
export const AIQ_DEEP_EXTRA = `<context_usage>
- If <verified_context> has off_exchange, implied_move, earnings_countdown, institutional_13f or ranking blocks, weave the one or two most informative into the sections where they belong — off-exchange, implied move and earnings into "Options Positioning"; 13F ownership and rankings into the technical/structure read — as FACT → MEANING → WATCH, keeping each figure's date attached to it. Relate each new fact to an indicator already in the note (agree or conflict) and say what that means for how the positioning is built.
- Dates: whale/net premium, put/call by volume, OPI and the option levels belong to the date in <data_freshness> — say "as of <that date>" once in the section that cites them. The price, SMA/ADX/OBV and other technical indicators, IV and scores follow the screen's session: never attach a <verified_context> date to those.
- keyInsight is one sentence a reader can check later (a level, an expiry or an earnings date), not a restatement of currentState.
- Dollar price levels that appear only inside news headlines (a trader's bet, an analyst's target, a past close) are not verified levels of this stock: report that news in words ("a large put bet far below the current price") without writing the dollar figure, so a news number is never mistaken for a structure level.
</context_usage>`;

/** 인텔 종목 분석 전용 */
export const AIQ_INTEL_EXTRA = `<context_usage>
- For each stock, if its <verified_context> has off_exchange, implied_move, institutional_13f or ranking blocks, use the most informative one as FACT → MEANING in the analysis (keep the date attached to the figure), relate it to an indicator already in the data (agree or conflict), and finish with the WATCH point.
- Dates: Whale index, NetPremium, PCR and the option levels belong to the date in <data_freshness> — say "as of <that date>" once when you cite them. The price, GEX/gamma regime, squeeze and ContextScore follow the screen's session: never attach a <verified_context> date to those.
- Describe each stock on its own data. Never compare it with the other stocks in the request or with "peers", "AI chip names" or a sector unless the data itself says so.
</context_usage>`;
