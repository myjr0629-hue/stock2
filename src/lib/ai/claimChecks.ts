/**
 * AI 문장의 «숫자 주어»·«방향 부호» 검사 — 가디언 Tactical·내 종목 해석이 같이 쓴다(순수 함수, tests/aiDepthMacro.test.ts).
 *
 * 왜 (운영 10/20 실제 모델 예시 결함):
 *   ① 고아 숫자 — «미국 10년물 금리 5.15%를 지탱하고 있으며, 이는 -0.74% 하락과 일치한다»: −0.74% 가 무엇(TLT)의 값인지 문장에 없다.
 *   ② 방향 모순 — «나스닥 +0.19%와 49% 참여폭은 약세»: 양수 등락을 «약세»로 서술.
 *   숫자 대조(depthNumbers)는 «값이 근거에 있나»만 보고, 그 값이 «누구의 값인지»·«방향 말과 맞는지»는 보지 않았다.
 *
 * 규칙
 *   · 고아 숫자: 숫자마다 «앞(직전 숫자 뒤~이 숫자)» 또는 «바로 뒤(조사·of·の 다음 첫 낱말)»에 지표 이름(주어)이 있어야 한다.
 *     같은 절(쉼표·마침표·세미콜론) 안에서만 본다. 시각(08:30)·날짜(10/20)·연도·지수 이름 속 숫자(S&P 500·10년물)·1~10 단독 정수는 면제.
 *   · 방향 부호: 부호(+/−)를 붙인 숫자는 그 뒤 첫 방향어(같은 마디 안)와 부호가 같아야 한다 — 뒤에 없으면 바로 앞 12자 안의 방향어.
 *     마디는 절 부호와 대조 접속어(에도 불구하고·반면·despite·while·一方…)로 나눈다. 반대 부호 숫자가 사이에 끼면 판정하지 않는다.
 *   모르는 모양은 판정하지 않는다(방향어 없음 = 통과). 지표 이름 사전은 닫힌 목록 — 없는 이름이면 탈락(교정 재생성)으로 실패한다.
 */

type Loc = 'ko' | 'en' | 'ja';

/** 숫자처럼 보이지만 «값»이 아닌 표기 — 같은 길이의 공백으로 가린다(위치 보존) */
const MASKS: RegExp[] = [
    /\b\d{4}-\d{2}-\d{2}\b/g, /(?<![\d.])\d{1,2}:\d{2}(?::\d{2})?(?!\d)/g, /(?<![\d.:/$])\d{1,2}\/\d{1,2}(?![\d/])/g,
    /\d{1,2}\s*(?:월|月)\s*\d{1,2}\s*(?:일|日)/g, /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi,
    /S&P\s?500/gi, /NASDAQ[\s-]?100/gi, /Russell\s?2000/gi, /Dow\s?30/gi, /Nikkei\s?225/gi,
    /(?<![\d.])\d{1,2}(?:-|\s)?(?:year|yr|Y)\b/gi, /(?<![\d.])\d{1,2}\s?년물/g, /(?<![\d.])\d{1,2}\s?年(?:債|物)/g, /\b2s10s\b/gi,
    /\bQ[1-4]\b/g, /\b13[FDG]\b/g, /Form\s?\d+/gi, /\bD-\d{1,2}\b/g, /\b(?:19|20)\d{2}\b/g, /\bHH:MM\b/g,
];

function mask(text: string): string {
    let t = text;
    for (const re of MASKS) t = t.replace(re, (m) => ' '.repeat(m.length));
    return t;
}

/** 값 숫자: 부호·통화·단위 포함 */
const VALUE_RE = /([+\-−±＋－]?)(\$|US\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s?(?:%p|%|bps?|bp|pts?|pp|[xX×]|[KMBT]\b|million|billion))?/g;   // 달러·ドル은 단위로 먹지 않는다(«101.8 달러 인덱스»의 주어)

export interface ValueToken { raw: string; index: number; end: number; sign: 1 | -1 | 0; exempt: boolean; /** 변화량 단위(%·bp·pp·pt) — 방향 검사는 이것만 */ change: boolean }

