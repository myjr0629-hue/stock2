/**
 * AI 신뢰 레이어(앱 강화 T5, 2026-10-07) — AI 가 쓴 글의 «출구» 공용 검사. 순수 함수만(네트워크·Redis 없음).
 *
 * 세 가지를 한 곳에 둔다(표면마다 복사하지 않는다):
 *   ① 예측어 — 선행·전망·임박·반등 기대·historically precede·will·〜見込み 같은 «앞으로 일어날 일»의 단정/전망 표현.
 *      대표 지시(9/29): 관찰·조건 서술만. 투자 권유로 읽힐 수 있는 문장은 화면에 나가기 전에 걸러낸다(보고서 §5.5).
 *      — 섹션 레이블([전망]·[Outlook]·[見通し]·[Interpretation])은 «글»이 아니라 화면이 정한 이름이므로 검사하지 않는다.
 *   ② 문턱·비교 문장 — «RLSI 42 sits below the 40 threshold»(42 는 40 아래가 아니다). 지표의 현재 값을 아는 지표에 한해
 *      «지금 상태» 비교 주장(sits below · is above · 미만이다 · 下回っている)을 코드가 판정한다. 조건문(if·하면·なら)은 가정이라 판정하지 않는다.
 *   ③ 낡음 — 생성 뒤 가격이 움직여 글의 서술(«콜 월 아래»)이 더는 맞지 않을 만큼이면 낡았다고 판정한다.
 *
 * 시험: tests/trustLayer.test.ts (운영 실측 문장으로 고정)
 */

export type TLocale = 'ko' | 'en' | 'ja';

// ─────────────────────────────────────────────────────────────────────────────
// 0) 문장 나누기 — 소수점·약어를 문장 끝으로 오인하지 않는다(10/7 «+0. 48%» 사고와 같은 종류)
// ─────────────────────────────────────────────────────────────────────────────
const DOT = ''; // 보호용 사설 문자

function protectDots(s: string): string {
    return s
        .replace(/(\d)\.(\d)/g, `$1${DOT}$2`)
        // 숫자.공백.숫자는 아님 — 약어(미국·월 이름·회사 접미)
        .replace(/\b(U)\.(S)\./g, `$1${DOT}$2${DOT}`)
        .replace(/\b(U)\.(K)\./g, `$1${DOT}$2${DOT}`)
        .replace(/\b(vs|e\.g|i\.e|approx|Inc|Corp|Co|Ltd|No|St|Mr|Ms|Dr|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|a\.m|p\.m)\./gi, (m) => m.replace(/\./g, DOT))
        .replace(/\b([A-Z])\.([A-Z])\b/g, `$1${DOT}$2`);   // BRK.B · S.E.C 류
}
const restoreDots = (s: string) => s.replace(new RegExp(DOT, 'g'), '.');

