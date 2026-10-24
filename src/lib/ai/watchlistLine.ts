import { buildStockQuote, type StockQuoteFact } from './watchlistStockFacts';
import { languageStats } from './outputGate';
import { WATCHLIST_DEPTH_RULES, checkDepthLine, fitDepthLine } from './watchlistDepth';
import { textIntegrityReasons } from './textIntegrity';
/**
 * «내 종목» AI 한 줄 — 입력 사실 만들기 · 프롬프트 · 출구 검사(가드)·자르기. 순수 함수만(네트워크·Redis 없음) → tests/watchlistAiLine.test.ts.
 *
 * 왜 (대표 2026-10-12 «개선도 완벽하게 진행해 차별점을 홍보에도 이용하고 매력적으로»):
 *   «옵션 지형을 AI 가 떠먹여 준다» — 한·일 경쟁 앱 21곳 중 옵션 구조를 AI 로 풀어 주는 곳 0(DIFF-2026-10-12/EXTERNAL-BENCHMARK.md).
 *   재료는 «내 종목» 화면이 이미 읽는 GET /api/watchlist/batch 의 필드뿐이다(새 데이터 없음).
 *
 * 숫자 원칙 («지어내지 않는다»):
 *   · 가격에 따라 움직이는 «레벨까지 거리 %»는 모델이 쓰지 않는다 — 자리표({MP}·{CW}·{PF}·{GF})만 쓰고 화면이 지금 가격으로 채운다(lib/app/watchlistAiLine).
 *   · 그 밖의 숫자(레벨 가격·장외 비중·예상 변동·날짜)는 아래 FACTS 글에 있는 숫자만 — depthNumbers.checkNumberGrounding 으로 대조한다(시스템 지시문의 예시 숫자는 근거가 아니다).
 *
 * 뺀 재료와 까닭:
 *   · P/C — 같은 이름에 범위가 다른 값이 화면마다 있다(미결제약정 P/C 만기 범위 W/T 불일치, 대표 결정 대기 — 메모리 pcr-field-names-and-oi-scope).
 *     정의가 정해지기 전 AI 글에 싣지 않는다.
 *   · GEX 크기 — 분석 캐시의 gex 와 구조(Flow) 값이 원천이 다르다. 감마 구간은 Gamma Flip 대비 «가격의 쪽»으로만 말한다(같은 구조 한 벌에서 나온다).
 */
import { checkNumberGrounding } from '@/lib/ai/depthNumbers';
import { restoreCommonTermNames } from '@/lib/ai/commonTerms';
import { IMPLIED_MOVE_DEF } from '@/lib/impliedMove';
import { formatLevelPrice, rowSpot } from '@/lib/optionLevelGate';
import {
    AI_LEVEL_KEYS, AI_PLACEHOLDER, distPct, sidesFor,
    type AiLevelKey, type AiLineLevels, type AiLineLocale, type AiSide,
} from '@/lib/app/watchlistAiLine';

/** 사다리 용도 이름(lib/ai/llmLadder TRACKED_PURPOSES·LADDER_PURPOSES) */
export const WL_LINE_PURPOSE = 'WatchlistLine';
export const WL_LINE_LOCALES: readonly AiLineLocale[] = ['ko', 'en', 'ja'];

/** 글 길이 상한(자리표는 «12.3%» 다섯 글자로 셈, 대표 «각 언어 약 60자») — 모델에게는 더 짧게(ko·ja 50 · en 80) 요청하고, 넘으면 뒤 조각부터 덜어 낸다 */
export const WL_LINE_MAX_CHARS: Record<AiLineLocale, number> = { ko: 60, ja: 60, en: 90 };
/** 화면 폭 상한(em, 11px 글자 기준) — 360폭 폰의 목록 안쪽 304px = 27.6em/줄, 두 줄 안에 들어가게(낱말 단위 줄바꿈 여유 포함) */
export const WL_LINE_MAX_EM = 46;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const pos = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

const LEVEL_NAME: Record<AiLevelKey, string> = { mp: 'Max Pain', cw: 'Call Wall', pf: 'Put Floor', gf: 'Gamma Flip' };

