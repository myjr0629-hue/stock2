/**
 * 종목 AI 글(Flow AI INTEL · Command 딥 분석)의 «자리표» — 글 속 수치는 모델이 쓰지 않고 코드가 채운다. 순수 함수만.
 *
 * ★2026-10-07 앱 강화 T5 / 0단계 발견: AI INTEL 글 «스퀴즈 99%·P/C 1.93·고래 프리미엄 $50.4M» 인데 같은 화면 패널은 «6%·1.62·+$158.5M».
 *   생성 시점 재료(조기 값)가 글에 박혔고, 서버는 가격 수준만 대조했다(lib/ai/flowNumbers) — P/C·스퀴즈·프리미엄·점수는 대상이 아니었다.
 * 지키는 것(guardianNumbers 와 같은 틀을 종목 글로 확장):
 *   ① 자리표 — 모델은 {PRICE}·{CALL_WALL}·{PC}·{SQUEEZE}… 로 쓴다. 값은 «화면이 보내 준 재료»(요청 flowData/snapshot)에서 온다.
 *   ② 출구 채움 — 나가기 직전에 «지금 요청한 화면의 값»(없으면 생성 때 값)으로 화면과 같은 표기로 채운다 → 글 숫자 = 화면 숫자.
 *   ③ 자동 자리표화 — 모델이 숫자를 직접 썼어도 생성 재료와 같은 값이면 코드가 자리표로 바꿔 저장한다.
 *   ④ 출구 대조 — 그래도 숫자로 남은 P/C·OPI·종합점수·스퀴즈는 «라벨 + 숫자»로 찾아 재료와 대조한다(가격 수준은 flowNumbers 가 한다).
 */
import { formatLevelPrice } from '@/lib/optionLevelGate';
import { splitSentences } from '@/lib/ai/trustLayer';

export type FLocale = 'ko' | 'en' | 'ja';

export const FLOW_TOKEN_KEYS = [
    'PRICE', 'CALL_WALL', 'PUT_FLOOR', 'MAX_PAIN', 'GAMMA_FLIP',
    'DIST_CALL', 'DIST_PUT', 'DIST_FLIP',
    'PC', 'OPI', 'COMPOSITE', 'SQUEEZE', 'NET_PREM', 'WHALE_PREM',
] as const;
export type FlowTokenKey = typeof FLOW_TOKEN_KEYS[number];
export type FlowTokens = Partial<Record<FlowTokenKey, number>>;

const fin = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[$,%\s]/g, '')) : NaN;
    return Number.isFinite(n) ? n : undefined;
};
const posv = (v: unknown): number | undefined => {
    const n = fin(v);
    return n !== undefined && n > 0 ? n : undefined;
};

