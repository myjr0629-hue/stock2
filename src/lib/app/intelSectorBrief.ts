/**
 * 앱 Intel 섹터 «관찰 문장» — 카드 한 줄 · 섹터 상세의 «AI 종합 판정»·«핵심 촉매» · 장마감 리포트 카드의 헤드라인·요약·관찰축·다이제스트를
 * «화면에 그려진 종목 행(설정 목록)»에서만 만든다 (2026-10-07, 앱 강화 정확성 3차 · 순수 함수)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────────────────────────
 *   ① 종목: 서버 스냅샷(/api/intel/snapshot — 마감 뒤 한 번 만든 규칙 문장)은 «엔진 목록»(알파·웹과 공용)의 종목을 말한다.
 *      퀀텀 엣지 카드는 칩이 IONQ·RGTI·QBTS 인데 «AI 종합 판정»은 «주도주 DELL(+3.93%), 약세 TWLO(-6.81%) · 6/7 Long Gamma · 4↑ 3↓»,
 *      촉매는 «AI Call Wall $11.5 근접»·«TWLO Put Floor $272.5 근접» 이었다(10/7 운영 실측).
 *   ② 숫자: 마감 시각에 박힌 값이라 화면의 실시간 값과 달랐다(문장 4↑3↓ ↔ 화면 W/L 3/0 · 문장 PCR 0.67 ↔ 화면 0.97 (1/3종목)).
 *   ③ 말: «하방 지지 예상»·«돌파 시 감마 스퀴즈 가능»·«상방 기대»·«범위 내 등락 예상»·«기술적 반등 가능성 영역» 같은 앞일 서술(대표 지시 9/29: 관찰·조건만).
 *   → 이 모듈은 화면의 종목 행(changePct·price·gex·pcr·콜 월·풋 플로어·RSI·RVOL)을 «읽어서» 지금 상태만 말한다.
 *      글에 박히는 숫자는 전부 같은 화면에 그려진 값이다(저장하지 않는다 — 렌더 때마다 같은 행에서 새로 만든다 = 자리표를 «그 자리에서 채운» 것과 같다).
 *      계산해서 새로 만든 숫자(격차·거리 %)는 쓰지 않는다 — 문턱(3% 이내·RSI 70/30·RVOL 1.5/0.5)은 규칙 상수라 글에 그대로 적는다.
 *
 * ── 말의 규칙 ───────────────────────────────────────────────────────────────────────────────────
 *   관찰어만: 값·개수·종목명·«위/아래/근접»(지금 위치)·«우위/균형»(P/C 색 규칙과 같은 문턱). 예측·전망·가능성·권유 표현 금지 —
 *   tests/intelSectorBrief.test.ts 가 모든 분기의 출력을 trustLayer 예측어 사전 + 더 엄격한 템플릿 사전으로 검사한다(0건 고정).
 *
 * ★ «주도»(= 카드 «주도 종목», 알파 점수 1위)와 «최고/최저»(= 변동률 최고·최저)는 다른 말이다 — 같은 화면에서 «주도» 가 두 뜻이 되지 않게 이 글은 «최고·최저»만 쓴다.
 * 시험: tests/intelSectorBrief.test.ts
 */
import { pcrTone } from '@/lib/app/intelOptionsBasis';

export type BriefLocale = 'ko' | 'en' | 'ja';

/** 화면의 종목 행(KeyStockPremiumData)의 부분집합. 못 쟀다 = null/undefined/0 — 0 을 «측정된 0» 으로 말하지 않는다 */
export interface BriefRow {
    sym: string;
    changePct?: number | null;
    price?: number | null;
    gex?: number | null;
    pcr?: number | null;
    callWall?: number | null;
    putFloor?: number | null;
    rsi?: number | null;
    rvol?: number | null;
    netPremium?: number | null;
}

export interface BriefInput {
    rows: readonly BriefRow[];
    /** 설정 목록 종목 수(카드 칩과 같은 목록) — «n/N종목» 표기의 분모 */
    total: number;
    /** 헤더 배지의 섹터 평균 변동(%) — 화면과 같은 값. 없으면 행에서 같은 식(변동률이 있는 행의 평균)으로 계산한다 */
    avgChange?: number | null;
}

