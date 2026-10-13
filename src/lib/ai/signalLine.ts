/**
 * «내 종목 이상 신호» 푸시의 «✦ AI 한 줄» — 프롬프트와 출구 가드. 순수 함수만(네트워크·Redis 없음). 시험: tests/signals.ai.test.ts
 *
 * 역할 분담: 무엇이 신호인가·숫자·기준 시각 = 규칙(lib/signals). AI = 한 줄 해설뿐 — 숫자를 새로 쓰거나 고르지 못한다.
 *   · 고래(미결제약정)·다크풀: 오늘 볼 것과 «같은 사실 글·같은 프롬프트·같은 출구 가드»(lib/ai/todayPicksLine — 운영에서 검증됨)를 그대로 쓴다.
 *   · 레벨 교차(Call Wall · Put Floor · Gamma Flip)·맥스페인 이탈·실적 D-1: 이 파일의 사실 글·가드(같은 부품: 숫자 전수 대조 · 가격($) 정확 일치 ·
 *     금지어·예측어·추측 표현·의도 추정 · 언어·길이 · 레벨 이름 곁의 «위/아래» 대조 · 저항/지지 같은 해석어 금지).
 * 가드를 못 넘으면 AI 줄이 «없는» 푸시가 나간다(규칙 줄은 늘 나간다 — 푸시는 비지 않는다).
 */
import { checkNumberGrounding } from '@/lib/ai/depthNumbers';
import { forecastHitsInSentence } from '@/lib/ai/trustLayer';
import { WL_LINE_FORBIDDEN, normalizeLine, sideClaims } from '@/lib/ai/watchlistLine';
import { bannedHit, foreignYear, scriptOk } from '@/lib/push/aiLine';
import {
    AMPLIFY, COUNTER_ONE, DAMPEN, DIR_DOWN, DIR_UP, DOLLAR_RE, HEDGE, INTENT, MIN_LEN, REFUSAL, TP_SYSTEM, TP_WHY_MAX, UNIT_AMOUNT,
    buildPickUserPrompt, checkPickWhy, dollarVals, type WhyCheck,
} from '@/lib/ai/todayPicksLine';
import { daysUntil, distStr, md, MEANING, priceStr, pct1, angleHint, factsForAi } from '@/lib/todayPicks/copy';
import type { DarkFacts, Loc, LocText, PickFacts, WhaleFacts } from '@/lib/todayPicks/types';
import { TP_LOCALES } from '@/lib/todayPicks/types';
import type { SignalFacts } from '@/lib/signals/types';

/** 사다리 용도 — 오늘 볼 것과 같은 설정(크레딧 전용 · 가드 실패 시 크레딧 한 번 더)을 쓴다 */
export const SIG_PURPOSE = 'TodayPicks';

const NAME_LABEL = { callWall: 'Call Wall', putFloor: 'Put Floor', gammaFlip: 'Gamma Flip' } as const;
const HOUR_EN = { bmo: 'before the market opens', amc: 'after the market closes', '': 'time not announced' } as const;

// ── 프롬프트 ────────────────────────────────────────────────────────────────────

/** 규칙 1~8 은 «오늘 볼 것»과 같다(TP_SYSTEM 에서 그대로 가져온다 — 두 벌로 갈라지지 않게) */
const TP_RULES = TP_SYSTEM.slice(TP_SYSTEM.indexOf('Rules:'), TP_SYSTEM.indexOf('Tone examples'));

export const SIG_SYSTEM = `You write the one-line «why it stands out» note shown under the numbers in a push notification of SIGNUM HQ, an options-flow app for retail investors. The notification already shows the ticker, a headline and a line with the key numbers and the time they are as of. Your line explains, in plain words, what this kind of signal measures and why it stands out here.

Return ONLY JSON: {"ko":"…","en":"…","ja":"…"} — the same note in Korean, English and Japanese.

${TP_RULES.trimEnd()}
9. Call Wall / Put Floor / Gamma Flip / Max Pain: follow the FACTS exactly for which side of the level the price is on; never mention a level the FACTS do not give. Never call a level "resistance" or "support" (저항, 지지, 抵抗, サポート) and never say the price will react to it. A reading is as of the time given in FACTS — say what it showed then, not what is happening now.
10. Earnings D-1: say only the timing and, if given, what the options have priced in. Never say what the report or the move will be.

Tone examples, one per kind. They show length and voice ONLY — write a NEW sentence for your case, following the ANGLE; never copy an example, and never reverse a side:
whale:    {"ko":"한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다","en":"One strike's open interest jumped in a session, so new positions were opened","ja":"ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました"}
dark pool:{"ko":"장외 거래량이 평소 수준을 크게 웃돌아 거래소 밖 체결이 많았습니다","en":"Off-exchange volume ran far above its usual level","ja":"場外の出来高が平常を大きく上回り、取引所外の約定が多くなりました"}
call wall:{"ko":"콜 미결제약정이 가장 몰린 행사가를 가격이 막 넘어선 시점입니다","en":"The price had just cleared the strike with the most call open interest","ja":"コール建玉が最も集中する行使価格を、価格が上回った時点です"}
max pain: {"ko":"이 종목으로서는 평소보다 Max Pain에서 많이 벌어진 가격입니다","en":"The price sits further from Max Pain than is usual for this stock","ja":"この銘柄にしては、Max Painから普段より大きく離れた価格です"}
earnings: {"ko":"발표를 낀 만기의 옵션이 이만큼의 움직임을 가격에 반영하고 있습니다","en":"Options for the expiry containing the report price in a move of this size","ja":"決算を含む満期のオプションが、この大きさの値動きを織り込んでいます"}`;

