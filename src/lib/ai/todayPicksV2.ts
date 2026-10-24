/** 오늘 볼 것 새 생성 전용. 저장본·복구·이상 신호 푸시는 todayPicksLine의 기존 계약을 유지한다. */
import { checkPickWhy, type WhyCheck } from './todayPicksLine';
import { normalizeLine } from './watchlistLine';
import { factsForAi, daysUntil } from '@/lib/todayPicks/copy';
import { TP_LOCALES, type Loc, type LocText, type PickFacts } from '@/lib/todayPicks/types';
import type { PreMarketContext } from './preMarketContext';

export const TP_V2_VERSION = 'today-picks-v2';
export const TP_V2_SYSTEM = `You write the short AI explanation beneath one item of SIGNUM HQ's Worth watching today card. Keep its calm, factual, polite voice. The existing ticker, label, dated numbers row already say WHAT changed and HOW MUCH. Your job is WHY THIS CASE STANDS OUT and WHAT THAT MEANS, in everyday language, not a dictionary definition or a numeric list.
Return ONLY JSON {"ko":"…","en":"…","ja":"…"}, with the same facts and meaning in all three languages.
Rules:
1. One compact sentence with up to TWO short connected clauses. Aim for Korean/Japanese 46 characters, English 100; existing hard limits are ko 56, ja 56, en 120. No line breaks, markdown, emoji, ticker-led opening or headings. Korean ~습니다/입니다; Japanese です・ます; English concise prose. Never truncate a thought.
2. Read CASE first: select its actual distinction, then explain its mechanism or limitation. The dated numbers row is part of the explanation; do not repeat it. Prefer no digits; at most one value from FACTS, with its subject next to it. No arithmetic, unit conversion or new amounts. No 억/億/万/million/billion. All numeric claims must occur in FACTS exactly.
3. Only FACTS are observations. MECHANISM is a definition, never evidence that a price reaction occurred. No invented news, company story, catalyst, investor identity or intent. No causal story from a market-wide move to an individual options position. Session/chain/quote dates describe different observations: never call an old position a current trade. SESSION describes generation time only. Do not add internal source/vendor names, freshness labels or the words 지연, delayed, 遅延.
4. No advice or price forecast: never use buy, sell, recommend, target, forecast, predict, expect, opportunity, bullish, bearish, rally, crash / 매수, 매도, 추천, 목표가, 예측, 전망, 예상, 기회, 강세, 약세, 베팅 / 買い, 売り, 推奨, 目標株価, 予測, 予想, 見通し, 強気, 弱気. No will, should, could, may, might, can, likely, 수 있습니다, 可能性. For priced-in movement use 반영 / priced in / 織り込む. A conditional description of the Gamma Flip mechanism is allowed; a predicted crossing or price move is not.
5. Keep Gamma Flip, Max Pain, Call Wall, Put Floor, GEX in English. Explain their meaning in plain words. 미결제약정 / open interest / 建玉; 다크풀 / off-exchange volume / ダークプール出来高. Do not mistake volume for its share of total volume, or infer buying from either.
6. Gamma Flip only: above the boundary hedging cushions swings; below it hedging amplifies swings. Prefer a compact two-way structural reading (위면 완충·아래면 증폭 / above: cushions; below: amplifies / 上なら緩和・下なら増幅), with the current side supplied in the dated numbers row. You may instead explain just the observed side. At the boundary neither side is established. Never claim the price crossed or will cross. Max Pain is an expiry payoff reference, not evidence of pinning, attraction or a destination.
7. Earnings: the straddle prices a magnitude, not a direction or guaranteed trading range. No own-history comparison without a historical input. Open-interest increases mean contracts remain open, not proof of who initiated them. New line means prior open interest is zero, not merely that prior data is missing.
Write for THIS item; if space is tight retain its distinction and meaning, not a generic definition.`;

function caseReading(f: PickFacts, today: string): string {
    switch (f.kind) {
        case 'whale': {
            const prior = f.best.oi - f.best.added;
            const days = daysUntil(today, f.best.expiry);
            return `${prior === 0 ? 'Prior open interest is zero: newly opened line.' : prior > 0 && f.jump != null ? 'Existing line grew: focus on the supplied open-interest multiple.' : 'Prior-line comparison unavailable: describe only the confirmed increase.'} Contracts still open distinguish this from trading turnover. ${days != null && days >= 0 && days <= 7 ? 'Expiry is within a week; this concentration is in a near expiry.' : ''} No normal-day baseline or participant identity is supplied.`;
        }
        case 'darkpool':
            return f.marketAvg != null && f.pct < f.marketAvg
                ? 'Off-exchange volume exceeds its own average, while its share of total volume is below the same-day all-stock average: these measure different things. Explain the contrast; no claim that share rose.'
                : 'Off-exchange volume exceeds its own average: more shares traded outside exchanges than usual for this stock. No evidence of a change in the share percentage or investor direction.';
        case 'gamma':
            return f.level === 'maxPain'
                ? 'The price is near the expiry payoff reference. Proximity alone establishes neither a pull toward it nor actual pinning. No historical price path supplied.'
                : `The supplied price-side reading is ${f.side === 'at' ? 'at the boundary; neither side is established' : f.side === 'a' ? 'above: cushioning side' : 'below: amplifying side'}. Explain the boundary's two mechanisms, not a price destination.`;
        case 'earnings':
            return `The supplied report timing is ${f.hour === 'bmo' ? 'before the open' : f.hour === 'amc' ? 'after the close' : 'unannounced'}. The supplied expiry contains the report. Explain that priced-in magnitude is separate from direction. No historical implied-move comparison or actual report result supplied.`;
    }
}

