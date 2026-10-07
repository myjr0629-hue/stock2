/**
 * 가디언 AI 문구(TACTICAL·RLSI INSIGHT·감마 브리프) — «글 속 시장 숫자 = 같은 화면의 숫자». 순수 함수만(네트워크·Redis 없음).
 *
 * ★2026-10-04 운영 실측(주말, 값 고정): 텍스트 칸 × 3개 국어 12행 중 4행 불일치.
 *   ko TACTICAL «나스닥 +0.94%·금 -0.72%·유가 -1.73%» — 같은 응답의 화면 값은 +0.98%·-0.95%·-1.90%.
 *   ko·ja «RLSI 41점» — 화면 37.9(게이지 38). en 은 «RLSI 37». 언어마다 생성 시점이 달라 언어끼리도 숫자가 달랐다.
 * 메커니즘: 생성 시점(금요일 장중) 값이 글에 박혔고, 저장(guardian:gemini 12시간 · guardian:ai_verdict 24시간)에
 *   입력 기준이 없어 원천 값이 마감 값으로 바뀐 뒤에도 그대로 나갔다. 출구 검사는 언어·거절·마크다운·연도뿐이었다.
 * 지키는 것(flowNumbers·earningsBrief 와 같은 틀):
 *   ① 자리표 — 모델은 나스닥·S&P·금·유가 변동률, VIX, DXY, 10년물, RLSI 를 {NDX_CHG} 같은 자리표로 쓴다.
 *      모델이 숫자를 직접 써도 생성 재료와 같은 값이면 코드가 자리표로 바꿔 둔다(tokenizeGuardianLiterals).
 *   ② 출구 채움 — 화면으로 나가기 직전에 «같은 응답의 화면 값»으로, 화면과 같은 표기(formatGNum)로 채운다.
 *      생성 때 값(basis)과 지금 값의 방향이 뒤집혔거나 크게 움직였으면 그 글의 서술(«상승»·«취약»)이 틀리므로 쓰지 않는다.
 *   ③ 출구 대조 — 그래도 숫자로 박힌 지표(옛 저장본·모델이 자리표를 안 쓴 글)는 화면 값과 대조한다
 *      (변동률 ±0.02%p — 정수·소수 한 자리 반올림 표기는 그 자릿수만큼 허용 · 점수 ±1 · 수준 ±1.5% · 방향 일치).
 *      «VIX 가 20 을 넘으면» 같은 문턱 문장은 대조하지 않는다.
 */

export type GLocale = 'ko' | 'en' | 'ja';
// ★2026-10-07 앱 강화 T5 — 자리표 확대: GEX·스퀴즈·참여폭(Breadth)·TLT·비트코인. (보고서 §5.2 ① «guardianNumbers 키 8개에 GEX·breadth·스퀴즈 없음»)
export const G_KEYS = ['NDX_CHG', 'SPX_CHG', 'GOLD_CHG', 'OIL_CHG', 'VIX', 'DXY', 'US10Y', 'RLSI', 'GEX', 'SQUEEZE', 'BREADTH', 'TLT_CHG', 'BTC_CHG'] as const;
export type GKey = typeof G_KEYS[number];
export type GNums = Partial<Record<GKey, number>>;

const CHG_KEYS: ReadonlySet<GKey> = new Set<GKey>(['NDX_CHG', 'SPX_CHG', 'GOLD_CHG', 'OIL_CHG', 'TLT_CHG', 'BTC_CHG']);
const KEYS_ALT = G_KEYS.join('|');

