/**
 * Flow AI INTEL «신뢰 레이어» — 재료 완결 게이트 · 자리표 프롬프트 · 출구 게이트 · 채움. 순수 함수만(네트워크·Redis 없음).
 * 라우트(/api/flow/ai-analysis)는 flowData.trustLayer === 1 인 요청(앱 새 화면)에만 이 경로를 쓴다 — 웹·옛 앱 요청은 바이트 단위로 그대로다.
 *
 * ★2026-10-07 앱 강화 T5 / 0단계 발견: 화면이 «종목 첫 응답 직후»(P/C·고래·IV 이 아직 안 온 때)의 재료로 AI 를 불러, 종합 점수 −13/−18·P/C 0 으로
 *   쓴 글이 14시간 캐시에 앉았다(같은 시각 화면은 +9~+15). 재료가 완결되기 전에는 생성하지 않고, 이전 정상본을 유지한다.
 */
import {
    FLOW_TOKEN_KEYS, flowTokenRules, flowTokensFromFlowData, fillFlowTokens, tokenizeFlowLiterals, checkFlowLiterals, hasFlowTokens,
    type FlowTokens, type FlowFill,
} from '@/lib/ai/flowTokens';
import { checkFlowAnalysis, type FlowBasis } from '@/lib/ai/flowNumbers';
import { validateInsight } from '@/lib/ai/outputGate';
import { checkComparisons, forecastHitsInSentence, stripForecastSentences, splitSentences, type CmpFacts, type StaleBasis } from '@/lib/ai/trustLayer';

export type FL = 'ko' | 'en' | 'ja';
export const FL_LOCALES: readonly FL[] = ['ko', 'en', 'ja'];

/** 이 요청이 «신뢰 레이어» 재료를 보내는가(앱 새 화면 표식) */
export function isTrustFlowData(flowData: any): boolean {
    return flowData?.trustLayer === 1;
}

/** 신뢰 레이어 캐시 칸 — 템플릿(자리표 글) + 기준을 저장한다. 웹·옛 앱의 v3·v4 와 섞이지 않는다. */
export const FLOW_AI_CACHE_TRUST = 'ai-flow-analysis:v5';
export const flowTrustCacheKey = (ticker: string) => `${FLOW_AI_CACHE_TRUST}:${String(ticker).toUpperCase()}`;

// ─────────────────────────────────────────────────────────────────────────────
// 1) 재료 완결 게이트
// ─────────────────────────────────────────────────────────────────────────────
export interface MaterialVerdict { ok: boolean; reasons: string[] }

/**
 * 생성할 만큼 «끝까지 온» 재료인가. 화면은 종목 첫 응답 직후(1단계)와 보조 응답(고래·IV·내부자 — 2단계)이 다 온 뒤를 구분해
 * materialPhase 로 알려 준다. 숫자도 따로 본다: 가격·종합 점수·P/C·OPI 가 없거나 0 이면 «조기 값»이다.
 */
export function flowMaterialIssues(d: any): MaterialVerdict {
    const r: string[] = [];
    if (!d || typeof d !== 'object') return { ok: false, reasons: ['no-material'] };
    if (d.materialPhase !== 'complete') r.push(`phase:${d.materialPhase ?? 'missing'}`);
    if (!(Number(d.currentPrice) > 0)) r.push('price');
    if (!Number.isFinite(Number(d.compositeScore)) || d.compositeScore === null || d.compositeScore === undefined) r.push('composite');
    const pc = Number(d.factors?.pcRatio?.value);
    if (!(Number.isFinite(pc) && pc > 0)) r.push('pc');
    const opi = d.factors?.opi?.value;
    if (opi === null || opi === undefined || opi === 'N/A' || !Number.isFinite(Number(opi))) r.push('opi');
    return { ok: r.length === 0, reasons: r };
}