/** 문장 단위로 나눈다. 줄바꿈은 문장 경계다. 각 조각은 끝 문장부호를 포함하고 앞뒤 공백은 없다. (lookbehind 를 쓰지 않는다 — iOS 15 WKWebView) */
export function splitSentences(text: string): string[] {
    const out: string[] = [];
    for (const line of String(text ?? '').split(/\n+/)) {
        const p = protectDots(line);
        let start = 0;
        for (let i = 0; i < p.length; i++) {
            const ch = p[i];
            let end = -1;
            if (ch === '。' || ch === '！' || ch === '？') {
                end = i + 1;
            } else if (ch === '.' || ch === '!' || ch === '?') {
                // 마침표류는 뒤가 공백·끝일 때만 문장 끝(«...» 같은 연속은 마지막 글자에서)
                const next = p[i + 1];
                if (next === undefined || /\s/.test(next)) end = i + 1;
            }
            if (end > 0) {
                const t = restoreDots(p.slice(start, end)).trim();
                if (t) out.push(t);
                start = end;
            }
        }
        const rest = restoreDots(p.slice(start)).trim();
        if (rest) out.push(rest);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) 예측어
// ─────────────────────────────────────────────────────────────────────────────

/** 한글 음절의 받침이 ㄹ 인가 (할·될·질·을 …) — «할 것이다» 류(미래·추정)를 가르는 데 쓴다 */
function endsWithRieul(ch: string): boolean {
    const c = ch.charCodeAt(0);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 8;
}

type Pat = [id: string, re: RegExp];

const FORECAST_EN: Pat[] = [
    // 단정적 미래: will/would/shall + 움직임·결과 동사 («will be reported» 같은 일정 사실은 제외)
    ['en:will', /\b(?:will|shall)\s+(?:likely\s+|probably\s+|then\s+|also\s+|continue|rise|fall|drop|decline|climb|rally|bounce|reverse|recover|break|test|reach|hit|push|pull|drive|force|trigger|accelerate|extend|expand|widen|persist|follow|lead|see|move|trend|gain|lose|surge|plunge|slide|sink|jump|tumble|squeeze|pin|cap|resist|support|result|cause|create|generate|produce|become|remain|stay|hold|keep|turn|shift|unwind|snap|revert|dominate|prevail|outperform|underperform)\b/i],
    // «likely to be driven by profit-taking» 같은 현재 상태 추정(be·reflect·indicate …)은 예측이 아니다 — 그 밖의 동사만
    ['en:expected-to', /\b(?:is|are|was|were|be|being|been)\s+(?:widely\s+|largely\s+)?(?:expected|likely|set|poised|bound|due|forecast(?:ed)?|projected|anticipated|primed|slated|on track)\s+to\s+(?!be\b|reflect|represent|indicate|signal|suggest|mean\b|imply|stem|result from|come from|owe|have been|remain\b(?! (?:above|below)))/i],
    ['en:we-expect', /\b(?:we|i)\s+(?:expect|anticipate|forecast|predict|project)\b/i],
    ['en:expect-outcome', /\b(?:expect(?:s|ed|ing)?|anticipat(?:e|es|ed|ing)|predict(?:s|ed|ing)?|forecast(?:s|ed|ing)?)\s+(?:a|an|the|further|more|continued|renewed|additional)?\s*(?:rally|rise|decline|drop|fall|rebound|reversal|correction|breakout|breakdown|squeeze|move|upside|downside|gains?|losses?|volatility|expansion|follow-through)\b/i],
    ['en:historically', /\bhistorically\s+(?:precede|precedes|preceded|lead|leads|led|follow|follows|followed|signal|signals|signaled|foreshadow|resolve|resolves|resolved|result|results|resulted|tends?\s+to|has\s+tended|have\s+tended)\b/i],
    ['en:precede', /\bprecede(?:s|d)?\s+(?:a\s+|an\s+|the\s+)?(?:rally|correction|reversal|mean reversion|sell-?off|decline|rebound|breakout|breakdown|squeeze|crash|pullback|bounce)\b/i],
    ['en:imminent', /\b(?:imminent|impending|looming)\s+(?:breakout|breakdown|move|reversal|rally|sell-?off|squeeze|correction|rebound|spike|drop|surge)\b|\bon the verge of\b|\babout to (?:break|rally|drop|fall|rise|surge|reverse)\b/i],
    ['en:target', /\b(?:price target|upside target|downside target|target price)\b/i],
    ['en:predictive-adv', /\b(?:likely to|poised to|set to|bound to|going to|expected to|destined to)\s+(?!be\b|reflect|represent|indicate|signal|suggest|mean\b|imply|stem|result from|come from|owe|have been)/i],
    ['en:breakout-expected', /\b(?:breakout|breakdown|reversal|rally|rebound|squeeze)\s+(?:is\s+)?(?:expected|likely|imminent|looming|anticipated|coming|ahead)\b/i],
    ['en:outlook-direction', /\b(?:bullish|bearish)\s+outlook\b|\bnear-term (?:upside|downside)\b|\bpotential (?:rally|rebound|bounce|upside|downside)\s+(?:ahead|next|soon)\b/i],
];

const FORECAST_KO: Pat[] = [
    ['ko:future-adnominal', /(?:^|[^가-힣])[가-힣]*?[가-힣](?= ?것(?:이다|이며|이고|이라|이므로|이니|입니다|으로|이 (?:예상|전망|기대)))/],   // 실제 판정은 koFutureHits() — 이 패턴은 사용하지 않는다(자리 표시)
    ['ko:expected', /(?:예상|전망|기대)(?:된다|됩니다|되며|되고|되는|됨|이다|입니다|한다|합니다|할 수|해 볼|해볼)/],
    ['ko:expected-noun', /것으로\s*(?:예상|전망|기대|점쳐)/],
    ['ko:imminent', /임박(?:했|한|하|해|하다|하며)/],
    ['ko:watershed', /분수령/],
    ['ko:precede', /선행(?:할|하여|하는|한다|해)\s*(?:가능성|것|패턴|신호)?|후행(?:\s*조정)\s*패턴|역사적으로[^.]{0,30}(?:선행|뒤따|이어졌|반복)/],
    ['ko:rebound-expect', /반등(?:\s*(?:가능성|여지|기대|예상|시도|전망|임박)|할\s*(?:가능성|전망|것|수\s*있))|반등이\s*(?:예상|기대|전망)/],
    ['ko:target', /목표가|목표\s*주가/],
    ['ko:outlook-claim', /(?:상승|하락|반등|조정)\s*(?:이|가)?\s*(?:예상|전망|기대|우려)(?:된다|됩니다|되며|되고|되는)/],
];

const FORECAST_JA: Pat[] = [
    ['ja:mikomi', /見込み(?:だ|です|である|が|で|も|は|。|$)/],
    ['ja:mitoshi', /(?:今後|先行き)の?見通し|見通しだ|見通しです|との見方/],
    ['ja:yosou', /予想(?:される|された|です|だ|され)|予測(?:される|された|です|だ|され)/],
    ['ja:darou', /(?:だろう|でしょう|であろう|であろ)(?:。|$|。|\s)/],
    ['ja:kitai', /期待される|期待が(?:高|膨)|期待できる/],
    ['ja:imminent', /差し迫っ/],
    ['ja:precede', /先行(?:する|し|して)|歴史的に[^。]{0,24}(?:先行|続いた|繰り返)/],
    ['ja:kotoninaru', /ことになる(?:だろう|でしょう)?|となる見込み/],
    ['ja:bunsui', /分水嶺/],
    ['ja:target', /目標株価|目標価格/],
    ['ja:rebound-expect', /反発(?:が|を)?(?:期待|予想|見込)/],
];

/** 모든 로케일 공통 — 한 언어 글에 다른 언어 예측어가 섞여도 잡는다(예: ko 화면에 영어 문장) */
const FORECAST_ALL: Record<TLocale, Pat[]> = {
    ko: [...FORECAST_KO, ...FORECAST_EN],
    en: [...FORECAST_EN],
    ja: [...FORECAST_JA, ...FORECAST_EN],
};

/** 문장 앞의 섹션 레이블([전망] 등) — 화면이 정한 이름이라 검사 대상이 아니다 */
const LABEL_PREFIX = /^\s*\[[^\]\n]{1,40}\]\s*/;
const stripLabel = (s: string) => s.replace(LABEL_PREFIX, '');