const fin = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
};
const posv = (v: unknown): number | undefined => {
    const n = fin(v);
    return n !== undefined && n > 0 ? n : undefined;
};
function compact(o: GNums): GNums {
    const out: GNums = {};
    for (const k of G_KEYS) {
        const v = o[k];
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
}

/**
 * 화면 값 — GuardianContext.market(+ rlsi.score). 생성 재료(computeGuardianSnapshot 의 macro)도 같은 모양이라
 * 이 함수 하나로 «생성 기준»과 «화면»을 같은 필드에서 읽는다.
 */
export function guardianNumsFromMarket(m: any, rlsiScore: unknown, extra?: { gexIndex?: unknown; squeezeRisk?: unknown; breadthPct?: unknown }): GNums {
    return compact({
        NDX_CHG: fin(m?.nqChangePercent) ?? fin(m?.factors?.nasdaq100?.chgPct),
        SPX_CHG: fin(m?.factors?.spx?.chgPct),
        GOLD_CHG: fin(m?.factors?.gold?.chgPct),
        OIL_CHG: fin(m?.factors?.oil?.chgPct),
        VIX: posv(m?.vix) ?? posv(m?.factors?.vix?.level),
        DXY: posv(m?.dxy) ?? posv(m?.factors?.dxy?.level),
        US10Y: posv(m?.factors?.us10y?.level) ?? posv(m?.yieldCurve?.us10y) ?? posv(m?.us10y),
        RLSI: fin(rlsiScore),
        TLT_CHG: fin(m?.tltChangePct),
        BTC_CHG: fin(m?.factors?.btc?.chgPct),
        GEX: fin(extra?.gexIndex),
        SQUEEZE: fin(extra?.squeezeRisk),
        BREADTH: fin(extra?.breadthPct),
    });
}

/** 같은 응답의 화면 값 — 시장(market)·RLSI·감마 쉴드·참여폭(정규장에서만 의미) 한 곳에서 */
export function guardianNumsFromContext(ctx: any): GNums {
    const reg = ctx?.rlsi?.session === 'REG';
    return guardianNumsFromMarket(ctx?.market, ctx?.rlsi?.score, {
        gexIndex: ctx?.gammaShield?.gexIndex,
        squeezeRisk: ctx?.gammaShield?.squeezeRisk,
        breadthPct: reg ? ctx?.rlsi?.components?.breadthPct : undefined,
    });
}

/** 생성 프롬프트에 실제로 들어간 값(IntelligenceContext) — 자리표 규칙·자동 자리표화·basis 의 기준 */
export function guardianNumsFromAiContext(c: any): GNums {
    return compact({
        NDX_CHG: fin(c?.nasdaqChange),
        SPX_CHG: fin(c?.spxChangePct),
        GOLD_CHG: fin(c?.goldChangePct),
        OIL_CHG: fin(c?.oilChangePct),
        VIX: posv(c?.vix),
        DXY: posv(c?.dxy),
        US10Y: posv(c?.us10y),
        RLSI: fin(c?.rlsiScore),
        TLT_CHG: fin(c?.tltChangePct),
        BTC_CHG: fin(c?.btcChangePct),
        GEX: fin(c?.gexIndex),
        SQUEEZE: fin(c?.squeezeRisk),
        BREADTH: fin(c?.breadthPct),
    });
}

/** 화면과 같은 표기 — 변동률 «+0.98%»(소수 둘째)·10년물 «5.28%»·VIX/DXY «15.3»·RLSI «38»(게이지처럼 반올림 정수) */
export function formatGNum(key: GKey, v: number): string {
    if (CHG_KEYS.has(key)) {
        const r = Math.round(v * 100) / 100;
        return `${r > 0 ? '+' : r < 0 ? '-' : ''}${Math.abs(r).toFixed(2)}%`;
    }
    if (key === 'US10Y') return `${v.toFixed(2)}%`;
    if (key === 'RLSI') return String(Math.round(v));
    if (key === 'GEX') { const r = Math.round(v); return `${r > 0 ? '+' : ''}${r}`; }
    if (key === 'SQUEEZE' || key === 'BREADTH') return `${Math.round(v)}%`;
    return v.toFixed(1);
}

// ── ① 자리표 ────────────────────────────────────────────────────────────────
const TOKEN_RE = new RegExp(`\\{\\s*(${KEYS_ALT})\\s*\\}(\\s?%(?![p\\w]))?`, 'g');
const UNKNOWN_TOKEN_RE = /\{\s*[A-Z][A-Z0-9_]{1,24}\s*\}/;

export function hasGuardianTokens(text: string | null | undefined): boolean {
    return typeof text === 'string' && new RegExp(`\\{\\s*(?:${KEYS_ALT})\\s*\\}`).test(text);
}

const RULE_LABEL: Record<GLocale, Record<GKey, string>> = {
    ko: { NDX_CHG: '나스닥 변동률', SPX_CHG: 'S&P 500 변동률', GOLD_CHG: '금 변동률', OIL_CHG: '유가(WTI) 변동률', VIX: 'VIX', DXY: '달러 인덱스(DXY)', US10Y: '미국 10년물 금리', RLSI: 'RLSI 점수', GEX: 'GEX 지수', SQUEEZE: '스퀴즈 리스크', BREADTH: '시장 참여폭(Breadth) 상승 비율', TLT_CHG: '채권 ETF(TLT) 변동률', BTC_CHG: '비트코인 변동률' },
    en: { NDX_CHG: 'NASDAQ change', SPX_CHG: 'S&P 500 change', GOLD_CHG: 'Gold change', OIL_CHG: 'Oil (WTI) change', VIX: 'VIX', DXY: 'Dollar index (DXY)', US10Y: 'US 10-year yield', RLSI: 'RLSI score', GEX: 'GEX index', SQUEEZE: 'Squeeze risk', BREADTH: 'Market breadth (advancing share)', TLT_CHG: 'TLT change', BTC_CHG: 'Bitcoin change' },
    ja: { NDX_CHG: 'ナスダック変動率', SPX_CHG: 'S&P 500変動率', GOLD_CHG: '金の変動率', OIL_CHG: '原油(WTI)変動率', VIX: 'VIX', DXY: 'ドル指数(DXY)', US10Y: '米10年債利回り', RLSI: 'RLSIスコア', GEX: 'GEX指数', SQUEEZE: 'スクイーズリスク', BREADTH: 'ブレッドス(上昇銘柄比率)', TLT_CHG: 'TLT変動率', BTC_CHG: 'ビットコイン変動率' },
};

/** 생성 프롬프트 끝에 붙이는 자리표 규칙 — 값이 있는 지표만 */
export function guardianTokenRules(loc: GLocale, nums: GNums): string {
    const keys = G_KEYS.filter((k) => typeof nums[k] === 'number');
    if (!keys.length) return '';
    const lines = keys.map((k) => `- ${RULE_LABEL[loc][k]} (${formatGNum(k, nums[k] as number)}) → {${k}}`).join('\n');
    if (loc === 'ko') {
        return `\n\n[숫자 자리표 — 반드시 지킨다]\n아래 지표의 값을 본문에 쓸 때는 숫자를 직접 쓰지 말고 오른쪽 자리표를 중괄호까지 그대로 쓴다. 화면에 나갈 때 화면과 같은 최신 값으로 바뀐다.\n${lines}\n자리표에는 부호와 %가 이미 들어 있다(예: «나스닥 {NDX_CHG} 상승», «RLSI {RLSI}점», «10년물 금리 {US10Y}»). 자리표 뒤에 %를 다시 붙이지 않는다. 그 밖의 숫자(섹터 수치·옵션 가격대·GEX 등)는 데이터 값 그대로 쓴다.`;
    }
    if (loc === 'ja') {
        return `\n\n[数値プレースホルダー — 必ず守る]\n次の指標の値を本文に書くときは数字を直接書かず、右側のプレースホルダーを波かっこごとそのまま書く。表示時に画面と同じ最新値に置き換わる。\n${lines}\nプレースホルダーには符号と%がすでに含まれる(例:「ナスダック{NDX_CHG}」「RLSI {RLSI}点」「米10年債利回り{US10Y}」)。プレースホルダーの後ろに%を付けない。それ以外の数字(セクター数値・オプション価格帯・GEXなど)はデータの値どおりに書く。`;
    }
    return `\n\n[Number placeholders — mandatory]\nWhen you mention any metric below, do not write its number; write the placeholder on the right exactly, braces included. It is replaced with the same live value the screen shows.\n${lines}\nPlaceholders already include the sign and % (e.g. "NASDAQ {NDX_CHG}", "RLSI at {RLSI}", "the 10-year at {US10Y}"). Do not add another %. Write every other number (sector figures, option levels, GEX) exactly as given in the data.`;
}

/** 생성 때 값과 지금 값 — 글의 서술(«상승»·«취약»)이 더는 맞지 않을 만큼 움직였는가 */
function staleMove(key: GKey, basis: number, now: number): boolean {
    if (CHG_KEYS.has(key)) {
        const flip = Math.abs(basis) >= 0.05 && Math.abs(now) >= 0.05 && Math.sign(basis) !== Math.sign(now);
        return flip || Math.abs(now - basis) >= 0.75;
    }
    if (key === 'RLSI') {
        const band = (s: number) => (s >= 65 ? 2 : s >= 45 ? 1 : 0); // 프롬프트의 «건강·중립·취약» 경계
        return band(basis) !== band(now) || Math.abs(now - basis) >= 8;
    }
    if (key === 'VIX') {
        const band = (v: number) => (v >= 25 ? 2 : v >= 18 ? 1 : 0); // 프롬프트의 «공포·경계·안정» 경계
        return band(basis) !== band(now);
    }
    if (key === 'GEX') {
        // 프롬프트의 «GEX ±20 = 딜러 감마 방어/증폭» 경계를 넘었거나 부호가 뒤집힘
        const band = (v: number) => (v >= 20 ? 2 : v <= -20 ? 0 : 1);
        return band(basis) !== band(now) || Math.abs(now - basis) >= 15;
    }
    if (key === 'SQUEEZE') {
        const band = (v: number) => (v >= 55 ? 2 : v >= 30 ? 1 : 0); // 프롬프트의 «임계·축적·안정» 경계
        return band(basis) !== band(now);
    }
    if (key === 'BREADTH') return Math.abs(now - basis) >= 10;
    return false;
}

export interface GFill { ok: boolean; text: string; reasons: string[] }

/** 자리표를 화면 값으로 채운다. 값이 없는 자리표·모르는 자리표·서술이 낡은 자리표가 있으면 ok=false. */
export function fillGuardianTokens(text: string, nums: GNums | null | undefined, basis?: GNums | null): GFill {
    const reasons = new Set<string>();
    const out = String(text ?? '').replace(TOKEN_RE, (m: string, k: GKey) => {
        const v = nums?.[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) { reasons.add(`token-missing:${k}`); return m; }
        const b = basis?.[k];
        if (typeof b === 'number' && Number.isFinite(b) && staleMove(k, b, v)) reasons.add(`token-stale:${k}:${formatGNum(k, b)}→${formatGNum(k, v)}`);
        return formatGNum(k, v);
    });
    if (UNKNOWN_TOKEN_RE.test(out)) reasons.add('token-unknown');
    return { ok: reasons.size === 0, text: out, reasons: [...reasons] };
}

// ── ③ 숫자로 박힌 지표 찾기 ─────────────────────────────────────────────────
type Kind = 'chg' | 'level' | 'score';
interface MetricPat { key: GKey; kind: Kind; re: RegExp }
// (지표 이름)(사이 — 숫자·문장 끝 없음)(숫자)(단위). 사이에 숫자가 끼면 «5일 +2.1%»처럼 다른 숫자라 대조하지 않는다.
// 쉼표·마침표(절·문장 경계)도 넘지 않는다 — «나스닥은 상승, 금은 -0.95%» 의 -0.95% 는 나스닥 값이 아니다.
const GAP = '[^0-9\\n。!?.,;、，]';
// 사이에 다른 지표 이름이 끼면 그 숫자는 그 지표의 것이다
const OTHER_NAME = /(나스닥|NASDAQ|Nasdaq|ナスダック|S&P|SPX|(?<![가-힣])금(?![리융요액지주년일번속])|금값|\b[Gg]old\b|ゴールド|유가|원유|WTI|\b[Oo]il\b|原油|VIX|DXY|달러|ドル|RLSI|10년물|10Y|10-?[Yy]ear|10年|GEX|[Ss]queeze|스퀴즈|スクイーズ|[Bb]readth|참여폭|ブレッドス|TLT|BTC|[Bb]itcoin|비트코인|ビットコイン)/;
const NUM_PCT = '([+\\-−]?\\d+(?:\\.\\d+)?)(\\s?%)';
const NUM_PLAIN = '(\\d+(?:\\.\\d+)?)(?![\\d.,]|\\s?%|\\s?(?:bp|일|日|day))()';
const NUM_SIGNED_PLAIN = '([+\\-−]?\\d+(?:\\.\\d+)?)(?![\\d.,]|\\s?%|\\s?(?:bp|일|日|day|[MBK]\\b))()';
const METRICS: MetricPat[] = [
    { key: 'NDX_CHG', kind: 'chg', re: new RegExp(`(나스닥|NASDAQ|Nasdaq|ナスダック|NDX)((?:\\s?100)?${GAP}{0,14}?)${NUM_PCT}`, 'g') },
    { key: 'SPX_CHG', kind: 'chg', re: new RegExp(`(S&P\\s?500|S&P|SPX)(${GAP}{0,14}?)${NUM_PCT}`, 'g') },
    { key: 'GOLD_CHG', kind: 'chg', re: new RegExp(`((?<![가-힣])금(?![리융요액지주년일번속])|금값|\\b[Gg]old\\b|(?<![資賃代現預基年税料])金(?![利融曜額])|ゴールド)(${GAP}{0,14}?)${NUM_PCT}`, 'g') },
    { key: 'OIL_CHG', kind: 'chg', re: new RegExp(`(유가|원유|WTI|\\b[Oo]il\\b|\\b[Cc]rude\\b|原油|石油)(${GAP}{0,14}?)${NUM_PCT}`, 'g') },
    { key: 'US10Y', kind: 'level', re: new RegExp(`(10년물|10년\\s?만기|10년\\s?국채|US\\s?10Y|\\b10Y\\b|10-?[Yy]ear|10年債|10年物|10年国債)(${GAP}{0,16}?)(\\d+(?:\\.\\d+)?)(\\s?%)`, 'g') },
    { key: 'VIX', kind: 'level', re: new RegExp(`(VIX)(${GAP}{0,10}?)${NUM_PLAIN}`, 'g') },
    { key: 'DXY', kind: 'level', re: new RegExp(`(DXY|달러\\s?인덱스|달러\\s?지수|달러\\s?강세|달러\\s?약세|ドル指数|ドルインデックス|ドル高|ドル安|[Dd]ollar [Ii]ndex)(${GAP}{0,10}?)(\\d{2,3}(?:\\.\\d+)?)(?![\\d.,]|\\s?%)()`, 'g') },
    { key: 'RLSI', kind: 'score', re: new RegExp(`(RLSI)(${GAP}{0,10}?)${NUM_PLAIN}`, 'g') },
    // ★2026-10-07 확대 — GEX(부호 있는 정수 지수)·스퀴즈 %·참여폭 %·TLT·비트코인 변동률
    { key: 'GEX', kind: 'score', re: new RegExp(`(GEX(?:\\s?(?:지수|index|Index|指数))?)(${GAP}{0,10}?)${NUM_SIGNED_PLAIN}`, 'g') },
    { key: 'SQUEEZE', kind: 'score', re: new RegExp(`([Ss]queeze(?:\\s?(?:risk|probability))?|스퀴즈(?:\\s?(?:리스크|확률|위험))?|スクイーズ(?:リスク|確率)?)(${GAP}{0,12}?)(\\d+(?:\\.\\d+)?)(\\s?%)`, 'g') },
    { key: 'BREADTH', kind: 'score', re: new RegExp(`([Bb]readth|시장\\s?참여폭|참여폭|ブレッドス)(${GAP}{0,12}?)(\\d+(?:\\.\\d+)?)(\\s?%)`, 'g') },
    { key: 'TLT_CHG', kind: 'chg', re: new RegExp(`(TLT)(${GAP}{0,14}?)${NUM_PCT}`, 'g') },
    { key: 'BTC_CHG', kind: 'chg', re: new RegExp(`(비트코인|[Bb]itcoin|BTC|ビットコイン)(${GAP}{0,14}?)${NUM_PCT}`, 'g') },
];

// 문턱·가정 문장(«VIX 가 20 을 넘으면» · «if VIX rises above 20» · «5.30%を超えて»)은 지금 값이 아니다
const THRESHOLD_BEFORE = /(above|below|over|under|beyond|past|toward|reach|breaks?|cross|reclaim|threshold|level of|넘|돌파|이상|이하)/i;
const THRESHOLD_AFTER = /^\s?(?:점|pt|points?|点)?\s?(?:[을를이가은는의]|선|대|수준|레벨)?\s?(?:넘|돌파|회복|웃돌|밑돌|하회|상회|이상|이하|아래로|위로|에 도달|에서 저항|threshold|level|mark|line|を超|を上回|を下回|以上|以下|を割|割れ|突破|回復|台)/i;
const UP_WORDS = /(상승|올라|오른|오르|강세|반등|급등|rose|rise|gain|up\b|climb|advanc|rall|jump|上昇|高く|上げ|反発)/i;
const DOWN_WORDS = /(하락|내린|내려|약세|떨어|급락|fell|fall|drop|declin|down\b|slid|lost|lower|下落|安く|下げ|続落)/i;

function decimalsOf(s: string): number {
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}
function tolFor(kind: Kind, written: string, actual: number): number {
    const half = 0.5 * Math.pow(10, -decimalsOf(written)) + 1e-9;
    if (kind === 'chg') return Math.max(0.02, half + 0.005);   // 소수 둘째 ±0.02%p · 한 자리 ±0.055 · 정수 ±0.505
    if (kind === 'score') return Math.max(1, half);            // 점수 ±1
    return Math.max(Math.abs(actual) * 0.015, half);           // 수준 ±1.5%
}

export interface GLiteral { key: GKey; written: string; value: number; index: number; numIndex: number; numLength: number; ctx: string }

/** 글 속에서 «지표 이름 + 숫자»로 박힌 값을 찾는다(문턱·가정 문장 제외). */
export function guardianLiterals(text: string): GLiteral[] {
    const out: GLiteral[] = [];
    const s = String(text ?? '');
    for (const p of METRICS) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(s))) {
            const [all, name, gap, numStr, unit = ''] = m;
            if (THRESHOLD_BEFORE.test(gap) || OTHER_NAME.test(gap)) continue;
            const end = m.index + all.length;
            if (THRESHOLD_AFTER.test(s.slice(end, end + 14))) continue;
            const value = Number(numStr.replace('−', '-'));
            if (!Number.isFinite(value)) continue;
            const numIndex = m.index + name.length + gap.length;
            out.push({ key: p.key, written: numStr.replace('−', '-'), value, index: m.index, numIndex, numLength: numStr.length + unit.length, ctx: s.slice(Math.max(0, m.index - 6), end + 10) });
        }
    }
    return out.sort((a, b) => a.numIndex - b.numIndex);
}

