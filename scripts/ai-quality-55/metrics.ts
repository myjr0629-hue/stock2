/** aiq55 전·후 표의 측정 정의 — 가드와 같은 함수(lib/ai/aiqGuard)를 쓴다. 순수 함수. */
import { AIQ_TOPIC, hasAsOfMarker, hasRealNumber, measureAiqText } from '../../src/lib/ai/aiqGuard';
import { splitSentences } from '../../src/lib/ai/trustLayer';
import type { AiqLoc } from '../../src/lib/ai/aiqContext';

export interface Slot { loc: AiqLoc; field: string; text: string }

const isTri = (o: any) => o && typeof o === 'object' && ['ko', 'en', 'ja'].some((l) => typeof o[l] === 'string');
const tri = (o: any, field: string, out: Slot[]) => { if (isTri(o)) for (const l of ['ko', 'en', 'ja'] as const) if (typeof o[l] === 'string' && o[l]) out.push({ loc: l, field, text: o[l] }); };

export function slotsOfRun(surface: string, locale: string, body: any): Slot[] {
    const out: Slot[] = [];
    if (!body || typeof body !== 'object') return out;
    if (surface === 'UC') {
        const loc = (locale === 'en' || locale === 'ja' ? locale : 'ko') as AiqLoc;
        if (typeof body.tickerRead === 'string' && body.tickerRead) out.push({ loc, field: 'tickerRead', text: body.tickerRead });
        for (const c of Array.isArray(body.cards) ? body.cards : []) for (const f of ['whyItMatters', 'moneyRead']) if (typeof c?.[f] === 'string' && c[f]) out.push({ loc, field: `cards.${f}`, text: c[f] });
    } else if (surface === 'Flow') {
        tri(body.structuralThesis, 'structuralThesis', out);
        (Array.isArray(body.factorHighlights) ? body.factorHighlights : []).forEach((h: any, i: number) => tri(h?.insight, `factorHighlights[${i}]`, out));
        tri(body.repricingCondition, 'repricingCondition', out);
    } else if (surface === 'Deep') {
        tri(body.currentState, 'currentState', out);
        (Array.isArray(body.sections) ? body.sections : []).forEach((s: any, i: number) => tri(s?.content, `sections[${i}]`, out));
        tri(body.keyInsight, 'keyInsight', out);
    } else if (surface === 'Intel') {
        for (const [t, a] of Object.entries<any>(body.analyses || {})) tri(a, `analyses.${t}`, out);
    }
    return out;
}

/** 데이터 영역(어떤 종류의 근거를 말하나) */
export const DOMAINS: Record<string, RegExp> = {
    levels: /Max Pain|Call Wall|Put Floor|Gamma Flip|콜\s?월|맥스\s?페인|풋\s?플로어|감마\s?플립|マックスペイン|コールウォール/i,
    offex: /off-exchange|dark[\s-]?pool|FINRA|장외|다크\s?풀|場外|ダークプール/i,
    implied: /implied move|price[sd]? in|straddle|expected move|변동폭|반영한|내재\s*변동|想定変動|織り込|ストラドル/i,
    holders13f: /13F|BlackRock|Vanguard|FMR|State Street|보고\s*기관|reporting institutions|報告機関/i,
    ranking: /ranking|ranked|랭킹|순위|ランキング|順位/i,
    earnings: /earnings|실적|決算|D-\d/i,
    insider: /insider|내부자|インサイダー|Form 4/i,
    news: /news|headline|뉴스|ニュース|기사|記事/i,
    whale: /whale|고래|ホエール|net premium|순\s*프리미엄|new position|신규\s*포지션|新規ポジション|unusual|UOA/i,
    gamma: /gamma|감마|ガンマ|GEX/i,
    squeeze: /squeeze|스퀴즈|スクイーズ|short interest|공매도|空売り/i,
    pcr: /P\/C|put[\s/-]call|풋\s?콜|プット[\s/]?コール/i,
    vol: /\bIV\b|implied vol|변동성|ボラティリティ|skew|스큐|スキュー/i,
};
export const NEW_DOMAINS = ['offex', 'implied', 'holders13f', 'ranking', 'earnings'];
export const domainsIn = (text: string): string[] => Object.entries(DOMAINS).filter(([, re]) => re.test(text)).map(([k]) => k);

export interface OutMetrics {
    loc: AiqLoc; chars: number; numbers: number; grounded: number; ungrounded: number;
    factSentences: number; datedFacts: number; anyAsOf: boolean;
    topicWithNumber: number; topicWithAsOf: number;
    domains: string[]; newDomains: string[]; filler: number;
}

export function measureOutput(slots: Slot[], loc: AiqLoc, ground: string, newList: string[] = NEW_DOMAINS): OutMetrics | null {
    const mine = slots.filter((s) => s.loc === loc);
    if (!mine.length) return null;
    const text = mine.map((s) => s.text).join('\n');
    const m = measureAiqText(text, loc, ground);
    let fact = 0, dated = 0;
    for (const sl of mine) {
        const sents = splitSentences(sl.text);
        sents.forEach((s, i) => {
            if (!hasRealNumber(s)) return;
            fact++;
            if (hasAsOfMarker(s, loc) || (i > 0 && hasAsOfMarker(sents[i - 1], loc))) dated++;
        });
    }
    const domains = domainsIn(text);
    void AIQ_TOPIC;
    return {
        loc, chars: text.length, numbers: m.numbers, grounded: m.grounded, ungrounded: m.ungrounded,
        factSentences: fact, datedFacts: dated, anyAsOf: m.anyAsOf,
        topicWithNumber: m.topicWithNumber, topicWithAsOf: m.topicWithAsOf,
        domains, newDomains: domains.filter((d) => newList.includes(d)), filler: m.filler,
    };
}

export const pctl = (xs: number[], p: number): number | null => {
    if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b);
    const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