export interface ForecastHit { id: string; match: string; sentence: string }

/** 한국어 «ㄹ 것» 미래·추정 — 할/될/질/을 + 것(이다·으로 …). «하는 것이»·«있는 것» 은 아니다. */
function koFutureHits(sentence: string): string[] {
    const hits: string[] = [];
    const re = /([가-힣])\s?것(?=(?:이다|이며|이고|이라|이므로|이니|입니다|으로|이 |은 |도 |을 |이어서|이지만|임|\s|[.,]|$))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence))) {
        const ch = m[1];
        // 받침 ㄹ(할·될·갈·올·질·을·를 아님) — «을» 은 받침 ㄹ(을 = 으 + ㄹ)
        if (!endsWithRieul(ch)) continue;
        // «할 것» 뒤가 «같다»(추정 «~할 것 같다») 도 미래 추정 — 포함. 단 «할 수 있을 것» 도 포함(미래).
        // 예외: «~할 것인가»(질문형) 는 문장 속 수사 의문 — 드물어 제외하지 않는다.
        hits.push(sentence.slice(Math.max(0, m.index - 4), m.index + m[0].length + 4).trim());
    }
    // «…할/될/질 가능성이 높다·크다» — 앞으로의 일에 대한 가능성 단정. «있을·했을·였을·일 가능성»(현재·과거 추정)은 예측이 아니다.
    const pr = /([가-힣]{1,2})\s?가능성이\s?(?:높|큽|크)/g;
    let pm: RegExpExecArray | null;
    while ((pm = pr.exec(sentence))) {
        const pre = pm[1];
        const last = pre[pre.length - 1];
        if (!endsWithRieul(last)) continue;
        if (/(?:있을|없을|했을|였을|었을|았을)$/.test(pre) || last === '일') continue;
        hits.push(sentence.slice(Math.max(0, pm.index - 6), pm.index + pm[0].length + 2).trim());
    }
    return hits;
}

