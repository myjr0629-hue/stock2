/**
 * 내부 필드명 누출 검사 — AI 글(화면 문구)에 입력 JSON 의 키 이름(camelCase 식별자)이 그대로 새는가 (2026-10-11).
 *
 * 근거: UC `tickerRead` 에 «oiPcr 0.75» 같은 내부 필드명이 화면 문구로 샜다(10/11 표본: 현행 2/30 · 깊이 3/30).
 *   UC system 프롬프트가 «oiPcr·volumePutCallRatio·newOiNotional …» 라는 이름으로 신호를 설명하고, 입력 MONEY JSON 도 같은 키를 쓰므로
 *   모델이 이름을 그대로 베낀다. 사람이 읽는 말은 «P/C(풋÷콜) 0.75» 이다.
 *
 * 판정(오탐을 막으려고 세 겹):
 *   ① 알려진 내부 이름(INTERNAL_FIELD_NAMES — MoneyData·카드 출력 키) 대소문자 무시 일치
 *   ② 호출자가 준 추가 키(입력 JSON 에서 뽑은 키) 일치
 *   ③ 일반형: 소문자로 시작하고 «대문자+소문자» 마디가 둘 이상인 식별자(darkPoolPct · newOiNotionalText …)
 *   한 마디짜리 브랜드(iPhone·eBay·iShares·iRobot)와 대문자 시작(YouTube·OpenAI)은 ③에 걸리지 않는다.
 * 순수 함수 — tests/fieldLeak.test.ts.
 */

/** 화면 문구에 나오면 안 되는 내부 이름(camelCase) — 일반형 ③ 이 못 잡는 한 마디짜리(oiPcr·maxPain …)를 포함 */
export const INTERNAL_FIELD_NAMES: readonly string[] = [
    // UC MoneyData / payload (옛 거래량 필드 volumePcr 는 모델 입력에서 빠져 있어 목록에 넣지 않는다 — tests/putCall.test.ts 의 옛 필드 소비자 센서스가 이 파일을 소비자로 센다)
    'oiPcr', 'volumePutCallRatio', 'putCallRatio', 'squeezeScore', 'maxPain', 'callWall', 'putFloor', 'gammaFlip',
    'newOiContracts', 'newOiNotional', 'newOiNotionalText', 'newOiSide', 'optionsDate', 'positionLeanText', 'flowLeanText',
    'darkPoolPct', 'darkPoolShortPct', 'darkPoolShortAvg', 'darkPoolShortDev', 'darkPoolVolRatio', 'darkPoolStealth', 'darkPoolRegime', 'darkPoolMarketAvg', 'darkPoolDate',
    'changePct', 'dayChangePct', 'newsSentiment',
    // UC 출력 키
    'plainTitle', 'whyItMatters', 'moneyRead', 'moneyMood', 'tickerRead', 'hasMoneyData',
    // 크로스섹터 입력 키
    'avgAlpha', 'avgPcr', 'totalGex', 'dominantRegime', 'sectorId', 'newsSentimentOverall',
];
const KNOWN = new Set(INTERNAL_FIELD_NAMES.map((n) => n.toLowerCase()));

const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*/g;
const GENERIC_CAMEL = /^[a-z]+(?:[A-Z][a-z0-9]+){2,}$/;

/** 글 속에서 내부 필드명으로 보이는 토큰 목록(중복 제거, 등장 순) */
export function findFieldNameLeaks(text: unknown, extraKeys: Iterable<string> = []): string[] {
    if (typeof text !== 'string' || !text) return [];
    const extra = new Set<string>();
    for (const k of extraKeys) if (typeof k === 'string' && /[a-z][A-Z]/.test(k)) extra.add(k.toLowerCase());
    const out: string[] = [];
    for (const m of text.matchAll(TOKEN_RE)) {
        const tok = m[0];
        if (tok.length < 4) continue;
        const lc = tok.toLowerCase();
        if (KNOWN.has(lc) || extra.has(lc) || GENERIC_CAMEL.test(tok)) { if (!out.includes(tok)) out.push(tok); }
    }
    return out;
}

/** JSON 입력 문자열에서 camelCase 키 이름을 뽑는다(누출 검사의 추가 키) */
export function camelKeysOf(jsonLikeText: string): string[] {
    const set = new Set<string>();
    for (const m of String(jsonLikeText || '').matchAll(/"([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)"\s*:/g)) set.add(m[1]);
    return [...set];
}

/** 객체(카드 등)의 문자열 잎들에서 누출을 모은다 */
export function findLeaksInFields(obj: Record<string, unknown> | null | undefined, fields: readonly string[], extraKeys: Iterable<string> = []): string[] {
    const out: string[] = [];
    if (!obj) return out;
    for (const f of fields) for (const t of findFieldNameLeaks(obj[f], extraKeys)) if (!out.includes(t)) out.push(t);
    return out;
}
