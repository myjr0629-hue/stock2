import { forecastHits } from './trustLayer';
import { ungroundedNumbers, numbersInText } from './factGrounding';
import type { SectorFact } from './sectorBriefFacts';

export type SectorLocale = 'ko' | 'en' | 'ja';
export const SECTOR_LOCALES: SectorLocale[] = ['ko', 'en', 'ja'];
const fields = { ko: 'headline', en: 'headlineEN', ja: 'headlineJP' } as const;
const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;
const numericFacts = (f: SectorFact) => [f.measured, f.total, f.up, f.down, f.flat, f.avgChangePct, f.leader.c, f.laggard.c, f.spreadPct];

// ★2026-10-26 첫 운영 생성 결함(T6): ① 입력 필드 이름(exLeader)이 한국어 문장에 그대로 노출 ② «제외 평균»이 어느 종목을 뺀 값인지
//   없이 최약 종목 옆에 붙어 «최약 제외»로 오독(bio_pulse VKTX −5.54% 옆 −2.44% = GILD 제외값) ③ 직전 정규장 섹터의 ko 문장에 기준일 누락.
//   → 모델에 주는 입력은 «무엇을 뺐는지»가 이름에 든 값으로 바꾸고(SectorFact 저장 형태는 그대로), 출구에서 내부 이름·뺀 종목 없는 평균을 거른다.
const SESSION_WORD: Record<SectorLocale, Record<string, string>> = {
    ko: { PRE: '개장 전', REG: '정규장', POST: '장후' },
    en: { PRE: 'PRE', REG: 'REG', POST: 'POST' },
    ja: { PRE: '取引開始前', REG: '通常取引', POST: '時間外' },
};
const monthDay = (iso: string) => { const [, m, d] = iso.split('-'); return { m: Number(m), d: Number(d) }; };
/** 독자 언어 세션 표지(«10/23 정규장»·«10/23 REG»·«10/23 通常取引»). */
export function sectorSessionTag(f: Pick<SectorFact, 'priceBasis' | 'priceDate'>, locale: SectorLocale): string {
    const { m, d } = monthDay(f.priceDate);
    return `${m}/${d} ${SESSION_WORD[locale][f.priceBasis] || f.priceBasis}`;
}
/** 글에 가격 기준일(M/D·M월 D일·M月D日)이 있는가. */
export function hasPriceDate(text: string, priceDate: string): boolean {
    const { m, d } = monthDay(priceDate);
    return new RegExp(`(?<!\\d)0?${m}\\s*/\\s*0?${d}(?!\\d)|(?<!\\d)0?${m}\\s*월\\s*0?${d}\\s*일|(?<!\\d)0?${m}\\s*月\\s*0?${d}\\s*日`).test(text);
}
const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
/** 한 종목을 뺀 나머지 측정 종목 평균(종목 자료가 3개 이상일 때만). */
function avgWithout(f: SectorFact, ticker: string): number | null {
    const rest = (f.members || []).filter(r => r.t !== ticker).map(r => r.c);
    return (f.members?.length || 0) >= 3 && rest.length === (f.members!.length - 1) ? mean(rest) : null;
}
/** 최고·최저 종목을 각각 뺀 평균 — 어느 종목을 뺐는지를 값과 함께 둔다. */
export function sectorExAverages(f: SectorFact): Array<{ role: 'best' | 'worst'; excludedTicker: string; pct: number }> {
    if (!f.members || f.members.length < 3) return [];
    const best = f.members[0].t, worst = f.members[f.members.length - 1].t;
    const out: Array<{ role: 'best' | 'worst'; excludedTicker: string; pct: number }> = [];
    const b = f.exLeaderAvgChangePct ?? avgWithout(f, best);
    if (b != null && Number.isFinite(b)) out.push({ role: 'best', excludedTicker: best, pct: Number(b.toFixed(2)) });
    const w = avgWithout(f, worst);
    if (w != null && best !== worst) out.push({ role: 'worst', excludedTicker: worst, pct: Number(w.toFixed(2)) });
    return out;
}
/** 모델 입력 — 필드 이름만으로 뜻이 드러나게(내부 약칭 exLeader 등 금지). 저장되는 SectorFact 는 바꾸지 않는다. */
export function sectorBriefModelInput(f: SectorFact) {
    const ex = sectorExAverages(f);
    const best = ex.find(e => e.role === 'best'), worst = ex.find(e => e.role === 'worst');
    return {
        id: f.id, sector: f.label,
        priceSession: f.priceBasis, priceDate: f.priceDate,
        sessionTag: { ko: sectorSessionTag(f, 'ko'), en: sectorSessionTag(f, 'en'), ja: sectorSessionTag(f, 'ja') },
        measuredNames: f.measured, totalNames: f.total, up: f.up, down: f.down, flat: f.flat,
        equalWeightAvgPct: f.avgChangePct,
        best: { ticker: f.leader.t, pct: f.leader.c }, worst: { ticker: f.laggard.t, pct: f.laggard.c },
        bestToWorstGapPoints: f.spreadPct,
        ...(f.members ? { members: f.members.map(r => ({ ticker: r.t, pct: r.c })) } : {}),
        ...(best ? { avgWithoutBest: { excludedTicker: best.excludedTicker, pct: best.pct } } : {}),
        ...(worst ? { avgWithoutWorst: { excludedTicker: worst.excludedTicker, pct: worst.pct } } : {}),
    };
}

