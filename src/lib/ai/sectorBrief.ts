import { forecastHits } from './trustLayer';
import { ungroundedNumbers } from './factGrounding';
import type { SectorFact } from './sectorBriefFacts';

export type SectorLocale = 'ko' | 'en' | 'ja';
export const SECTOR_LOCALES: SectorLocale[] = ['ko', 'en', 'ja'];
const fields = { ko: 'headline', en: 'headlineEN', ja: 'headlineJP' } as const;
const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;
const numericFacts = (f: SectorFact) => [f.measured, f.total, f.up, f.down, f.flat, f.avgChangePct, f.leader.c, f.laggard.c, f.spreadPct];

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
        'Use members and exLeaderAvgChangePct to distinguish a single-name lift from participation; avgChangePct is an equal-weight mean of measured members, never an ETF or index return.',
        'Keep the denominator honest: measured members are a sample of total members. Never turn partial coverage into all-sector participation.',
        'Explain dispersion as a gap between stock moves; spreadPct is percentage POINTS, not a stock return. Avoid bare jargon such as risk-on, rotation, bifurcation or alpha.',
        'If room remains, name the next observable test with two interpretations: peers join = broader participation; peers do not = concentrated leadership. This is a conditional reading, never a price forecast.',
        'Do not force a four-part essay into this line. Clarity of the observed structure takes priority over the optional next test.',
        'Causal evidence: NONE supplied. Price co-movement does not establish why it happened. Do not invent earnings, rates, AI demand, policy, institutional buying, fund flows or investor intent.',
        'Do not attach a generic market headline to a sector. No causal news claim without sector relevance and an event/report time; this price-only contract supplies neither.',
        'State the price session in reader language: PRE = 개장 전/premarket/取引開始前; REG = 정규장/cash/通常取引; POST = 장후/after-hours/時間外.',
        'If priceDate differs from the trading date, include M/D of priceDate and its session; never describe prior REG as current PRE or POST.',
        'No futures/index comparison is supplied. Do not mention futures, benchmark outperformance or data-latency labels in any language.',
        'Numbers must belong to the named subject in this sector. Copy signs correctly. Use one useful number, not a metric inventory.',
        'Never predict or advise buying/selling. No will/expected rally/예상/전망/見込み/予想. Conditional participation tests are allowed without forecasting the outcome.',
        'Korean ends in 관측/확인 or a natural observational sentence; Japanese 観測/確認; English plain observed/holding/diverging when natural.',
        'ko is Korean, en English, ja Japanese; ticker symbols/numbers/session abbreviations are allowed. All three must express the same facts and interpretation.',
        'No internal provider/cache/source names, meta commentary, markdown, bullet points or readiness placeholders.',
        'Return ONLY JSON keyed by every supplied sector id: {"m7":{"ko":"...","en":"...","ja":"..."}, ...}',
    ].join('\n');
    // Do not pass unrelated PRE news, futures or dated options into a price-distribution line.
    const input = facts.map(({ priorOptions: _prior, ...f }) => f);
    const userPrompt = [
        `Session: ${session} (ET). Trading date: ${todayET}.`,
        'Measured facts per sector (change % belongs to priceBasis and priceDate, not necessarily today):',
        JSON.stringify(input, null, 1),
        'Only use numeric values from the measured price/breadth fields in verdicts; priceDate may be rendered M/D.',
        `Return ALL ${facts.length} sector ids in ko/en/ja: ${facts.map(f => f.id).join(', ')}. JSON only.`,
    ].join('\n');
    return { system, userPrompt };
}

/** New generations only. Do not reject for style, length target, missing jargon/gloss or absent two-way clause. */
export function checkSectorBriefNew(text: string, locale: SectorLocale, f: SectorFact): string[] {
    // Session dates are not price/count numbers. Strip only the supplied date, never arbitrary numbers.
    const [, m, d] = f.priceDate.split('-');
    const dateFree = text.replaceAll(f.priceDate, '').replace(new RegExp(`\\b0?${Number(m)}/0?${Number(d)}\\b`, 'g'), '');
    const reasons = checkSectorBriefLegacy(text, locale);
    const allowed = [...numericFacts(f), ...(f.members?.map(r => r.c) || []), f.exLeaderAvgChangePct ?? NaN];
    reasons.push(...ungroundedNumbers(dateFree, allowed).map(n => `number:${n}`));
    if (/지연|\bdelay(?:ed)?\b|遅延/i.test(text)) reasons.push('latency-label');
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
        const re = new RegExp(`\\b${row.t}\\b\\s*(?:은|는|이|가|は|が|:)?\\s*(?:(up|down|rose|fell|gained|lost)\\s+)?([+−-]?\\d+(?:\\.\\d+)?)\\s*[%％](?!\\s*(?:p\\b|points?\\b|포인트|ポイント))\\s*(상승|하락|上昇|下落)?`, 'gi');
        for (const hit of text.matchAll(re)) {
            const raw = Number(hit[2].replace('−', '-'));
            const direction = hit[1] || hit[3] || '';
            const negative = /down|fell|lost|하락|下落/i.test(direction);
            const positive = /up|rose|gained|상승|上昇/i.test(direction);
            const signed = /^[+−-]/.test(hit[2]);
            const written = negative ? -Math.abs(raw) : positive ? Math.abs(raw) : raw;
            const decimals = hit[2].split('.')[1]?.length || 0;
            const badValue = Math.abs(Math.abs(written) - Math.abs(row.c)) > 0.5 * 10 ** -decimals + 0.005;
            if (badValue || (written !== 0 && (signed || direction) && Math.sign(written) !== Math.sign(row.c))) reasons.push(`stock-number:${row.t}`);
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

export function selectSectorBriefOutput(parsed: Record<string, Partial<Record<SectorLocale, string>>> | null, facts: SectorFact[]) {
    const sectors: Record<string, Record<string, string>> = {};
    const missing: string[] = [], rejected: string[] = [];
    for (const f of facts) {
        const value = parsed?.[f.id];
        if (!value) { missing.push(f.id); continue; }
        const entry: Record<string, string> = {};
        const dropped: string[] = [];
        for (const locale of SECTOR_LOCALES) {
            const text = String(value[locale] || '').trim();
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
