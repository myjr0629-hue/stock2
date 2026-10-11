/**
 * 출력 속 숫자가 «입력 데이터에 있는 숫자»인가 — 지어낸 숫자 탐지 (순수 함수, tests/depthNumbers.test.ts 가 고정한다).
 *
 * 용도별 신뢰 게이트(flowTrust·deepTrust·guardianNumbers·ucNumbers)가 «가격 수준·배수·거리» 같은 특정 유형을 보는 것과 달리,
 * 이 검사는 «모든 숫자»를 입력(system + user 텍스트)의 숫자와 대조한다 — 깊이 변형이 새 숫자를 만들어 내지 않는지 보는 시험용이다.
 *
 * 규칙
 *  · 입력과 출력에서 같은 방식으로 숫자를 뽑는다: 쉼표 천 단위·소수·% · bp · pt · $ · 단위(K/M/B/T · 천/千 · 만/万 · 억/億 · 조/兆 · million/billion).
 *    한국어/일본어의 «1조 2,300억» 같은 복합 단위는 합산한다.
 *  · 부호는 보지 않는다(방향 오류는 다른 가드의 일). 크기만 본다.
 *  · 출력 숫자는 «쓴 자릿수만큼 반올림한 입력 값»이면 일치로 본다(소수: 마지막 자리의 절반 이내, 정수: 1단위 이내 — 내림 표기 허용, 단위 스케일 포함). 더 자세한 자릿수로 쓰면 불일치.
 *  · 면제: 1~10 의 단독 정수(개수·순서), 자리표 {PRICE} 등, 지수·서류 이름(S&P 500, NASDAQ 100, 10Y, 2s10s, Form 4, 8-K, 10b5-1, Q3 …).
 *  · 입력에 없는 숫자는 «지어낸 숫자»(ungrounded) — 환산·차이 계산도 포함(모델은 새 숫자를 계산하지 않기로 했다).
 */

export interface NumberToken {
    raw: string;
    /** 단위를 반영한 크기(부호 제외) */
    value: number;
    /** 허용 오차 — 정수는 마지막 자리 1단위(내림 표기 허용), 소수는 마지막 자리의 절반(반올림) · 단위 스케일 반영 */
    tol: number;
    index: number;
    /** 소수·%·$·단위 중 하나라도 붙어 있다 */
    marked: boolean;
}

const UNIT_MULT: Array<{ re: string; mult: number }> = [
    { re: '[Tt]rillion', mult: 1e12 }, { re: '[Bb]illion', mult: 1e9 }, { re: '[Mm]illion', mult: 1e6 }, { re: '[Tt]housand', mult: 1e3 },
    { re: '兆', mult: 1e12 }, { re: '조', mult: 1e12 }, { re: '億', mult: 1e8 }, { re: '억', mult: 1e8 },
    { re: '천만', mult: 1e7 }, { re: '千万', mult: 1e7 },
    { re: '万', mult: 1e4 }, { re: '萬', mult: 1e4 }, { re: '만', mult: 1e4 }, { re: '千', mult: 1e3 }, { re: '천', mult: 1e3 },
    { re: 'T', mult: 1e12 }, { re: 'B', mult: 1e9 }, { re: 'M', mult: 1e6 }, { re: 'K', mult: 1e3 }, { re: 'k', mult: 1e3 },
];
const UNIT_ALT = UNIT_MULT.map((u) => u.re).join('|');
const multOf = (u: string): number => {
    for (const x of UNIT_MULT) if (new RegExp(`^(?:${x.re})$`).test(u)) return x.mult;
    return 1;
};