export interface LineFacts {
    ticker: string;
    quote: StockQuoteFact;
    /** 이 글을 쓰는 가격(행의 화면 현물 — rowSpot: 정규장·마감은 표시 가격, 프리·애프터는 시간외 가격) */
    spot: number;
    chain: string;
    expiry: string | null;
    lv: AiLineLevels;
    sides: Partial<Record<AiLevelKey, AiSide>>;
    /** 거리 순(가까운 레벨 먼저) — 값이 있는 레벨만 */
    order: AiLevelKey[];
    darkPool: { pct: number; date: string } | null;
    implied: { pct: number; expiry: string } | null;
    /** 모델에게 주는 사실 글 = 숫자 대조의 «근거» */
    factsText: string;
    contextText?: string;
    /** 최상위 근거 한 줄(«TOP EVIDENCE [kind]: …» — watchlistDepth.rankStockContext) */
    topLine?: string;
}

/**
 * 묶음 응답 한 행(realtime) → 사실. 지도(내 종목 PositionMap)가 서는 조건과 같게 — 구조 한 벌(levelsSource 'structure')·
 * 공급사 지연·오래됨 표식 없음·Put Floor·Max Pain·Call Wall 셋 다 있음. 하나라도 아니면 null(글을 만들지 않는다 = 줄을 그리지 않는다).
 */
export function buildLineFacts(ticker: string, rt: any, nowMs: number = Date.now()): LineFacts | null {
    if (!rt || typeof rt !== 'object') return null;
    const T = String(ticker || '').toUpperCase();
    const spot = rowSpot(rt);
    if (spot == null) return null;
    if (rt.levelsSource !== 'structure' || rt.levelsStaleReason) return null;
    const chain = typeof rt.levelsChainDate === 'string' && YMD.test(rt.levelsChainDate.slice(0, 10)) ? rt.levelsChainDate.slice(0, 10) : null;
    if (!chain) return null;
    const lv: AiLineLevels = { mp: pos(rt.maxPain), cw: pos(rt.callWall), pf: pos(rt.putFloor), gf: pos(rt.gammaFlipLevel) };
    if (lv.mp == null || lv.cw == null || lv.pf == null) return null;
    const expiry = typeof rt.levelsExpiration === 'string' && YMD.test(rt.levelsExpiration) ? rt.levelsExpiration : null;
    const sides = sidesFor(spot, lv);
    const order = AI_LEVEL_KEYS.filter((k) => lv[k] != null).sort((a, b) => distPct(spot, lv[a]!) - distPct(spot, lv[b]!));

    const dpPct = pos(rt.darkPoolPct);
    const darkPool = dpPct != null && dpPct < 100 && typeof rt.darkPoolDate === 'string' && YMD.test(rt.darkPoolDate)
        ? { pct: Math.round(dpPct * 10) / 10, date: rt.darkPoolDate } : null;
    const imPct = pos(rt.impliedMovePct);
    const implied = imPct != null && rt.impliedMoveDef === IMPLIED_MOVE_DEF && typeof rt.impliedMoveExpiry === 'string' && YMD.test(rt.impliedMoveExpiry)
        ? { pct: Math.round(imPct * 10) / 10, expiry: rt.impliedMoveExpiry } : null;

    const f: LineFacts = { ticker: T, quote: buildStockQuote(T, rt, nowMs), spot, chain, expiry, lv, sides, order, darkPool, implied, factsText: '' };
    f.factsText = factsTextOf(f);
    return f;
}

function sideText(k: AiLevelKey, s: AiSide | undefined): string {
    if (s === 'at') return 'price is AT this level (do not use a distance placeholder for it)';
    const above = s === 'a';
    switch (k) {
        case 'mp': return above ? 'price is ABOVE Max Pain' : 'price is BELOW Max Pain';
        case 'cw': return above ? 'price is ABOVE the Call Wall (outside the range)' : 'the Call Wall is above the price';
        case 'pf': return above ? 'the Put Floor is below the price' : 'price is BELOW the Put Floor (outside the range)';
        case 'gf': return above ? 'price is ABOVE the Gamma Flip → positive gamma zone' : 'price is BELOW the Gamma Flip → negative gamma zone';
    }
}

