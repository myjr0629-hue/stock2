/**
 * «✦ AI 오늘 볼 것» — 항목별 «왜 볼 만한가 한 줄»의 프롬프트와 출구 가드. 순수 함수만(네트워크·Redis 없음). 시험: tests/todayPicks.test.ts
 *
 * 역할 분담: 무엇을 고르는가·숫자·날짜 = 규칙(lib/todayPicks). AI = 선택된 항목의 한 줄 해설뿐. AI 가 숫자를 새로 쓰거나 고르지 못하게
 *   ① 입력 사실 글(factsForAi)에 있는 숫자만 쓰게 하고 ② 출구에서 «모든 숫자»(작은 정수 포함)를 사실 글과 대조하고 ③ 단위 금액(억·億)·가격($)은 정확 일치,
 *   ④ 감마 항목의 «가격이 레벨의 위/아래·양/음 감마 구간» 주장은 사실의 쪽과 대조한다. 못 넘으면 규칙 해설(copy.fallbackWhy)이 나간다 — 카드는 비지 않는다.
 *
 * 유사투자자문 금지선: 매수·매도·추천·목표가·예측·전망·기회·강세/약세·베팅 …을 세 언어 모두 막는다(WL_LINE_FORBIDDEN + 아래 추가).
 */
import { checkNumberGrounding } from '@/lib/ai/depthNumbers';
import { hasUnitAmounts } from '@/lib/ai/amountGuard';
import { forecastHitsInSentence } from '@/lib/ai/trustLayer';
import { WL_LINE_FORBIDDEN, normalizeLine, sideClaims } from '@/lib/ai/watchlistLine';
import { bannedHit, foreignYear, scriptOk } from '@/lib/push/aiLine';
import { angleHint, factsForAi, MEANING } from '@/lib/todayPicks/copy';
import type { Loc, LocText, PickFacts } from '@/lib/todayPicks/types';
import { TP_LOCALES } from '@/lib/todayPicks/types';

/** 사다리 용도 이름(lib/ai/llmLadder TRACKED_PURPOSES·LADDER_PURPOSES) */
export const TP_PURPOSE = 'TodayPicks';

/** 해설 길이 상한(글자 수) — 카드에서 두 줄 안(360폭 11.5px 기준 한 줄 한·일 약 26자 · 영어 약 52자 → 세 줄 안). 모델은 요청보다 20~30% 길게 쓰므로 더 짧게(38/38/70) 요청한다 */
export const TP_WHY_MAX: Record<Loc, number> = { ko: 56, ja: 56, en: 110 };
const MIN_LEN = 8;