function literalMatches(l: GLiteral, actual: number, text: string): boolean {
    const kind: Kind = CHG_KEYS.has(l.key) ? 'chg' : (l.key === 'RLSI' || l.key === 'GEX' || l.key === 'SQUEEZE' || l.key === 'BREADTH') ? 'score' : 'level';
    const tol = tolFor(kind, l.written.replace(/^[+-]/, ''), actual);
    if (kind !== 'chg') return Math.abs(l.value - actual) <= tol;
    const explicitSign = /^[+-]/.test(l.written);
    if (explicitSign) {
        if (Math.abs(l.value - actual) > tol) return false;
        return !(Math.abs(actual) >= 0.05 && Math.abs(l.value) >= 0.05 && Math.sign(l.value) !== Math.sign(actual));
    }
    if (Math.abs(Math.abs(l.value) - Math.abs(actual)) > tol) return false;
    // 부호 없는 «0.98% 상승» — 방향어가 실제 방향과 맞아야 한다
    if (Math.abs(actual) >= 0.05) {
        const around = text.slice(Math.max(0, l.numIndex - 12), l.numIndex + l.numLength + 10);
        if (actual > 0 && DOWN_WORDS.test(around) && !UP_WORDS.test(around)) return false;
        if (actual < 0 && UP_WORDS.test(around) && !DOWN_WORDS.test(around)) return false;
    }
    return true;
}

