import { createHash } from 'node:crypto';
import { etDateOf } from '@/lib/marketCalendar';
import { dropElapsedScheduled, isUpcomingLine, scheduledLineAt } from './evidenceTime';
import { textIntegrityReasons } from './textIntegrity';

export type FactDirection = 'up' | 'down' | 'flat';
type Locale = 'ko' | 'en' | 'ja';
export interface TacticalFacts {
    version: 1;
    asOfDate: string;
    metrics: Record<string, { value: number; sign: -1 | 0 | 1; magnitude: number; direction: FactDirection | null; asOfDate: string }>;
    news: Array<{ id: string; publishedAt: string; source: string; text: string; directions: Array<{ key: string; direction: FactDirection }> }>;
    events: Array<{ id: string; at: string | null; exact: boolean; upcoming: boolean; text: string }>;
}

// 수준의 부호를 등락으로 바꾸지 않는다. TLT와 금리는 서로 다른 관측값이다.
const CHANGE_KEYS = new Set(['nasdaqChange', 'spxChangePct', 'goldChangePct', 'oilChangePct', 'btcChangePct', 'tltChangePct',
    'us10yChangeBp', 'dxyChangePct', 'vixChangePct', 'gexChange']);
const CANONICAL: Record<string, string> = {
    NDX_CHG: 'nasdaqChange', SPX_CHG: 'spxChangePct', GOLD_CHG: 'goldChangePct', OIL_CHG: 'oilChangePct',
    BTC_CHG: 'btcChangePct', TLT_CHG: 'tltChangePct', US10Y: 'us10y', DXY: 'dxy', VIX: 'vix', RLSI: 'rlsiScore',
    GEX: 'gexIndex', BREADTH: 'breadthPct', SQUEEZE: 'squeezeRisk',
};
const idOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** 세 언어가 공유하는 사실 정본. 모델·네트워크 호출 없이 입력값과 시각 계약만 사용한다. */
export function buildTacticalFacts<T extends { asOf?: string; metricsAsOf?: string; marketNewsHeadlines?: string[]; scheduledEvents?: string[] }>(ctx: T): TacticalFacts {
    const now = Date.parse(ctx.asOf || new Date(Date.now()).toISOString());
    const asOfDate = etDateOf(now);
    const metricsDate = ctx.metricsAsOf ? etDateOf(Date.parse(ctx.metricsAsOf)) : asOfDate;
    const metrics: TacticalFacts['metrics'] = {};
    for (const [rawKey, value] of Object.entries(ctx)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        const key = CANONICAL[rawKey] || rawKey;
        const sign = Math.sign(value) as -1 | 0 | 1;
        metrics[key] = { value, sign, magnitude: Math.abs(value), direction: CHANGE_KEYS.has(key) ? sign > 0 ? 'up' : sign < 0 ? 'down' : 'flat' : null, asOfDate: metricsDate };
    }
    const news: TacticalFacts['news'] = [];
    for (const text of ctx.marketNewsHeadlines || []) {
        const m = text.match(/^\[([^;\]]+); (\d{4}-\d\d-\d\dT[^;\]]+)[;\]]/);
        const at = m ? Date.parse(m[2]) : NaN;
        if (!m || !Number.isFinite(at) || at > now || etDateOf(at) !== asOfDate || textIntegrityReasons(text).length) continue;
        // 원천 id 없는 기존 근거 줄도 발행시각·출처·내용으로 식별 가능하게 한다.
        const body = text.replace(/^\[[^\]]*\]\s*/, '');
        // 우려·예상은 실제 움직임이 아니다. 모호한 원문을 코드가 사실로 승격하지 않는다.
        const speculative = /\b(?:may|might|could|would|will|forecast|expect\w*|outlook|concern\w*|fear\w*|worr\w*)\b|우려|전망|예상|가능|懸念|見通し|予想|恐れ/i.test(body);
        const directions = speculative ? [] : directionClaims(body).filter(c => !c.negated && !c.unverifiable).map(({ key, direction }) => ({ key, direction }));
        news.push({ id: `news:${idOf(text)}`, publishedAt: new Date(at).toISOString(), source: m[1], text, directions });
    }
    const events = dropElapsedScheduled(ctx.scheduledEvents || [], now).map(text => {
        const at = scheduledLineAt(text);
        return { id: `event:${idOf(text)}`, at: at === null ? null : new Date(at).toISOString(),
            exact: at !== null && /\b\d{2}:\d{2}(?::\d{2})? ET\b/.test(text) && !/timing boundary|release time unknown/.test(text),
            upcoming: isUpcomingLine(text, now), text };
    });
    return { version: 1, asOfDate, metrics, news, events };
}