export const TP_SYSTEM = `You write the one-line «why it is worth a look» note under one item of the "Worth watching today" card in SIGNUM HQ, an options-flow app for retail investors. The card already shows the ticker, a label and a line with the key numbers. Your line explains, in plain words, what this kind of signal measures and why it stands out here.

Return ONLY JSON: {"ko":"…","en":"…","ja":"…"} — the same note in Korean, English and Japanese.

Rules:
1. Observation only. No advice, no forecast, no target, no "will", no "should". Never say or imply what the price may do next, and do not guess anyone's intent (no bet, bullish, bearish, accumulation). Never use the words: buy, sell, recommend, target, forecast, predict, expect, opportunity, bullish, bearish, rally, crash / 매수, 매도, 추천, 목표가, 예측, 전망, 예상, 기회, 강세, 약세, 베팅 / 買い, 売り, 推奨, 目標株価, 予測, 予想, 見通し, 強気, 弱気. For an options-implied move say "priced in" (en), "반영" (ko), "織り込む" (ja) — never "expected".
2. Use only the FACTS and the MEANING. Every digit you write must appear in FACTS exactly as written. Prefer words to numbers; use at most ONE number. Never compute, round, convert units or restate money amounts (do not write 억, 億, 万, million, billion). Write counts as words, not digits (한 행사가, 하루, 一つの, 一日, one strike) — never "1つ", "1日", "1 strike".
3. Use the MEANING to say what the signal measures in your own words (a mechanism, not a prediction), then why this case stands out. Do not repeat the numbers line the card already shows.
4. Length: Korean ≤ 38 characters, Japanese ≤ 38 characters, English ≤ 70 characters — hard limits, count them. One short sentence with ONE clause, no line breaks. Do not start with the ticker or a company name.
5. Terms stay in English in every language: Max Pain, Gamma Flip, Call Wall, Put Floor, GEX. Dark pool = 다크풀 (ko), ダークプール (ja). Open interest = 미결제약정 (ko), 建玉 (ja). Implied move = 옵션 예상 변동 (ko, only in this fixed term), 想定変動幅 (ja).
6. Gamma Flip: if the price is ABOVE it, say dealer hedging tends to dampen moves; if BELOW, say it tends to amplify moves; if AT it, say it is right at the switch point. Follow the FACTS exactly — never reverse the side.
7. Dark pool: the ratio is about VOLUME (거래량 / 出来高 / volume), not about the share percentage. Say "volume", never say the share rose.
8. Style: Korean polite "~습니다/입니다" style; Japanese "です・ます" style; English a terse sentence. Plain text: no emoji, no quotes, no markdown.

Tone examples, one per kind. They show length and voice ONLY — write a NEW sentence for your case, following the ANGLE; never copy an example, and never reverse a side:
whale:    {"ko":"한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다","en":"One strike's open interest jumped in a session, so new positions were opened","ja":"ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました"}
dark pool:{"ko":"장외 거래량이 평소 수준을 크게 웃돌아 거래소 밖 체결이 많았습니다","en":"Off-exchange volume ran far above its usual level","ja":"場外の出来高が平常を大きく上回り、取引所外の約定が多くなりました"}
gamma:    {"ko":"Gamma Flip 위라 딜러 헤지가 움직임을 줄이는 쪽입니다","en":"Above Gamma Flip, where dealer hedging tends to dampen moves","ja":"Gamma Flipの上で、ディーラーのヘッジが値動きを抑える側です"}
earnings: {"ko":"발표를 낀 만기의 옵션이 이만큼의 움직임을 가격에 반영하고 있습니다","en":"Options for the expiry containing the report price in a move of this size","ja":"決算を含む満期のオプションが、この大きさの値動きを織り込んでいます"}`;

export function buildPickUserPrompt(ticker: string, f: PickFacts, todayEt: string): string {
    return `${factsForAi(ticker, f, todayEt)}\n\nMEANING: ${MEANING[f.kind]}\n\nANGLE: ${angleHint(f, todayEt)}\n\nWrite the note for ${ticker} now — specific to this case, not a generic definition. JSON only.`;
}

// ── 출구 가드 ──────────────────────────────────────────────────────────────────