function factsTextOf(f: LineFacts): string {
    const head = `FACTS — ${f.ticker} (options open interest as of the ${md(f.chain)} close${f.expiry ? `; levels for the ${md(f.expiry)} expiry` : ''})`;
    const lines: string[] = [head, 'Levels, nearest to the price first:'];
    for (const k of f.order) {
        const s = f.sides[k];
        const ph = s === 'at' ? '' : ` — distance placeholder ${AI_PLACEHOLDER[k]}`;
        lines.push(`- ${LEVEL_NAME[k]} $${formatLevelPrice(f.lv[k])}: ${sideText(k, s)}${ph}`);
    }
    const { pf, cw } = f.lv;
    if (pf != null && cw != null && pf < cw) {
        const sp = f.sides.pf, sc = f.sides.cw;
        const range = sp === 'b' ? 'price is below the Put Floor–Call Wall range'
            : sc === 'a' ? 'price is above the Put Floor–Call Wall range'
                : 'price is inside the Put Floor–Call Wall range';
        lines.push(`- Range: ${range}`);
    }
    const other: string[] = [];
    if (f.darkPool) other.push(`- Off-exchange share (FINRA) on ${md(f.darkPool.date)}: ${f.darkPool.pct.toFixed(1)}%`);
    if (f.implied) other.push(`- Options implied move to the ${md(f.implied.expiry)} expiry: ±${f.implied.pct.toFixed(1)}%`);
    if (other.length) lines.push('Other facts:', ...other);
    return lines.join('\n');
}

export const OPTIONS_MAP_SYSTEM = `You write the one-line «options map» reading under a stock in a watchlist (SIGNUM HQ app). The row above already shows the ticker, the price and a map bar (Put Floor — Max Pain — price — Call Wall). Your line says in plain words where the price sits on that map, for a retail investor.

Return ONLY JSON: {"ko":"…","en":"…","ja":"…"} — the same reading in Korean, English and Japanese.

Rules:
1. Use only the FACTS. Every number you write (level prices like $215, percentages like 43.8%, dates like 10/16) must appear in FACTS exactly as written. Never compute, round or invent a number.
2. Distances from the price to a level are filled in live by the app. Write a distance ONLY as that level's placeholder ({MP}, {CW}, {PF} or {GF}), at most once each. Never write a distance number yourself. Put a placeholder right next to its own level with the side word, exactly in these shapes: ko «Max Pain $215 위 {MP}» / «Call Wall $250까지 {CW}» / «Put Floor $220 아래 {PF}», ja «Max Pain $215の{MP}上» / «Call Wall $250まで{CW}», en «{MP} above Max Pain $215» / «{CW} below Call Wall $250». Never leave a placeholder without its side word (위·아래·까지 / 上·下·まで / above·below), and never put it after another phrase such as a gamma zone.
3. Observation only — no advice, no forecast, no target, no "will". Never use: buy, sell, recommend, target, forecast, predict, expect, should, opportunity / 매수, 매도, 추천, 목표가, 예측, 전망, 기회 / 買い, 売り, 推奨, 目標株価, 予測, 予想, 見通し. Do not say what the price may do next. Do not add size words such as near/far/close/가깝다/멀다/近い — the live % already shows it.
4. Use the 2–3 most useful facts, taking them in the order given. Separate parts with " · ". Do not start with the ticker or the company name.
5. Length: Korean ≤ 50 characters, Japanese ≤ 50 characters, English ≤ 80 characters (count each placeholder as 5).
6. Terms in every language, exactly: Max Pain, Call Wall, Put Floor, Gamma Flip. Off-exchange share = 장외 비중 (ko), 場外比率 (ja), off-exchange (en). Options implied move = 옵션 예상 변동 (ko), 想定変動幅 (ja), implied move (en). Positive / negative gamma zone = 양(+) 감마 구간 / 음(−) 감마 구간 (ko), 正ガンマ圏 / 負ガンマ圏 (ja), positive / negative gamma zone (en).
7. Style: Korean as short noun-ending fragments (… 위 · … 아래 · …까지 · … 구간), Japanese in 体言止め, English as a terse fragment. Plain text: no emoji, no quotes, no markdown, no line breaks.

Style examples (numbers here are only an illustration — never copy them):
{"ko":"Max Pain $180 위 {MP} · Call Wall $195까지 {CW} · 장외 비중 41.2%","en":"{MP} above Max Pain $180 · {CW} below Call Wall $195 · off-exchange 41.2%","ja":"Max Pain $180の{MP}上 · Call Wall $195まで{CW} · 場外比率41.2%"}
{"ko":"Gamma Flip $90 아래 {GF}, 음(−) 감마 구간 · Put Floor $85 위 {PF}","en":"{GF} below Gamma Flip $90, negative gamma zone · {PF} above Put Floor $85","ja":"Gamma Flip $90の{GF}下、負ガンマ圏 · Put Floor $85の{PF}上"}`;