export function valueTokens(text: string): ValueToken[] {
    const src = mask(text);
    const out: ValueToken[] = [];
    for (const m of src.matchAll(VALUE_RE)) {
        const idx = m.index!;
        const before = src[idx - 1] || '';
        if (/[A-Za-z0-9_.]/.test(before)) continue;                  // 단어·소수 중간(«GPT4»·«1.5»의 5)
        const [raw, signRaw, cur, num, unit] = m;
        const marked = !!(cur || unit || num.includes('.') || signRaw);
        const n = Number(num.replace(/,/g, ''));
        const exempt = !marked && Number.isInteger(n) && n >= 0 && n <= 10;
        const sign: 1 | -1 | 0 = signRaw === '+' || signRaw === '＋' ? 1 : signRaw && signRaw !== '±' ? -1 : 0;
        const change = !!unit && /%|bp|pp|pt/i.test(unit);
        out.push({ raw: raw.trim(), index: idx, end: idx + raw.length, sign, exempt, change });
    }
    return out;
}

/** 지표·대상 이름(주어) — 닫힌 목록. 대문자 티커·약어(2~5자)는 따로 인정한다. */
const SUBJECT_EN = ['yields?', 'treasur\\w*', 'bonds?', 'S&P', 'SPX', 'nasdaq', 'dow', 'russell', 'breadth', 'participation', 'A/D',
    'gamma', 'GEX', 'volatility', 'dollar', 'gold', 'oil', 'crude', 'brent', 'barrels?', 'bitcoin', 'fear', 'greed', 'squeeze',
    'max pain', 'call wall', 'put floor', 'gamma flip', 'implied (?:move|range)', '\\d{1,2}-?year', 'off-exchange', 'support', 'resistance', 'levels?', 'spread',
    'futures', 'index', 'stocks?', 'shares?', 'sectors?', 'semiconductors?', 'chips?', 'tech', 'prices?', 'rates?', 'inflation', 'payrolls?', 'claims',
    'housing', 'permits', 'starts', 'sales', 'range', 'premium', 'calls?', 'puts?', 'flows?', 'market', 'equities'];
const SUBJECT_CJK = [
    // ko
    '맥스\\s?페인', '콜\\s?월', '풋\\s?플로어', '감마\\s?플립', '금리', '국채', '년물', '채권', '나스닥', '다우', '러셀', '참여폭', '시장 폭', '상승 종목', '하락 종목', '등락', '감마', '변동성', '달러', '금값', '금 ', '금은', '금이', '금도',
    '유가', '원유', '브렌트', '배럴', '비트코인', '공포', '탐욕', '스퀴즈', '예상 변동', '장외 비중', '장외', '지지', '저항', '레벨', '스프레드',
    '선물', '지수', '주가', '종목', '섹터', '반도체', '기술주', '가격', '물가', '고용', '주택', '착공', '허가', '판매', '범위', '프리미엄', '콜', '풋', '시장',
    // ja
    'マックス\\s?ペイン', 'コール\\s?ウォール', 'プット\\s?フロア', 'ガンマ\\s?フリップ', '金利', '利回り', '国債', '年債', '債券', 'ナスダック', 'ダウ', 'ラッセル', 'ブレッドス', '騰落', '値上がり', '値下がり', 'ガンマ', 'ボラティリティ', 'ドル', '金価格', '金相場', '金は', '金が',
    '原油', 'ブレント', 'バレル', 'ビットコイン', '恐怖', '強欲', 'スクイーズ', '想定変動', '場外比率', '場外', 'サポート', 'レジスタンス', '水準', 'スプレッド',
    '先物', '指数', '株価', '銘柄', 'セクター', '半導体', 'ハイテク', '価格', '物価', '雇用', '住宅', '着工', '許可', '販売', 'レンジ', '幅', 'プレミアム', 'コール', 'プット', '市場',
];
// 영어는 낱말 경계(«moderate»의 rate·«decline»은 주어가 아니다 — 방향어는 주어로 치지 않는다)
const SUBJECT = new RegExp(`(?<![A-Za-z])(?:${SUBJECT_EN.join('|')})(?![A-Za-z])|${SUBJECT_CJK.join('|')}`, 'i');
const TICKER = /(?<![A-Za-z0-9])[A-Z][A-Z0-9&]{1,5}(?![A-Za-z0-9])/;

const hasSubject = (s: string) => SUBJECT.test(s) || TICKER.test(s);
/** 숫자 «바로 뒤»의 주어(«49% 참여폭»·«5% of stocks»·«5.15%の米10年債») — 조사·전치사 몇 글자 안에서 시작할 때만 */
const subjectRightAfter = (s: string) => {
    const head = s.match(/^\s*(?:of|の|의)?\s*/)?.[0].length ?? 0;
    const rest = s.slice(head);
    const m = rest.match(SUBJECT) || rest.match(TICKER);
    // 바로 붙거나, 꾸밈말 한 낱말(«49%의 중립 참여폭»·«49% weak breadth») 뒤
    return !!m && (m.index! <= 1 || /^[^\s\d]{1,4}\s$/.test(rest.slice(0, m.index!)));
};