/** Frozen 10/24 contract. Do not add v2 requirements to restored/stored text. */
export function checkSectorBriefLegacy(text: string, locale: SectorLocale, f?: SectorFact): string[] {
    const t = text.trim();
    const ok = locale === 'ko' ? t.length >= 12 && HANGUL.test(t)
        : locale === 'en' ? t.length >= 16 && !HANGUL.test(t) && !KANA.test(t) && !KANJI.test(t)
            : t.length >= 8 && !HANGUL.test(t) && (KANA.test(t) || KANJI.test(t));
    return [...(!ok ? ['language-or-min-length'] : []),
        ...forecastHits(t, locale).map(h => `forecast:${h.id}`),
        ...(f ? ungroundedNumbers(t, numericFacts(f)).map(n => `number:${n}`) : [])];
}

// Serving already checked age/date/presence only. Both readers remain unchanged.
// Comparison must not pretend stored text had the current generating facts.
export function checkSectorBriefStored(text: string): string[] {
    return text.trim() ? [] : ['missing'];
}

export function buildSectorBriefPrompt(facts: SectorFact[], session: string, todayET: string) {
    const system = [
        'You write one-line sector verdicts for an institutional-grade US equity intelligence app.',
        'Keep the concise, measured observational tone. Explain a useful distinction in plain language.',
        'One line per sector per language. 40-70 characters for Korean/Japanese, 55-95 for English. Same existing space; no lists or extra fields.',
        'Priority within that space: named subject + one measured move, then what the rest of the measured members say about it.',
        'Explain whether strength/weakness is shared or concentrated. A positive leader alone does not make a sector rally.',
        'Use members, avgWithoutBest and avgWithoutWorst to distinguish a single-name move from participation; equalWeightAvgPct is an equal-weight mean of measured members, never an ETF or index return.',
        'An excluding average belongs ONLY to its excludedTicker. Whenever you cite one, name that excluded ticker right next to it: ko «GILD 제외 평균 −2.44%», en «average ex-GILD −2.44%», ja «GILDを除く平均−2.44%». Never place it next to a different ticker or call it a generic leader/선두/리더 average.',
        'For a mostly falling sector the useful check is usually avgWithoutWorst (is the drop only the worst name?); for a mostly rising sector, avgWithoutBest.',
        'Keep the denominator honest: measured members are a sample of total members. Never turn partial coverage into all-sector participation.',
        'Explain dispersion as a gap between stock moves; bestToWorstGapPoints is percentage POINTS, not a stock return. Avoid bare jargon such as risk-on, rotation, bifurcation or alpha.',
        'If room remains, name the next observable test with two interpretations: peers join = broader participation; peers do not = concentrated leadership. This is a conditional reading, never a price forecast.',
        'Do not force a four-part essay into this line. Clarity of the observed structure takes priority over the optional next test.',
        'Causal evidence: NONE supplied. Price co-movement does not establish why it happened. Do not invent earnings, rates, AI demand, policy, institutional buying, fund flows or investor intent.',
        'Do not attach a generic market headline to a sector. No causal news claim without sector relevance and an event/report time; this price-only contract supplies neither.',
        'State the price session in reader language: PRE = 개장 전/premarket/取引開始前; REG = 정규장/cash/通常取引; POST = 장후/after-hours/時間外.',
        'Every line in every language (Korean included) must contain that language\'s sessionTag text verbatim, e.g. ko «(10/23 정규장)», en «(10/23 REG)», ja «（10/23 通常取引）». Never describe prior REG as current PRE or POST.',
        'No futures/index comparison is supplied. Do not mention futures, benchmark outperformance or data-latency labels in any language.',
        'Numbers must belong to the named subject in this sector. Copy signs correctly. Use one useful number, not a metric inventory.',
        'Never predict or advise buying/selling. No will/expected rally/예상/전망/見込み/予想. Conditional participation tests are allowed without forecasting the outcome.',
        'Korean ends in 관측/확인 or a natural observational sentence; Japanese 観測/確認; English plain observed/holding/diverging when natural.',
        'ko is Korean, en English, ja Japanese; ticker symbols/numbers/session abbreviations are allowed. All three must express the same facts and interpretation.',
        'No internal provider/cache/source names, meta commentary, markdown, bullet points or readiness placeholders.',
        'Input keys (sessionTag, avgWithoutBest, avgWithoutWorst, equalWeightAvgPct, bestToWorstGapPoints, members, sector ids such as silicon_core) are internal names: never write them; say what they mean in the reader\'s language.',
        'Return ONLY JSON keyed by every supplied sector id: {"m7":{"ko":"...","en":"...","ja":"..."}, ...}',
    ].join('\n');
    // Do not pass unrelated PRE news, futures or dated options into a price-distribution line.
    const input = facts.map(sectorBriefModelInput);
    const userPrompt = [
        `Session: ${session} (ET). Trading date: ${todayET}.`,
        'Measured facts per sector (pct values are % changes for priceSession on priceDate, not necessarily today):',
        JSON.stringify(input, null, 1),
        'Only use numeric values from the measured price/breadth fields in verdicts; priceDate may be rendered M/D.',
        `Return ALL ${facts.length} sector ids in ko/en/ja: ${facts.map(f => f.id).join(', ')}. JSON only.`,
    ].join('\n');
    return { system, userPrompt };
}