export const WL_LINE_SYSTEM = OPTIONS_MAP_SYSTEM + '\n\n' + WATCHLIST_DEPTH_RULES;

export function buildLineUserPrompt(f: LineFacts): string {
    return `${f.factsText}

CONTEXT (dated observations, not causal proof):
${f.topLine ? `${f.topLine}\n` : ''}${f.contextText || [f.darkPool ? `FINRA off-exchange share on ${f.darkPool.date}: ${f.darkPool.pct}% (not net buying)` : '', f.implied ? `Options implied move to ${f.implied.expiry}: ±${f.implied.pct}% (not a forecast)` : ''].filter(Boolean).join('\n') || 'EMPTY'}

Write the line for ${f.ticker} now. JSON only.`;
}

// ── 출구 검사 ────────────────────────────────────────────────────────────────

const HANGUL = /[가-힣]/;
const KANA = /[぀-ヿ]/;
const KANJI = /[一-鿿]/;

/** 권유·예측·목표 — 세 언어 패턴을 모든 칸에 건다. «공매도»·«空売り»·«예상 변동»(앱의 implied move 용어)은 뺀다 */
export const WL_LINE_FORBIDDEN: ReadonlyArray<RegExp> = [
    /매수|(?<!공)매도|추천|목표\s?(?:가|주가|가격)|예측|전망|예상(?!\s?변동)|오를|내릴|상승할|하락할|사세요|파세요|진입|손절|익절|기회|유망|급등|급락|폭등|폭락|확실|보장/,
    /買い|(?<!空)売り|買う|売る|推奨|おすすめ|目標株価|目標価格|予測|予想|見通し|上昇する|下落する|上がる|下がる|チャンス|確実|保証|狙い/,
    /\b(?:buy|buys|buying|sell|sells|selling|recommend\w*|target\w*|forecast\w*|predict\w*|expect\w*|will|should|opportunit\w*|guarantee\w*|bullish|bearish|upside|downside|rally|crash|soar\w*|plunge\w*)\b/i,
    /\bI\b|\bAI\b|죄송|申し訳/,
];

/** 보이는 폭(em, 11px 기준 대략) — 한·일 글자 1 · 대문자 0.66 · 소문자·숫자 0.56 · 공백 0.28 · 그 밖 0.4 */
export function lineWidthEm(s: string): number {
    let w = 0;
    for (const ch of s) {
        if (HANGUL.test(ch) || KANA.test(ch) || KANJI.test(ch) || /[　-〿＀-￯]/.test(ch)) w += 1;
        else if (/[A-Z]/.test(ch)) w += 0.66;
        else if (/[a-z0-9$%]/.test(ch)) w += 0.56;
        else if (ch === ' ') w += 0.28;
        else w += 0.4;
    }
    return Math.round(w * 100) / 100;
}

/** 자리표를 가장 긴 거리 글자(«12.3%»)로 바꾼 길이·폭 */
const SAMPLE_FILL = '12.3%';
const filledForMeasure = (s: string) => s.replace(/\{(?:MP|CW|PF|GF)\}/g, SAMPLE_FILL);
export const lineLength = (s: string): number => [...filledForMeasure(s)].length;
export const fitsLine = (s: string, loc: AiLineLocale): boolean =>
    lineLength(s) <= WL_LINE_MAX_CHARS[loc] && lineWidthEm(filledForMeasure(s)) <= WL_LINE_MAX_EM;

/**
 * 자르기 — 넘치면 « · »로 나뉜 조각을 뒤에서부터 덜어 낸다(첫 조각 = 가장 가까운 레벨은 남는다). 조각 하나로도 넘치면 null.
 * 글자 중간을 자르지 않는다(«…»로 끝나는 반쪽 문장을 내보내지 않는다).
 */