/** 숫자로 박힌 지표를 화면 값과 대조 — 틀린 이유 목록(비면 통과). 화면 값이 없는 지표는 판정하지 않는다. */
export function checkGuardianLiterals(text: string, nums: GNums | null | undefined): string[] {
    if (!nums) return [];
    const bad: string[] = [];
    for (const l of guardianLiterals(text)) {
        const actual = nums[l.key];
        if (typeof actual !== 'number' || !Number.isFinite(actual)) continue;
        if (!literalMatches(l, actual, text)) bad.push(`literal:${l.key}:${l.written}≠${formatGNum(l.key, actual)}`);
    }
    return bad;
}

/**
 * 생성 직후 — 모델이 자리표 대신 숫자를 썼더라도, 생성 재료와 같은 값이면 그 숫자를 자리표로 바꿔 둔다.
 * (다른 값이면 그대로 둔다 — 출구 대조가 판정한다.)
 */
export function tokenizeGuardianLiterals(text: string, nums: GNums | null | undefined): string {
    const s = String(text ?? '');
    if (!nums) return s;
    const hits = guardianLiterals(s).filter((l) => {
        const actual = nums[l.key];
        return typeof actual === 'number' && Number.isFinite(actual) && literalMatches(l, actual, s)
            // 부호 없는 변동률(«0.98% 상승»)은 자리표(부호 포함)로 바꾸면 «+0.98% 상승»이 된다 — 부호가 있을 때만 바꾼다
            && (!CHG_KEYS.has(l.key) || /^[+-]/.test(l.written));
    });
    let out = '';
    let pos = 0;
    for (const h of hits) {
        if (h.numIndex < pos) continue;
        out += s.slice(pos, h.numIndex) + `{${h.key}}`;
        pos = h.numIndex + h.numLength;
    }
    return out + s.slice(pos);
}