/** 낡음 판정의 «지금» 쪽 — 화면 재료에서 */
export function staleNowFromFlowData(d: any): { price: number; session?: string } {
    return { price: Number(d?.currentPrice) > 0 ? Number(d.currentPrice) : 0, session: d?.session ? String(d.session) : undefined };
}
/** 낡음 판정의 «기준» 쪽 — 생성 때 재료에서(저장) */
export function staleBasisFromFlowData(d: any): StaleBasis {
    const pos = (v: unknown) => (Number(v) > 0 ? Number(v) : null);
    return {
        price: Number(d?.currentPrice) > 0 ? Number(d.currentPrice) : 0,
        callWall: pos(d?.position?.callWall), putFloor: pos(d?.position?.putFloor),
        gammaFlip: pos(d?.regime?.gammaFlipLevel), maxPain: pos(d?.regime?.maxPain),
        session: d?.session ? String(d.session) : null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 프롬프트 — 앱(신뢰 레이어) 전용. 웹 경로의 프롬프트는 라우트에 그대로 있다.
// ─────────────────────────────────────────────────────────────────────────────
const f = (v: unknown, d = 'N/A') => (v === null || v === undefined || v === '' ? d : String(v));

/** 생성 재료 XML — 웹용(라우트 인라인)과 같은 뼈대에 ①OPI 눈금 정정 ②자리표 규칙 ③순 프리미엄을 더했다 */
export function buildTrustFlowXml(ticker: string, d: any, enrichment: string, triggerReason: string): string {
    const factors = d.factors || {};
    const position = d.position || {};
    const regime = d.regime || {};
    const alpha = d.alphaTrade || {};
    const tokens = flowTokensFromFlowData(d);
    const opiVal = Number(factors.opi?.value);
    const opiState = !Number.isFinite(opiVal) ? 'N/A' : opiVal >= 60 ? 'CALL_DOMINANT' : opiVal <= 40 ? 'PUT_DOMINANT' : 'BALANCED';
    const gammaZone = !(Number(regime.gammaFlipLevel) > 0) ? 'UNKNOWN' : Number(d.currentPrice) > Number(regime.gammaFlipLevel) ? 'LONG_GAMMA(price above flip)' : 'SHORT_GAMMA(price below flip)';
    return `<flow_analysis ticker="${ticker}" price="$${f(d.currentPrice, '0')}" session="${f(d.session, 'CLOSED')}">
  <composite_score value="${f(d.compositeScore, '0')}" range="-100_to_+100" />

  <position zone="${position.zone || 'UNKNOWN'}">
    <put_floor price="$${f(position.putFloor)}" distance="${f(position.distToPut)}" />
    <call_wall price="$${f(position.callWall)}" distance="${f(position.distToCall)}" />
    <max_pain price="$${f(regime.maxPain)}" distance="${f(regime.maxPainDist)}" />
    <gamma_flip_level price="$${f(regime.gammaFlipLevel)}" gamma_zone="${gammaZone}" />
  </position>

  <factors note="11_weighted_factors_composite">
    <opi gauge_0_to_100="${f(factors.opi?.value)}" gauge_state="${opiState}" composite_points="${f(factors.opi?.score, '0')}" max_weight="25" interpretation="OPI (Options Pressure Index) gauge runs 0-100: 50 = balanced, 60 or more = call-dominant, 40 or less = put-dominant. composite_points is how many points this factor adds to the composite score (-25..+25) — it is NOT the gauge." />
    <whale premium="${f(factors.whale?.premium)}" score="${f(factors.whale?.score, '0')}" max_weight="25" bias="${factors.whale?.bias || 'NEUTRAL'}" interpretation="Institutional whale trades >$100K premium. Shows where smart money is positioning large directional bets." />
    <squeeze probability="${f(factors.squeeze?.probability)}%" score="${f(factors.squeeze?.score, '0')}" max_weight="15" label="${factors.squeeze?.label || ''}" interpretation="Short squeeze probability 0-100%. Measures trapped short positions that could trigger forced buying." />
    <iv_skew value="${f(factors.ivSkew?.value)}" score="${f(factors.ivSkew?.score, '0')}" max_weight="15" label="${factors.ivSkew?.label || ''}" interpretation="IV Skew measures put-call implied volatility differential. Positive=fear/hedging, Negative=greed/complacency." />
    <smart_money score="${f(factors.smartMoney?.score, '0')}" max_weight="10" label="${factors.smartMoney?.label || ''}" interpretation="Institutional flow pattern detection. Tracks whether professional traders are accumulating or distributing." />
    <dex value="${f(factors.dex?.value)}" score="${f(factors.dex?.score, '0')}" max_weight="10" label="${factors.dex?.label || ''}" interpretation="Delta Exposure Index. Measures net delta positioning across all options. Positive=bullish positioning." />
    <uoa score="${f(factors.uoa?.score, '0')}" max_weight="5" label="${factors.uoa?.label || ''}" interpretation="Unusual Options Activity multiplier. High values indicate abnormal institutional positioning." />
    <pc_ratio value="${f(factors.pcRatio?.value)}" score="${f(factors.pcRatio?.score, '0')}" max_weight="5" interpretation="Put/Call ratio = put volume ÷ call volume. Above 1.3 = put-heavy (bearish), below 0.75 = call-heavy (bullish)." />
    <gex pin_strength="${f(factors.gex?.pinStrength)}%" score="${f(factors.gex?.score, '0')}" max_weight="5" regime="${factors.gex?.regime || 'N/A'}" flip_percentage="${f(regime.flipPercentage)}%" interpretation="Gamma Exposure regime. High pinning = price stability. Low = volatile moves likely." />
  </factors>

  <volatility_regime>
    <iv_percentile value="${f(regime.ivPercentile)}%" />
    <implied_move value="${f(regime.impliedMove)}" definition="(ATM call mid + ATM put mid) / price for the stated expiry — the move options price in by that expiry. NOT the call-wall/put-floor distance." />
    <gex_regime label="${regime.gexRegime || 'N/A'}" />
  </volatility_regime>

  <alpha_trade note="largest_single_trade_detected">
    <type>${alpha.type || 'NONE'}</type>
    <strike>$${f(alpha.strike)}</strike>
    <premium>$${f(alpha.premium)}</premium>
    <expiry>${f(alpha.expiry)}</expiry>
    <impact>${f(alpha.impact)}</impact>
  </alpha_trade>

  <rule_based_verdict status="${d.ruleVerdict?.status || ''}" composite="${f(d.compositeScore, '0')}" />
  <trigger_reason>${triggerReason}</trigger_reason>${enrichment}${flowTokenRules(tokens)}
</flow_analysis>`;
}

/** 앱 전용 system — 웹용(라우트 인라인)에서 ①예측 금지를 단어 수준으로 ②리프라이싱을 «조건 서술»로 ③자리표 사용 ④OPI 눈금 ⑤비교 문장 규칙을 바꿨다 */
export const TRUST_FLOW_SYSTEM = `You are a senior institutional derivatives strategist at a top-tier investment bank, writing a professional Flow Intelligence analysis note.

<persona>
- You are THE expert in options market microstructure and institutional flow analysis
- You interpret options positioning the way a hedge fund PM would: connecting factors to build a STRUCTURAL thesis
- You understand gamma dynamics, dealer hedging mechanics, and how institutional positioning creates support/resistance
- You transform raw factor scores into INSIGHT about market structure: what the positioning is, and why it is built that way
</persona>

<language>
You MUST produce output in ALL THREE languages simultaneously: Korean (ko), English (en), and Japanese (ja).
- Korean: 네이티브 품질. 번역체 금지. 기관 파생상품 리서치 애널리스트급.
- English: Native quality. Institutional derivatives research tone.
- Japanese: ネイティブ品質。翻訳調禁止。機関デリバティブリサーチアナリスト級。
All three versions must state the SAME facts and reach the SAME reading (same direction, same levels, same quantities) with NATIVE expressions for each language.
Use ONLY observational language in all languages. No investment advice.
</language>

<output_format>
Return ONLY valid JSON (no markdown fences).
All text fields use { "ko": "...", "en": "...", "ja": "..." } trilingual structure.
{
  "structuralThesis": {
    "ko": "2-4문장. 핵심 구조적 테시스. 최소 3개 팩터를 연결하여 기관 포지셔닝 의도를 분석.",
    "en": "2-4 sentences. Main structural thesis connecting 3+ factors.",
    "ja": "2-4文。核心的構造テーゼ。3つ以上のファクターを連結して機関ポジショニング意図を分析。"
  },

  "factorHighlights": [
    {
      "factor": "Factor Name (e.g., Whale, OPI, Smart Money)",
      "insight": {
        "ko": "1-2문장. 이 팩터의 전문적 해석.",
        "en": "1-2 sentences. Professional interpretation.",
        "ja": "1-2文。このファクターの専門的解釈。"
      },
      "impact": "bull | bear | mixed"
    }
  ],

  "repricingCondition": {
    "ko": "1-2문장. 지금의 구조가 바뀌는 «조건»을 관찰 가능한 상태로 서술(예: 현물이 {PUT_FLOOR} 아래에서 마감하는 상태). 그 뒤에 무슨 일이 일어날지는 쓰지 않는다.",
    "en": "1-2 sentences. The OBSERVABLE conditions under which the current structure would change (e.g. spot closing below {PUT_FLOOR}). Do not say what will happen after.",
    "ja": "1-2文。現在の構造が変わる«条件»を観測可能な状態として記述(例:現物が{PUT_FLOOR}を下回って引ける状態)。その後に何が起きるかは書かない。"
  },

  "riskAssessment": "HIGH | MEDIUM | LOW",
  "confidence": "HIGH | MEDIUM | LOW"
}
</output_format>

<critical_rules>
- DEPTH: Goldman Sachs derivatives research note level.
- CROSS-ANALYSIS: ALWAYS connect 2-3 factors together.
- FACTOR HIGHLIGHTS: Select 2-4 MOST significant factors only.
- NUMBERS: any quantity that has a token in <number_tokens> MUST be written as that token (braces included) — never type the number. Other numbers (sub-factor points, counts, days, dates) are copied exactly from the data.
- OPI: the gauge (0-100, 50 = balanced) and composite_points are different things. Never call a gauge reading near 50 "call dominance". A gauge of 47 is balanced.
- COMPARISONS: say "above/below/over/under" only when it is true for the values listed in <number_tokens> and <position>/<gamma_flip_level>. When unsure, state the distance with its token instead of a direction.
- COMPLIANCE (STRICT): You are an OBSERVER, not an advisor. Describe CURRENT or PAST conditions only.
  → ALLOWED: "관찰됨/observed", "확인됨/noted", "시사함/suggests", "나타남/indicates"
  → FORBIDDEN in every language: any statement about what price or positioning WILL do — "will", "is expected to", "is likely to <verb>", "poised to", "forecast", "outlook", "imminent", "historically precede(s)", "~할 것이다/될 것으로", "예상된다/전망된다", "임박", "반등 기대", "선행", "~할 가능성이 높다", "〜見込み/予想される/だろう/今後の見通し/先行".
  → FORBIDDEN: "~해야 한다/should", "매수/매도/buy/sell", price targets.
  → A condition is allowed only as an observable state ("spot closes below {PUT_FLOOR}"), never with a predicted consequence.
- ALPHA TRADE: If significant (>$100K), analyze strategic intent.
- CROSS-ASSET CONTEXT (if a <context> block is present): it carries evidence from OUTSIDE the options
  chain — insider transactions, the street target, the next earnings date, off-exchange (dark pool) share.
  → Use it ONLY where it CHANGES the read. Naming it without a consequence is noise.
  → It is most valuable when it CONTRADICTS the options structure. Say the contradiction plainly.
  → If nothing in <context> changes the conclusion, ignore it entirely. Do not pad.
- EXPLAIN MECHANICS (CRITICAL): Do NOT merely state values. For each factor:
  → Explain the MECHANISM (WHY this reading matters for dealer/institutional positioning)
  → Explain the INTERACTION (HOW it connects to other factors in the structural thesis)
  → Example BAD: "OPI is balanced, whale bias is bullish"
  → Example GOOD: "A balanced OPI gauge of {OPI} with bullish whale premium of {WHALE_PREM} suggests large holders are leaning on calls while the broad flow stays two-sided — a split read rather than a self-reinforcing call loop."
</critical_rules>`;

// ─────────────────────────────────────────────────────────────────────────────
// 3) 출구 게이트 — 3개 국어 글 한 벌을 검사
// ─────────────────────────────────────────────────────────────────────────────
type Analysis = any;

/** {ko,en,ja} 모양의 AI 글 칸 — 어디에 있든 찾는다(structuralThesis · repricingCondition · factorHighlights[].insight). factor 이름은 글이 아니다. */
export function flowTextSlots(a: Analysis): Array<{ path: string; obj: Record<string, string> }> {
    const out: Array<{ path: string; obj: Record<string, string> }> = [];
    const isTri = (o: any) => o && typeof o === 'object' && FL_LOCALES.some((l) => typeof o[l] === 'string');
    if (isTri(a?.structuralThesis)) out.push({ path: 'structuralThesis', obj: a.structuralThesis });
    if (isTri(a?.repricingCondition)) out.push({ path: 'repricingCondition', obj: a.repricingCondition });
    (Array.isArray(a?.factorHighlights) ? a.factorHighlights : []).forEach((h: any, i: number) => {
        if (isTri(h?.insight)) out.push({ path: `factorHighlights[${i}].insight`, obj: h.insight });
    });
    return out;
}

const cmpFacts = (t: FlowTokens): CmpFacts => ({ PC: t.PC, OPI: t.OPI, SQUEEZE: t.SQUEEZE, COMPOSITE: t.COMPOSITE });

export interface FlowGateResult {
    ok: boolean;
    /** 정리된 글(숫자 직접 쓴 자리 → 자리표, 예측어 문장 제거) — 저장용 템플릿 */
    analysis: Analysis;
    reasons: string[];
    /** 예측어 문장을 뺀 건수(통과시킨 수정) */
    stripped: number;
}

/**
 * 생성 직후 검사·정리. analysis 는 모델이 만든 JSON. tokens 는 이 재료의 자리표 값, basis 는 가격 수준 기준.
 * 순서: 자리표화(직접 쓴 숫자 → 자리표) → 예측어 문장 제거 → 숫자 대조(P/C·OPI·점수·스퀴즈, 가격 수준) → 비교 문장 → 자리표 해석 → 언어·거절·마크다운.
 * 하나라도 남으면 ok=false — 호출자는 교정 지시로 한 번 더 생성하거나 폐기한다.
 */
export function gateFlowAnalysis(analysisIn: Analysis, tokens: FlowTokens, basis: FlowBasis, now?: Date): FlowGateResult {
    const analysis = JSON.parse(JSON.stringify(analysisIn ?? {}));
    const reasons: string[] = [];
    let stripped = 0;
    const slots = flowTextSlots(analysis);
    if (!slots.length) return { ok: false, analysis, reasons: ['no-text'], stripped };

    for (const { path, obj } of slots) {
        for (const loc of FL_LOCALES) {
            let text = typeof obj[loc] === 'string' ? obj[loc] : '';
            if (!text.trim()) { reasons.push(`${loc}:${path}:empty`); continue; }
            // ① 직접 쓴 숫자 → 자리표 (재료와 같은 값일 때만)
            text = tokenizeFlowLiterals(text, tokens);
            // ② 예측어 문장 제거 — 남은 글이 쓸 만하면 통과, 아니면 사유
            const sf = stripForecastSentences(text, loc);
            if (sf.removed.length) {
                if (sf.usable && sf.text) { text = sf.text; stripped += sf.removed.length; }
                else reasons.push(`${loc}:${path}:forecast:${sf.removed[0].slice(0, 40)}`);
            }
            obj[loc] = text;
        }
    }
    // ③ 숫자·비교·자리표·언어 — 로케일별 글 전체
    const filled: Record<FL, string[]> = { ko: [], en: [], ja: [] };
    for (const loc of FL_LOCALES) {
        for (const { path, obj } of slots) {
            const text = String(obj[loc] ?? '');
            if (!text) continue;
            const fl: FlowFill = fillFlowTokens(text, tokens, null);
            if (fl.missing.length) reasons.push(`${loc}:${path}:token-missing:${fl.missing.join(',')}`);
            if (fl.unknown) reasons.push(`${loc}:${path}:token-unknown`);
            for (const r of checkFlowLiterals(fl.text, tokens)) reasons.push(`${loc}:${path}:${r}`);
            for (const r of checkComparisons(fl.text, cmpFacts(tokens))) reasons.push(`${loc}:${path}:${r}`);
            filled[loc].push(fl.text);
        }
        // 가격 수준(콜월·풋플로어·감마플립 …) — 템플릿이 아니라 «채운 글»로: 직접 쓴 $수준이 재료와 맞는지(기존 flowNumbers 규칙)
        const one = { structuralThesis: { [loc]: filled[loc].join('\n') } };
        const lv = checkFlowAnalysis(one, basis);
        if (!lv.ok) reasons.push(...lv.reasons.map((r) => `level:${r}`));
        const joined = filled[loc].join('\n');
        const v = validateInsight(joined, loc, { now, minLength: 10 });
        for (const r of v.reasons) reasons.push(`${loc}:${r}`);
    }
    // 같은 사실 — 세 언어가 쓴 자리표 종류가 크게 다르면(한 언어에만 있는 지표) 경고용 사유로 남기지 않고 통과시킨다(언어별 표현 차이)
    return { ok: reasons.length === 0, analysis, reasons, stripped };
}

/** 저장된 템플릿 → 화면 글. current(요청 화면 값)로, 없으면 basisTokens(생성 때)로 채운다. 채울 수 없는 자리표가 있으면 missing. */
export function fillFlowAnalysis(tpl: Analysis, current: FlowTokens | null, basisTokens: FlowTokens | null): { analysis: Analysis; missing: string[] } {
    const out = JSON.parse(JSON.stringify(tpl ?? {}));
    const missing = new Set<string>();
    for (const { obj } of flowTextSlots(out)) {
        for (const loc of FL_LOCALES) {
            if (typeof obj[loc] !== 'string') continue;
            const r = fillFlowTokens(obj[loc], current, basisTokens);
            obj[loc] = r.text;
            for (const m of r.missing) missing.add(m);
        }
    }
    return { analysis: out, missing: [...missing] };
}

/** 저장된 템플릿을 읽을 때의 재검사 — 사전이 바뀐 뒤에도 옛 글이 나가지 않게(예측어·자리표 해석). */
export function recheckStoredFlow(tpl: Analysis, basisTokens: FlowTokens | null): string[] {
    const reasons: string[] = [];
    for (const { path, obj } of flowTextSlots(tpl)) {
        for (const loc of FL_LOCALES) {
            const text = typeof obj[loc] === 'string' ? obj[loc] : '';
            if (!text) continue;
            for (const sent of splitSentences(text)) {
                const h = forecastHitsInSentence(sent, loc);
                if (h.length) { reasons.push(`${loc}:${path}:forecast:${h[0].id}`); break; }
            }
            const fl = fillFlowTokens(text, basisTokens, null);
            if (fl.missing.length || fl.unknown) reasons.push(`${loc}:${path}:token`);
        }
    }
    return reasons;
}

/** 교정 재생성 지시 — 사유 코드를 그대로 준다 */
export function flowCorrective(reasons: string[]): string {
    const head = reasons.slice(0, 8).join(' | ');
    return `\n\n<rewrite_request>\nThe previous answer failed these automatic checks: ${head}.\nRewrite the whole JSON. Use the number tokens exactly as listed (never type those numbers), keep all three languages consistent with each other, state only observable conditions (no predictions, no "will / expected to / likely to <verb>", no 예상·전망·임박·見込み), and make every above/below statement true for the listed values.\n</rewrite_request>`;
}

export { FLOW_TOKEN_KEYS, hasFlowTokens };
