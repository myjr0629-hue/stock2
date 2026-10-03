/**
 * 종목별 AI 분석(/api/flow/ai-analysis) — «글 속 가격 = 그 종목 화면의 가격» 검사. 순수 함수만(네트워크·Redis 없음).
 *
 * ★2026-10-04 운영 실측(캐시 8종목 × ko·en·ja = 24행 중 15행 불일치):
 *   AAPL 글 «$200 콜 벽과 $170 풋 플로어 … 현물 가격을 $188.75 근처에» = PLTR 값(188.75 / CW 200 / PF 170).
 *   AAPL 화면은 333.69 / CW 340 / PF 330. 같은 식으로 MSFT 글엔 NVDA 값($235/$220), META 엔 AAPL, GOOGL 엔 MSFT, AMD 엔 GOOGL 값.
 *   다섯 건 모두 10/3 16:23:37~16:24:20Z 40초 안에 FIRST_LOAD 로 생성 — 종목을 빠르게 넘긴 한 화면.
 * 메커니즘: 앱 app-view/flow 의 AI 이펙트는 «종목이 바뀐 바로 그 렌더»에 돈다. 그 렌더의 재료(aiPayloadRef)는 아직
 *   이전 종목의 가격·벽이고(가격 state 는 종목이 바뀌어도 초기화되지 않는다), 서버는 flowData 가 그 티커 것인지 보지 않고
 *   생성해 «티커 하나» 키에 최대 14시간 저장했다. 출구에 숫자 대조도 없었다.
 * 지키는 것(earningsBrief 와 같은 틀):
 *   ① 재료 검증 — 요청 가격이 서버가 아는 그 종목 가격(정규장·시간외·전일 종가 중 가장 가까운 값)과 3% 넘게 다르면 생성하지 않는다.
 *   ② 출구 대조 — 글 속 «가격 수준» $숫자는 생성 재료(현재가·콜월·풋플로어·맥스페인·감마플립) 중 하나와 ±1.5% 안이어야 한다.
 *      «$수준, X% 거리» 짝은 |수준−현재가|/현재가 와 맞아야 한다. 틀린 언어가 하나라도 있으면 저장·제공하지 않는다.
 *   ③ 기준 — 저장값에 basis(재료 숫자)를 같이 둬서 캐시에서 나갈 때도 같은 검사를 한다.
 */

export type FlowLocale = 'ko' | 'en' | 'ja';
export const FLOW_LOCALES: readonly FlowLocale[] = ['ko', 'en', 'ja'];

export interface FlowBasis {
    ticker: string;
    price: number;
    callWall: number | null;
    putFloor: number | null;
    maxPain: number | null;
    gammaFlip: number | null;
    /** 프롬프트에 들어간 그 밖의 $수준 — 알파 트레이드 행사가·프리미엄, 애널리스트 목표가(보강 재료) */
    extras: number[];
}

/** 가격 수준 대조 허용 오차 — AI 반올림(188.75 → «$189»·«$190») 허용 */
export const LEVEL_TOL = 0.015;
/** 요청 재료 가격 ↔ 서버 가격 허용 오차 — 다른 종목 값(188 vs 333)은 수십 % 차이, 화면·서버 시차는 1% 안쪽 */
export const SERVER_PRICE_TOL = 0.03;

const pos = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v.replace(/[$,%\s]/g, '')) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** 화면이 보낸 flowData 에서 «글에 들어갈 수 있는 가격 수준»만 뽑는다. */
export function basisFromFlowData(ticker: string, d: any): FlowBasis {
    return {
        ticker: String(ticker || '').toUpperCase(),
        price: pos(d?.currentPrice) ?? 0,
        callWall: pos(d?.position?.callWall),
        putFloor: pos(d?.position?.putFloor),
        maxPain: pos(d?.regime?.maxPain),
        gammaFlip: pos(d?.regime?.gammaFlipLevel),
        extras: [pos(d?.alphaTrade?.strike), pos(d?.alphaTrade?.premium)].filter((v): v is number => v != null),
    };
}

