/**
 * 크로스섹터 브리프 `outlook.keyLevels` — «입력에 있는 수준만» (2026-10-11).
 *
 * 문제: 프롬프트의 출력 예시가 `S&P 500 Support 5,800 / Resistance 6,200 / NASDAQ Resistance 25,000 / VIX Threshold 20.0` 이라는
 *   «지지·저항 4칸»을 요구했고, 입력(매크로 시세 + 섹터 요약)에는 지수의 지지·저항이 하나도 없어서 모델이 매일 수준을 지어냈다
 *   (10/9 운영 저장본: S&P 지지 7,750 · 저항 7,900 · US10Y «임계» 5.30%(입력은 5.24%) · VIX 임계 17.0(입력의 VIX3M 은 17.77)).
 *   10/11 Haiku 5.5 표본(금요일 입력 × 8회)에서도 같은 구조(HAIKU55-AB 문서 14절 발견 4).
 * 처방: ① 프롬프트·스키마가 «입력에 찍힌 수준만» 쓰게(옵션 구조의 Call Wall·Put Floor·Max Pain·Gamma Flip · VIX3M) — 없으면 빈 배열
 *       ② 출구에서 `depthNumbers`(출력 숫자 ↔ 입력 숫자 대조)로 입력에 없는 수준을 걸러 낸다 — 생성 출구(POST)와 서빙 출구(GET) 둘 다
 *          (사용자가 보는 v3 저장본은 AWS Lambda 가 만든다 — 그쪽 프롬프트를 못 고쳐도 서빙 출구가 같은 규칙으로 거른다).
 * ★2026-10-11 후속(fix/cross-sector-real-levels): 입력에 «지수 ETF 옵션 구조 레벨» 블록(SPY·QQQ·IWM 의 Put Floor·Call Wall·Max Pain·Gamma Flip, lib/ai/crossSectorLevels)을
 *   실제로 넣어 keyLevels 가 실데이터 2칸 이상으로 채워지게 한다. 규칙(입력에 찍힌 수준만 · 같은 출구 필터)은 그대로, 블록의 근거 줄을 ground 에 더한다.
 *   웹 범위 바는 첫 두 칸을 «아래 끝/위 끝»으로 그리므로 출구에서 Put Floor → Call Wall 순서로 맞춘다(orderKeyLevels).
 * 걸러진 칸은 화면의 기존 빈 상태를 따른다: 수준이 2개 미만이면 웹 «가격 범위 바», 0개면 앱 «핵심 레벨» 줄이 기존 조건부 렌더로 빠진다(새 칸·새 문구 없음).
 *
 * 순수 함수만 — tests/keyLevels.test.ts 가 고정한다.
 */
import { extractNumbers } from './depthNumbers';

export interface KeyLevel { label: string; value: string }

/** 프롬프트에 들어가는 출력 예시 — 지어낸 수 대신 «데이터에서 베낀 값»을 자리로 둔다 */
export const KEYLEVELS_SCHEMA_EXAMPLE = `"keyLevels": [
      { "label": "<TICKER + level name as printed in the data, e.g. SPY Put Floor | SPY Call Wall | SPY Max Pain | QQQ Gamma Flip | VIX3M>", "value": "<number copied exactly from the data>" }
    ],`;

/** ANALYSIS REQUIREMENTS 의 한 줄 */
export const KEYLEVELS_REQUIREMENT = `- keyLevels: 0-4 entries, ONLY levels that are printed in the data above, with the number copied exactly (no rounding, no new numbers). Allowed: an options-structure level printed in the "Index ETF Options Structure Levels" block (Put Floor, Call Wall, Max Pain, Gamma Flip of SPY, QQQ, IWM) and "VIX3M" (the level above which VIX is in backwardation) from the macro block. Label = "<TICKER> <level name>" as printed (e.g. "SPY Put Floor"). Order: when both are printed, "SPY Put Floor" first and "SPY Call Wall" second (the first two entries are drawn as the low end and the high end of one price range), then SPY Max Pain, SPY Gamma Flip, QQQ / IWM levels, VIX3M. ETF levels are per-share prices: never convert them into index points. A price reading (S&P500, NASDAQ, DOW, US10Y, Gold ...) is NOT a level, and NEVER invent a support, resistance or threshold number, a round number or a historical level. If nothing qualifies return "keyLevels": [] — an empty list is the correct answer when the data has no level.`;