// 이름과 방향을 묶어서 검사한다. 다른 지표의 반대 방향을 이 지표에 붙이지 않는다.
const SUBJECTS: Array<{ key: string; re: RegExp }> = [
    // 정책금리는 국채 수익률과 다른 사실이다. 입력 뉴스의 방향으로만 검증한다.
    { key: 'policyRateChange', re: /\b(?:policy\s+(?:interest\s+)?rates?|federal\s+funds\s+(?:target\s+)?rates?)\b|(?:정책|기준)\s*금리|(?:政策|基準)金利/gi },
    { key: 'us10yChangeBp', re: /\b(?:yields?|(?:interest\s+)?rates?)\b|금리|利回り|金利/gi },
    { key: 'nasdaqChange', re: /\b(?:NASDAQ(?:[ -]100)?|NDX|QQQ)\b|나스닥|ナスダック/gi },
    { key: 'spxChangePct', re: /\b(?:S&P\s?500|SPX|SPY)\b/gi },
    { key: 'tltChangePct', re: /\bTLT\b|\bbond\s+prices?\b|채권\s*가격|債券価格/gi },
    { key: 'dxyChangePct', re: /\b(?:DXY|dollar(?:\s+index)?)\b|달러(?:\s*인덱스)?|ドル(?:指数)?/gi },
    { key: 'vixChangePct', re: /\bVIX\b|변동성|ボラティリティ/gi },
    { key: 'goldChangePct', re: /\bgold\b|금값|금\s*가격|金価格|金相場/gi },
    { key: 'oilChangePct', re: /\b(?:oil|crude|WTI)\b|유가|원유|原油/gi },
    { key: 'btcChangePct', re: /\b(?:bitcoin|BTC)\b|비트코인|ビットコイン/gi },
    { key: 'gexChange', re: /\b(?:GEX|gamma)\b|감마|ガンマ/gi },
    // 다른 주어의 약화·강화를 직전 금리/지수에 붙이지 않기 위한 절 경계.
    { key: '', re: /\b(?:demand|pressure|absorption|breadth|participation|support)\b|수요|압력|흡수력|참여폭|需要|圧力|吸収力|ブレッドス/gi },
];

export const TACTICAL_DIRECTION_WORDS: Record<Locale, Record<FactDirection, string>> = {
    ko: { up: '상승|급등|반등|오름|강세|강화|올랐|오른|오르|높아', down: '하락|급락|내림|약세|약화|떨어|내렸|내린|내려|내리|낮아', flat: '보합|횡보|변동\\s*없' },
    en: { up: '\\b(?:up|rise[sn]?|rising|rose|risen|higher|rall(?:y|ies|ied|ying)|gains?|gained|gaining|stronger|strength(?:ens?|ened|ening)?)\\b',
        down: '\\b(?:down|falls?|falling|fell|fallen|lower|drops?|dropped|dropping|declin(?:e[sd]?|ing)|weaker|weaken(?:s|ed|ing)?)\\b', flat: '\\b(?:flat|unchanged|sideways)\\b' },
    ja: { up: '上昇|上が|上げ|高ま|強気|強含み|上伸', down: '下落|低下|下が|下げ|弱気|弱含み|軟化', flat: '横ばい|変わらず' },
};