/** 보강 재료 문자열(buildEnrichment)에 든 애널리스트 목표가 — 글이 «목표가 $X»를 쓰면 이 값이어야 한다. */
export function enrichmentLevels(enrichment: string): number[] {
    const out: number[] = [];
    for (const m of String(enrichment || '').matchAll(/target_[a-z]+="\$(\d+(?:\.\d+)?)"/g)) {
        const v = Number(m[1]);
        if (Number.isFinite(v) && v > 0) out.push(v);
    }
    return out;
}

export function basisLevels(b: FlowBasis): number[] {
    return [b.price, b.callWall, b.putFloor, b.maxPain, b.gammaFlip, ...(b.extras || [])].filter((v): v is number => typeof v === 'number' && v > 0);
}

/** 요청 재료의 가격이 서버가 아는 그 종목 가격들 중 하나와 맞는가. 서버 가격을 모르면 판정하지 않는다(true). */
export function flowPriceMatchesServer(flowPrice: number, serverPrices: Array<number | null | undefined>, tol = SERVER_PRICE_TOL): boolean {
    const s = serverPrices.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (!s.length) return true;
    if (!(flowPrice > 0)) return false;
    return s.some((p) => Math.abs(flowPrice - p) / p <= tol);
}

// 금액(프리미엄·내부자·매출)·목표가·이동평균 등 «가격 수준이 아닌» $숫자를 가르는 문맥
const AMOUNT_AFTER = /^\s?(?:[BMKT]\b|bn\b|mm\b|billion|million|thousand|trillion|억|만|万|億|兆|조|천)/i;
const DIR_AFTER = /^\s*(?:above|below|away|from|off|higher|lower|upside|downside|거리|상방|하방|위|아래|떨어|높|낮|上|下|離れ|乖離|高い|安い)/i;
const NOT_LEVEL_AFTER = /^\s*[,(（]?\s*(?:street |analyst |consensus |price |median )?(?:target|목표|目標|컨센서스)/i;
const NOT_LEVEL_BEFORE = /(target|목표|目標|SMA|EMA|\bMA\s?\d|\d{2,3}[- ]?(?:day|일|日)|52|EPS|매출|revenue|売上|insider|내부자|インサイダー|premium|프리미엄|プレミアム|배당|dividend|配当)[^$]{0,24}$/i;

export interface LevelHit { value: number; index: number; ctx: string }

/** 글 속 $숫자 중 «가격 수준»으로 읽히는 것만 돌려준다(현재가의 0.3~3배, 금액·목표가·이동평균 문맥 제외). */
export function priceLevelsInText(text: string, price: number): LevelHit[] {
    if (!text || !(price > 0)) return [];
    const out: LevelHit[] = [];
    const re = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const v = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(v) || v < 0.3 * price || v > 3 * price) continue;
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
        if (AMOUNT_AFTER.test(after) || NOT_LEVEL_AFTER.test(after)) continue;
        if (NOT_LEVEL_BEFORE.test(text.slice(Math.max(0, m.index - 32), m.index))) continue;
        out.push({ value: v, index: m.index, ctx: text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 14) });
    }
    return out;
}

