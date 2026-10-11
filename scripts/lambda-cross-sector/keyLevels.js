// ★2026-10-11 keyLevels «입력에 있는 수준만» — Lambda 판(CommonJS 단순 구현).
// 규칙은 src/lib/ai/keyLevels.ts 와 같다: 수준 값의 숫자가 입력의 매크로 시세 블록(macroStr)에 «그 값 그대로»(쓴 마지막 자리의 반올림 오차만) 있어야 하고,
// 숫자가 없는 칸·입력에 없는 칸은 제거한다. 근거 숫자는 macroStr 의 «라벨: 값» 자리(콜론 뒤)에서만 뽑는다 — 변화율(괄호 안 %)·라벨 속 숫자(VIX3M·S&P500)는 근거가 아니다.
// 테스트: tests/lambdaKeyLevels.test.js

const SCHEMA_EXAMPLE = `"keyLevels": [
      { "label": "<level name as printed in the data, e.g. Call Wall | Put Floor | Max Pain | Gamma Flip | VIX3M>", "value": "<number copied exactly from the data>" }
    ],`;

const REQUIREMENT = `- keyLevels: 0-4 entries, ONLY levels that are printed in the data above, with the number copied exactly (no rounding, no new numbers). Allowed: an options-structure level of an index or ETF (Call Wall, Put Floor, Max Pain, Gamma Flip) if the data lists one, and "VIX3M" (the level above which VIX is in backwardation) from the macro block. A price reading (S&P500, NASDAQ, DOW, US10Y, Gold ...) is NOT a level, and NEVER invent a support, resistance or threshold number, a round number or a historical level. If nothing qualifies return "keyLevels": [] — an empty list is the correct answer when the data has no level.`;

function groundNumbers(macroStr) {
    const out = [];
    const re = /:\s*[$¥€]?(\d[\d,]*(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(String(macroStr || '')))) out.push(Number(m[1].replace(/,/g, '')));
    return out.filter(Number.isFinite);
}

function isGroundedLevel(level, cands) {
    const v = level && typeof level === 'object' ? level.value : null;
    if (typeof v !== 'string') return false;
    const written = [...v.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((x) => x[0]);
    if (written.length === 0) return false;
    return written.every((raw) => {
        const num = Number(raw.replace(/,/g, ''));
        const dec = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
        const tol = (dec === 0 ? 0.5 : 0.5 * Math.pow(10, -dec)) * 1.0001;
        return cands.some((c) => Math.abs(c - num) <= Math.max(tol, num * 1e-9));
    });
}

/** structured.outlook.keyLevels 에서 입력에 없는 칸을 제자리 제거 — 제거한 칸 수 */
function enforceKeyLevels(structured, macroStr) {
    const lv = structured && structured.outlook && structured.outlook.keyLevels;
    if (!Array.isArray(lv)) return 0;
    const cands = groundNumbers(macroStr);
    const kept = lv.filter((l) => isGroundedLevel(l, cands));
    const dropped = lv.length - kept.length;
    if (dropped) structured.outlook.keyLevels = kept;
    return dropped;
}

module.exports = { SCHEMA_EXAMPLE, REQUIREMENT, groundNumbers, isGroundedLevel, enforceKeyLevels };