const REFUSAL = /죄송|답변(?:을|할)\s?수\s?없|I\s+(?:can(?:no|')t|am\s+unable|apologi[sz]e)|\bAs an AI\b|申し訳|お答えできません/i;
/** 의도·방향 추정(해설이 «누가 왜»를 지어내지 못하게) */
const INTENT: RegExp[] = [
    /베팅|강세|약세|매집|분산\s?매도|저점|바닥\s?신호/,
    /賭け|強気|弱気|買い集め|底打ち/,
    /\b(?:bets?|betting|bullish|bearish|accumulat\w*|distribut\w*|bottom(?:ing)?|capitulat\w*)\b/i,
];
/** 세는 말로 쓴 «1» (1つの·1日·1セッション·1개·1일 …) — 숫자 사실이 아니라 개수 표현이라 대조에서 뺀다(2~9 나 소수는 그대로 대조) */
const COUNTER_ONE = /(?<![\d.,])1(?=\s?(?:つ|日|回|件|度|社|本|セッション|営業日|行使価格|満期|取引日|개|일|회|건|번|곳|세션|거래일))/g;
/** Gamma Flip 위/아래에 따른 헤지 기전 주장 — 위: 움직임을 줄인다(양의 감마) · 아래: 키운다(음의 감마). 반대로 쓰면 사실이 틀린 글이다 */
const DAMPEN = /줄이|줄입|줄여|억제|완화|dampen|damp\b|抑え|抑制|緩和/i;
const AMPLIFY = /키우|키워|키웁|증폭|확대|amplif|magnif|増幅|拡大|強め/i;
const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const dollarVals = (text: string): Set<number> => {
    const out = new Set<number>();
    for (const m of text.matchAll(DOLLAR_RE)) out.add(Number(m[1].replace(/,/g, '')));
    return out;
};

/** 배수를 «말»로 쓴 경우(두 배·五倍·tenfold·twice) — 숫자 대조가 못 잡는다. 사실의 배수(미결제약정 배수·20일 평균 대비)와 ±20% 안이어야 한다 */
const KO_N: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const JA_N: Record<string, number> = { 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const EN_N: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twice: 2, double: 2, doubled: 2, triple: 3, tripled: 3 };
export function multiplierWords(t: string, loc: Loc): number[] {
    const found: Array<{ i: number; v: number }> = [];
    const add = (re: RegExp, val: (m: RegExpMatchArray) => number | undefined) => {
        for (const m of t.matchAll(re)) { const v = val(m); if (v != null && Number.isFinite(v)) found.push({ i: m.index ?? 0, v }); }
    };
    if (loc === 'ko') add(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?배/g, (m) => KO_N[m[1]]);
    else if (loc === 'ja') add(/(二|三|四|五|六|七|八|九|十)倍/g, (m) => JA_N[m[1]]);
    else {
        add(/\b(two|three|four|five|six|seven|eight|nine|ten)[\s-]?(?:fold|times)\b/gi, (m) => EN_N[m[1].toLowerCase()]);
        add(/\b(twice|double[sd]?|triple[sd]?)\b/gi, (m) => { const w = m[1].toLowerCase(); return w.startsWith('doubl') || w === 'twice' ? 2 : 3; });
    }
    return found.sort((a, b) => a.i - b.i).map((x) => x.v);
}
const factMultiples = (f: PickFacts): number[] => (f.kind === 'whale' && f.jump != null ? [f.jump] : f.kind === 'darkpool' ? [f.ratio] : []);

const NAME_RE = /Gamma Flip|Max Pain/g;
const DIR_UP: Record<Loc, RegExp> = { ko: /(?:^|\s)(?:바로\s?|살짝\s?)?위(?!치|험|해|기|안|원|반|약|임|탁|로움|대|한)|상회/, ja: /(?<!以)上(?!げ|昇|場|回)|上回/, en: /\babove\b|\bover\b/i };
const DIR_DOWN: Record<Loc, RegExp> = { ko: /아래|밑|하회/, ja: /(?<!以)下(?!げ|落|回)|下回/, en: /\bbelow\b|\bunder\b/i };

/**
 * 글이 레벨 이름(Gamma Flip·Max Pain) 가까이에서 말한 «가격의 쪽»: 'a'(위) · 'b'(아래) · null(말하지 않았거나 양쪽이 섞임).
 * 레벨 이름 앞뒤 16자 안의 방향 말만 본다 — 숫자 대조·쪽 대조(sideClaims, 가격이 붙은 모양)가 못 잡는 «Gamma Flip 바로 위» 같은 표현을 잡는다.
 */
export function levelDirection(t: string, loc: Loc): 'a' | 'b' | null {
    let up = false, down = false;
    for (const m of t.matchAll(NAME_RE)) {
        const win = t.slice(Math.max(0, (m.index ?? 0) - 16), (m.index ?? 0) + m[0].length + 16);
        if (DIR_UP[loc].test(win)) up = true;
        if (DIR_DOWN[loc].test(win)) down = true;
    }
    return up && !down ? 'a' : down && !up ? 'b' : null;
}

export interface WhyCheck {
    ok: boolean;
    reasons: string[];
    /** 통과한(정리된) 세 언어 해설 — ok 일 때만 */
    text?: LocText;
}

/**
 * 모델 응답(JSON 문자열) → 세 언어 해설. 한 언어라도 걸리면 ok=false(세 언어가 함께 나가거나 규칙 해설이 나간다 — 언어마다 AI·규칙이 섞이지 않게).
 */
export function checkPickWhy(raw: string, ticker: string, f: PickFacts, currentYear: number, todayEt?: string): WhyCheck {
    let obj: any;
    try {
        const s = String(raw || '').replace(/```(?:json)?/g, '').trim();
        const a = s.indexOf('{'), b = s.lastIndexOf('}');
        obj = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
    } catch { return { ok: false, reasons: ['json'] }; }
    if (!obj || typeof obj !== 'object') return { ok: false, reasons: ['json'] };

    const facts = factsForAi(ticker, f, todayEt);
    const okDollars = dollarVals(facts);
    const levelKey = f.kind === 'gamma' ? (f.level === 'gammaFlip' ? 'gf' : 'mp') : null;
    const reasons: string[] = [];
    const text = {} as LocText;
    for (const loc of TP_LOCALES) {
        const t = normalizeLine(obj[loc]);
        const r: string[] = [];
        if (t.length < MIN_LEN) { reasons.push(`${loc}:empty`); continue; }
        if ([...t].length > TP_WHY_MAX[loc]) r.push(`${loc}:too-long:${[...t].length}`);
        if (!scriptOk(t, loc)) r.push(`${loc}:script`);
        if (REFUSAL.test(t)) r.push(`${loc}:refusal`);
        for (const re of WL_LINE_FORBIDDEN) { const m = t.match(re); if (m) r.push(`${loc}:forbidden:${m[0]}`); }
        const bh = bannedHit(t);
        if (bh) r.push(`${loc}:banned:${bh}`);
        for (const re of INTENT) { const m = t.match(re); if (m) r.push(`${loc}:intent:${m[0]}`); }
        const fc = forecastHitsInSentence(t, loc);
        if (fc.length) r.push(`${loc}:forecast:${fc[0].id}`);
        if (foreignYear(t, currentYear)) r.push(`${loc}:year`);
        if (/…|\.\.\./.test(t) || /[{}]/.test(t)) r.push(`${loc}:ellipsis-or-brace`);
        if (loc !== 'en' && hasUnitAmounts(t)) r.push(`${loc}:unit-amount`);
        // 숫자 — 작은 정수도 사실 글에 있어야 한다(exemptSmallInts:false)
        for (const u of checkNumberGrounding(t.replace(COUNTER_ONE, ''), facts, { exemptSmallInts: false }).ungrounded) r.push(`${loc}:number:${u.raw}`);
        for (const m of t.matchAll(DOLLAR_RE)) if (!okDollars.has(Number(m[1].replace(/,/g, '')))) r.push(`${loc}:price:$${m[1]}`);
        // 쪽 — 가격이 레벨의 위/아래·양/음 감마 구간 주장은 사실과 같아야 한다(주지 않은 레벨 이야기는 금지)
        for (const c of sideClaims(t, loc)) {
            const truth = f.kind === 'gamma' && c.k === levelKey && f.side !== 'at' ? f.side : null;
            if (truth == null || c.side !== truth) r.push(`${loc}:side:${c.raw}`);
        }
        // 배수를 말로 쓴 경우: 사실의 배수와 20% 안(없으면 말로도 배수를 쓰지 못한다)
        for (const v of multiplierWords(t, loc)) {
            const ms = factMultiples(f);
            if (!ms.some((m) => Math.abs(v - m) / m <= 0.2)) r.push(`${loc}:multiple:${v}`);
        }
        // 감마 플립 항목: 가격이 레벨의 어느 쪽인가 · 그 쪽에 맞는 헤지 기전만 허용
        if (f.kind === 'gamma') {
            const dir = levelDirection(t, loc);
            if (dir && (f.side === 'at' || dir !== f.side)) r.push(`${loc}:dir:${dir}`);
            if (f.level === 'gammaFlip') {
                if (DAMPEN.test(t) && f.side !== 'a') r.push(`${loc}:mechanism:dampen`);
                if (AMPLIFY.test(t) && f.side !== 'b') r.push(`${loc}:mechanism:amplify`);
            } else if (DAMPEN.test(t) || AMPLIFY.test(t)) r.push(`${loc}:mechanism:maxpain`);
        }
        if (r.length) { reasons.push(...r); continue; }
        text[loc] = t;
    }
    if (reasons.length) return { ok: false, reasons };
    return { ok: true, reasons: [], text };
}

/** 푸시 한 줄 검사(규칙 문장이지만 한 번 더 — 길이 상한 · 금지어 · 예측어 · 언어) */
export function checkPushLine(line: string, loc: Loc, max: number): string[] {
    const r: string[] = [];
    if ([...line].length > max) r.push('too-long');
    if (!scriptOk(line, loc)) r.push('script');
    const b = bannedHit(line); if (b) r.push(`banned:${b}`);
    // 앞의 고정 머리(«✦ 오늘 볼 것 · » — 카드 이름)는 빼고 본문만 예측어를 본다(한국어 «볼 것»은 미래형 패턴에 걸리는 이름일 뿐이다)
    const fc = forecastHitsInSentence(line.replace(/^✦[^·]*·\s*/, ''), loc); if (fc.length) r.push(`forecast:${fc[0].id}`);
    return r;
}