export function buildPickV2Prompt(ticker: string, f: PickFacts, today: string, context?: PreMarketContext): string {
    // 배경 시세·선물·뉴스를 항목의 인과 근거로 승격하지 않는다. 공통 프리 입력/다른 호출자는 변경하지 않는다.
    const facts = factsForAi(ticker, f, today).replace(/, confirmed by OCC| \(FINRA\)/g, '')
        .replace(/ \(a brand-new line\)/g, f.kind === 'whale' && f.best.oi - f.best.added !== 0 ? ' (prior comparison unavailable)' : ' (a brand-new line)');
    const mechanism = f.kind === 'gamma' ? (f.level === 'gammaFlip'
        ? 'Gamma Flip: above cushions swings; below amplifies swings. These are conditional structures, not price predictions.'
        : 'Max Pain: expiry strike minimizing aggregate intrinsic option payout; proximity is not evidence of a price path.')
        : f.kind === 'whale' ? 'Open interest counts contracts still open, unlike volume which counts trades.'
            : f.kind === 'darkpool' ? 'Volume ratio compares shares traded off-exchange to their own average; share percentage compares off-exchange volume to all volume.'
                : 'The report-containing expiry straddle prices the size of movement, independently of direction.';
    const priceBasis = f.kind === 'gamma' ? '\nPRICE_BASIS: selected level snapshot; price timestamp/session not supplied. Do not assign the open-interest date or generation session to this price, or call it live.' : '';
    return `CONTRACT: ${TP_V2_VERSION}\nGENERATION_DATE_ET: ${today}\nSESSION: ${context?.session || 'not supplied'} (generation only)\nLAST_REGULAR_DATE: ${context?.lastRegularDate || 'not supplied'} (calendar only, not the item observation date)\n${facts}${priceBasis}\nMECHANISM: ${mechanism}\nCASE: ${caseReading(f, today)}\nUse only this dated item. JSON only.`;
}

// 조건별 기전은 현재 위치 주장이 아니다. 정확히 인식한 절만 기존 쪽 검사에서 분리한다.
// 그 밖의 숫자·길이·언어·권유·예측 검사는 원문 전체에 기존 계약 그대로 적용한다.
const BRANCHES: Record<Loc, [RegExp, RegExp]> = {
    ko: [
        /위(?:쪽)?(?:면|라면|에서는|에선)\s*(?:(?!아래|현재|지금)[^,;·。]){0,26}?(?:완충|줄이|줄입|줄여|억제|완화)[가-힣]*/g,
        /아래(?:쪽)?(?:면|라면|에서는|에선)\s*(?:(?!위|현재|지금)[^,;·。]){0,26}?(?:증폭|확대|키우|키워|키웁)[가-힣]*/g,
    ],
    en: [
        /(?:\b(?:if|when)\s+(?:the\s+price\s+is\s+)?above(?:\s+(?:Gamma Flip|it|the\s+(?:boundary|level)))?[, :]?|\babove\s*:)\s*(?:(?!below|currently|\bnow\b)[^,;]){0,48}?(?:cushion|dampen)\w*(?:\s+(?:swings|moves))?\b/gi,
        /(?:\b(?:if|when)\s+(?:the\s+price\s+is\s+)?below(?:\s+(?:Gamma Flip|it|the\s+(?:boundary|level)))?[, :]?|\bbelow\s*:)\s*(?:(?!above|currently|\bnow\b)[^,;]){0,48}?(?:amplif|magnif)\w*(?:\s+(?:swings|moves))?\b/gi,
    ],
    ja: [
        /上(?:側)?(?:なら|では)(?:(?!下|現在|今)[^,;・、。]){0,24}?(?:緩和|抑え|抑制)/g,
        /下(?:側)?(?:なら|では)(?:(?!上|現在|今)[^,;・、。]){0,24}?(?:増幅|拡大|強め)/g,
    ],
};
const MECHANISM_WORDS: Record<Loc, [string, string]> = {
    ko: ['(?:완충|줄이|줄입|줄여|억제|완화)', '(?:증폭|확대|키우|키워|키웁)'],
    en: ['(?:cushion|dampen)', '(?:amplif|magnif)'],
    ja: ['(?:緩和|抑え|抑制)', '(?:増幅|拡大|強め)'],
};
const INTERNAL = /\b(?:FINRA|OCC|Intrinio|Polygon|Redis|Bedrock|Haiku|Upstash)\b|지연|\bdelayed\b|遅延/i;
const NEGATED = /없|아닙|않|\b(?:not|no|neither|without)\b|ません|ない|ありません/i;
const NEG_MECHANISM = new RegExp(`${NEGATED.source}|못|せず|しない|されない`, 'i');
const UNSUPPORTED_CAUSE = /\b(?:CPI|FOMC|Fed|tariffs?|inflation)\b|연준|관세|물가\s*발표|関税|インフレ/i;
const HISTORY = /평소보다|이례적|유례|\b(?:unusually|unprecedented|larger than usual)\b|普段より|異例/i;
// 조건절을 떼어 낸 나머지에 남은 위치 단어는 «현재 위치 주장»으로 본다(관문 10240458: «Price is above.»처럼 currently/now 없이도).
const CURRENT_SIDE: Record<Loc, RegExp> = {
    ko: /(?<![가-힣])(위|아래)(?=\s*(?:에|입니|이며|이고|이라|라서|쪽|로|서|$|[,.。]))/g,
    en: /\b(above|below)\b/gi,
    ja: /(?<!その|以|向|値|株|史|最|地|底|天|浮|売|買|計|途|川|頭|手|年|目|部|形|陸|水|海|空|身|上|下)(上|下)(?=\s*(?:に|です|で|側|回|、|。|$))/g,
};