/** 절 경계(쉼표·세미콜론·문장 끝). 소수점·천 단위 쉼표는 경계가 아니다. */
function clauseBounds(src: string): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    let start = 0;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const next = src[i + 1] || '';
        const prev = src[i - 1] || '';
        const boundary = /[;；。、，!?！？]/.test(c)
            || (c === ',' && !(/\d/.test(prev) && /\d/.test(next)))
            || (c === '.' && !(/\d/.test(prev) && /\d/.test(next)) && (/\s/.test(next) || next === ''));
        if (boundary) { out.push([start, i]); start = i + 1; }
    }
    out.push([start, src.length]);
    return out.filter(([a, b]) => b > a);
}

/** 직전 숫자와 같은 지표로 잇는 사이 — 조사·전치사, 또는 방향 동사 한 낱말(«+6bp 상승해 5.15%», «rose to 5.15%») */
const ADJ = /^\s*(?:(?:상승|하락|올라|내려|떨어져|반등|오른|내린)\S{0,2}\s*|(?:rose|rising|fell|falling|climbed|dropped|jumped|slid|up|down)\s+|(?:上昇|下落|低下|反発)\S{0,2}\s*)?(?:로|으로|에서|から|で|to|from|\(|（)?\s*$/i;

/** ① 고아 숫자 — 반환: 사유 코드(«orphan-number:−0.74%») */
export function orphanNumberReasons(text: string): string[] {
    if (!text) return [];
    const src = mask(text);
    const toks = valueTokens(text);
    const out: string[] = [];
    for (const [a, b] of clauseBounds(src)) {
        const inClause = toks.filter((t) => t.index >= a && t.index < b);
        const orphanIdx = new Set<number>();
        inClause.forEach((t, i) => {
            if (t.exempt) return;
            const backFrom = i > 0 ? inClause[i - 1].end : a;
            const back = text.slice(backFrom, t.index);
            const fwdTo = Math.min(i + 1 < inClause.length ? inClause[i + 1].index : b, t.end + 16);
            const fwd = text.slice(t.end, fwdTo);
            // 같은 지표의 수준·변화량 연달아(«금리 5.15%로 +6bp 상승») — 직전 숫자와 조사 하나 사이면 그 숫자의 주어를 잇는다(관문 10201522 ②)
            const adjacent = i > 0 && ADJ.test(back) && !orphanIdx.has(i - 1);   // «와·과·and»는 다른 대상의 나열이라 잇지 않는다
            if (!hasSubject(back) && !subjectRightAfter(fwd) && !adjacent) { out.push(`orphan-number:${t.raw}`); orphanIdx.add(i); }
        });
    }
    return out;
}

const DOWN = /하락|약세|약화|내림|내렸|떨어|밀리|밀려|후퇴|하회|감소|줄어|下落|弱気|弱含|軟調|安く|値下がり|下げ|\b(?:down|fell|falls?|falling|dropp?(?:ed|ing|s)?|declin(?:e|ed|es|ing)|lower|weak(?:er|ness|ening|ened)?|slid(?:e|es|ing)?|slipp?(?:ed|ing|s)?|lost|loss(?:es)?|sank|retreat(?:ed|ing|s)?|bearish)\b/i;
const UP = /상승|강세|오름|올라|오른|올랐|반등|상회|증가|늘어|上昇|強気|強含|堅調|反発|値上がり|上げ|高く|\b(?:up|rose|rises?|rising|gain(?:ed|ing|s)?|higher|strong(?:er|ly)?|strength(?:ened)?|rall(?:y|ied|ies|ying)|rebound(?:ed|ing|s)?|climb(?:ed|ing|s)?|advanc(?:e|ed|es|ing)|jump(?:ed|ing|s)?|bullish)\b/i;
/** 대조 접속어 — 앞뒤 마디의 방향이 다를 수 있다 */
const CONTRAST = /에도\s?불구하고|에도|반면|지만|면서도|가운데|와\s?달리|과\s?달리|にもかかわらず|一方|ものの|のに対し|対照的|\b(?:despite|but|while|whereas|although|though|as|after|amid|with|versus|vs\.?|contrast(?:s|ed|ing)?)\b/gi;

/** 등위 접속뿐인 사이(«와 »·« and breadth at »·«とブレッドス») — 접속어 뒤에는 주어 이름과 군말(at·the·of·の)만 */
const COORD_HEAD = /^\s*(?:와|과|및|그리고|,|、|と|や|及び|and|&)\s*/i;
const COORD = { test: (between: string): boolean => {
    const h = between.match(COORD_HEAD);
    if (!h) return false;
    const rest = between.slice(h[0].length).replace(new RegExp(SUBJECT.source, 'gi'), ' ').replace(new RegExp(TICKER.source, 'g'), ' ')
        .replace(/(?<![A-Za-z])(?:at|the|of|its)(?![A-Za-z])|の/gi, ' ');
    return rest.trim() === '';
} };

function segmentBounds(src: string): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const [a, b] of clauseBounds(src)) {
        let s = a;
        const part = src.slice(a, b);
        for (const m of part.matchAll(CONTRAST)) { out.push([s, a + m.index!]); s = a + m.index! + m[0].length; }
        out.push([s, b]);
    }
    return out.filter(([a, b]) => b > a);
}