/** 이름처럼 쓰이는 숫자 표기 — 사실이 아니라 라벨이라 대조에서 뺀다 */
const NAME_PATTERNS: RegExp[] = [
    /S&P\s?500/gi, /NASDAQ[\s-]?100/gi, /NASDAQ\s?Composite/gi, /Russell\s?2000/gi, /Dow\s?30/gi, /Nikkei\s?225/gi, /KOSPI\s?200/gi,
    /(?<![\d.])\d{1,2}Y\b/g, /(?<![\d.])\d{1,2}M\b(?=\s*(?:yield|bill))/gi, /\b2s10s\b/gi, /\bVIX3M\b/gi, /\bVIX9D\b/gi, /(?<![\d.])3M\b/g,
    /Form\s?\d+[A-Z]?/gi, /\b\d{1,2}-[KQ]\b/g, /10b5-1/gi, /\bQ[1-4]\b/g, /\bFY\s?\d{2,4}\b/gi, /\bH[12]\b/g,
    /\b13[FDG]\b/g, /\bSC\s?13[DG]\b/gi, /\b424B\d\b/gi, /\bMag\s?7\b/gi, /\bM7\b/g, /\bG7\b/g, /\bG20\b/g, /\bUSD\/KRW\b/g, /\bUSD\/JPY\b/g,
    /\bTop\s?\d+\b/gi, /\b(?:SMA|EMA|WMA|MA)[-_ ]?\d{1,3}(?![\d.])/gi, /\b\d{2,3}[- ]?days?\b/gi, /\b\d{2,3}\s?[- ]?(?:일|日)\s?(?:선|線|이동평균선?|移動平均線?|평균)?/g, /\b24\/7\b/g, /\bGPT-?\d[\w.]*/gi, /\bB2B\b/g, /\b3D\b/g, /\bAI\s?2\.0\b/gi,
];
const PLACEHOLDER = /\{[A-Z][A-Z0-9_]*\}/g;

function stripNames(text: string): string {
    let t = String(text || '').replace(PLACEHOLDER, ' ');
    for (const re of NAME_PATTERNS) t = t.replace(re, ' ');
    return t;
}

const NUM_RE = new RegExp(
    '(?<![A-Za-z0-9.,])' +                                   // 단어/소수점 중간에서 시작하지 않는다
    '([$¥€₩]|US\\$)?' +                                // 통화 접두
    '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)' +
    '(?:\\s?(%p|%|bps?|pp|pts?|points?|[xX×]|hrs?|[dh]|' + UNIT_ALT + ')(?![A-Za-z_])|(?![A-Za-z0-9]))',
    'gu',
);

/** 텍스트에서 숫자 뽑기(복합 단위 합산 포함) */
export function extractNumbers(text: string): NumberToken[] {
    const src = stripNames(text);
    const out: NumberToken[] = [];
    NUM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUM_RE.exec(src))) {
        const [raw, cur, numStr, unitRaw] = m;
        const base = Number(numStr.replace(/,/g, ''));
        if (!Number.isFinite(base)) continue;
        const decimals = numStr.includes('.') ? numStr.length - numStr.indexOf('.') - 1 : 0;
        const unit = unitRaw && /^(%p|%|bps?|pp|pts?|points?)$/i.test(unitRaw) ? '' : (unitRaw || '');
        const mult = unit ? multOf(unit) : 1;
        const marked = !!(cur || unitRaw || decimals > 0);
        out.push({ raw: raw.trim(), value: base * mult, tol: (decimals === 0 ? 1 : 0.5 * Math.pow(10, -decimals)) * mult, index: m.index, marked });
    }
    // 복합 단위 «1조 2,300억» «1兆2,300億» «3억 5천만»: 인접(공백 0~1) 토큰이 서로 더 작은 한자 단위면 합산
    const merged: NumberToken[] = [];
    for (let i = 0; i < out.length; i++) {
        const t = out[i];
        const cjk = /^[\d,.]+\s?(조|兆|억|億|천만|千万|만|万|萬|천|千)$/.test(t.raw);
        if (cjk) {
            let sum = t.value, tol = t.tol, rawAll = t.raw, last = t;
            let j = i + 1;
            while (j < out.length) {
                const n = out[j];
                const nCjk = /^[\d,.]+\s?(조|兆|억|億|천만|千万|만|万|萬|천|千)$/.test(n.raw);
                const gap = n.index - (last.index + last.raw.length);
                const prevMult = unitMultOfRaw(last.raw), nMult = unitMultOfRaw(n.raw);
                if (nCjk && gap >= 0 && gap <= 1 && nMult < prevMult) { sum += n.value; tol = n.tol; rawAll += ' ' + n.raw; last = n; j++; } else break;
            }
            if (j > i + 1) { merged.push({ raw: rawAll, value: sum, tol, index: t.index, marked: true }); i = j - 1; continue; }
        }
        merged.push(t);
    }
    return merged;
}
function unitMultOfRaw(raw: string): number {
    const u = raw.match(/(조|兆|억|億|천만|千万|만|万|萬|천|千)$/)?.[1];
    return u ? multOf(u) : 1;
}