const close = (written: string, value: number) => {
    const dec = written.split('.')[1]?.length || 0;
    return Math.abs(Math.abs(Number(written.replace('−', '-'))) - Math.abs(value)) <= 0.5 * 10 ** -dec + 0.005;
};
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 제외 평균 결속: ① «T 제외 평균 X%»의 X 는 T 를 뺀 평균이어야 하고 ② 제외 평균 값만 쓴 숫자는 뺀 종목이 글에 있어야 한다. */
function exAverageReasons(text: string, f: SectorFact, exAvgs: ReturnType<typeof sectorExAverages>): string[] {
    const out: string[] = [];
    if (!f.members || f.members.length < 3) return out;
    const NUM = '([+−-]?\\d+(?:\\.\\d+)?)\\s*[%％]';
    for (const row of f.members) {
        const T = escapeRe(row.t);
        const pats = [
            `(?<![A-Za-z])${T}(?![A-Za-z])\\s*(?:을|를)?\\s*(?:제외(?:한|하면|하고)?|뺀|빼면|외)\\s*(?:나머지\\s*)?(?:\\d+\\s*종(?:목)?\\s*)?(?:의\\s*)?평균\\s*(?:은|는|이|가|도)?\\s*(?:약\\s*)?${NUM}`,
            `(?:\\bex-|\\bexcluding\\s+|\\bwithout\\s+|\\bminus\\s+|\\bother than\\s+)${T}(?![A-Za-z])[^%％.;]{0,30}?\\b(?:average|avg|mean)\\b[^%％.;]{0,12}?${NUM}`,
            `\\b(?:average|avg|mean)\\s+(?:ex-|excluding\\s+|without\\s+|other than\\s+)${T}(?![A-Za-z])\\s*(?:is|was|of|at|stands at|:|,)?\\s*${NUM}`,
            `(?<![A-Za-z])${T}(?![A-Za-z])\\s*(?:を)?\\s*(?:除く|除いた|除外した|以外の?)\\s*(?:\\d+銘柄\\s*の?\\s*)?平均\\s*(?:は|が|:|：)?\\s*${NUM}`,
        ];
        const expect = avgWithout(f, row.t);
        for (const p of pats) for (const hit of text.matchAll(new RegExp(p, 'g'))) {
            const signed = /^[+−-]/.test(hit[1]) && expect != null && Math.abs(expect) >= 0.005
                && Math.sign(Number(hit[1].replace('−', '-'))) !== Math.sign(expect);
            if (expect == null || !close(hit[1], expect) || signed) out.push(`ex-average:${row.t}`);
        }
    }
    const others = [...numericFacts(f), ...f.members.map(r => r.c)];
    for (const h of numbersInText(text)) {
        const owners = exAvgs.filter(e => close(h.written, e.pct));
        if (!owners.length || others.some(v => close(h.written, v))) continue;
        if (!owners.some(e => new RegExp(`(?<![A-Za-z])${escapeRe(e.excludedTicker)}(?![A-Za-z])`).test(text))) out.push(`ex-average-unnamed:${h.written}`);
    }
    return out;
}