/** 한 언어 글의 검사 — 틀린 이유 목록(비면 통과). */
export function checkFlowText(text: string, b: FlowBasis): string[] {
    const bad: string[] = [];
    if (!text || !(b.price > 0)) return bad;
    const levels = basisLevels(b);
    for (const h of priceLevelsInText(text, b.price)) {
        const near = levels.reduce((best, l) => (Math.abs(l - h.value) < Math.abs(best - h.value) ? l : best), levels[0]);
        if (Math.abs(near - h.value) / near > LEVEL_TOL) {
            bad.push(`level $${h.value} ≠ 재료(${levels.join('/')})`);
        }
    }
    // «$190 감마 플립은 현재가에서 1.25% 상방» · «$235, 0.4% 거리» · «$337.5 … 1.1% 上方» — 방향어가 붙은 % 는 «바로 앞 70자 안»에
    //   나온 수준(현재가 제외) 중 하나의 거리 |수준−현재가|/현재가 와 맞아야 한다. (10/4 재생성 PLTR: $190 vs $188.75 = 0.66% 인데 «1.25%» —
    //   $1.25 달러 차이를 % 로 씀.) 방향어 없는 % («6.0% vs 9.9%», OPI·확률)는 대조하지 않는다.
    const pctRe = /([+\-−]?\d+(?:\.\d+)?)\s*%/g;
    let pm: RegExpExecArray | null;
    while ((pm = pctRe.exec(text))) {
        const after = text.slice(pm.index + pm[0].length, pm.index + pm[0].length + 10);
        if (!DIR_AFTER.test(after)) continue;
        if (/(probab|확률|確率|OPI|score|점수|スコア|비율|ratio|比率)[^%]{0,16}$/i.test(text.slice(Math.max(0, pm.index - 24), pm.index))) continue;
        const pct = Math.abs(Number(pm[1].replace('−', '-')));
        if (!Number.isFinite(pct) || pct >= 30) continue;
        let win = text.slice(Math.max(0, pm.index - 70), pm.index);
        const nl = Math.max(win.lastIndexOf('\n'), win.lastIndexOf('. '), win.lastIndexOf('。'));
        if (nl >= 0) win = win.slice(nl + 1);
        const lv = priceLevelsInText(win, b.price)
            .map((h) => {   // 가장 가까운 재료 수준(첫 번째로 오차 안에 드는 값이 아니라 — $190 이 현재가 188.75 로 읽히면 안 된다)
                const near = levels.reduce((best, l) => (Math.abs(l - h.value) < Math.abs(best - h.value) ? l : best), levels[0]);
                return Math.abs(near - h.value) / near <= LEVEL_TOL ? near : undefined;
            })
            .filter((l): l is number => typeof l === 'number' && Math.abs(l - b.price) / b.price > 0.0005);
        if (!lv.length) continue;
        const exps = lv.map((l) => (Math.abs(l - b.price) / b.price) * 100);
        if (!exps.some((e) => Math.abs(e - pct) <= Math.max(0.35, e * 0.25))) {
            bad.push(`distance ${pct}% ≠ 계산 ${exps.map((e) => e.toFixed(2)).join('/')}%`);
        }
    }
    return bad;
}

/** 분석 한 벌(3개 국어)에서 그 언어의 사용자 노출 글만 모은다. */
export function flowTextsFor(analysis: any, loc: FlowLocale): string {
    const parts: string[] = [];
    const pick = (o: any) => (o && typeof o === 'object' && typeof o[loc] === 'string' ? o[loc] : typeof o === 'string' && loc === 'en' ? o : '');
    parts.push(pick(analysis?.structuralThesis), pick(analysis?.repricingCondition));
    for (const h of Array.isArray(analysis?.factorHighlights) ? analysis.factorHighlights : []) parts.push(pick(h?.insight));
    return parts.filter(Boolean).join('\n');
}

export interface FlowCheck { ok: boolean; badLocales: FlowLocale[]; reasons: string[] }

/** 3개 국어 전부 검사 — 한 언어라도 틀리면 ok=false(이 라우트는 3개 국어를 한 덩어리로 저장·제공한다). */
export function checkFlowAnalysis(analysis: any, b: FlowBasis): FlowCheck {
    const badLocales: FlowLocale[] = [];
    const reasons: string[] = [];
    for (const loc of FLOW_LOCALES) {
        const r = checkFlowText(flowTextsFor(analysis, loc), b);
        if (r.length) { badLocales.push(loc); reasons.push(`${loc}: ${r.slice(0, 3).join('; ')}`); }
    }
    return { ok: badLocales.length === 0, badLocales, reasons };
}