/** 근거 텍스트에서 «뉴스 본문» 구획을 뺀다 — 뉴스 속 숫자(«S&P 500 at 10,000», «$4,200»)는 수준의 근거가 아니다 */
export function levelGroundText(promptOrBlocks: string): string {
    return promptOrBlocks.replace(/\n## Real-time Market News[\s\S]*?(?=\n## |\n*$)/g, '\n');
}

/**
 * 수준 한 칸이 입력에 근거하는가 — 값(value)의 숫자가 전부 근거 텍스트에 «그 값 그대로» 있어야 한다. 숫자가 하나도 없는 칸은 수준이 아니다.
 * depthNumbers 의 숫자 추출(쉼표·소수·%·단위)을 쓰되, 허용 오차는 수준에 맞게 더 좁힌다: 쓴 마지막 자리의 «반올림» 오차만(정수 ±0.5, 소수 ±0.5×자릿수)
 * — 일반 대조의 «정수 1단위·내림 표기 허용»(781 ← 780)은 수준 값에는 너무 느슨하다. 1~10 의 작은 정수도 면제하지 않는다.
 */
export function isGroundedLevel(level: unknown, groundText: string): boolean {
    if (!level || typeof level !== 'object') return false;
    const v = (level as KeyLevel).value;
    if (typeof v !== 'string' || !v.trim()) return false;
    const written = extractNumbers(v);
    if (written.length === 0) return false;
    const cands = extractNumbers(groundText).map((x) => x.value);
    return written.every((w) => {
        const tol = /\d\.\d/.test(w.raw) ? w.tol : w.tol / 2;
        const eps = Math.max(tol, w.value * 1e-9) * 1.0001;
        return cands.some((c) => Math.abs(c - w.value) <= eps);
    });
}

export interface KeyLevelFilterResult { kept: KeyLevel[]; dropped: KeyLevel[] }

/** 배열의 칸을 걸러 낸다(입력은 건드리지 않는다). 배열이 아니면 빈 결과. */
export function groundKeyLevels(levels: unknown, groundText: string): KeyLevelFilterResult {
    const kept: KeyLevel[] = [], dropped: KeyLevel[] = [];
    if (!Array.isArray(levels)) return { kept, dropped };
    for (const l of levels) (isGroundedLevel(l, groundText) ? kept : dropped).push(l as KeyLevel);
    return { kept, dropped };
}

/**
 * 구조화된 브리프(`{ outlook: { keyLevels } }`)에서 입력에 없는 수준을 제자리에서 걸러 낸다. 걸러 낸 칸 수를 돌려준다.
 * outlook 이 없거나 keyLevels 가 배열이 아니면 아무것도 하지 않는다(0).
 */
export function enforceKeyLevels(structured: any, groundText: string): number {
    const lv = structured?.outlook?.keyLevels;
    if (!Array.isArray(lv)) return 0;
    const { kept, dropped } = groundKeyLevels(lv, groundText);
    if (dropped.length) structured.outlook.keyLevels = kept;
    return dropped.length;
}

/**
 * 서빙 출구용 — 저장된 브리프 객체(`{ structured, macroSnapshot, macroIndicators, vixTermStructure }`)의 사본을 만들어 수준을 거른다.
 * 근거 = 저장본에 같이 있는 입력 요약(macroSnapshot 문자열 · 지표 값 · VIX 기간구조). 원본(캐시 객체)은 바꾸지 않는다.
 */
export function sanitizeServedBrief<T extends Record<string, any>>(brief: T): { brief: T; dropped: number } {
    const lv = brief?.structured?.outlook?.keyLevels;
    if (!Array.isArray(lv) || lv.length === 0) return { brief, dropped: 0 };
    const parts: string[] = [];
    if (typeof brief.macroSnapshot === 'string') parts.push(brief.macroSnapshot);
    if (Array.isArray(brief.macroIndicators)) for (const m of brief.macroIndicators) if (m && typeof m.value === 'number') parts.push(`${m.key}: ${m.value}`);
    const t = brief.vixTermStructure;
    if (t && typeof t === 'object') parts.push(`VIX: ${t.vix} VIX3M: ${t.vix3m} VIX/VIX3M Ratio: ${t.ratio}`);
    // 입력에 실제로 넣은 «지수 ETF 옵션 구조 레벨» 근거 줄(저장본에 같이 싣는다 — 없던 옛 저장본은 이 줄이 없어 옛 규칙 그대로)
    if (typeof (brief as any).levelsSnapshot === 'string') parts.push((brief as any).levelsSnapshot);
    const { kept, dropped } = groundKeyLevels(lv, parts.join(' | '));
    if (dropped.length === 0) return { brief, dropped: 0 };
    return { brief: { ...brief, structured: { ...brief.structured, outlook: { ...brief.structured.outlook, keyLevels: kept } } }, dropped: dropped.length };
}

/**
 * 웹 «가격 범위 바»는 keyLevels 의 첫 두 칸을 «아래 끝(초록)·위 끝(빨강)»으로 그린다. 모델이 순서를 바꿔 쓰면 막대가 뒤집힌다
 * → 같은 ETF 의 Put Floor·Call Wall 이 둘 다 있으면 그 둘을 맨 앞(Put Floor → Call Wall)으로, 나머지는 원래 순서로 둔다. 같은 칸(라벨·값 동일)은 한 번만, 최대 4칸.
 * 짝이 없으면 순서를 건드리지 않는다. 새 값을 만들지 않는다 — 있는 칸의 순서만.
 */
export function orderKeyLevels<T extends KeyLevel>(levels: T[]): T[] {
    const seen = new Set<string>();
    const list = levels.filter((l) => { const k = `${l?.label}|${l?.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const kindOf = (l: KeyLevel): { tk: string; kind: 'pf' | 'cw' } | null => {
        const m = String(l?.label || '').match(/^\s*([A-Za-z]{2,5})\s+(put\s*floor|call\s*wall)\b/i);
        return m ? { tk: m[1].toUpperCase(), kind: /^put/i.test(m[2]) ? 'pf' : 'cw' } : null;
    };
    const order = ['SPY', 'QQQ', 'IWM'];
    const tickers = Array.from(new Set(list.map((l) => kindOf(l)?.tk).filter(Boolean) as string[])).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    for (const tk of tickers) {
        const pf = list.find((l) => { const k = kindOf(l); return k && k.tk === tk && k.kind === 'pf'; });
        const cw = list.find((l) => { const k = kindOf(l); return k && k.tk === tk && k.kind === 'cw'; });
        if (pf && cw) return [pf, cw, ...list.filter((l) => l !== pf && l !== cw)].slice(0, 4);
    }
    return list.slice(0, 4);
}

/** 생성 출구 — 입력에 없는 칸을 거르고(enforceKeyLevels) 범위 바 순서를 맞춘다. 걸러 낸 칸 수를 돌려준다. */
export function finalizeKeyLevels(structured: any, groundText: string): number {
    const dropped = enforceKeyLevels(structured, groundText);
    const lv = structured?.outlook?.keyLevels;
    if (Array.isArray(lv) && lv.length) structured.outlook.keyLevels = orderKeyLevels(lv);
    return dropped;
}
