/** 오늘 볼 것 새 생성 전용. 저장본·복구·이상 신호 푸시는 todayPicksLine의 기존 계약을 유지한다. */
import { checkPickWhy, type WhyCheck } from './todayPicksLine';
import { normalizeLine } from './watchlistLine';
import { factsForAi, daysUntil } from '@/lib/todayPicks/copy';
import { TP_LOCALES, type Loc, type LocText, type PickFacts } from '@/lib/todayPicks/types';
import type { PreMarketContext } from './preMarketContext';

export const TP_V2_VERSION = 'today-picks-v2';
export const TP_V2_SYSTEM = `You write the one-line «why it is worth a look» note under one item of SIGNUM HQ's "Worth watching today" card. Keep its calm, factual, polite voice. The card already shows the ticker, a label and the dated numbers row (WHAT changed and HOW MUCH). Your line says, in plain everyday words, what is DISTINCTIVE about this case and what that means — not a dictionary definition, not a list of numbers.
Return ONLY JSON {"ko":"…","en":"…","ja":"…"} — the same fact and meaning in Korean, English and Japanese.
Rules:
1. Length is a hard limit — count it: Korean ≤ 40 characters, Japanese ≤ 40 characters, English ≤ 85 characters. ONE short sentence, ONE clause — make ONE point only (do not add a second clause explaining what open interest or volume is). No line breaks, markdown, emoji or quotes. Do not start with the ticker or company name. Korean ~습니다/입니다; Japanese です・ます; English terse.
2. Read CASE first and say its single most useful distinction (new line vs. an existing line growing, a near expiry, off-exchange volume high while its share is low, which side of Gamma Flip, priced-in size vs. direction). Do not write meta sentences such as «the two measures differ» / «두 지표는 서로 다릅니다» — say what the contrast means for this stock.
3. Only FACTS are observations. MECHANISM is background, not evidence that something happened. No invented news, catalyst, investor identity or intent. No history or «unusual» comparison unless FACTS give it. Never call an old position a current trade. No internal source/vendor names, no freshness labels, never the words 지연, delayed, 遅延.
4. Prefer words to digits; at most ONE number and it must appear in FACTS exactly. Never write contract counts, prior/after open-interest figures, paraphrased multiples (doubled, tripled, 두 배, 倍増), arithmetic, unit conversions or money amounts (no 억/億/万/million/billion). Write counts and durations as words (한 행사가, 일주일, one strike, a week, 一つの, 一週間 — never 1週間, 1日, 1 strike).
5. No advice and no forecast: never use buy, sell, recommend, target, forecast, predict, expect, opportunity, bullish, bearish, rally, crash / 매수, 매도, 추천, 목표가, 예측, 전망, 예상, 기회, 강세, 약세, 베팅 / 買い, 売り, 推奨, 目標株価, 予測, 予想, 見通し, 強気, 弱気. No will, should, could, may, might, can, likely, 수 있습니다, 可能性. Present or past tense only. For an implied move say priced in / 반영 / 織り込む.
6. Terms stay in English: Gamma Flip, Max Pain, Call Wall, Put Floor, GEX. 미결제약정 / open interest / 建玉; 다크풀 / dark pool / ダークプール. Dark-pool ratio is about VOLUME, never say the share rose.
7. Gamma Flip: above it dealer hedging dampens moves; below it hedging amplifies moves. State the side given in CASE — never reverse it, never claim a crossing. When CASE says AT the boundary, say only that the price is right at the switch point where the hedging direction changes — do NOT use above/below/위/아래/上/下 and do NOT mention dampening or amplifying (완충·증폭·抑え·増幅). Max Pain: say plainly that the price sits near the expiry payoff reference; do not add disclaimers about pulls or pinning.
8. Earnings: the straddle prices the SIZE of a move, not its direction or a guaranteed range. Use the report timing given in CASE (before the open / after the close / unannounced) so each item reads specific to its case.
Voice examples (length and tone only — write a NEW sentence for THIS case, never copy, never reverse a side):
whale: {"ko":"전날 없던 행사가에 새 미결제약정이 크게 열렸습니다","en":"A strike with no prior open interest saw a large new position opened","ja":"前日に建玉のなかった行使価格で新規の建玉が大きく開かれました"}
dark pool: {"ko":"장외 거래량은 평소보다 많지만 비중은 시장 평균보다 낮습니다","en":"Off-exchange volume ran above its norm, yet its share stayed below the market average","ja":"場外の出来高は平常より多い一方、比率は市場平均を下回っています"}
gamma: {"ko":"Gamma Flip 아래라 딜러 헤지가 움직임을 키우는 쪽입니다","en":"Below Gamma Flip, where dealer hedging tends to amplify moves","ja":"Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です"}
earnings: {"ko":"개장 전 발표를 낀 만기의 옵션은 방향이 아닌 움직임 크기를 반영합니다","en":"With a before-open report inside the expiry, options price the move's size, not its direction","ja":"寄り付き前の決算を含む満期のオプションは、方向ではなく値動きの大きさを織り込みます"}`;