const MEANING_SIG = {
    wall: 'A positioning level built from options open interest (contracts still open): the Call Wall is the strike above the price with the most call open interest for the nearest expiry; the Put Floor is the strike below the price with the most put open interest; the Gamma Flip is the price where dealers\' net gamma changes sign. These levels describe where positions are concentrated; they are not forecasts. The reading is a snapshot at a stated time.',
    maxpain: 'Max Pain is the strike where the most options expire worthless at that expiry; price sometimes drifts toward it into expiry (pinning). The gap compares the price with it. "Top 10% of its own gaps" means the gap is as large as or larger than on 90% of this stock\'s own readings over the last 20 sessions.',
    earn: 'The options-implied move is the size of move the at-the-money straddle prices in for the expiry that contains the report. It is the market\'s priced-in range, not a prediction of direction or outcome.',
} as const;

/** AI 에게 주는 사실 글(영어) — 이 글에 있는 숫자만 AI 가 쓸 수 있다(출구 가드가 대조). 고래·다크풀은 오늘 볼 것과 같은 글 */
export function sigFactsForAi(ticker: string, f: SignalFacts, todayEt: string): string {
    switch (f.kind) {
        case 'wall': {
            const nm = NAME_LABEL[f.level];
            const rel = f.distPct >= 0 ? 'above' : 'below';
            const defn = f.level === 'callWall' ? 'the strike above the price with the most call open interest' : f.level === 'putFloor' ? 'the strike below the price with the most put open interest' : 'the price where dealer net gamma changes sign';
            const dayN = f.expiry ? daysUntil(todayEt, f.expiry) : null;
            return [
                `FACTS — ${ticker}: the price moved ${f.direction === 'up' ? 'up through' : 'down through'} a positioning level (reading as of ${wallTime(f.asOfMs)}${f.chainDate ? `; open interest as of the ${md(f.chainDate)} close` : ''})`,
                `- ${nm} (${defn}) is $${priceStr(f.levelPrice)}; the price in this reading is $${priceStr(f.price)}, ${distStr(Math.abs(f.distPct))}% ${rel} it`,
                `- At the previous reading earlier the same day the price was ${f.direction === 'up' ? 'below' : 'above'} this level`,
                ...(f.expiry ? [`- The levels are for the ${md(f.expiry)} expiry${dayN != null && dayN >= 0 ? ` (${dayN} day${dayN === 1 ? '' : 's'} away)` : ''}`] : []),
            ].join('\n');
        }
        case 'maxpain': {
            const rel = f.divPct >= 0 ? 'above' : 'below';
            const dayN = daysUntil(todayEt, f.expiry);
            return [
                `FACTS — ${ticker}: price versus Max Pain in expiry week (reading as of ${wallTime(f.asOfMs)}${f.chainDate ? `; open interest as of the ${md(f.chainDate)} close` : ''})`,
                `- Max Pain for the ${md(f.expiry)} expiry is $${priceStr(f.maxPain)}; the price is $${priceStr(f.price)}, ${distStr(Math.abs(f.divPct))}% ${rel} it`,
                `- That gap is at or beyond this stock's own top-10% gap over the last 20 sessions (that edge: ${distStr(f.p90Pct)}%)`,
                ...(dayN != null && dayN >= 0 ? [`- The expiry is ${dayN} day${dayN === 1 ? '' : 's'} away (as of ${md(todayEt)})`] : []),
            ].join('\n');
        }
        case 'earnings_d1':
            return [
                `FACTS — ${ticker}: earnings report on ${md(f.date)}, ${HOUR_EN[f.hour]} — ${f.tomorrow ? 'tomorrow' : 'on the next trading day'} (company-announced date)`,
                ...(f.impliedPct != null && f.impliedExpiry ? [`- Options-implied move: ±${pct1(f.impliedPct)}% (at-the-money straddle for the ${md(f.impliedExpiry)} expiry)`] : ['- No options-implied move figure is available — talk only about the timing']),
            ].join('\n');
        default:
            return factsForAi(ticker, f as PickFacts, todayEt);
    }
}