export interface GroundingResult {
    total: number;
    grounded: number;
    exempt: number;
    ungrounded: Array<{ raw: string; value: number; context: string }>;
}

/** 입력 숫자의 후보 크기들 — 같은 숫자를 단위 없이 쓴 경우도 함께 */
function candidateValues(inputNums: NumberToken[]): number[] {
    const set = new Set<number>();
    for (const n of inputNums) set.add(n.value);
    return [...set];
}

const near = (cands: number[], v: number, tol: number): boolean => {
    const eps = Math.max(tol, v * 1e-9);
    for (const c of cands) if (Math.abs(c - v) <= eps * 1.0001) return true;
    return false;
};

/**
 * output 의 모든 숫자가 input(들)에 있는지. extraGround 는 «근거로 인정할 추가 텍스트»(예: 자리표 값 블록).
 */
export function checkNumberGrounding(output: string, input: string, opts: { exemptSmallInts?: boolean } = {}): GroundingResult {
    const exemptSmall = opts.exemptSmallInts !== false;
    const inputNums = extractNumbers(input);
    const cands = candidateValues(inputNums);
    const outNums = extractNumbers(output);
    const res: GroundingResult = { total: outNums.length, grounded: 0, exempt: 0, ungrounded: [] };
    const outText = stripNames(output);
    for (const n of outNums) {
        if (exemptSmall && !n.marked && Number.isInteger(n.value) && n.value >= 0 && n.value <= 10) { res.exempt++; continue; }
        // 쓴 자릿수만큼 입력을 반올림/내림한 값이면 일치. 입력이 같은 자릿수보다 덜 자세해도 정확히 같으면 일치.
        if (near(cands, n.value, n.tol)) { res.grounded++; continue; }
        // 단위 없이 쓴 큰 수(93070000)와 입력의 단위 표기(93.07M)는 위에서 value 로 이미 같다. 퍼센트를 분수로 쓴 경우는 일치로 보지 않는다.
        res.ungrounded.push({ raw: n.raw, value: n.value, context: outText.slice(Math.max(0, n.index - 24), n.index + n.raw.length + 16).replace(/\s+/g, ' ') });
    }
    return res;
}

/** JSON(문자열 잎 전부) 또는 평문에서 모델이 쓴 글 조각들을 모은다 — 키 이름의 숫자는 보지 않는다 */
export function textLeaves(output: string): string[] {
    const leaves: string[] = [];
    try {
        const walk = (v: unknown) => {
            if (typeof v === 'string') leaves.push(v);
            else if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
        };
        walk(JSON.parse(output));
        return leaves;
    } catch { return [output]; }
}

/** 출력 전체(JSON 잎 합치기)에 대한 대조 */
export function checkOutputNumbers(output: string, input: string): GroundingResult {
    const parts = textLeaves(output);
    const total: GroundingResult = { total: 0, grounded: 0, exempt: 0, ungrounded: [] };
    for (const p of parts) {
        const r = checkNumberGrounding(p, input);
        total.total += r.total; total.grounded += r.grounded; total.exempt += r.exempt; total.ungrounded.push(...r.ungrounded);
    }
    return total;
}