function compact(o: FlowTokens): FlowTokens {
    const out: FlowTokens = {};
    for (const k of FLOW_TOKEN_KEYS) {
        const v = o[k];
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
}

/** 거리(%) — 현재가 대비 수준의 절대 거리. 화면(distToCall·distToPut)과 같은 식·같은 한 자리 */
const distPct = (level: number | undefined, price: number | undefined, base: 'price' | 'level' = 'price'): number | undefined =>
    level && price ? (Math.abs(level - price) / (base === 'level' ? level : price)) * 100 : undefined;

/** 1) 앱 Flow 화면이 보내는 flowData → 자리표 값(화면 상태에서 온 값) */
export function flowTokensFromFlowData(d: any): FlowTokens {
    const price = posv(d?.currentPrice);
    const callWall = posv(d?.position?.callWall);
    const putFloor = posv(d?.position?.putFloor);
    const flip = posv(d?.regime?.gammaFlipLevel);
    const whale = fin(d?.factors?.whale?.premiumUsd);
    return compact({
        PRICE: price,
        CALL_WALL: callWall,
        PUT_FLOOR: putFloor,
        MAX_PAIN: posv(d?.regime?.maxPain),
        GAMMA_FLIP: flip,
        DIST_CALL: distPct(callWall, price),
        DIST_PUT: distPct(putFloor, price),
        DIST_FLIP: distPct(flip, price, 'level'),
        PC: posv(d?.factors?.pcRatio?.value),
        OPI: fin(d?.factors?.opi?.value),
        COMPOSITE: fin(d?.compositeScore),
        SQUEEZE: fin(d?.factors?.squeeze?.probability),
        NET_PREM: fin(d?.netPremium),
        WHALE_PREM: whale,
    });
}

/** 2) Command 딥 분석 snapshot → 자리표 값 */
export function flowTokensFromDeepSnapshot(s: any): FlowTokens {
    const price = posv(s?.price);
    const st = s?.structure || {};
    const callWall = posv(st.callWall);
    const putFloor = posv(st.putFloor);
    const flip = posv(st.gammaFlipLevel);
    return compact({
        PRICE: price,
        CALL_WALL: callWall,
        PUT_FLOOR: putFloor,
        MAX_PAIN: posv(st.maxPain),
        GAMMA_FLIP: flip,
        DIST_CALL: distPct(callWall, price),
        DIST_PUT: distPct(putFloor, price),
        DIST_FLIP: distPct(flip, price, 'level'),
        PC: posv(st.pcRatio),
        NET_PREM: fin(s?.flow?.netPremium),
    });
}

const compactMoney = (n: number): string => {
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
    return `${sign}$${a.toFixed(0)}`;
};

/** 화면과 같은 표기 — 가격 «$239.24» · 수준 «$245»(formatLevelPrice, 앱 전체 한 규칙) · 거리 «0.4%» · P/C «0.62» · 점수 «+15» · 금액 «+$158.5M» */
export function formatFlowToken(key: FlowTokenKey, v: number): string {
    switch (key) {
        case 'PRICE': return `$${v.toFixed(2)}`;
        case 'CALL_WALL': case 'PUT_FLOOR': case 'MAX_PAIN': case 'GAMMA_FLIP': return `$${formatLevelPrice(v)}`;
        case 'DIST_CALL': case 'DIST_PUT': case 'DIST_FLIP': return `${v.toFixed(1)}%`;
        case 'PC': return v.toFixed(2);
        case 'OPI': return String(Math.round(v));
        case 'COMPOSITE': { const r = Math.round(v); return `${r > 0 ? '+' : ''}${r}`; }
        case 'SQUEEZE': return `${Math.round(v)}%`;
        case 'NET_PREM': return `${v >= 0 ? '+' : ''}${compactMoney(v)}`;
        case 'WHALE_PREM': return compactMoney(v);
    }
}

// ── ① 자리표 ────────────────────────────────────────────────────────────────
const KEYS_ALT = FLOW_TOKEN_KEYS.join('|');
// 모델이 «${PRICE}»·«{DIST_CALL}%» 처럼 단위를 또 붙이는 실수(10/7 생성 실측 «3.9%%») — 자리표 앞의 $·뒤의 % 는 자리표가 이미 품고 있으면 삼킨다
const TOKEN_RE = new RegExp(`(\\$?)\\{\\s*(${KEYS_ALT})\\s*\\}(\\s?%(?![A-Za-z]))?`, 'g');
const ANY_TOKEN_RE = /\{\s*[A-Z][A-Z0-9_]{1,24}\s*\}/g;

export function hasFlowTokens(text: string | null | undefined): boolean {
    return typeof text === 'string' && new RegExp(`\\{\\s*(?:${KEYS_ALT})\\s*\\}`).test(text);
}

export interface FlowFill { text: string; missing: string[]; unknown: boolean }

/** 자리표를 채운다. current(지금 화면 값) 우선, 없으면 basis(생성 때 값). 둘 다 없는 자리표는 남기고 missing 에 올린다. */
export function fillFlowTokens(text: string, current: FlowTokens | null | undefined, basis?: FlowTokens | null): FlowFill {
    const missing = new Set<string>();
    const out = String(text ?? '').replace(TOKEN_RE, (m: string, pre: string, k: FlowTokenKey, post: string | undefined) => {
        const v = current?.[k] ?? basis?.[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) { missing.add(k); return m; }
        const f = formatFlowToken(k, v);
        return `${f.startsWith('$') ? '' : pre}${f}${f.endsWith('%') ? '' : (post || '')}`;
    });
    ANY_TOKEN_RE.lastIndex = 0;
    const stillBraced = ANY_TOKEN_RE.test(out);
    return { text: out, missing: [...missing], unknown: stillBraced && missing.size === 0 };
}

/** 생성 프롬프트에 붙이는 자리표 규칙 — 값이 있는 자리표만, «지금 화면 값»을 같이 보여 줘 모델이 위·아래를 판단할 수 있게 */
export function flowTokenRules(tokens: FlowTokens): string {
    const rows: Array<[FlowTokenKey, string]> = [
        ['PRICE', 'current price'],
        ['CALL_WALL', 'call wall level'], ['PUT_FLOOR', 'put floor level'], ['GAMMA_FLIP', 'gamma flip level'], ['MAX_PAIN', 'max pain level'],
        ['DIST_CALL', 'distance from price to the call wall (unsigned %)'], ['DIST_PUT', 'distance from price to the put floor (unsigned %)'], ['DIST_FLIP', 'distance from price to the gamma flip (unsigned %)'],
        ['PC', 'put/call ratio (puts ÷ calls)'], ['OPI', 'OPI gauge (0-100, 50 = balanced)'], ['COMPOSITE', 'composite score (-100..+100)'],
        ['SQUEEZE', 'squeeze probability'], ['NET_PREM', 'net option premium (calls minus puts)'], ['WHALE_PREM', 'whale net premium'],
    ];
    const lines = rows.filter(([k]) => typeof tokens[k] === 'number').map(([k, label]) => `- {${k}} = ${formatFlowToken(k, tokens[k] as number)}  (${label})`);
    if (!lines.length) return '';
    return `\n<number_tokens>\nNUMBER TOKENS (mandatory): whenever you mention one of these quantities, write the token exactly, braces included — NEVER type the number yourself.\nThe app replaces each token with the live value shown on the user's screen, so the text and the screen always agree.\n${lines.join('\n')}\nTokens already include "$", "%", and the sign where shown. Do not add another "$" or "%" next to a token. Write a direction word (above/below/higher/lower) yourself, based on the values listed here, and only when it is true for them.\nONLY the tokens listed above exist — never invent another token (no {SMART_MONEY}, {OPI_SCORE}, {IV_SKEW} …). Every other number (sub-factor scores, counts, days to earnings, dates) is written as a plain number exactly as given in the data above.\n</number_tokens>`;
}

// ── ③ 숫자로 박힌 지표 찾기 (자동 자리표화·출구 대조 공용) ─────────────────────
interface LitPat { key: FlowTokenKey; re: RegExp; num: number; unit?: number }
// 라벨과 숫자 사이: 숫자·문장 끝·쉼표 없는 짧은 틈. «score»·«점수» 같은 말이 끼면 다른 양(구성 점수)이라 건너뛴다.
const GAP = '[^0-9\\n。!?.,;、，\\-+−]{0,8}';
// 라벨과 숫자 사이에 낀 말 — 구성 점수(score)이거나 문턱·범위(below/미만/between/사이 …)이면 «지금 값» 주장이 아니다
const SCORE_WORDS = /(score|점수|스코어|スコア|points?|pt|below|under|above|over|less|more|beyond|between|within|threshold|range|cutoff|미만|이하|이상|초과|아래|위|사이|범위|임계|문턱|未満|以下|以上|閾値|範囲|レンジ)/i;
/** 숫자 바로 뒤가 문턱·범위 표지(«0.75 미만»·«0.75~1.3»·«0.75 and 1.3»·«0.75 to») 이면 그 숫자는 문턱이다 */
const THRESHOLD_AFTER = /^\s*(?:미만|이하|이상|초과|이내|아래|未満|以下|以上|を下回|を上回|を超|[~～–—]\s*\d|-\s*\d|to\s+\d|and\s+\d|or (?:less|lower|below|more|higher|above)|\))/i;
const LIT: LitPat[] = [
    { key: 'PC', re: new RegExp(`(?:P\\/C|PC|[Pp]ut[\\/-][Cc]all|풋\\/?콜|プット\\/?コール)(?:\\s*(?:ratio|비율|比率|レシオ|比))?(${GAP})(\\d+\\.\\d{1,3})(?![\\d])(?!\\s*%)`, 'g'), num: 2 },
    { key: 'OPI', re: new RegExp(`\\bOPI(?:\\s*(?:gauge|게이지|ゲージ|value|값|値))?(${GAP})([+\\-−]?\\d{1,3})(?!\\d)(?!\\.\\d)(?!\\s*%)`, 'g'), num: 2 },
    { key: 'COMPOSITE', re: new RegExp(`(?:[Cc]omposite(?:\\s*(?:score|index))?|종합\\s*(?:수급\\s*)?(?:점수|지수|스코어)?|総合(?:需給)?(?:スコア|指数)?)(${GAP})([+\\-−]?\\d{1,3})(?!\\d)(?!\\.\\d)(?!\\s*%)`, 'g'), num: 2 },
    { key: 'SQUEEZE', re: new RegExp(`(?:[Ss]queeze(?:\\s*(?:probability|risk))?|스퀴즈(?:\\s*(?:확률|리스크|위험))?|スクイーズ(?:確率|リスク)?)(${GAP})(\\d{1,3}(?:\\.\\d+)?)\\s*%`, 'g'), num: 2 },
];