function wallTime(ms: number): string {
    // 사실 글은 «M/D HH:mm ET» — 규칙 줄의 기준 시각과 같은 모양(copy.etHm 과 같은 계산을 순환 import 없이)
    const d = new Date(ms);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${g('month')}/${g('day')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')} ET`;
}

/** 이 항목의 «각도» — 매번 같은 문장이 되지 않게 규칙으로 정한 한 가지 특징(영어 지시, 쓰인 숫자는 사실 글에 있다) */
export function sigAngle(f: SignalFacts, todayEt: string): string {
    switch (f.kind) {
        case 'wall': {
            const d = Math.abs(f.distPct);
            if (f.level === 'gammaFlip') return `Say the price moved ${f.direction === 'up' ? 'above' : 'below'} the Gamma Flip in this reading; dealer hedging is described by the side the FACTS give — never reverse it.`;
            if (d < 0.6) return 'Lead with the fact that the price had only just moved past the level in this reading — in words, no number.';
            return `Lead with the fact that the price was already clearly past the level in this reading (${distStr(d)}% beyond).`;
        }
        case 'maxpain': {
            const n = daysUntil(todayEt, f.expiry);
            return n != null && n <= 1
                ? 'Lead with the fact that expiry is only a day away yet the price sits unusually far from Max Pain for this stock.'
                : 'Lead with the fact that the gap to Max Pain is larger than is usual for this stock — its own top 10% of readings.';
        }
        case 'earnings_d1':
            // 규칙 줄이 이미 날짜·시각·변동폭을 보여 준다 — 되풀이하지 않고 «그 값이 무엇을 재는가»를 말로 풀게 한다
            if (f.impliedPct != null && f.impliedPct >= 8) return 'Do not repeat the date, time or figure from the numbers line. Say in words that the options price in an unusually large move for this report, and what an options-implied move measures.';
            return 'Do not repeat the date, time or figure from the numbers line. Say in words what an options-implied move measures: the size of move the options already price in around the report, with no direction.';
        default:
            return angleHint(f as PickFacts, todayEt);
    }
}

export function sigMeaning(f: SignalFacts): string {
    switch (f.kind) {
        case 'wall': return MEANING_SIG.wall;
        case 'maxpain': return MEANING_SIG.maxpain;
        case 'earnings_d1': return MEANING_SIG.earn;
        default: return MEANING[(f as PickFacts).kind];
    }
}

/** 시스템 프롬프트 — 고래·다크풀은 «오늘 볼 것»의 것을 그대로 */
export function sigSystemFor(f: SignalFacts): string {
    return f.kind === 'whale' || f.kind === 'darkpool' ? TP_SYSTEM : SIG_SYSTEM;
}

export function buildSignalUserPrompt(ticker: string, f: SignalFacts, todayEt: string): string {
    if (f.kind === 'whale' || f.kind === 'darkpool') return buildPickUserPrompt(ticker, f as PickFacts, todayEt);
    return `${sigFactsForAi(ticker, f, todayEt)}\n\nMEANING: ${sigMeaning(f)}\n\nANGLE: ${sigAngle(f, todayEt)}\n\nWrite the note for ${ticker} now — specific to this case, not a generic definition. JSON only.`;
}

// ── 출구 가드 ────────────────────────────────────────────────────────────────────

/** 해석어(저항·지지) — 레벨을 «막는/받치는 선»으로 말하는 순간 예측이 된다 */
const SR_WORDS = /저항|지지선|지지대|지지\s?(?:받|한|하)|抵抗|レジスタンス|サポート|支持線|\bresistance\b|\bsupport(?:s|ed|ing)?\b/i;
const NAME_ANY = /Call Wall|Put Floor|Gamma Flip|Max Pain/g;

function nameSide(t: string, loc: Loc): Array<{ name: string; side: 'a' | 'b' | 'x' }> {
    const out: Array<{ name: string; side: 'a' | 'b' | 'x' }> = [];
    for (const m of t.matchAll(NAME_ANY)) {
        const win = t.slice(Math.max(0, (m.index ?? 0) - 16), (m.index ?? 0) + m[0].length + 16);
        const up = DIR_UP[loc].test(win), down = DIR_DOWN[loc].test(win);
        out.push({ name: m[0], side: up && !down ? 'a' : down && !up ? 'b' : up && down ? 'x' : 'x' });
    }
    return out;
}

const KEY_OF: Record<string, 'mp' | 'cw' | 'pf' | 'gf'> = { 'Max Pain': 'mp', 'Call Wall': 'cw', 'Put Floor': 'pf', 'Gamma Flip': 'gf' };

/**
 * 모델 응답(JSON 문자열) → 세 언어 한 줄. 한 언어라도 걸리면 ok=false(세 언어가 함께 나가거나 AI 줄이 없다).
 * 고래·다크풀은 checkPickWhy(오늘 볼 것과 같은 가드)로 위임한다.
 */
export function checkSignalWhy(raw: string, ticker: string, f: SignalFacts, currentYear: number, todayEt: string): WhyCheck {
    if (f.kind === 'whale' || f.kind === 'darkpool') return checkPickWhy(raw, ticker, f as WhaleFacts | DarkFacts, currentYear, todayEt);

    let obj: any;
    try {
        const s = String(raw || '').replace(/```(?:json)?/g, '').trim();
        const a = s.indexOf('{'), b = s.lastIndexOf('}');
        obj = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
    } catch { return { ok: false, reasons: ['json'] }; }
    if (!obj || typeof obj !== 'object') return { ok: false, reasons: ['json'] };

    const facts = sigFactsForAi(ticker, f, todayEt);
    const okDollars = dollarVals(facts);
    // 사실이 말하는 레벨 이름(있다면)과 가격의 쪽
    let ownKey: 'mp' | 'cw' | 'pf' | 'gf' | null = null;
    let truth: 'a' | 'b' | null = null;
    if (f.kind === 'wall') { ownKey = f.level === 'callWall' ? 'cw' : f.level === 'putFloor' ? 'pf' : 'gf'; truth = f.distPct >= 0 ? 'a' : 'b'; }
    if (f.kind === 'maxpain') { ownKey = 'mp'; truth = f.divPct >= 0 ? 'a' : 'b'; }
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
        for (const re of HEDGE) { const m = t.match(re); if (m) r.push(`${loc}:hedge:${m[0]}`); }
        const fc = forecastHitsInSentence(t, loc);
        if (fc.length) r.push(`${loc}:forecast:${fc[0].id}`);
        if (foreignYear(t, currentYear)) r.push(`${loc}:year`);
        if (/…|\.\.\./.test(t) || /[{}]/.test(t)) r.push(`${loc}:ellipsis-or-brace`);
        if (loc !== 'en' && UNIT_AMOUNT.test(t)) r.push(`${loc}:unit-amount`);
        const sr = t.match(SR_WORDS);
        if (sr) r.push(`${loc}:interpretive:${sr[0]}`);
        for (const u of checkNumberGrounding(t.replace(COUNTER_ONE, '').replace(/만기/g, 'expiry'), facts, { exemptSmallInts: false }).ungrounded) r.push(`${loc}:number:${u.raw}`);
        for (const m of t.matchAll(DOLLAR_RE)) if (!okDollars.has(Number(m[1].replace(/,/g, '')))) r.push(`${loc}:price:$${m[1]}`);
        // 가격이 붙은 «레벨 위/아래» 주장: 사실의 레벨·쪽과 같아야 한다(주지 않은 레벨 이야기 금지)
        for (const c of sideClaims(t, loc)) {
            if (ownKey == null || c.k !== ownKey || truth == null || c.side !== truth) r.push(`${loc}:side:${c.raw}`);
        }
        // 가격이 붙지 않은 «Call Wall 위»류 — 이름 곁(앞뒤 16자) 방향 말
        for (const ns of nameSide(t, loc)) {
            const k = KEY_OF[ns.name];
            if (ns.side === 'x') continue;
            if (ownKey == null || k !== ownKey || truth == null || ns.side !== truth) r.push(`${loc}:dir:${ns.name}`);
        }
        // 기전(딜러 헤지가 움직임을 줄인다/키운다) — Gamma Flip 만 쪽에 맞게, 그 밖은 금지(정의되지 않은 주장)
        if (DAMPEN.test(t) || AMPLIFY.test(t)) {
            if (f.kind === 'wall' && f.level === 'gammaFlip') {
                if (DAMPEN.test(t) && truth !== 'a') r.push(`${loc}:mechanism:dampen`);
                if (AMPLIFY.test(t) && truth !== 'b') r.push(`${loc}:mechanism:amplify`);
            } else r.push(`${loc}:mechanism`);
        }
        if (r.length) { reasons.push(...r); continue; }
        text[loc] = t;
    }
    if (reasons.length) return { ok: false, reasons };
    return { ok: true, reasons: [], text };
}