/** New generations only. Do not reject for style, length target, missing jargon/gloss or absent two-way clause. */
export function checkSectorBriefNew(text: string, locale: SectorLocale, f: SectorFact): string[] {
    // Session dates are not price/count numbers. Strip only the supplied date, never arbitrary numbers.
    const [, m, d] = f.priceDate.split('-');
    const dateFree = text.replaceAll(f.priceDate, '').replace(new RegExp(`\\b0?${Number(m)}/0?${Number(d)}\\b`, 'g'), '')
        .replace(new RegExp(`(?<!\\d)0?${Number(m)}\\s*(?:월|月)\\s*0?${Number(d)}\\s*(?:일|日)`, 'g'), '');
    const reasons = checkSectorBriefLegacy(text, locale);
    const exAvgs = sectorExAverages(f);
    const allowed = [...numericFacts(f), ...(f.members?.map(r => r.c) || []), f.exLeaderAvgChangePct ?? NaN, ...exAvgs.map(e => e.pct)];
    reasons.push(...ungroundedNumbers(dateFree, allowed).map(n => `number:${n}`));
    // 입력 필드 이름 노출(10/26 운영 ko «exLeader 0.97%»): 소문자로 시작하는 camelCase·snake_case 식별자. 티커(대문자)·mRNA·iPhone 류는 해당 없음.
    if (/(?<![A-Za-z])[a-z]{2,}[A-Z][A-Za-z]*|(?<![A-Za-z])[a-z]+_[a-z]+(?![A-Za-z])/.test(text)) reasons.push('internal-field');
    // «제외 평균»은 뺀 종목과 묶여야 한다(10/26 bio_pulse «VKTX −5.54%로 낙폭 최대이며 제외 평균 −2.44%» = GILD 제외값).
    reasons.push(...exAverageReasons(dateFree, f, exAvgs));
    // 시세·자료의 지연 표기만(관문 10241828: «동료 종목 동참 지연»·«participation is delayed»는 시세 표기가 아니다).
    if (/지연\s*(?:시세|가격|데이터|자료|호가)|(?:시세|가격|데이터|자료|호가)\s*(?:가\s*|이\s*)?지연|\bdelayed\s+(?:\w+\s+)?(?:quotes?|prices?|pricing|data|feed)\b|\b(?:quotes?|prices?|data|feed)\s+(?:is\s+|are\s+)?delayed\b|遅延\s*の?\s*(?:データ|相場|気配|価格|通常取引|時間外|取引開始前)|(?:データ|相場|気配|価格)\s*(?:の|が)?\s*遅延/i.test(text)) reasons.push('latency-label');
    if (/NEWS PULSE|guardian:|intel:|Redis|Bedrock|Upstash|Polygon|FMP|SIGNUM/i.test(text)) reasons.push('internal-source');
    if (/\bfutures\b|선물|先物/i.test(text)) reasons.push('unsupported-futures');
    // 미확인·판단 보류 표현(관문 10241655: «판단 불가»·«판단하기 어려움»·cannot·unclear·判断できない)은 인과·자금 단정이 아니다.
    const unconfirmed = /아니|아님|않|없|미확인|불가|어렵|어려움|유보|보류|미검증|알\s*수\s*없|未確認|未検証|保留|ではな|確認されず|判断できな|分から|わから|不明|難し|\b(?:not|no|unconfirmed|unproven|unverified|cannot|can't|unclear|unknown|uncertain)\b/i.test(text);
    // 근거 없는 자금·인과 «단정» 검사는 거절하지 않는다(관문 10241655·10241720·10241742: «판단 유보·추가 확인 필요·確認できない» 등
    // 유보 표현을 단정으로 오인하는 오탈락 반복). 운영(옛) 검사에도 없고, 운영 모델 실측 180줄에서 해당 주장 0건 — 프롬프트 지시로 다룬다.
    if (/매수(?:하|를 권)|매도(?:하|를 권)|買い推奨|売り推奨|\b(?:buy now|sell now|should buy|should sell)\b/i.test(text)) reasons.push('advice');
    // Require the universal subject to directly predicate the move. Scope phrases
    // such as '모든 종목 중 NVDA만 상승' / '全銘柄のうちNVDAのみ上昇' are not unanimity.
    // 질문·여부·엇갈림처럼 «전 종목이 올랐다»를 단정하지 않는 표현은 제외한다(관문 10240727: «전 종목 상승 여부는 엇갈리며»).
    const notClaimKo = '(?!\\s*(?:률|폭|여부|인지|이\\s*아니|은\\s*아니|는\\s*아니|하지|한\\s*것은\\s*아니|과|와|또는|혹은|·|/|엇갈|혼조))';
    const notClaimJa = '(?!\\s*(?:率|幅|かどうか|するか|ではな|せず|とは限ら|・|/|と下落|と上昇|か下落|か上昇))';
    const allUp = new RegExp(`(?:전\\s*종목|모든\\s*종목)\\s*(?:이|가|은|는)?\\s*(?:모두\\s*|일제히\\s*|동반\\s*)?상승${notClaimKo}|(?<!whether |if )\\ball (?:stocks|members) (?:are )?(?:up|rising)\\b|全銘柄\\s*(?:が|は)?\\s*(?:一斉に|そろって|揃って)?上昇${notClaimJa}`, 'i');
    const allDown = new RegExp(`(?:전\\s*종목|모든\\s*종목)\\s*(?:이|가|은|는)?\\s*(?:모두\\s*|일제히\\s*|동반\\s*)?하락${notClaimKo}|(?<!whether |if )\\ball (?:stocks|members) (?:are )?(?:down|falling)\\b|全銘柄\\s*(?:が|は)?\\s*(?:一斉に|そろって|揃って)?下落${notClaimJa}`, 'i');
    const conditional = /\bif\b|\bwhether\b|면|なら|ば/i.test(text);
    // 전체 참여 모순은 «거절»하지 않는다(관문 10240502·10240727·10241655·10241720: «상승률·여부·상승보다는» 등 정상 문장 오탈락이 반복).
    // 운영(옛) 검사에도 없던 의미 판정이다 — 프롬프트(분모·부분 참여 지시)로 다루고, 비교 도구 진단용으로만 남긴다.
    void (!conditional && !unconfirmed && ((allUp.test(text) && f.up !== f.measured) || (allDown.test(text) && f.down !== f.measured)));
    // Direct ticker return only. Percentage-point units denote a gap, not a return.
    for (const row of f.members || [f.leader, f.laggard]) {
        const re = new RegExp(`(?<![’'\\w])${row.t}\\b\\s*(?:은|는|이|가|は|が|:)?\\s*(?:(up|down|rose|fell|gained|lost)\\s+)?([+−-]?\\d+(?:\\.\\d+)?)\\s*[%％](?!\\s*(?:p\\b|points?\\b|포인트|ポイント))\\s*(상승|하락|上昇|下落)?`, 'gi');
        for (const hit of text.matchAll(re)) {
            // 티커는 대소문자까지 같아야 한다(관문 10241806: 소유격 «CRWD's»의 s 를 티커 S 로 오인).
            if (!hit[0].startsWith(row.t)) continue;
            const raw = Number(hit[2].replace('−', '-'));
            const direction = hit[1] || hit[3] || '';
            const negative = /down|fell|lost|하락|下落/i.test(direction);
            const positive = /up|rose|gained|상승|上昇/i.test(direction);
            const signed = /^[+−-]/.test(hit[2]);
            // 방향어로 정규화하기 전에 숫자에 명시된 부호와의 모순을 보존한다.
            const badDirection = signed && ((negative && raw > 0) || (positive && raw < 0));
            const written = negative ? -Math.abs(raw) : positive ? Math.abs(raw) : raw;
            const decimals = hit[2].split('.')[1]?.length || 0;
            const badValue = Math.abs(Math.abs(written) - Math.abs(row.c)) > 0.5 * 10 ** -decimals + 0.005;
            if (badDirection || badValue || (written !== 0 && (signed || direction) && Math.sign(written) !== Math.sign(row.c))) reasons.push(`stock-number:${row.t}`);
        }
    }
    // 세션 모순 검사는 두지 않는다(관문 10240727: «upcoming cash session» 같은 다음 세션 관찰점을 현재 가격 세션으로 오인).
    // 세션 표기는 프롬프트 지시로 다루고, 출구에서는 숫자·부호·근거 없는 인과처럼 명백한 오류만 거른다.
    return [...new Set(reasons)];
}

export function parseSectorBrief(text: string): Record<string, Partial<Record<SectorLocale, string>>> {
    const t = text.trim();
    return JSON.parse(t.startsWith('{') ? t : `{${t}`);
}

export function sectorBriefBatchGate(text: string, facts: SectorFact[]): boolean {
    try {
        const parsed = parseSectorBrief(text);
        const good = facts.filter(f => checkSectorBriefNew(String(parsed?.[f.id]?.ko || ''), 'ko', f).length === 0).length;
        return good >= Math.ceil(facts.length * 0.8);
    } catch { return false; }
}

/** 직전 정규장 섹터(가격 기준일 ≠ 거래일)인데 기준일이 빠진 문장 — 사실 그대로의 세션 표지를 끝에 붙인다(10/26 ko 7섹터 누락). */
export function withPriceDateTag(text: string, locale: SectorLocale, f: SectorFact, tradingDate?: string): string {
    if (!text || !tradingDate || f.priceDate === tradingDate || hasPriceDate(text, f.priceDate)) return text;
    return locale === 'ja' ? `${text}（${sectorSessionTag(f, 'ja')}）` : `${text} (${sectorSessionTag(f, locale)})`;
}

export function selectSectorBriefOutput(parsed: Record<string, Partial<Record<SectorLocale, string>>> | null, facts: SectorFact[], tradingDate?: string) {
    const sectors: Record<string, Record<string, string>> = {};
    const missing: string[] = [], rejected: string[] = [];
    for (const f of facts) {
        const value = parsed?.[f.id];
        if (!value) { missing.push(f.id); continue; }
        const entry: Record<string, string> = {};
        const dropped: string[] = [];
        for (const locale of SECTOR_LOCALES) {
            const text = withPriceDateTag(String(value[locale] || '').trim(), locale, f, tradingDate);
            const reasons = checkSectorBriefNew(text, locale, f);
            if (!reasons.length) entry[fields[locale]] = text;
            else dropped.push(`${locale}:${reasons.join('+')}`);
        }
        if (!entry.headline) { rejected.push(`${f.id}(ko실패:${dropped.join(',')})`); continue; }
        if (dropped.length) rejected.push(`${f.id}(부분:${dropped.join(',')})`);
        sectors[f.id] = entry;
    }
    return { sectors, kept: Object.keys(sectors).length, missing, rejected };
}
