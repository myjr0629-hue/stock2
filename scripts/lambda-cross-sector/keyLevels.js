// ★2026-10-11 keyLevels «입력에 있는 수준만» — Lambda 판(CommonJS 단순 구현).
// 규칙은 src/lib/ai/keyLevels.ts 와 같다: 수준 값의 숫자가 입력의 매크로 시세 블록(macroStr)에 «그 값 그대로»(쓴 마지막 자리의 반올림 오차만) 있어야 하고,
// 숫자가 없는 칸·입력에 없는 칸은 제거한다. 근거 숫자는 macroStr 의 «라벨: 값» 자리(콜론 뒤)에서만 뽑는다 — 변화율(괄호 안 %)·라벨 속 숫자(VIX3M·S&P500)는 근거가 아니다.
// ★2026-10-11 후속: 입력에 «지수 ETF 옵션 구조 레벨» 블록(indexLevels.js)이 들어가 근거 줄이 늘었고, 웹 범위 바를 위해 orderKeyLevels(Put Floor → Call Wall 순서)를 더했다.
// 테스트: tests/keyLevels.test.ts · tests/crossSectorLevels.test.ts (TS 판과 같은 판정·같은 문구를 고정)

const SCHEMA_EXAMPLE = `"keyLevels": [
      { "label": "<TICKER + level name as printed in the data, e.g. SPY Put Floor | SPY Call Wall | SPY Max Pain | QQQ Gamma Flip | VIX3M>", "value": "<number copied exactly from the data>" }
    ],`;

const REQUIREMENT = `- keyLevels: 0-4 entries, ONLY levels that are printed in the data above, with the number copied exactly (no rounding, no new numbers). Allowed: an options-structure level printed in the "Index ETF Options Structure Levels" block (Put Floor, Call Wall, Max Pain, Gamma Flip of SPY, QQQ, IWM) and "VIX3M" (the level above which VIX is in backwardation) from the macro block. Label = "<TICKER> <level name>" as printed (e.g. "SPY Put Floor"). Order: when both are printed, "SPY Put Floor" first and "SPY Call Wall" second (the first two entries are drawn as the low end and the high end of one price range), then SPY Max Pain, SPY Gamma Flip, QQQ / IWM levels, VIX3M. ETF levels are per-share prices: never convert them into index points. A price reading (S&P500, NASDAQ, DOW, US10Y, Gold ...) is NOT a level, and NEVER invent a support, resistance or threshold number, a round number or a historical level. If nothing qualifies return "keyLevels": [] — an empty list is the correct answer when the data has no level.`;

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

/**
 * 웹 «가격 범위 바»는 첫 두 칸을 «아래 끝·위 끝»으로 그린다 → 같은 ETF 의 Put Floor·Call Wall 이 둘 다 있으면 맨 앞(Put Floor → Call Wall)으로.
 * 같은 칸(라벨·값 동일)은 한 번만, 최대 4칸, 짝이 없으면 순서 유지. (src/lib/ai/keyLevels.ts orderKeyLevels 와 같은 규칙)
 */
function orderKeyLevels(levels) {
    const seen = new Set();
    const list = levels.filter((l) => { const k = `${l && l.label}|${l && l.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const kindOf = (l) => {
        const m = String((l && l.label) || '').match(/^\s*([A-Za-z]{2,5})\s+(put\s*floor|call\s*wall)\b/i);
        return m ? { tk: m[1].toUpperCase(), kind: /^put/i.test(m[2]) ? 'pf' : 'cw' } : null;
    };
    const order = ['SPY', 'QQQ', 'IWM'];
    const tickers = Array.from(new Set(list.map((l) => { const k = kindOf(l); return k && k.tk; }).filter(Boolean))).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    for (const tk of tickers) {
        const pf = list.find((l) => { const k = kindOf(l); return k && k.tk === tk && k.kind === 'pf'; });
        const cw = list.find((l) => { const k = kindOf(l); return k && k.tk === tk && k.kind === 'cw'; });
        if (pf && cw) return [pf, cw, ...list.filter((l) => l !== pf && l !== cw)].slice(0, 4);
    }
    return list.slice(0, 4);
}

module.exports = { SCHEMA_EXAMPLE, REQUIREMENT, groundNumbers, isGroundedLevel, enforceKeyLevels, orderKeyLevels };
