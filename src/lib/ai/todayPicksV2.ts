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
                : `The supplied price-side reading is ${f.side === 'at' ? 'AT the boundary: write only that the price is at the switch point (전환점·転換点) — no above/below/위/아래/上/下, no dampen/amplify, no can/could/수 있/可能' : f.side === 'a' ? 'ABOVE: dampening side' : 'BELOW: amplifying side'}. Describe only this side (do not explain both sides), not a price destination.`;
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

const INTERNAL = /\b(?:FINRA|OCC|Intrinio|Polygon|Redis|Bedrock|Haiku|Upstash)\b|지연\s*(?:시세|가격|데이터|자료)|(?:시세|가격|데이터|자료)\s*(?:가\s*|이\s*)?지연|\bdelayed\s+(?:\w+\s+)?(?:quotes?|prices?|pricing|data|feed)\b|遅延\s*の?\s*(?:データ|相場|気配|価格)|(?:データ|相場|気配|価格)\s*(?:の|が)?\s*遅延/i;

export function checkPickV2Why(raw: string, ticker: string, f: PickFacts, year: number, today?: string): WhyCheck {
    const original = checkPickWhy(raw, ticker, f, year, today);
    if (original.reasons.includes('json')) return original;
    let obj: Record<string, unknown>;
    try {
        const s = raw.replace(/```(?:json)?/g, '').trim();
        obj = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    } catch { return original; }
    const text = Object.fromEntries(TP_LOCALES.map(l => [l, normalizeLine(obj[l])])) as LocText;
    let reasons = [...original.reasons];   // 운영(옛) 검사 사유 전부 + 새 생성 전용(내부 출처·시세 지연 표기)
    for (const l of TP_LOCALES) {
        const t = text[l];
        if (INTERNAL.test(t)) reasons.push(`${l}:v2:internal-or-freshness`);
        // 원인(연준·관세 등)·역사 비교(«평소보다·unusually») 새 검사는 거절하지 않는다 — 부정·유보 문형(«no evidence links…»·«불명확»·«unconfirmed»)을
        // 단정으로 오독하는 오탈락이 관문마다 재현됐고(10242104~10242126) 운영엔 없던 검사다. 운영 모델 225건 실측 해당 0 — 프롬프트 3항으로 다룬다.
        // Gamma Flip 위치·기전은 운영(옛) 검사 판정 그대로 — «두 갈래 구조 설명» 완화는 두지 않는다.
        // (운영 모델 v2.5 225건 실측에서 완화가 판정을 바꾼 경우 0건이고, 완화 판정은 관문 23회 동안 문형마다 오통과가 재현됐다: 10241657~10242209.)
    }
    reasons = [...new Set(reasons)];
    return reasons.length ? { ok: false, reasons } : { ok: true, reasons: [], text };
}