function caseReading(f: PickFacts, today: string): string {
    switch (f.kind) {
        case 'whale': {
            const prior = f.best.oi - f.best.added;
            const days = daysUntil(today, f.best.expiry);
            return `${prior === 0 ? 'Prior open interest is zero: newly opened line.' : prior > 0 && f.jump != null ? 'Existing line grew: name the growth in words or with the supplied multiple only — no contract counts.' : 'Prior-line comparison unavailable: describe only the confirmed increase.'} ${days != null && days >= 0 && days <= 7 ? 'Expiry is within a week; this concentration is in a near expiry.' : ''} No normal-day baseline or participant identity is supplied.`;
        }
        case 'darkpool':
            return f.marketAvg != null && f.pct < f.marketAvg
                ? 'Off-exchange volume exceeds its own average, while its share of total volume is below the same-day all-stock average: these measure different things. Explain the contrast; no claim that share rose.'
                : 'Off-exchange volume exceeds its own average: more shares traded outside exchanges than usual for this stock. No evidence of a change in the share percentage or investor direction.';
        case 'gamma':
            return f.level === 'maxPain'
                ? 'The price sits near Max Pain, the expiry payoff reference. Describe only that proximity, in one short clause.'
                : `The supplied price-side reading is ${f.side === 'at' ? 'AT the boundary: write only that the price is at the switch point (전환점·転換点) — no above/below/위/아래/上/下, no dampen/amplify, no can/could/수 있/可能' : f.side === 'a' ? 'ABOVE: dampening side' : 'BELOW: amplifying side'}. Explain the boundary's two mechanisms, not a price destination.`;
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
        /(?:\b(?:if|when)\s+(?:the\s+price\s+is\s+)?above(?:\s+(?:Gamma Flip|it|the\s+(?:boundary|level)))?[, :]?|\babove\s*:|\babove\s+(?:Gamma Flip|it|the\s+(?:boundary|level))\s*,)\s*(?:(?!below|currently|\bnow\b)[^,;]){0,48}?(?:cushion|dampen)\w*(?:\s+(?:swings|moves))?\b/gi,
        /(?:\b(?:if|when)\s+(?:the\s+price\s+is\s+)?below(?:\s+(?:Gamma Flip|it|the\s+(?:boundary|level)))?[, :]?|\bbelow\s*:|\bbelow\s+(?:Gamma Flip|it|the\s+(?:boundary|level))\s*,)\s*(?:(?!above|currently|\bnow\b)[^,;]){0,48}?(?:amplif|magnif)\w*(?:\s+(?:swings|moves))?\b/gi,
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
    en: /\b(above|below|beneath|over(?=\s+(?:it|Gamma Flip|the\s+(?:level|boundary|flip|line))\b)|under(?=\s+(?:it|Gamma Flip|the\s+(?:level|boundary|flip|line))\b))\b/gi,
    ja: /(?<!その|以|向|値|株|史|最|地|底|天|浮|売|買|計|途|川|頭|手|年|目|部|形|陸|水|海|空|身|上|下)(上|下)(?=\s*(?:に|です|で|側|回|、|。|$))/g,
};

const CONTRAST = /\brather than\b|\binstead of\b|대신|아니라|이\s*아닌|가\s*아닌|ではなく|代わりに/i;
const NEG_AFTER: Record<Loc, RegExp> = { ko: /^\s*(?:않|못|없)/, en: /(?!)/, ja: /^(?:せず|しない|されない|しません|ない|ず)/ };
const CURRENT_MECH: Record<Loc, RegExp> = {
    ko: /(?:현재|지금)[^,;·。]{0,24}?(완충|줄이|줄입|줄여|억제|완화|증폭|확대|키우|키워|키웁)/g,
    en: /\b(?:currently|now)\b[^,;.]{0,30}?\b(cushion\w*|dampen\w*|amplif\w*|magnif\w*)/gi,
    ja: /(?:現在|今は)[^,;・、。]{0,24}?(緩和|抑え|抑制|増幅|拡大|強め)/g,
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
        // 부정된 반대 기전(«below it, hedging does not dampen»)은 뒤집힌 조건이 아니라 올바른 설명이다(관문 10241729).
        // «amplifies rather than cushions»·«instead of cushioning»·«완충이 아니라»·«緩和ではなく»처럼 대조로 부정된 기전도 같다(관문 10241801).
        // 영어 부정은 «그 갈래의 기전 단어 바로 앞(10자)»에 있을 때만(«does not dampen»). «does not cushion but amplifies»의 not 은 다른 단어를 부정한다(관문 10242027).
        const mechNegated = (m: RegExpMatchArray, i: number) => {
            const w = [...m[0].matchAll(new RegExp(MECHANISM_WORDS[l][i], 'gi'))].pop();
            if (!w) return false;
            return /\b(?:not|no|never|n't|without)\b[^,;.]{0,10}$|n't\s*$/i.test(m[0].slice(Math.max(0, (w.index ?? 0) - 14), w.index));
        };
        const negatedClause = (m: RegExpMatchArray, i = BRANCHES[l].findIndex(re => new RegExp(re.source, re.flags.replace('g', '')).test(m[0]))) =>
            (l === 'en' ? mechNegated(m, Math.max(0, i)) : NEG_MECHANISM.test(m[0])) || CONTRAST.test(m[0])
            || /^\s*(?:이|가|은|는)?\s*(?:아니라|아닌|대신)|^\s*(?:では|じゃ)なく/.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8))
            || NEG_AFTER[l].test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 6));
        // 반대 기전 «어휘» 판정은 두지 않는다 — 감소·부재·부정 서술(줄고·사라지는·limits·less·loses…)을 뒤집힘으로 오독하는 오탈락이
        // 관문 10회 내내 반복됐다(10241729~10242022). 운영(옛) 검사와 같은 수준으로 두고, 뒤집힘 금지는 프롬프트 7항으로 다룬다
        // (운영 모델 225건 실측 뒤집힘 0). 아래 «두 갈래 모두 정상 기전»일 때만 조건절을 떼어 현재 위치·기전을 다시 본다.
        // new RegExp: g 플래그의 lastIndex가 다음 호출에 남지 않게 한다.
        // 위·아래 «두 갈래가 모두» 있을 때만 조건 구조로 본다 — 한 갈래만 쓰면 현재 위치 주장이므로 기존 검사 그대로.
        if (!pair.every(re => new RegExp(re).test(t))) continue;
        // 기전을 부정한 조건절(«위면 완충하지 않는다»·«does not dampen»·«緩和せず»)은 올바른 조건 구조가 아니다(관문 10240458).
        // 부정어는 절 안(영어) 또는 절 «바로 뒤»(한국어 «완충하지 않고»·일본어 «緩和せず»)만 본다 — «; no direction implied» 같은 다음 절은 제외(관문 10241657).
        if (pair.some(re => [...t.matchAll(new RegExp(re))].some(m => negatedClause(m))))
            reasons.push(`${l}:v2:conditional-mechanism`);
        const residual = pair.reduce((s, re) => s.replace(new RegExp(re), ''), t);
        // 두 갈래를 떼어 낸 나머지에 위치·기전·현재 단어가 «하나라도» 남으면 완화하지 않는다 — 운영(옛) 검사 판정을 그대로 쓴다.
        // (나머지를 따로 해석하던 판정은 부정·대조 문형마다 오탈락·오통과가 번갈아 나왔다: 관문 10241657~10242039.)
        // 완화는 «순수한 두 갈래 구조 설명»(나머지에 위치·기전 주장 없음)일 때만 — 그때만 옛 검사의 위치·기전 사유를 뗀다.
        const residualClaims = new RegExp(CURRENT_SIDE[l]).test(residual) || new RegExp(CURRENT_MECH[l]).test(residual)
            || new RegExp(`${MECHANISM_WORDS[l][0]}|${MECHANISM_WORDS[l][1]}`, 'i').test(residual)
            || /\b(?:currently|now|price|it is|sits?)\b|현재|지금|주가|가격|現在|株価|価格/i.test(residual);
        if (residualClaims) {
            // 나머지에 부정·대조·감소 표현이 전혀 없을 때만 «현재 위치·기전» 단정을 실제 쪽과 맞춘다(«현재는 위입니다» 거절).
            // 부정 등이 섞이면 해석하지 않고 옛 검사 판정 그대로(관문 10242027·10242039: «not far above»·«완충 효과는 없습니다»).
            const plain = !NEG_MECHANISM.test(residual) && !CONTRAST.test(residual) && !/아니|아닌|ではな|\b(?:far|less|limits?|nor)\b|줄|사라|잃|없|弱|消/i.test(residual);
            if (plain) {
                for (const m of residual.matchAll(new RegExp(CURRENT_SIDE[l])))
                    if ((/^(?:위|above|over|上)$/i.test(m[1]) ? 'a' : 'b') !== f.side) reasons.push(`${l}:v2:current-side`);
                for (const m of residual.matchAll(new RegExp(CURRENT_MECH[l])))
                    if ((new RegExp(MECHANISM_WORDS[l][0], 'i').test(m[1]) ? 'a' : 'b') !== f.side) reasons.push(`${l}:v2:current-mechanism`);
                // 단정이 실제 쪽과 맞으면 옛 검사가 두 갈래의 반대쪽 단어로 낸 위치·기전 사유는 뗀다(«… Price is below.» 정상).
                reasons = reasons.filter(r => !(r.startsWith(`${l}:dir:`) || r.startsWith(`${l}:mechanism:`)));
            }
            continue;
        }
        const isSideReason = (r: string) => r.startsWith(`${l}:dir:`) || r.startsWith(`${l}:mechanism:`);
        reasons = reasons.filter(r => !isSideReason(r));
    }
    reasons = [...new Set(reasons)];
    return reasons.length ? { ok: false, reasons } : { ok: true, reasons: [], text };
}