export interface FlowLiteral { key: FlowTokenKey; written: string; value: number; numIndex: number; numLength: number }

export function flowLiterals(text: string): FlowLiteral[] {
    const out: FlowLiteral[] = [];
    const s = String(text ?? '');
    for (const p of LIT) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(s))) {
            const gap = m[1] || '';
            if (SCORE_WORDS.test(gap)) continue;          // «OPI 스코어 -1»·«P/C below 0.75» — 점수·문턱은 지표 값이 아니다
            if (THRESHOLD_AFTER.test(s.slice(m.index + m[0].length, m.index + m[0].length + 14))) continue;
            const numStr = m[p.num];
            const value = Number(numStr.replace('−', '-'));
            if (!Number.isFinite(value)) continue;
            const numIndex = m.index + m[0].length - numStr.length - (p.key === 'SQUEEZE' ? (m[0].length - m[0].replace(/\s*%$/, '').length) : 0);
            out.push({ key: p.key, written: numStr.replace('−', '-'), value, numIndex, numLength: numStr.length });
        }
    }
    return out.sort((a, b) => a.numIndex - b.numIndex);
}

const decimalsOf = (s: string) => { const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
function litMatches(l: FlowLiteral, actual: number): boolean {
    const w = l.written.replace(/^[+-]/, '');
    const half = 0.5 * Math.pow(10, -decimalsOf(w)) + 1e-9;
    switch (l.key) {
        case 'PC': return Math.abs(l.value - actual) <= Math.max(0.015, half + 0.005);
        case 'OPI': case 'COMPOSITE': return Math.abs(l.value - actual) <= 1.01;
        case 'SQUEEZE': return Math.abs(l.value - actual) <= Math.max(1.01, half);
        default: return true;
    }
}

/** 숫자로 박힌 P/C·OPI·종합점수·스퀴즈를 재료 값과 대조 — 틀린 이유 목록(비면 통과). 재료에 없는 지표는 판정 안 함. */
export function checkFlowLiterals(text: string, tokens: FlowTokens | null | undefined): string[] {
    if (!tokens) return [];
    const bad: string[] = [];
    for (const l of flowLiterals(text)) {
        const actual = tokens[l.key];
        if (typeof actual !== 'number' || !Number.isFinite(actual)) continue;
        if (!litMatches(l, actual)) bad.push(`metric:${l.key}:${l.written}≠${formatFlowToken(l.key, actual)}`);
    }
    return bad;
}

/** 모델이 숫자를 직접 썼어도 재료와 같은 값이면 자리표로 바꿔 둔다. 가격·수준은 «표기가 정확히 같을 때만»(애매하면 그대로). */
export function tokenizeFlowLiterals(text: string, tokens: FlowTokens | null | undefined): string {
    const s = String(text ?? '');
    if (!tokens) return s;
    // ① 라벨 달린 지표
    const reps: Array<{ at: number; len: number; token: string }> = [];
    for (const l of flowLiterals(s)) {
        const actual = tokens[l.key];
        if (typeof actual !== 'number' || !litMatches(l, actual)) continue;
        // 부호가 필요한 자리표(COMPOSITE)는 «부호 있는 표기»만 바꾼다 — «15» 를 {COMPOSITE}(+15)로 바꾸면 부호가 생긴다
        if (l.key === 'COMPOSITE' && !/^[+-]/.test(l.written) && actual > 0) continue;
        // SQUEEZE 는 자리표가 % 를 품는다 — 숫자 뒤 % 까지 한 덩어리로 바꾼다
        const tail = l.key === 'SQUEEZE' ? (s.slice(l.numIndex + l.numLength).match(/^\s*%/)?.[0].length ?? 0) : 0;
        reps.push({ at: l.numIndex, len: l.numLength + tail, token: `{${l.key}}` });
    }
    // ② 가격·수준 — 표기가 같은 값만, 같은 표기를 가진 자리표가 둘 이상이면(콜 월 = 감마 플립 = $240) 건드리지 않는다
    const byText = new Map<string, FlowTokenKey[]>();
    for (const k of ['PRICE', 'CALL_WALL', 'PUT_FLOOR', 'MAX_PAIN', 'GAMMA_FLIP'] as FlowTokenKey[]) {
        const v = tokens[k];
        if (typeof v !== 'number') continue;
        const t = formatFlowToken(k, v);
        byText.set(t, [...(byText.get(t) || []), k]);
    }
    for (const [t, ks] of byText) {
        if (ks.length !== 1) continue;
        const re = new RegExp(`\\$\\s?${t.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(s))) {
            // 이미 자리표 안·단위 붙은 금액(«$245M»)은 건드리지 않는다
            if (/^[BMKT]\b|^\s?(?:million|billion|억|만|億|万)/i.test(s.slice(m.index + m[0].length, m.index + m[0].length + 8))) continue;
            reps.push({ at: m.index, len: m[0].length, token: `{${ks[0]}}` });
        }
    }
    if (!reps.length) return s;
    reps.sort((a, b) => a.at - b.at);
    let out = '', pos = 0;
    for (const r of reps) {
        if (r.at < pos) continue;
        out += s.slice(pos, r.at) + r.token;
        pos = r.at + r.len;
    }
    return out + s.slice(pos);
}


/**
 * 모델이 지어낸 자리표({SMART_MONEY}·{OPI_SCORE} 등 목록에 없는 이름)가 든 문장을 뺀다 — 값을 알 수 없으므로 그 문장은 쓸 수 없다.
 * 남은 글이 쓸 만하면(15자 이상·원문의 35% 이상) usable. 목록에 있는 자리표({PC} 등)는 건드리지 않는다.
 */
export function stripUnknownTokenSentences(text: string): { text: string; removed: string[]; usable: boolean } {
    const removed: string[] = [];
    const known = new RegExp(`^(?:${KEYS_ALT})$`);
    const hasUnknown = (sent: string) => {
        const re = /\{\s*([A-Z][A-Z0-9_]{1,24})\s*\}/g; let m: RegExpExecArray | null;
        while ((m = re.exec(sent))) if (!known.test(m[1])) return true;
        return false;
    };
    const kept = splitSentences(text).filter((s) => { if (hasUnknown(s)) { removed.push(s); return false; } return true; });
    const out = kept.join(' ').trim();
    const plain = (t: string) => t.replace(/\s+/g, '');
    return { text: removed.length ? out : text, removed, usable: removed.length === 0 || (plain(out).length >= 15 && plain(out).length >= 0.35 * plain(text).length) };
}