export function trimLine(text: string, loc: AiLineLocale): string | null {
    let parts = text.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return null;
    while (!fitsLine(parts.join(' · '), loc)) {
        const last = parts[parts.length - 1];
        // 마지막 조각에 덧붙인 구절(«…{GF}, 음(−) 감마 구간»)이 있으면 그 구절부터 덜어 낸다 — 레벨·거리는 남긴다
        const cut = Math.max(last.lastIndexOf(', '), last.lastIndexOf('、'));
        if (cut > 0) { parts = [...parts.slice(0, -1), last.slice(0, cut).trim()]; continue; }
        if (parts.length === 1) break;
        parts = parts.slice(0, -1);
    }
    const out = parts.join(' · ');
    return fitsLine(out, loc) ? out : null;
}

const NAMES = 'Max Pain|Call Wall|Put Floor|Gamma Flip';
const KEY_OF_NAME: Record<string, AiLevelKey> = { 'max pain': 'mp', 'call wall': 'cw', 'put floor': 'pf', 'gamma flip': 'gf' };
const PRICE = '\\$\\s?[\\d,]+(?:\\.\\d+)?';
const PH = '(?:\\{(?:MP|CW|PF|GF)\\})?';
/**
 * 글이 말한 «가격이 레벨의 어느 쪽인가» — 사실(f.sides)과 대조한다. 위·上·above = 가격이 레벨 위('a') · 아래·下·below·까지·まで = 가격이 레벨 아래('b').
 * 감마 구간: 양(+)·正·positive = Gamma Flip 위 · 음(−)·負·negative = 아래.
 * 실측(10/12 운영 표본): AMZN 한국어 «Put Floor $250 아래 {PF}» — 사실은 가격이 Put Floor 위(숫자 대조·자리표 검사로는 못 잡는다).
 */
export function sideClaims(t: string, loc: AiLineLocale): Array<{ k: AiLevelKey; side: 'a' | 'b'; raw: string }> {
    const out: Array<{ k: AiLevelKey; side: 'a' | 'b'; raw: string }> = [];
    const push = (name: string, w: string, raw: string) => {
        const k = KEY_OF_NAME[name.toLowerCase()];
        if (!k) return;
        // «까지·まで»(거기까지)는 방향이 없는 말 — 벽(Call Wall)은 아래에서 올라가는 거리, 바닥(Put Floor)은 위에서 내려가는 거리로만 읽는다. 다른 레벨은 판정하지 않는다
        if (/^(까지|まで)$/.test(w)) {
            if (k === 'cw') out.push({ k, side: 'b', raw });
            else if (k === 'pf') out.push({ k, side: 'a', raw });
            return;
        }
        out.push({ k, side: /^(위|上|above)$/i.test(w) ? 'a' : 'b', raw });
    };
    if (loc === 'ko') {
        for (const m of t.matchAll(new RegExp(`(${NAMES})\\s*${PRICE}\\s*(위|아래|까지)`, 'g'))) push(m[1], m[2], m[0]);
    } else if (loc === 'ja') {
        for (const m of t.matchAll(new RegExp(`(${NAMES})\\s*${PRICE}\\s*の?\\s*${PH}\\s*(上|下|まで)`, 'g'))) push(m[1], m[2], m[0]);
    } else {
        for (const m of t.matchAll(new RegExp(`\\b(above|below)\\s+(?:the\\s+)?(${NAMES})\\s*${PRICE}`, 'gi'))) push(m[2], m[1], m[0]);
        for (const m of t.matchAll(new RegExp(`(${NAMES})\\s*${PRICE}\\s+(above|below)\\b`, 'gi'))) push(m[1], m[2], m[0]);
    }
    const zonePos = loc === 'ko' ? /양\s?\(\+\)|양\s?감마/ : loc === 'ja' ? /正ガンマ/ : /positive gamma/i;
    const zoneNeg = loc === 'ko' ? /음\s?\([−-]\)|음\s?감마/ : loc === 'ja' ? /負ガンマ/ : /negative gamma/i;
    const zp = t.match(zonePos), zn = t.match(zoneNeg);
    if (zp) out.push({ k: 'gf', side: 'a', raw: zp[0] });
    if (zn) out.push({ k: 'gf', side: 'b', raw: zn[0] });
    return out;
}