export function checkPickV2Why(raw: string, ticker: string, f: PickFacts, year: number, today?: string): WhyCheck {
    const original = checkPickWhy(raw, ticker, f, year, today);
    if (original.reasons.includes('json')) return original;
    let obj: Record<string, unknown>;
    try {
        const s = raw.replace(/```(?:json)?/g, '').trim();
        obj = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    } catch { return original; }
    const text = Object.fromEntries(TP_LOCALES.map(l => [l, normalizeLine(obj[l])])) as LocText;
    let reasons = [...original.reasons];
    for (const l of TP_LOCALES) {
        const t = text[l];
        if (INTERNAL.test(t)) reasons.push(`${l}:v2:internal-or-freshness`);
        if (UNSUPPORTED_CAUSE.test(t)) reasons.push(`${l}:v2:unsupported-cause`);
        if ((f.kind === 'earnings' || f.kind === 'whale') && HISTORY.test(t) && !NEGATED.test(t)) reasons.push(`${l}:v2:unsupported-history`);
        if (f.kind !== 'gamma' || f.level !== 'gammaFlip') continue;
        const pair = BRANCHES[l];
        // 현재 쪽이 우연히 맞더라도 «위면 증폭/아래면 완충»이라는 뒤집힌 조건은 거절한다.
        if (pair.some((re, i) => new RegExp(re.source.replace(MECHANISM_WORDS[l][i], MECHANISM_WORDS[l][1 - i]), re.flags).test(t)))
            reasons.push(`${l}:v2:conditional-mechanism`);
        // new RegExp: g 플래그의 lastIndex가 다음 호출에 남지 않게 한다.
        if (!pair.some(re => new RegExp(re).test(t))) continue;
        // 기전을 부정한 조건절(«위면 완충하지 않는다»·«does not dampen»)은 올바른 조건 구조가 아니다(관문 10240458).
        // 한국어 «완충하지 않고»처럼 부정어가 절 바로 뒤에 오는 경우까지 본다(절 + 뒤 6자).
        if (pair.some(re => [...t.matchAll(new RegExp(re))].some(m => NEG_MECHANISM.test(m[0] + t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 6)))))
            reasons.push(`${l}:v2:conditional-mechanism`);
        const residual = pair.reduce((s, re) => s.replace(new RegExp(re), ''), t);
        for (const m of residual.matchAll(new RegExp(CURRENT_SIDE[l]))) {
            const side = /^(?:위|above|上)$/i.test(m[1]) ? 'a' : 'b';
            if (side !== f.side) reasons.push(`${l}:v2:current-side`);
        }
        const checked = checkPickWhy(JSON.stringify({ ...text, [l]: residual.length >= 8 ? residual : { ko: '감마 경계의 구조입니다', en: 'Options boundary structure', ja: 'ガンマ境界の構造です' }[l] }), ticker, f, year, today);
        const isSideReason = (r: string) => r.startsWith(`${l}:dir:`) || r.startsWith(`${l}:mechanism:`);
        reasons = reasons.filter(r => !isSideReason(r));
        reasons.push(...checked.reasons.filter(isSideReason));
    }
    reasons = [...new Set(reasons)];
    return reasons.length ? { ok: false, reasons } : { ok: true, reasons: [], text };
}