/** 출구 한 번에: 자리표 채움(+ 낡은 서술 판정) → 숫자로 박힌 지표 대조. */
export function guardianNumbersGate(text: string, nums: GNums | null | undefined, basis?: GNums | null): GFill {
    const f = fillGuardianTokens(text, nums, basis);
    const lit = checkGuardianLiterals(f.text, nums);
    return { ok: f.ok && lit.length === 0, text: f.text, reasons: [...f.reasons, ...lit] };
}


// ── ★2026-10-07 앱 강화 T5 — 재료 완결·비교 판정 재료 ─────────────────────────────

/**
 * 가디언 AI 생성 재료가 «끝까지 온» 것인가. 시장 데이터(VIX 등)가 안 온 조기 재료로 만든 글이 화면과 어긋나는 사고를 막는다.
 * 필수: RLSI 점수(유한값)·VIX(양수). 없으면 생성하지 않고 마지막 정상본을 유지한다.
 */
export function guardianMaterialIssues(nums: GNums | null | undefined): string[] {
    const r: string[] = [];
    if (typeof nums?.RLSI !== 'number' || !Number.isFinite(nums.RLSI)) r.push('rlsi');
    if (typeof nums?.VIX !== 'number' || !(nums.VIX > 0)) r.push('vix');
    return r;
}

/** 문턱·범위 문장(lib/ai/trustLayer) 판정에 쓰는 «지금 값» */
export function guardianCmpFacts(nums: GNums | null | undefined): { RLSI?: number; VIX?: number; GEX?: number; SQUEEZE?: number; BREADTH?: number; DXY?: number; US10Y?: number } {
    if (!nums) return {};
    return { RLSI: nums.RLSI, VIX: nums.VIX, GEX: nums.GEX, SQUEEZE: nums.SQUEEZE, BREADTH: nums.BREADTH, DXY: nums.DXY, US10Y: nums.US10Y };
}
