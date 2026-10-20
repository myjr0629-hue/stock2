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
        const directions = speculative ? [] : directionClaims(body).filter(c => !c.negated).map(({ key, direction }) => ({ key, direction }));
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

interface DirectionClaim { key: string; direction: FactDirection; word: string; negated: boolean }
function directionClaims(text: string): DirectionClaim[] {
    const result: DirectionClaim[] = [];
    // 소수점은 절 경계가 아니다. 대조 접속사는 다른 주어와의 잘못된 결합을 막는다.
    const clauses = text.split(/(?<!\d)[.,](?!\d)|[。!?！？;；,，]|\b(?:while|whereas|but)\b|반면|一方/iu);
    const directions = (Object.keys(TACTICAL_DIRECTION_WORDS) as Locale[]).flatMap(l =>
        (['up', 'down', 'flat'] as const).map(direction => ({ direction, re: new RegExp(TACTICAL_DIRECTION_WORDS[l][direction], 'gi') })));
    for (const clause of clauses) {
        if (/\b(?:if|unless)\b|만약|경우|라면|なら|場合/i.test(clause)) continue;
        const subjects = SUBJECTS.flatMap(s => [...clause.matchAll(s.re)].map(m => ({ key: s.key, start: m.index!, end: m.index! + m[0].length })));
        for (const { direction, re } of directions) for (const m of clause.matchAll(re)) {
            const start = m.index!, end = start + m[0].length;
            const left = subjects.filter(s => s.end <= start).sort((a, b) => b.end - a.end)[0];
            const right = subjects.filter(s => s.start >= end).sort((a, b) => a.start - b.start)[0];
            // 영어의 «falling yields»·«higher rates»도 인정. 뒤 주어까지 공백만 있으면 수식 관계가 우선.
            const prefix = /^[A-Za-z]/.test(m[0]) && right && /^\s*(?:US\s+|Treasury\s+|10-year\s+)*$/i.test(clause.slice(end, right.start));
            const subject = prefix ? right : left;
            if (!subject?.key || Math.min(Math.abs(start - subject.end), Math.abs(subject.start - end)) > 48) continue;
            const before = clause.slice(prefix ? Math.max(0, start - 24) : subject.end, start), after = clause.slice(end);
            if (/^.{0,12}(?:미확인|未確認|unconfirmed)/i.test(after)) continue;
            const negated = /\b(?:not|no)\s+(?:\w+\s+)?$/i.test(before) || /^(?:[은는이가을를のはが]?\s*)(?:아니|아닙|아닌|아님|아닐|않|ではな|していな)/.test(after);
            result.push({ key: subject.key, direction, word: m[0], negated });
        }
    }
    return result;
}

/** 숫자 없는 방향 주장도 검사. 수준만 있거나 TLT만 있으면 금리 방향을 만들어 내지 않는다. */
export function tacticalFactReasons(text: string, facts: TacticalFacts): string[] {
    const reasons: string[] = [];
    for (const claim of directionClaims(text)) {
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