/** 모델 글 한 칸 정리 — 공백 접기·따옴표/마침표 떼기·음차 지표 이름 되돌리기(콜월 → Call Wall) */
export function normalizeLine(s: unknown): string {
    let t = typeof s === 'string' ? s : '';
    t = t.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    t = t.replace(/^["'“”‘’«»「」『』]+|["'“”‘’«»「」『』]+$/g, '').trim();
    t = t.replace(/[。.]$/, '').trim();
    t = t.replace(/\s*[|•∙・]\s*(?=\S)/g, (m) => (m.includes('・') ? m : ' · '));   // 다른 구분점 → « · » (일본어 가운뎃점 «・»은 단어 안에서도 쓰므로 그대로)
    // 되돌린 이름 뒤에 가격이 붙어 있으면 한 칸 띄운다(«マックスペイン$215» → «Max Pain $215»)
    return restoreCommonTermNames(t).text.replace(/(Max Pain|Call Wall|Put Floor|Put Wall|Gamma Flip)(?=[$\d])/g, '$1 ');
}

const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const dollarVal = (x: string) => Number(x.replace(/,/g, ''));
function dollarsIn(text: string): Set<number> {
    const out = new Set<number>();
    for (const m of text.matchAll(DOLLAR_RE)) out.add(dollarVal(m[1]));
    return out;
}

export interface LineCheck {
    ok: boolean;
    reasons: string[];
    /** 통과한(정리·자르기 뒤) 세 언어 글 — ok 일 때만 */
    text?: Record<AiLineLocale, string>;
    insight?: Partial<Record<AiLineLocale, string>>;
    /** 해석을 버린 사유(칩 줄은 통과) — 기록용 */
    insightReasons?: string[];
    /** 모델이 준 해석 원문(언어별 120자까지) — 탈락 원인 실측용, 화면에는 안 나간다 */
    insightRaw?: Partial<Record<AiLineLocale, string>> | null;
}

export function lineLocaleReasons(s: string, loc: AiLineLocale): string[] {
    const st = languageStats(s, { ignoreCommonNames: true });
    const total = st.hangul + st.kana + st.kanji + st.latin;
    const extra: string[] = [];
    if (loc === 'ko' && total && st.hangul / total < 0.6) extra.push('ko:foreign-prose');
    if (loc === 'ja' && total && (st.kana + st.kanji) / total < 0.6) extra.push('ja:foreign-prose');
    if (loc === 'ko') return [...extra, ...(!HANGUL.test(s) ? ['ko:no-hangul'] : []), ...(KANA.test(s) ? ['ko:has-kana'] : [])];
    if (loc === 'ja') return [...extra, ...(!(KANA.test(s) || KANJI.test(s)) ? ['ja:no-kana'] : []), ...(HANGUL.test(s) ? ['ja:has-hangul'] : [])];
    return HANGUL.test(s) || KANA.test(s) || KANJI.test(s) ? ['en:not-latin'] : [];
}

/**
 * 출구 검사 — 사다리 validate(① 응답이 못 넘으면 크레딧으로 한 번 더 → 그래도 못 넘으면 건너뜀)와 저장 직전에 같은 함수.
 *   JSON · 세 칸 · 정리 · 자르기 · 언어 · 금지어 · 자리표(값이 있는 레벨·«위에 있음»이 아닌 레벨만·한 번씩) · 숫자 대조(FACTS 글) · 사실 하나 이상
 */
export function checkLineOutput(raw: string, f: LineFacts): LineCheck {
    let obj: any;
    try {
        const s = String(raw || '').replace(/```(?:json)?/g, '').trim();
        const a = s.indexOf('{'), b = s.lastIndexOf('}');
        obj = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
    } catch { return { ok: false, reasons: ['json'] }; }
    if (!obj || typeof obj !== 'object') return { ok: false, reasons: ['json'] };
    // 모델이 칩 줄을 한 겹 안에 넣어 오는 형태({"options_map":{ko,en,ja},"insight":…} — 10/20 실제 모델 재현)는 위로 올려 읽는다
    if (typeof obj.ko !== 'string') {
        const inner = [obj.options_map, obj.optionsMap, obj.chips, obj.line, obj.lines].find((v) => v && typeof v === 'object' && typeof v.ko === 'string');
        if (inner) obj = { ...inner, insight: obj.insight ?? null };
    }

    const allowed = new Set(AI_LEVEL_KEYS.filter((k) => f.lv[k] != null && f.sides[k] && f.sides[k] !== 'at').map((k) => AI_PLACEHOLDER[k]));
    const reasons: string[] = [];
    const text = {} as Record<AiLineLocale, string>;
    for (const loc of WL_LINE_LOCALES) {
        const rawReasons = textIntegrityReasons(typeof obj[loc] === 'string' ? obj[loc] : '');
        if (rawReasons.length) { reasons.push(...rawReasons.map(r => `${loc}:${r}`)); continue; }
        const norm = normalizeLine(obj[loc]);
        if (norm.length < 8) { reasons.push(`${loc}:empty`); continue; }
        const t = trimLine(norm, loc);
        if (!t) { reasons.push(`${loc}:too-long:${lineLength(norm)}`); continue; }
        const r: string[] = [];
        r.push(...lineLocaleReasons(t, loc));
        for (const re of WL_LINE_FORBIDDEN) { const m = t.match(re); if (m) r.push(`${loc}:forbidden:${m[0]}`); }
        const braces = t.match(/\{[^{}]*\}/g) || [];
        const seen = new Set<string>();
        for (const b of braces) {
            if (!allowed.has(b)) r.push(`${loc}:placeholder:${b}`);
            else if (seen.has(b)) r.push(`${loc}:placeholder-twice:${b}`);
            seen.add(b);
        }
        if (/[{}]/.test(t.replace(/\{[^{}]*\}/g, ''))) r.push(`${loc}:stray-brace`);
        if (/…|\.\.\./.test(t)) r.push(`${loc}:ellipsis`);
        for (const c of sideClaims(t, loc)) if (f.sides[c.k] !== c.side) r.push(`${loc}:side:${c.raw}`);
        const g = checkNumberGrounding(t, f.factsText);
        for (const u of g.ungrounded) r.push(`${loc}:number:${u.raw}`);
        // 가격($)은 «정확히» 사실의 가격이어야 한다 — 공용 대조는 정수 1단위 차이를 내림 표기로 허용한다($216 ≈ $215). 레벨 가격은 행사가라 한 칸 틀리면 거짓이다
        for (const m of t.matchAll(DOLLAR_RE)) if (!dollarsIn(f.factsText).has(dollarVal(m[1]))) r.push(`${loc}:price:$${m[1]}`);
        if (!braces.length && !/\$\s?\d|\d%/.test(t)) r.push(`${loc}:no-fact`);
        if (r.length) { reasons.push(...r); continue; }
        text[loc] = t;
    }
    // 해석 한 줄은 «덧붙임»이다 — 없거나 검사를 못 넘으면 해석만 버리고 칩 줄은 그대로 저장한다
    //   (해석 때문에 칩 줄까지 실패하면 30분 쉬는 동안 지도가 바뀐 종목의 줄이 사라진다 · 10/20 실제 모델 시험에서 insight:null 재현).
    //   언어별로 통과한 것만 싣는다(사용자는 자기 언어 하나만 본다 — 영어 한도 초과로 한국어 해석까지 버리지 않게).
    let insight: Partial<Record<AiLineLocale, string>> | undefined;
    const insightReasons: string[] = [];
    if (obj.insight != null && (f.contextText || f.darkPool || f.implied)) {
        const cand: Partial<Record<AiLineLocale, string>> = {};
        for (const loc of WL_LINE_LOCALES) {
            const value = fitDepthLine(obj.insight?.[loc], loc);
            const r = checkDepthLine(value, loc, buildLineUserPrompt(f));
            insightReasons.push(...r.map(x => `${loc}:${x}`));
            if (!r.length) cand[loc] = String(value).trim();
        }
        if (Object.keys(cand).length) insight = cand;
    } else if (f.contextText || f.darkPool || f.implied) insightReasons.push('insight:null');
    if (reasons.length) return { ok: false, reasons };
    const insightRaw = obj.insight && typeof obj.insight === 'object'
        ? Object.fromEntries(WL_LINE_LOCALES.filter((l) => typeof obj.insight[l] === 'string').map((l) => [l, String(obj.insight[l]).slice(0, 120)])) as Partial<Record<AiLineLocale, string>>
        : null;
    return { ok: true, reasons: [], text, insight, insightReasons, insightRaw };
}