// 방향을 가진 금리 절의 부정·가정은 의미를 역산하지 않고 fail-closed 처리한다.
const RATE_UNVERIFIABLE = /않|(?<![가-힣])안(?=\s)|못|아니|아닙|아닌|아님|아닐|ない|なかった|ません|ず|\b(?:not|no\s+longer|never|if|unless|should|would|could)\b|n['’]t\b|경우|면(?=\s|$)|라면|다면|場合|なら|れば|たら/iu;
const RATE_KEYS = new Set(['us10yChangeBp', 'policyRateChange']);
interface DirectionClaim { key: string; direction: FactDirection; word: string; negated: boolean; unverifiable: boolean }
// 앞 수식(«falling yields»·«하락한 금리»·«下落した金利»)으로 방향어가 바로 뒤 주어에 붙는 틈.
const PREFIX_GAP: Record<Locale, RegExp> = {
    en: /^\s*(?:US\s+|Treasury\s+|10-year\s+)*$/i,
    ko: /^\s*(?:(?:한|하는|했던|하던|중인|세인|인|진|지는)\s*)?$/,
    ja: /^\s*(?:(?:した|している|していた|する|の)\s*)?$/,
};
// 서술(«gold fell»·«금값은 하락»·«金価格は下落»)로 방향어가 바로 앞 주어에 붙는 틈. 조사·보조어·수치만 허용한다.
const POSTFIX_GAP: Record<Locale, RegExp> = {
    en: /^\s*(?:(?:prices?|futures|index|levels?|support|exposure|positioning)\s+)?(?:(?:is|are|was|were|has|have|had|been|also|all|both|sharply|slightly|modestly|further|[+\-−]?\d+(?:\.\d+)?\s*(?:%|bps?)?)\s+){0,3}$/i,
    ko: /^\s*(?:(?:가격|선물|지수|방어|지지|노출|포지션)\s*)?(?:[은는이가도의]\s*)?(?:(?:크게|소폭|다소|더|추가로?|모두|[+\-−]?\d+(?:\.\d+)?\s*(?:%|bp|포인트)?)\s*){0,2}$/,
    ja: /^\s*(?:(?:価格|先物|指数|防御|支持)\s*)?(?:[はがもの]\s*)?(?:(?:大きく|小幅に?|やや|さらに|[+\-−]?\d+(?:\.\d+)?\s*(?:%|bp)?)\s*){0,2}$/,
};
// 소수점은 절 경계가 아니다. 대조 접속사는 다른 주어와의 잘못된 결합을 막는다.
const CLAUSE_SPLIT = /((?<!\d)[.,](?!\d)|[。!?！？;；,，]|\b(?:and|or|while|whereas|but|yet|however|although|because)\b|\s+(?=(?:if|unless)\b)|반면|으며|지만|는데|(?<=[가-힣])고(?=\s)|一方|しかし|また|したが|しており)/iu;
// 주어 나열(«Yields, gold and oil»·«Yields and gold»)을 끊는 약한 경계.
const SOFT_BOUNDARY = /^(?:,|，|and|or|また)$/i;
const DIRECTIONS = (Object.keys(TACTICAL_DIRECTION_WORDS) as Locale[]).flatMap(locale =>
    (['up', 'down', 'flat'] as const).map(direction => ({ locale, direction, re: new RegExp(TACTICAL_DIRECTION_WORDS[locale][direction], 'gi') })));
const hasDirectionWord = (text: string) => DIRECTIONS.some(({ re }) => new RegExp(re.source, 'i').test(text));
const subjectsOf = (clause: string) => {
    const matches = SUBJECTS.flatMap(s => [...clause.matchAll(s.re)].map(m => ({ key: s.key, start: m.index!, end: m.index! + m[0].length })));
    // «policy rates» 안의 «rates»처럼 겹친 이름은 더 구체적인 전체 주어를 쓴다.
    return matches.filter(s => !matches.some(other => other !== s && other.start <= s.start && other.end >= s.end
        && other.end - other.start > s.end - s.start));
};
const hasRateSubject = (text: string) => subjectsOf(text).some(s => RATE_KEYS.has(s.key));
/** 절 분할 뒤 금리 절을 넓힌다(fail-closed).
 * ① 방향어 없는 조각(주어 나열)은 약한 경계(쉼표·and·or)를 넘어 앞뒤 조각과 한 절(«Yields, gold and oil fell»·«Falling gold and yields»).
 * ② 주어 없이 방향어만 있는 조각은 문장 안에서 앞 금리 절에 붙인다(«Yields rose and then fell»·«上昇したが、その後下落»). */
function clausesOf(text: string): string[] {
    const parts = text.split(CLAUSE_SPLIT);
    const clauses: string[] = [];
    let current = parts[0] ?? '';
    for (let i = 1; i < parts.length; i += 2) {
        const boundary = parts[i] ?? '', next = parts[i + 1] ?? '';
        const soft = SOFT_BOUNDARY.test(boundary.trim());
        const sentenceEnd = /^[.。!?！？]$/.test(boundary.trim());
        // 방향어 없는 조각은 주어 나열의 일부다. 나열 전체를 한 절로 묶어 금리 주어를 떼어 내지 않는다.
        const join = (soft && (!hasDirectionWord(parts[i - 1] ?? '') || !hasDirectionWord(next)))
            || (!sentenceEnd && hasRateSubject(current) && !subjectsOf(next).length && hasDirectionWord(next));
        if (join) current += boundary + next;
        else { clauses.push(current); current = next; }
    }
    clauses.push(current);
    return clauses;
}
function directionClaims(text: string): DirectionClaim[] {
    const result: DirectionClaim[] = [];
    for (const clause of clausesOf(text)) {
        const rateUnverifiable = RATE_UNVERIFIABLE.test(clause);
        const subjects = subjectsOf(clause);
        const rateSubjects = subjects.filter(s => RATE_KEYS.has(s.key));
        // 같은 절에 금리 이름·방향어·표지가 있으면 거리나 관형 어미를 해석하지 않는다.
        // «하락하지 않은 금리»도 정상 관형 어미 사전 밖이라는 이유로 통과시키지 않는다.
        if (rateUnverifiable) for (const subject of rateSubjects) {
            for (const { direction, re } of DIRECTIONS) {
                const word = clause.match(re)?.[0];
                if (word) result.push({ key: subject.key, direction, word, negated: false, unverifiable: true });
            }
        }
        const words: Array<{ direction: FactDirection; word: string; negated: boolean; bound: typeof subjects }> = [];
        for (const { locale, direction, re } of DIRECTIONS) for (const m of clause.matchAll(re)) {
            const start = m.index!, end = start + m[0].length;
            const left = subjects.filter(s => s.end <= start).sort((a, b) => b.end - a.end)[0];
            const right = subjects.filter(s => s.start >= end).sort((a, b) => a.start - b.start)[0];
            // «falling yields»·«하락한 금리»·«下落した金利»는 뒤 주어를 수식한다.
            // 언어별 관형 어미만 허용해 앞 절의 방향을 먼 주어에 붙이지 않는다.
            const prefix = !!right && PREFIX_GAP[locale].test(clause.slice(end, right.start));
            const postfix = !!left && POSTFIX_GAP[locale].test(clause.slice(left.end, start));
            const subject = prefix ? right : left;
            const before = clause.slice(prefix ? Math.max(0, start - 24) : subject ? subject.end : 0, start), after = clause.slice(end);
            if (/^.{0,12}(?:미확인|未確認|unconfirmed)/i.test(after)) continue;
            const negated = /\b(?:not|no)\s+(?:\w+\s+)?$/i.test(before) || /^(?:[은는이가을를のはが]?\s*)(?:아니|아닙|아닌|아님|아닐|않|ではな|していな)/.test(after);
            words.push({ direction, word: m[0], negated, bound: [...(prefix ? [right!] : []), ...(postfix ? [left!] : [])] });
            if (!subject?.key || Math.min(Math.abs(start - subject.end), Math.abs(subject.start - end)) > 48) continue;
            if (RATE_KEYS.has(subject.key) && rateUnverifiable) continue;
            result.push({ key: subject.key, direction, word: m[0], negated, unverifiable: false });
        }
        // 절 단위 fail-closed: 금리 주어에 바로 붙은 방향어가 없으면 절 안 모든 방향어를 금리 주장으로 본다
        // («금리와 금값은 하락»·«Yields and gold fell»·«金利と金価格は下落»). 바로 붙은 방향어가 있어도
        // 다른 주어에 바로 붙지 않은 방향어는 금리 주장으로 본다. 오탐(정상 문장 탈락)은 허용한다.
        if (rateUnverifiable) continue;
        for (const rate of rateSubjects) {
            // «금리 압력»·«rate pressure»처럼 금리가 바로 뒤 명사를 꾸미면 그 명사가 주어 머리다. 머리에 붙은 방향어도 금리 주장으로 본다.
            const head = subjects.find(s => !s.key && s.start >= rate.end && /^\s*(?:의|の)?\s*$/.test(clause.slice(rate.end, s.start)));
            const mine = (w: typeof words[number]) => w.bound.includes(rate) || (!!head && w.bound.includes(head));
            const own = words.some(mine);
            for (const w of words) {
                // 다른 주어에 바로 붙은 방향어만 면제한다. 금리에 직접 방향어가 없고 머리 명사만 있으면 금리보다 앞선 주어의 방향어만 면제한다
                // («수요 약화와 금리 압력»은 통과, «금리 압력과 금값은 하락»은 거부).
                const exempt = !mine(w) && w.bound.length > 0
                    && (own || (!!head && w.bound.every(b => b.end <= rate.start)));
                if (exempt) continue;
                result.push({ key: rate.key, direction: w.direction, word: w.word, negated: w.negated, unverifiable: false });
            }
        }
    }
    // 같은 주장이 일반 결합과 fail-closed 결합 양쪽에서 나오면 하나로 센다.
    return [...new Map(result.map(c => [JSON.stringify(c), c])).values()];
}

/** 숫자 없는 방향 주장도 검사. 수준만 있거나 TLT만 있으면 금리 방향을 만들어 내지 않는다. */
export function tacticalFactReasons(text: string, facts: TacticalFacts): string[] {
    const reasons: string[] = [];
    for (const claim of directionClaims(text)) {
        if (claim.unverifiable) {
            reasons.push(`tactical:facts-direction:${claim.key}:unverifiable:${claim.direction}`);
            continue;
        }
        const expected = facts.metrics[claim.key]?.direction;
        // 감마의 강/약·흡수력은 GEX 변화량과 다르다. 시간 변화어만 대조한다.
        if (claim.key === 'gexChange' && /강|약|強|弱|strength|weak/i.test(claim.word)) continue;
        if (expected) {
            if (claim.negated ? claim.direction === expected : claim.direction !== expected) reasons.push(`tactical:facts-direction:${claim.key}:${expected}:${claim.negated ? 'not-' : ''}${claim.direction}`);
        } else {
            if (claim.negated) continue;
            // 관측 변화량이 없을 때 원문 뉴스에 명시된 같은 방향의 보도만 허용한다.
            const reported = facts.news.flatMap(n => n.directions)
                .filter(c => c.key === claim.key);
            if (reported.length && reported.every(c => c.direction === claim.direction)) continue;
            if (claim.key === 'gexChange') continue;
            reasons.push(`tactical:facts-direction:${claim.key}:unknown:${claim.direction}`);
        }
    }
    return [...new Set(reasons)];
}

export function tacticalPromptFacts(prompt: string): TacticalFacts | null {
    try {
        const value = JSON.parse(prompt.match(/^FACTS: (.+)$/m)?.[1] || 'null');
        return value?.version === 1 && value.metrics && Array.isArray(value.news) && Array.isArray(value.events) ? value : null;
    } catch { return null; }
}
