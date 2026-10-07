/**
 * Command AI 딥 분석 «신뢰 레이어» — 재료 완결 게이트 · 자리표 프롬프트 · 출구 게이트. 순수 함수만.
 * 라우트(/api/command/deep-analysis)는 snapshot.trustLayer === 1 인 요청(앱 새 화면)에만 이 경로를 쓴다 — 웹·옛 앱은 그대로.
 * Flow AI INTEL(lib/ai/flowTrust)과 같은 엔진(gateTrustAnalysis)을 쓰고, 글 칸·프롬프트·가격 수준 대조만 딥 분석용이다.
 */
import { gateTrustAnalysis, fillTrustAnalysis, recheckStoredTrust, FL_LOCALES, type FlowGateResult, type MaterialVerdict } from '@/lib/ai/flowTrust';
import { flowTokenRules, flowTokensFromDeepSnapshot, type FlowTokens } from '@/lib/ai/flowTokens';
import { checkFlowText, type FlowBasis } from '@/lib/ai/flowNumbers';
import type { StaleBasis } from '@/lib/ai/trustLayer';

export const DEEP_AI_CACHE_TRUST = 'ai-deep-analysis:v3';
export const deepTrustCacheKey = (ticker: string) => `${DEEP_AI_CACHE_TRUST}:${String(ticker).toUpperCase()}`;
export const isTrustDeepSnapshot = (s: any): boolean => s?.trustLayer === 1;

/** 지표 그룹이 3개 이상 있는가 — 라우트 기존 규칙(hasEnoughSnapshot)과 같다 */
function groupCount(s: any): number {
    const groups = [s?.signalCore, s?.structure, s?.sma, s?.volatility, s?.flow, s?.technicals, s?.squeeze];
    return groups.filter((g) => g && typeof g === 'object' && Object.keys(g).length > 0).length;
}

/**
 * 생성할 만큼 «끝까지 온» 재료인가. 화면은 기술지표·내부자·GEX 이력·매크로가 각각 도착했거나 실패로 끝난 뒤(= 더 올 것이 없는 상태)
 * materialPhase:'complete' 로 알린다 — 첫 데이터 직후(보조 응답 전)의 조기 재료로 만든 글이 12시간 캐시에 앉는 것을 막는다.
 */
export function deepMaterialIssues(s: any): MaterialVerdict {
    const r: string[] = [];
    if (!s || typeof s !== 'object') return { ok: false, reasons: ['no-material'] };
    if (s.materialPhase !== 'complete') r.push(`phase:${s.materialPhase ?? 'missing'}`);
    if (!(Number(s.price) > 0)) r.push('price');
    if (groupCount(s) < 3) r.push('groups');
    return { ok: r.length === 0, reasons: r };
}

export const staleNowFromDeepSnapshot = (s: any): { price: number; session?: string } =>
    ({ price: Number(s?.price) > 0 ? Number(s.price) : 0, session: s?.session ? String(s.session) : undefined });
export function staleBasisFromDeepSnapshot(s: any): StaleBasis {
    const pos = (v: unknown) => (Number(v) > 0 ? Number(v) : null);
    const st = s?.structure || {};
    return {
        price: Number(s?.price) > 0 ? Number(s.price) : 0,
        callWall: pos(st.callWall), putFloor: pos(st.putFloor), gammaFlip: pos(st.gammaFlipLevel), maxPain: pos(st.maxPain),
        session: s?.session ? String(s.session) : null,
    };
}

/** 글 칸 — currentState · sections[].content · keyInsight. 섹션 제목(title)은 프롬프트가 정한 이름이라 글이 아니다. */
export function deepTextSlots(a: any): Array<{ path: string; obj: Record<string, string> }> {
    const out: Array<{ path: string; obj: Record<string, string> }> = [];
    const isTri = (o: any) => o && typeof o === 'object' && FL_LOCALES.some((l) => typeof o[l] === 'string');
    if (isTri(a?.currentState)) out.push({ path: 'currentState', obj: a.currentState });
    (Array.isArray(a?.sections) ? a.sections : []).forEach((sec: any, i: number) => {
        if (isTri(sec?.content)) out.push({ path: `sections[${i}].content`, obj: sec.content });
    });
    if (isTri(a?.keyInsight)) out.push({ path: 'keyInsight', obj: a.keyInsight });
    return out;
}