function firstDir(s: string): { dir: 1 | -1; at: number } | null {
    const d = s.match(DOWN), u = s.match(UP);
    const di = d ? d.index! : Infinity, ui = u ? u.index! : Infinity;
    if (di === Infinity && ui === Infinity) return null;
    return di < ui ? { dir: -1, at: di } : { dir: 1, at: ui };
}
function lastDir(s: string): 1 | -1 | null {
    let best: { dir: 1 | -1; at: number } | null = null;
    for (const [re, dir] of [[DOWN, -1], [UP, 1]] as const) {
        for (const m of s.matchAll(new RegExp(re.source, 'gi'))) if (!best || m.index! > best.at) best = { dir, at: m.index! };
    }
    return best ? best.dir : null;
}

/** ② 방향 모순 — 반환: «direction-sign:+0.19%» */
export function directionSignReasons(text: string): string[] {
    if (!text) return [];
    const src = mask(text);
    // 부호 붙은 «변화량»(%·bp)만 — «GEX -40»·«RLSI 36» 같은 수준 값은 등락이 아니다(관문 10201522 ①)
    const toks = valueTokens(text).filter((t) => t.sign !== 0 && t.change);
    const out: string[] = [];
    for (const [a, b] of segmentBounds(src)) {
        const seg = toks.filter((t) => t.index >= a && t.index < b);
        seg.forEach((t, i) => {
            // 뒤쪽: 첫 방향어 — 다음 숫자에서 멈추되, 사이가 등위 접속(«와·과·and·と»)뿐이면 함께 서술되는 것으로 보고 넘어간다
            //   «나스닥 +0.19%와 49% 참여폭은 약세» = 둘 다 약세(판정) · «GEX +7는 중립 수준이고 49% 참여폭은 약세» = +7 은 중립(판정 안 함)
            const allToks = valueTokens(text);
            const all = allToks.filter((x) => x.index > t.index && x.index < b);
            let stop = b;
            let prevEnd = t.end;
            let last: ValueToken = t;
            for (const nx of all) {
                const between = text.slice(prevEnd, nx.index);
                if (nx.sign === -t.sign || !COORD.test(between)) { stop = nx.index; break; }
                prevEnd = nx.end; last = nx;
            }
            const fwd = text.slice(t.end, stop);
            const f = firstDir(fwd);
            let dir: 1 | -1 | null = f ? f.dir : null;
            if (f) {
                // 방향어 앞에 «다른 주어»가 끼면 그 주어의 방향이다 — «TLT -0.74%는 금리 상승과 연결»(관문 10201535 ②)
                //   마지막 나열 숫자에 바로 붙은 주어(«49% 참여폭은 약세»)는 그 숫자의 주어라 다른 주어가 아니다
                const pre = text.slice(prevEnd, t.end + f.at);
                const lastPrev = allToks.filter((x) => x.end <= last.index).pop();
                const lastHasBack = hasSubject(text.slice(Math.max(a, lastPrev ? lastPrev.end : a), last.index));
                let rest = pre;
                if (!lastHasBack && subjectRightAfter(pre)) {
                    const m = pre.match(SUBJECT) || pre.match(TICKER);
                    if (m) rest = pre.slice(m.index! + m[0].length);
                }
                if (hasSubject(rest)) dir = null;
            }
            if (dir === null) {
                const backFrom = Math.max(a, t.index - 12, i > 0 ? seg[i - 1].end : a);
                dir = lastDir(text.slice(backFrom, t.index));
            }
            if (dir !== null && dir !== t.sign) out.push(`direction-sign:${t.raw}`);
        });
    }
    return out;
}

/** 두 검사를 한 번에(사유 접두어 붙여) */
export function claimReasons(text: string, prefix: string): string[] {
    return [...orphanNumberReasons(text), ...directionSignReasons(text)].map((r) => `${prefix}:${r}`);
}

export type { Loc as ClaimLocale };