/** 제3자 전망을 «인용·귀속»한 문장(따옴표 · according to · 에 따르면 · によると) — 우리 예측이 아니라 보도다 */
const ATTRIBUTION = /["\u201C\u201D\u300C\u300D]|\baccording to\b|\bper (?:the )?(?:report|study|survey)\b|에 따르면|によると|によれば/i;

/** 한 문장의 예측어 — 레이블은 빼고 본다 */
export function forecastHitsInSentence(sentence: string, locale: TLocale): ForecastHit[] {
    const s = stripLabel(sentence);
    const out: ForecastHit[] = [];
    if (ATTRIBUTION.test(s)) return out;
    for (const [id, re] of FORECAST_ALL[locale]) {
        if (id === 'ko:future-adnominal') continue;
        const m = s.match(re);
        if (m) out.push({ id, match: m[0].trim().slice(0, 40), sentence });
    }
    if (locale === 'ko') {
        for (const h of koFutureHits(s)) out.push({ id: 'ko:future-geot', match: h, sentence });
    }
    return out;
}

/** 글 전체의 예측어(문장별) */
export function forecastHits(text: string, locale: TLocale): ForecastHit[] {
    const out: ForecastHit[] = [];
    for (const sent of splitSentences(text)) out.push(...forecastHitsInSentence(sent, locale));
    return out;
}

export interface StripResult {
    /** 예측어가 걸린 문장을 뺀 글(줄 구조·레이블 유지) */
    text: string;
    removed: string[];
    /** 빼고 남은 글이 «글»로 쓸 만한가 (원문의 35% 이상 · 15자 이상 · 문장 하나 이상) */
    usable: boolean;
}

/**
 * 예측어가 걸린 문장을 뺀다. 줄 단위로 처리 — 줄의 «[레이블]»은 유지하고, 줄 안 문장이 전부 빠지면 그 줄은 비워 «usable=false».
 * (여러 줄 구조 글(가디언 [현황][해석][전망])은 호출자가 usable=false 를 «재생성 필요»로 다룬다.)
 */
export function stripForecastSentences(text: string, locale: TLocale): StripResult {
    const removed: string[] = [];
    const lines = String(text ?? '').split('\n');
    let emptyLine = false;
    const outLines = lines.map((line) => {
        const label = (line.match(LABEL_PREFIX) || [''])[0];
        const body = line.slice(label.length);
        const sents = splitSentences(body);
        const kept = sents.filter((s) => {
            const hit = forecastHitsInSentence(s, locale).length > 0;
            if (hit) removed.push(s);
            return !hit;
        });
        if (sents.length && !kept.length) emptyLine = true;
        return kept.length ? `${label}${kept.join(' ')}` : (sents.length ? '' : line);
    });
    const out = outLines.filter((l, i) => l !== '' || lines[i] === '').join('\n').trim();
    const plain = (t: string) => t.replace(/\s+/g, '');
    const usable = removed.length === 0 || (!emptyLine && plain(out).length >= 15 && plain(out).length >= 0.35 * plain(text).length);
    return { text: out, removed, usable };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 문턱·비교 문장
// ─────────────────────────────────────────────────────────────────────────────

/** 비교 주장을 판정할 지표 — 현재 값을 아는 것만 */
export type CmpKey = 'RLSI' | 'VIX' | 'GEX' | 'SQUEEZE' | 'BREADTH' | 'PC' | 'OPI' | 'DXY' | 'US10Y' | 'COMPOSITE' | 'IV_RANK';
export type CmpFacts = Partial<Record<CmpKey, number>>;

const NAME: Record<CmpKey, string> = {
    RLSI: 'RLSI',
    VIX: 'VIX',
    GEX: 'GEX(?:\\s*(?:지수|index|Index|指数))?',
    SQUEEZE: '(?:squeeze(?:\\s+risk|\\s+probability)?|스퀴즈(?:\\s*(?:리스크|확률|위험))?|スクイーズ(?:リスク|確率)?)',
    BREADTH: '(?:breadth|Breadth|시장\\s*참여폭|참여폭|브레드스|ブレッド(?:ス)?|騰落)',
    PC: '(?:P\\/C|PC|put\\/call|Put\\/Call|풋\\/?콜|プット\\/?コール)(?:\\s*(?:ratio|비율|比率|レシオ))?',
    OPI: 'OPI',
    DXY: '(?:DXY|dollar index|Dollar index|달러\\s*(?:인덱스|지수)|ドル(?:指数|インデックス))',
    US10Y: '(?:10-?year(?: yield)?|10Y|US10Y|10년물(?:\\s*금리)?|10年(?:債|国債|物)(?:利回り)?)',
    COMPOSITE: '(?:composite(?:\\s+score)?|종합\\s*(?:점수|수급\\s*지수)|総合(?:スコア|需給指数))',
    IV_RANK: '(?:IV\\s*(?:rank|percentile|랭크|순위)|IV\\s*ランク)',
};

type Op = 'lt' | 'gt';
interface Cmp { key: CmpKey; op: Op; threshold: number; sentence: string; written: string }

const EN_BELOW = '(?:below|under|beneath|less than|lower than|lacks?|short of|falls? short of|dips? below|slips? below|trails?)';
const EN_ABOVE = '(?:above|over|exceeds?|exceeding|higher than|greater than|more than|surpass(?:es|ing)?|tops?|clears?|beyond)';

/** 가정·조건 절 표지 — «if VIX rises above 20»·«20 을 넘으면»·«40 を超えたら» 는 지금 상태 주장이 아니다 */
const CONDITIONAL = /\b(?:if|when|once|unless|should|whether|until|as soon as|in case|were|than if|crosses?|breach(?:es)?|break(?:s|ing)?|reclaim|trigger|threshold (?:for|of|at))\b|(?:이면|하면|으면|라면|할 경우|일 경우|경우|시에는|시$|할 때|넘으면|넘어서면|돌파하면|돌파 시|이탈하면|하회하면|상회하면|내려가면|올라가면|여부|지 않으면)|(?:[으하되서가오리르지나]|넘|돌파|이탈)면(?=[\s,，.]|$)|(?:なら|たら|れば|場合|ば、|ると、?|かどうか|時には|際には|たとき|ときは)/i;

const NUM = '(\\d+(?:\\.\\d+)?)';

/** 문장에서 «지표 … 비교어 … 숫자» 주장을 뽑는다. 조건문은 제외. */
export function comparisonClaims(text: string): Cmp[] {
    const out: Cmp[] = [];
    for (const sentence of splitSentences(text)) {
        const s = stripLabel(sentence);
        if (CONDITIONAL.test(s)) continue;
        for (const key of Object.keys(NAME) as CmpKey[]) {
            const nm = NAME[key];
            // en: «RLSI 42 sits below the 40 threshold» · «VIX is above 20» · «squeeze risk at 39% stays under the 45% mark»
            const en = new RegExp(`\\b${nm}\\b[^.;]{0,60}?\\b(${EN_BELOW}|${EN_ABOVE})\\b\\s+(?:the\\s+)?(?:\\$)?${NUM}\\s*(%|-?point|pt)?`, 'ig');
            let m: RegExpExecArray | null;
            while ((m = en.exec(s))) {
                const word = m[1].toLowerCase();
                const op: Op = new RegExp(`^${EN_BELOW}$`, 'i').test(word) ? 'lt' : 'gt';
                // «more than» 는 수량 비교로 흔해(예: «more than 5 sessions») 단위 없는 숫자는 제외하지 않고 판정하되, «lacks» 같은 변형은 lt
                out.push({ key, op, threshold: Number(m[2]), sentence, written: m[0].slice(0, 60) });
            }
            // ko: «RLSI 42는 40 미만» · «VIX 가 20 이상이다» · «RLSI 는 40 아래에 있다»
            const ko = new RegExp(`${nm}[^.。;]{0,30}?${NUM}\\s*(?:%|점|pt|포인트)?\\s*(미만|이하|아래|밑|이상|초과|위|상회|하회)`, 'ig');
            while ((m = ko.exec(s))) {
                const w = m[2];
                const op: Op = /미만|이하|아래|밑|하회/.test(w) ? 'lt' : 'gt';
                out.push({ key, op, threshold: Number(m[1]), sentence, written: m[0].slice(0, 60) });
            }
            // ja: «RLSIは40を下回っている» · «VIXは20未満» · «VIX 20以上»
            const ja = new RegExp(`${nm}[^。;]{0,30}?${NUM}\\s*(?:%|点|pt|ポイント)?\\s*(?:を)?(未満|以下|を下回|下回っ|を割|割り込|以上|を上回|上回っ|を超|超え|超過)`, 'ig');
            while ((m = ja.exec(s))) {
                const w = m[2];
                const op: Op = /未満|以下|下回|割/.test(w) ? 'lt' : 'gt';
                out.push({ key, op, threshold: Number(m[1]), sentence, written: m[0].slice(0, 60) });
            }
        }
    }
    return out;
}

/**
 * 비교 주장 판정 — 현재 값(facts)을 아는 지표의 주장만 본다. 틀린 주장 목록(비면 통과).
 * 경계값(같음)은 «이상·이하»가 아닌 «미만·초과»에서만 틀렸다고 한다 — 문장 표현 차이(≤ vs <)에 관대하게.
 */
export function checkComparisons(text: string, facts: CmpFacts | null | undefined): string[] {
    if (!facts) return [];
    const bad: string[] = [];
    for (const c of comparisonClaims(text)) {
        const actual = facts[c.key];
        if (typeof actual !== 'number' || !Number.isFinite(actual)) continue;
        const ok = c.op === 'lt' ? actual <= c.threshold : actual >= c.threshold;
        // 단위가 다른 우연(예: GEX 지수 -7 이 «5 미만» 같은 문장)을 줄이려고, 지표의 일반 범위 밖 문턱은 판정하지 않는다
        if (!thresholdPlausible(c.key, c.threshold)) continue;
        if (!ok) bad.push(`compare:${c.key}:${c.op === 'lt' ? '<' : '>'}${c.threshold}≠${round2(actual)}`);
    }
    return bad;
}

/** «P/C 0.62 는 중립 범위(0.75~1.3)에 있다»류 — 지표 이름 뒤 70자 안의 «a~b» 범위에 «안에 있다» 주장 */
const RANGE_NUM = /(\d+(?:\.\d+)?)\s*(?:[~～–—]|-|to|and|から|부터)\s*(\d+(?:\.\d+)?)/;
const RANGE_WITHIN = /(?:within|inside|in the|between|neutral|range|zone|band|범위|구간|사이|안에|내에|내|圏|範囲|レンジ|ゾーン|帯)/i;
// 이 말이 같이 있으면 «범위 밖/문턱 비교» 이야기일 수 있어 판정하지 않는다
const RANGE_NOT = /(?:\boutside\b|\bbeyond\b|\bbelow\b|\bunder\b|\babove\b|\bover\b|\bexceed|\bbreach|not within|벗어|밖|미만|이하|이상|초과|아래|넘|外|未満|以下|以上|超|下回|上回)/i;   // «범위»의 «위» 때문에 «위»는 넣지 않는다

export function checkRanges(text: string, facts: CmpFacts | null | undefined): string[] {
    if (!facts) return [];
    const bad: string[] = [];
    for (const sentence of splitSentences(text)) {
        const s = stripLabel(sentence);
        if (CONDITIONAL.test(s) || RANGE_NOT.test(s)) continue;
        for (const key of Object.keys(NAME) as CmpKey[]) {
            const actual = facts[key];
            if (typeof actual !== 'number' || !Number.isFinite(actual)) continue;
            const m = new RegExp(`(?:^|[^A-Za-z])${NAME[key]}(?![A-Za-z])[^;。]{0,70}`, 'i').exec(s);   // 한글 이름 뒤 \\b 는 동작하지 않는다
            if (!m) continue;
            const seg = m[0];
            const r = RANGE_NUM.exec(seg);
            if (!r || !RANGE_WITHIN.test(seg)) continue;
            const lo = Number(r[1]), hi = Number(r[2]);
            if (!(lo < hi) || !thresholdPlausible(key, lo) || !thresholdPlausible(key, hi)) continue;
            if (actual < lo || actual > hi) bad.push(`range:${key}:${lo}~${hi}≠${round2(actual)}`);
        }
    }
    return bad;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function thresholdPlausible(key: CmpKey, t: number): boolean {
    switch (key) {
        case 'RLSI': case 'BREADTH': case 'SQUEEZE': case 'IV_RANK': return t >= 0 && t <= 100;
        case 'VIX': return t >= 5 && t <= 90;
        case 'GEX': return t >= 0 && t <= 100;
        case 'PC': case 'OPI': case 'COMPOSITE': return t >= 0 && t <= 100;
        case 'DXY': return t >= 70 && t <= 130;
        case 'US10Y': return t >= 0 && t <= 12;
        default: return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 낡음 — 생성 뒤 가격이 글의 서술을 넘어섰는가
// ─────────────────────────────────────────────────────────────────────────────

export interface StaleBasis {
    price: number;
    callWall?: number | null;
    putFloor?: number | null;
    maxPain?: number | null;
    gammaFlip?: number | null;
    session?: string | null;
}
export interface StaleVerdict {
    /** fresh = 그대로 · mild = «생성 시각» 표기 · stale = 서술이 틀릴 수 있다(재생성 대상) */
    level: 'fresh' | 'mild' | 'stale';
    reasons: string[];
    movePct: number;
}

export const STALE_MILD_PCT = 1.0;
export const STALE_HARD_PCT = 2.0;

/** 기준(생성 때 값)과 지금(화면 값) 비교. 지금 가격을 모르면 fresh(판정 안 함). */
export function flowStaleness(basis: StaleBasis, now: { price: number; session?: string | null }): StaleVerdict {
    const reasons: string[] = [];
    if (!(basis.price > 0) || !(now.price > 0)) return { level: 'fresh', reasons, movePct: 0 };
    const move = ((now.price - basis.price) / basis.price) * 100;
    const levels: Array<[string, number | null | undefined]> = [
        ['callWall', basis.callWall], ['putFloor', basis.putFloor], ['gammaFlip', basis.gammaFlip], ['maxPain', basis.maxPain],
    ];
    let crossed = false;
    for (const [name, lv] of levels) {
        if (typeof lv !== 'number' || !(lv > 0)) continue;
        const before = Math.sign(basis.price - lv);
        const after = Math.sign(now.price - lv);
        if (before !== 0 && after !== 0 && before !== after) { crossed = true; reasons.push(`crossed:${name}`); }
    }
    const sessionChanged = !!basis.session && !!now.session && String(basis.session).toUpperCase() !== String(now.session).toUpperCase();
    if (sessionChanged) reasons.push(`session:${basis.session}→${now.session}`);
    const abs = Math.abs(move);
    if (abs >= STALE_HARD_PCT) reasons.push(`move:${round2(move)}%`);
    else if (abs >= STALE_MILD_PCT) reasons.push(`move-mild:${round2(move)}%`);
    const level: StaleVerdict['level'] = (crossed || sessionChanged || abs >= STALE_HARD_PCT) ? 'stale' : abs >= STALE_MILD_PCT ? 'mild' : 'fresh';
    return { level, reasons, movePct: round2(move) };
}

/** 방향·위치 서술 문장(위·아래·돌파·above·below …) — 낡았을 때 이 문장들을 뺀다 */
const DIRECTION_WORDS: Record<TLocale, RegExp> = {
    ko: /(?:위에|아래|위쪽|아래쪽|상방|하방|돌파|이탈|넘어|밑|근접|바로\s*(?:위|아래)|상단|하단|우위|열위|강세|약세)/,
    en: /\b(?:above|below|under|over|beneath|atop|breach(?:ed|es)?|break(?:s|ing)?|cross(?:ed|es|ing)?|approach(?:es|ing)?|upside|downside|bullish|bearish|rising|falling)\b/i,
    ja: /(?:上回|下回|上方|下方|突破|割れ|割り込|超え|超過|近接|上に|下に|強気|弱気|優勢|劣勢)/,
};
export function hasDirectionWords(sentence: string, locale: TLocale): boolean {
    return DIRECTION_WORDS[locale].test(stripLabel(sentence));
}
/** 낡은 글에서 방향·위치 서술 문장을 뺀다. 남은 글이 쓸 만하면 usable. */
export function dropDirectionSentences(text: string, locale: TLocale): StripResult {
    const removed: string[] = [];
    const kept = splitSentences(text).filter((s) => {
        if (hasDirectionWords(s, locale)) { removed.push(s); return false; }
        return true;
    });
    const out = kept.join(' ').trim();
    const plain = (t: string) => t.replace(/\s+/g, '');
    return { text: out, removed, usable: removed.length === 0 || (plain(out).length >= 15 && plain(out).length >= 0.3 * plain(text).length) };
}

/** «생성 HH:MM ET 기준» 표기 — 글 끝에 붙인다 */
export function asOfLabel(locale: TLocale, generatedAt: string | number | Date): string {
    const d = new Date(generatedAt);
    if (Number.isNaN(d.getTime())) return '';
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return locale === 'ko' ? `(생성 ${hm} ET 기준)` : locale === 'ja' ? `(${hm} ET 生成時点)` : `(as of ${hm} ET)`;
}