export interface SectorBrief {
    headline: string;
    /** 판정 한두 문장 — 카드 한 줄 · 상세 «AI 종합 판정» · 리포트 요약이 모두 같은 글 */
    summary: string;
    /** «다음 세션 관찰축» 칸 — 지금 위치(레벨) 관찰 한 줄 */
    outlook: string;
    /** 다이제스트 줄(뉴스가 없을 때) */
    bullets: string[];
    /** «핵심 촉매» 줄 — 각 줄은 종목 하나로 시작한다(칩 표시) */
    catalysts: string[];
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/** 레벨 근접 문턱(%) — 현재가가 콜 월 아래 / 풋 플로어 위 이 거리 안이면 «근접» */
export const NEAR_LEVEL_PCT = 3;
export const RSI_HIGH = 70;
export const RSI_LOW = 30;
export const RVOL_HIGH = 1.5;
export const RVOL_LOW = 0.5;
/** 촉매 줄 최대 수 */
export const MAX_CATALYSTS = 4;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 변동률 «+0.74%» — 종목 행(소수 둘째)과 같은 글자 */
export function fmtChg2(v: number): string {
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
/** 섹터 평균 «+0.6%» — 헤더 배지(formatPercentCompact)와 같은 글자 */
export function fmtChg1(v: number): string {
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}
/** GEX «+5.73M» — 헤더 칸(formatGex)과 같은 글자 */
export function fmtGex(val: number): string {
    if (val === 0) return '0.00';
    const abs = Math.abs(val);
    const sign = val > 0 ? '+' : '-';
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`;
    return `${sign}${val.toFixed(2)}`;
}
/** 가격 «$43.29» */
export const fmtPrice = (v: number): string => `$${v.toFixed(2)}`;
/** 옵션 레벨 «$42» · «$272.5» · «$1,062.5» — 상세 종목 행의 레벨 글자(lib/optionLevelGate.formatLevelPrice)와 같은 규칙 */
const LEVEL_NUMBER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function fmtLevel(v: number): string {
    return `$${LEVEL_NUMBER.format(v)}`;
}

interface Facts {
    n: number;
    up: number;
    down: number;
    avg: number | null;
    hi: { sym: string; chg: number } | null;
    lo: { sym: string; chg: number } | null;
    gexSum: number | null;
    gexLong: number;
    gexShort: number;
    gexN: number;
    pcrAvg: number | null;
    pcrN: number;
    total: number;
    bias: number;
    /** 모든 행의 변동률이 측정됐고 전부 > 0 (변동률 0·미측정이 섞이면 «전부 상승» 이라 말하지 않는다 — 화면 W/L 은 ≥0 을 상승으로 센다) */
    allPos: boolean;
    /** 모든 행의 변동률이 측정됐고 전부 < 0 */
    allNeg: boolean;
}

function factsOf(input: BriefInput): Facts {
    const rows = input.rows.filter((r) => r && r.sym);
    // 화면의 W/L 과 같은 규칙 — 변동률이 없는 행은 0 으로 읽는다(alignReportToConfig 의 gainers/losers)
    const up = rows.filter((r) => (r.changePct || 0) >= 0).length;
    const down = rows.filter((r) => (r.changePct || 0) < 0).length;
    const measured = rows.filter((r) => fin(r.changePct));
    const sorted = [...measured].sort((a, b) => (b.changePct as number) - (a.changePct as number));
    const hi = sorted.length ? { sym: sorted[0].sym, chg: sorted[0].changePct as number } : null;
    const lo = sorted.length ? { sym: sorted[sorted.length - 1].sym, chg: sorted[sorted.length - 1].changePct as number } : null;
    const avgFromRows = measured.length ? measured.reduce((s, r) => s + (r.changePct as number), 0) / measured.length : null;
    const avg = fin(input.avgChange) ? input.avgChange : avgFromRows;

    const gexRows = rows.filter((r) => fin(r.gex) && r.gex !== 0);
    const gexSum = gexRows.length ? gexRows.reduce((s, r) => s + (r.gex as number), 0) : null;
    const gexLong = gexRows.filter((r) => (r.gex as number) > 0).length;
    const gexShort = gexRows.filter((r) => (r.gex as number) < 0).length;
    const pcrRows = rows.filter((r) => fin(r.pcr) && (r.pcr as number) > 0);
    const pcrAvg = pcrRows.length ? pcrRows.reduce((s, r) => s + (r.pcr as number), 0) / pcrRows.length : null;
    const netPrem = rows.reduce((s, r) => s + (fin(r.netPremium) ? r.netPremium : 0), 0);

    // 센티먼트 — 앱의 app-live 리포트와 같은 점수식(상승−하락 + 순 프리미엄 부호 + GEX 부호 + P/C 구간)
    const bias = (up - down) + (netPrem > 0 ? 1 : netPrem < 0 ? -1 : 0) + ((gexSum ?? 0) > 0 ? 1 : (gexSum ?? 0) < 0 ? -1 : 0)
        + (pcrAvg != null && pcrAvg > 0 && pcrAvg < 0.9 ? 1 : pcrAvg != null && pcrAvg > 1.15 ? -1 : 0);

    const allMeasured = measured.length === rows.length && measured.length > 0;
    const allPos = allMeasured && measured.every((r) => (r.changePct as number) > 0);
    const allNeg = allMeasured && measured.every((r) => (r.changePct as number) < 0);
    return { n: rows.length, up, down, avg, hi, lo, gexSum, gexLong, gexShort, gexN: gexRows.length, pcrAvg, pcrN: pcrRows.length, total: Math.max(input.total, rows.length), bias, allPos, allNeg };
}

const sentimentOf = (bias: number): SectorBrief['sentiment'] => (bias >= 2 ? 'BULLISH' : bias <= -2 ? 'BEARISH' : 'NEUTRAL');

// ── 문장 재료(언어별) ──────────────────────────────────────────────────────────────────────────
interface Words {
    headline: (f: Facts, avg: string | null, hi: string, lo: string) => string;
    moves: (f: Facts, avg: string | null, hi: string, lo: string) => string;
    gex: (f: Facts, sum: string) => string;
    gexNone: string;
    pcr: (f: Facts, v: string, tone: string) => string;
    pcrNone: string;
    optionsNone: string;
    tone: { call: string; balanced: string; put: string };
    levelNearCall: (sym: string, cw: string, px: string) => string;
    levelAboveCall: (sym: string, cw: string, px: string) => string;
    levelNearPut: (sym: string, pf: string, px: string) => string;
    levelBelowPut: (sym: string, pf: string, px: string) => string;
    rsiHigh: (sym: string, r: number) => string;
    rsiLow: (sym: string, r: number) => string;
    rvolHigh: (sym: string, x: string) => string;
    rvolLow: (sym: string, x: string) => string;
    leadOnly: (sym: string, chg: string) => string;
    noNearLevels: string;
    bulletMoves: (f: Facts, avg: string | null) => string;
    bulletLead: (hi: string, lo: string) => string;
    bulletGex: (f: Facts, sum: string) => string;
    bulletPcr: (f: Facts, v: string, tone: string) => string;
    bulletRsi: (hiList: string, loList: string) => string;
}

const cov = (n: number, total: number): string => (n > 0 && n < total ? `${n}/${total}` : '');

const KO: Words = {
    headline: (f, avg, hi, lo) => {
        const head = f.allPos ? `${f.n}종목 전부 상승` : f.allNeg ? `${f.n}종목 전부 하락` : `상승 ${f.up} · 하락 ${f.down}`;
        const tail = f.n <= 1 ? hi : f.allPos ? `최고 ${hi}` : f.allNeg ? `최저 ${lo}` : `최고 ${hi} · 최저 ${lo}`;
        return `${head} — ${avg ? `평균 ${avg}, ` : ''}${tail}`;
    },
    moves: (f, avg, hi, lo) => (f.n <= 1 ? `${hi}.` : `상승 ${f.up}·하락 ${f.down}${avg ? `, 평균 ${avg}` : ''}. 최고 ${hi}, 최저 ${lo}.`),
    gex: (f, sum) => `GEX ${sum}(롱 감마 ${f.gexLong}·숏 감마 ${f.gexShort}${cov(f.gexN, f.total) ? `, ${cov(f.gexN, f.total)}종목` : ''})`,
    gexNone: 'GEX 집계 종목 없음',
    pcr: (f, v, tone) => `P/C ${v}(${tone}${cov(f.pcrN, f.total) ? `, ${cov(f.pcrN, f.total)}종목` : ''})`,
    pcrNone: 'P/C 집계 종목 없음',
    optionsNone: '옵션 지표(GEX·P/C)는 집계된 종목이 없습니다.',
    tone: { call: '콜 우위', balanced: '균형', put: '풋 우위' },
    levelNearCall: (s, cw, px) => `${s} 콜 월 ${cw} 근접 (현재가 ${px}, ${NEAR_LEVEL_PCT}% 이내)`,
    levelAboveCall: (s, cw, px) => `${s} 현재가 ${px}가 콜 월 ${cw} 위`,
    levelNearPut: (s, pf, px) => `${s} 풋 플로어 ${pf} 근접 (현재가 ${px}, ${NEAR_LEVEL_PCT}% 이내)`,
    levelBelowPut: (s, pf, px) => `${s} 현재가 ${px}가 풋 플로어 ${pf} 아래`,
    rsiHigh: (s, r) => `${s} RSI ${r} (${RSI_HIGH} 이상)`,
    rsiLow: (s, r) => `${s} RSI ${r} (${RSI_LOW} 이하)`,
    rvolHigh: (s, x) => `${s} 상대 거래량 ${x} (${RVOL_HIGH}x 이상)`,
    rvolLow: (s, x) => `${s} 상대 거래량 ${x} (${RVOL_LOW}x 이하)`,
    leadOnly: (s, c) => `${s} ${c} — 섹터 내 변동률 1위`,
    noNearLevels: `주요 옵션 레벨(콜 월·풋 플로어) ${NEAR_LEVEL_PCT}% 이내 종목 없음`,
    bulletMoves: (f, avg) => `상승 ${f.up} · 하락 ${f.down}${avg ? ` (평균 ${avg})` : ''}`,
    bulletLead: (hi, lo) => `최고 ${hi} · 최저 ${lo}`,
    bulletGex: (f, sum) => `감마 GEX ${sum} · 롱 ${f.gexLong} : 숏 ${f.gexShort}${cov(f.gexN, f.total) ? ` (${cov(f.gexN, f.total)}종목)` : ''}`,
    bulletPcr: (f, v, tone) => `P/C 평균 ${v} · ${tone}${cov(f.pcrN, f.total) ? ` (${cov(f.pcrN, f.total)}종목)` : ''}`,
    bulletRsi: (h, l) => [h ? `${h} — RSI ${RSI_HIGH} 이상` : '', l ? `${l} — RSI ${RSI_LOW} 이하` : ''].filter(Boolean).join(' · '),
};

const EN: Words = {
    headline: (f, avg, hi, lo) => {
        const head = f.allPos ? `All ${f.n} up` : f.allNeg ? `All ${f.n} down` : `${f.up} up · ${f.down} down`;
        const tail = f.n <= 1 ? hi : f.allPos ? `highest ${hi}` : f.allNeg ? `lowest ${lo}` : `highest ${hi} · lowest ${lo}`;
        return `${head} — ${avg ? `avg ${avg}, ` : ''}${tail}`;
    },
    moves: (f, avg, hi, lo) => (f.n <= 1 ? `${hi}.` : `${f.up} up, ${f.down} down${avg ? `, average ${avg}` : ''}. Highest ${hi}, lowest ${lo}.`),
    gex: (f, sum) => `GEX ${sum} (long gamma ${f.gexLong} · short gamma ${f.gexShort}${cov(f.gexN, f.total) ? `, ${cov(f.gexN, f.total)} names` : ''})`,
    gexNone: 'GEX not measured for any name',
    pcr: (f, v, tone) => `P/C ${v} (${tone}${cov(f.pcrN, f.total) ? `, ${cov(f.pcrN, f.total)} names` : ''})`,
    pcrNone: 'P/C not measured for any name',
    optionsNone: 'No name has options metrics (GEX, P/C) measured.',
    tone: { call: 'call-side tilt', balanced: 'balanced', put: 'put-side tilt' },
    levelNearCall: (s, cw, px) => `${s} near Call Wall ${cw} (price ${px}, within ${NEAR_LEVEL_PCT}%)`,
    levelAboveCall: (s, cw, px) => `${s} price ${px} is above Call Wall ${cw}`,
    levelNearPut: (s, pf, px) => `${s} near Put Floor ${pf} (price ${px}, within ${NEAR_LEVEL_PCT}%)`,
    levelBelowPut: (s, pf, px) => `${s} price ${px} is below Put Floor ${pf}`,
    rsiHigh: (s, r) => `${s} RSI ${r} (${RSI_HIGH} or above)`,
    rsiLow: (s, r) => `${s} RSI ${r} (${RSI_LOW} or below)`,
    rvolHigh: (s, x) => `${s} relative volume ${x} (${RVOL_HIGH}x or above)`,
    rvolLow: (s, x) => `${s} relative volume ${x} (${RVOL_LOW}x or below)`,
    leadOnly: (s, c) => `${s} ${c} — highest change in the sector`,
    noNearLevels: `No name within ${NEAR_LEVEL_PCT}% of a key option level (Call Wall, Put Floor)`,
    bulletMoves: (f, avg) => `${f.up} up · ${f.down} down${avg ? ` (avg ${avg})` : ''}`,
    bulletLead: (hi, lo) => `Highest ${hi} · lowest ${lo}`,
    bulletGex: (f, sum) => `Gamma: GEX ${sum} · long ${f.gexLong} : short ${f.gexShort}${cov(f.gexN, f.total) ? ` (${cov(f.gexN, f.total)} names)` : ''}`,
    bulletPcr: (f, v, tone) => `Avg P/C ${v} · ${tone}${cov(f.pcrN, f.total) ? ` (${cov(f.pcrN, f.total)} names)` : ''}`,
    bulletRsi: (h, l) => [h ? `${h} — RSI ${RSI_HIGH} or above` : '', l ? `${l} — RSI ${RSI_LOW} or below` : ''].filter(Boolean).join(' · '),
};

const JA: Words = {
    headline: (f, avg, hi, lo) => {
        const head = f.allPos ? `全${f.n}銘柄上昇` : f.allNeg ? `全${f.n}銘柄下落` : `上昇${f.up} · 下落${f.down}`;
        const tail = f.n <= 1 ? hi : f.allPos ? `最高 ${hi}` : f.allNeg ? `最低 ${lo}` : `最高 ${hi} · 最低 ${lo}`;
        return `${head} — ${avg ? `平均 ${avg}、` : ''}${tail}`;
    },
    moves: (f, avg, hi, lo) => (f.n <= 1 ? `${hi}。` : `上昇${f.up}・下落${f.down}${avg ? `、平均 ${avg}` : ''}。最高 ${hi}、最低 ${lo}。`),
    gex: (f, sum) => `GEX ${sum}(ロングガンマ ${f.gexLong}・ショートガンマ ${f.gexShort}${cov(f.gexN, f.total) ? `、${cov(f.gexN, f.total)}銘柄` : ''})`,
    gexNone: 'GEX 集計銘柄なし',
    pcr: (f, v, tone) => `P/C ${v}(${tone}${cov(f.pcrN, f.total) ? `、${cov(f.pcrN, f.total)}銘柄` : ''})`,
    pcrNone: 'P/C 集計銘柄なし',
    optionsNone: 'オプション指標(GEX・P/C)を集計できた銘柄はありません。',
    tone: { call: 'コール優勢', balanced: '均衡', put: 'プット優勢' },
    levelNearCall: (s, cw, px) => `${s} コールウォール ${cw} に接近 (現在値 ${px}、${NEAR_LEVEL_PCT}%以内)`,
    levelAboveCall: (s, cw, px) => `${s} 現在値 ${px} がコールウォール ${cw} の上`,
    levelNearPut: (s, pf, px) => `${s} プットフロア ${pf} に接近 (現在値 ${px}、${NEAR_LEVEL_PCT}%以内)`,
    levelBelowPut: (s, pf, px) => `${s} 現在値 ${px} がプットフロア ${pf} の下`,
    rsiHigh: (s, r) => `${s} RSI ${r} (${RSI_HIGH}以上)`,
    rsiLow: (s, r) => `${s} RSI ${r} (${RSI_LOW}以下)`,
    rvolHigh: (s, x) => `${s} 相対出来高 ${x} (${RVOL_HIGH}x以上)`,
    rvolLow: (s, x) => `${s} 相対出来高 ${x} (${RVOL_LOW}x以下)`,
    leadOnly: (s, c) => `${s} ${c} — セクター内の騰落率1位`,
    noNearLevels: `主要オプションレベル(コールウォール・プットフロア)${NEAR_LEVEL_PCT}%以内の銘柄なし`,
    bulletMoves: (f, avg) => `上昇${f.up} · 下落${f.down}${avg ? ` (平均 ${avg})` : ''}`,
    bulletLead: (hi, lo) => `最高 ${hi} · 最低 ${lo}`,
    bulletGex: (f, sum) => `ガンマ GEX ${sum} · ロング ${f.gexLong} : ショート ${f.gexShort}${cov(f.gexN, f.total) ? ` (${cov(f.gexN, f.total)}銘柄)` : ''}`,
    bulletPcr: (f, v, tone) => `平均 P/C ${v} · ${tone}${cov(f.pcrN, f.total) ? ` (${cov(f.pcrN, f.total)}銘柄)` : ''}`,
    bulletRsi: (h, l) => [h ? `${h} — RSI ${RSI_HIGH}以上` : '', l ? `${l} — RSI ${RSI_LOW}以下` : ''].filter(Boolean).join(' · '),
};

const WORDS: Record<BriefLocale, Words> = { ko: KO, en: EN, ja: JA };

/**
 * 섹터 관찰 문장. 변동률이 있는 종목이 하나도 없으면 null — 호출자는 «문장 없음»으로 둔다(서버 문장으로 메우지 않는다).
 */
export function buildSectorBrief(input: BriefInput, locale: BriefLocale): SectorBrief | null {
    const w = WORDS[locale] ?? WORDS.en;
    const f = factsOf(input);
    if (!f.n || !f.hi || !f.lo) return null;

    const avg = f.avg != null ? fmtChg1(f.avg) : null;
    const hi = `${f.hi.sym} ${fmtChg2(f.hi.chg)}`;
    const lo = `${f.lo.sym} ${fmtChg2(f.lo.chg)}`;
    const rows = input.rows.filter((r) => r && r.sym);

    // ── 옵션 문장 ──
    const gexText = f.gexSum != null ? w.gex(f, fmtGex(f.gexSum)) : w.gexNone;
    const tone = pcrTone(f.pcrAvg);
    const pcrText = f.pcrAvg != null && tone ? w.pcr(f, f.pcrAvg.toFixed(2), w.tone[tone]) : w.pcrNone;
    const optionsSentence = f.gexSum == null && f.pcrAvg == null
        ? w.optionsNone
        : (locale === 'ja' ? `${gexText}、${pcrText}。` : `${gexText}, ${pcrText}.`);

    const summary = `${w.moves(f, avg, hi, lo)}${locale === 'ja' ? '' : ' '}${optionsSentence}`.replace(/\s+/g, ' ').trim();
    const headline = w.headline(f, avg, hi, lo);

    // ── 촉매(레벨 → RSI → 상대 거래량) ──
    const levels: string[] = [];
    const callLines: string[] = [];
    const putLines: string[] = [];
    for (const r of rows) {
        const px = fin(r.price) && r.price > 0 ? r.price : null;
        if (px == null) continue;
        if (fin(r.callWall) && r.callWall > 0) {
            if (px >= r.callWall) callLines.push(w.levelAboveCall(r.sym, fmtLevel(r.callWall), fmtPrice(px)));
            else if (((r.callWall - px) / px) * 100 <= NEAR_LEVEL_PCT) callLines.push(w.levelNearCall(r.sym, fmtLevel(r.callWall), fmtPrice(px)));
        }
        if (fin(r.putFloor) && r.putFloor > 0) {
            if (px <= r.putFloor) putLines.push(w.levelBelowPut(r.sym, fmtLevel(r.putFloor), fmtPrice(px)));
            else if (((px - r.putFloor) / px) * 100 <= NEAR_LEVEL_PCT) putLines.push(w.levelNearPut(r.sym, fmtLevel(r.putFloor), fmtPrice(px)));
        }
    }
    levels.push(...callLines, ...putLines);

    const rsiHigh = rows.filter((r) => fin(r.rsi) && r.rsi >= RSI_HIGH).sort((a, b) => (b.rsi as number) - (a.rsi as number));
    const rsiLow = rows.filter((r) => fin(r.rsi) && r.rsi > 0 && r.rsi <= RSI_LOW).sort((a, b) => (a.rsi as number) - (b.rsi as number));
    const rvolHigh = rows.filter((r) => fin(r.rvol) && r.rvol >= RVOL_HIGH).sort((a, b) => (b.rvol as number) - (a.rvol as number));
    const rvolLow = rows.filter((r) => fin(r.rvol) && r.rvol > 0 && r.rvol <= RVOL_LOW).sort((a, b) => (a.rvol as number) - (b.rvol as number));
    const flags: string[] = [
        ...rsiHigh.map((r) => w.rsiHigh(r.sym, Math.round(r.rsi as number))),
        ...rsiLow.map((r) => w.rsiLow(r.sym, Math.round(r.rsi as number))),
        ...rvolHigh.map((r) => w.rvolHigh(r.sym, `${(r.rvol as number).toFixed(1)}x`)),
        ...rvolLow.map((r) => w.rvolLow(r.sym, `${(r.rvol as number).toFixed(1)}x`)),
    ];

    const catalysts = [...levels, ...flags].slice(0, MAX_CATALYSTS);
    const hasLevelData = rows.some((r) => (fin(r.callWall) && r.callWall > 0) || (fin(r.putFloor) && r.putFloor > 0));
    if (levels.length === 0 && hasLevelData && catalysts.length < MAX_CATALYSTS) catalysts.push(w.noNearLevels);
    if (catalysts.length === 0) catalysts.push(w.leadOnly(f.hi.sym, fmtChg2(f.hi.chg)));

    // ── 다이제스트 줄 ──
    //   ⚠ 리포트 탭의 다이제스트 렌더러는 줄 앞의 «대문자 단어»(^[A-Z][A-Z0-9.-]{1,5})를 «종목 칸»으로 떼고 나머지의 앞 «-»·«:» 를 지운다 —
    //   «GEX -2.60M …» 이 «GEX | 2.60M …» 이 되어 음수 부호가 사라진다(10/7 미리보기 실측). 줄은 대문자 단어 + 부호 있는 숫자로 시작하지 않는다(시험이 지킨다).
    const bullets: string[] = [w.bulletMoves(f, avg), w.bulletLead(hi, lo)];
    bullets.push(f.gexSum != null ? w.bulletGex(f, fmtGex(f.gexSum)) : w.gexNone);
    bullets.push(f.pcrAvg != null && tone ? w.bulletPcr(f, f.pcrAvg.toFixed(2), w.tone[tone]) : w.pcrNone);
    const rsiLine = w.bulletRsi(rsiHigh.map((r) => `${r.sym} ${Math.round(r.rsi as number)}`).join(', '), rsiLow.map((r) => `${r.sym} ${Math.round(r.rsi as number)}`).join(', '));
    if (rsiLine) bullets.push(rsiLine);

    return {
        headline,
        summary,
        outlook: catalysts[0] || bullets[1],
        bullets,
        catalysts,
        sentiment: sentimentOf(f.bias),
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 리포트 객체에 입히기 — 서버 리포트의 «글»을 설정 목록 행에서 만든 글로 바꾼다(숫자 집계는 호출자가 이미 설정 목록으로 맞춘 상태)
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface BriefableReport {
    sentiment: string;
    verdict: string;
    catalysts: string[];
    bullets: string[];
    keyStocksData: Array<{ sym: string } & Omit<BriefRow, 'sym' | 'price'> & { closePrice?: number | null }>;
    reportHeadline?: string;
    reportSummary?: string;
    dayOutlook?: string;
    newsDigest?: string[];
    briefingBullets?: string[];
    newsItems?: Array<{ tickers?: string[] }>;
    riskNotes?: string[];
}

/** 뉴스 항목이 «이 섹터 카드의 종목»만 말하는가 — 태그된 종목이 하나 이상이고 전부 설정 목록 안이어야 한다 */
export function newsItemInConfig(item: { tickers?: string[] } | null | undefined, config: ReadonlySet<string>): boolean {
    const tk = (item?.tickers || []).map((t) => String(t).toUpperCase()).filter(Boolean);
    return tk.length > 0 && tk.every((t) => config.has(t));
}

/**
 * 리포트의 글 칸(판정·촉매·헤드라인·요약·관찰축·다이제스트·리스크·센티먼트)을 설정 목록 행에서 만든 관찰 문장으로 바꾼다.
 *   · keyStocksData 는 호출자가 설정 목록으로 맞춘 행이어야 한다(alignReportToConfig).
 *   · 행이 없으면 서버 글을 «비운다» — 엔진 목록 종목을 말하는 글을 내보내지 않는다.
 *   · 뉴스 항목은 태그된 종목이 전부 설정 목록 안인 것만 남긴다(카드에 없는 종목의 뉴스를 이 카드에 붙이지 않는다).
 */
export function applySectorBrief<T extends BriefableReport>(report: T, configTickers: readonly string[], locale: BriefLocale, avgChange?: number | null): T {
    const config = new Set(configTickers.map((t) => t.toUpperCase()));
    const newsItems = (report.newsItems || []).filter((n) => newsItemInConfig(n, config));
    const rows: BriefRow[] = (report.keyStocksData || []).map((s) => ({
        sym: s.sym, changePct: s.changePct, price: s.closePrice, gex: s.gex, pcr: s.pcr, callWall: s.callWall, putFloor: s.putFloor, rsi: s.rsi, rvol: s.rvol, netPremium: s.netPremium,
    }));
    const brief = buildSectorBrief({ rows, total: configTickers.length, avgChange }, locale);
    if (!brief) {
        return { ...report, verdict: '', catalysts: [], bullets: [], reportHeadline: '', reportSummary: '', dayOutlook: '', newsDigest: [], briefingBullets: [], riskNotes: [], newsItems };
    }
    return {
        ...report,
        sentiment: brief.sentiment,
        verdict: brief.summary,
        catalysts: brief.catalysts,
        bullets: brief.bullets,
        reportHeadline: brief.headline,
        reportSummary: brief.summary,
        dayOutlook: brief.outlook,
        // 뉴스 항목이 없을 때 다이제스트 칸이 쓰는 줄 — 서버의 뉴스 줄(엔진 목록 종목의 기사)이 아니라 같은 행에서 만든 줄
        newsDigest: brief.bullets,
        briefingBullets: brief.bullets,
        riskNotes: brief.catalysts.slice(0, 3),
        newsItems,
    };
}