/** 앱 전용 system — 웹용(라우트 원문) 끝의 critical_rules 에 자리표·예측어·비교 규칙을 더한다 */
export const TRUST_DEEP_RULES = `- NUMBERS (TOKENS): any quantity that has a token in <number_tokens> MUST be written as that token (braces included) — never type the number. Other numbers (SMA values, ADX, scores, counts, dates, news figures) are copied exactly from the data.
- COMPARISONS: say "above/below/over/under" only when it is true for the values in <number_tokens> and <options_flow>. When unsure, state the distance with its token instead of a direction.
- NO FORECASTS (STRICT, every language): never state what price, positioning, or any metric WILL do. FORBIDDEN: "will", "is expected to", "is likely to <verb>", "poised to", "forecast", "outlook", "imminent", "historically precede(s)", "~할 것이다/될 것으로", "예상된다/전망된다", "임박", "반등 기대", "선행", "~할 가능성이 높다", "〜見込み/予想される/だろう/今後の見通し/先行". A news item that quotes someone else's forecast may be reported only as "X said/forecast …" with the source named. A condition is allowed only as an observable state ("spot closes below {PUT_FLOOR}"), never with a predicted consequence.
- LANGUAGE: each language field is written in that language. Korean — bullish=강세, bearish=약세, call-heavy=콜 우위, put-heavy=풋 우위, short gamma=숏 감마, long gamma=롱 감마. Japanese — bullish=強気, bearish=弱気, call-heavy=コール優位, put-heavy=プット優位. Keep English only for tickers and metric abbreviations. All three languages must state the same facts, levels and quantities.`;

export function trustDeepSystem(legacySystem: string): string {
    if (/<\/critical_rules>\s*$/.test(legacySystem)) return legacySystem.replace(/<\/critical_rules>\s*$/, `${TRUST_DEEP_RULES}\n</critical_rules>`);
    return `${legacySystem}\n<critical_rules>\n${TRUST_DEEP_RULES}\n</critical_rules>`;
}

/** 생성 재료 XML 끝에 자리표 규칙(지금 화면 값 포함)을 붙인다 */
export function trustDeepUserPrompt(xml: string, tokens: FlowTokens): string {
    const block = flowTokenRules(tokens);
    if (!block) return xml;
    return /<\/ticker_analysis>\s*$/.test(xml) ? xml.replace(/<\/ticker_analysis>\s*$/, `${block}\n</ticker_analysis>`) : `${xml}${block}`;
}

// 딥 분석은 뉴스 인용에 미래 연도(«2027년 전망»)가 자주 나온다 — 연도 검사는 끄고, 가격 수준은 기존 deepNumbers 규칙(checkFlowText)으로 대조한다
const deepLevelCheck = (joined: Record<'ko' | 'en' | 'ja', string>, basis: FlowBasis): string[] => {
    const out: string[] = [];
    for (const loc of FL_LOCALES) for (const r of checkFlowText(joined[loc], basis)) out.push(`${loc}: ${r}`);
    return out;
};

export const gateDeepAnalysis = (a: any, tokens: FlowTokens, basis: FlowBasis, now?: Date): FlowGateResult =>
    gateTrustAnalysis(a, deepTextSlots, tokens, basis, { now, skipYear: true, levelCheck: deepLevelCheck });
export const fillDeepAnalysis = (tpl: any, current: FlowTokens | null, basisTokens: FlowTokens | null) => fillTrustAnalysis(tpl, deepTextSlots, current, basisTokens);
export const recheckStoredDeep = (tpl: any, basisTokens: FlowTokens | null): string[] => recheckStoredTrust(tpl, deepTextSlots, basisTokens);

export function deepCorrective(reasons: string[]): string {
    const head = reasons.slice(0, 8).join(' | ');
    return `\n\n<rewrite_request>\nThe previous answer failed these automatic checks: ${head}.\nRewrite the whole JSON. Use the number tokens exactly as listed (never type those numbers), keep all three languages consistent, state only observable conditions (no predictions, no "will / expected to / likely to <verb>", no 예상·전망·임박·見込み), and make every above/below statement true for the listed values.\n</rewrite_request>`;
}

export { flowTokensFromDeepSnapshot };
