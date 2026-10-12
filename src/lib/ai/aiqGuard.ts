/**
 * aiq55 출구 가드 — 새 입력(장외 비중·옵션이 반영한 변동폭·13F·랭킹·실적 D-n)을 인용한 문장이 «근거 숫자»와 «기준 시각»을 지키는가. 순수 함수만.
 *
 * 기존 가드(언어·거절문·연도·금액 자릿수·가격 수준·예측어)는 그대로 둔다 — 이 파일은 «새 사실 문장»만 본다.
 *   1) 숫자가 든 모든 문장은 그 숫자가 입력(system+user)에 있어야 한다(depthNumbers.checkNumberGrounding — 반올림 허용, 환산·차이 계산은 «지어낸 숫자»).
 *      어긋난 문장은 «그 문장만» 뺀다(글 전체를 버리지 않는다 — 남은 글이 쓸 만하면 통과). 못 쓸 만하면 사유로 돌려 호출자가 교정 재생성/다음 단으로 보낸다.
 *   2) 주제 숫자가 든 글(칸)에는 기준 시각 표지(날짜·마감 기준·분기말·as of)가 하나 이상 있어야 한다 — 없으면 asOfMissing(호출자가 교정 지시 또는 기록).
 *   3) 13F 는 분기 증감이 없다 — «기관이 늘렸다/팔았다/added/trimmed» 류가 13F 문장에 있으면 그 문장을 뺀다.
 */
import { checkNumberGrounding } from '@/lib/ai/depthNumbers';
import { splitSentences, forecastHitsInSentence } from '@/lib/ai/trustLayer';
import type { AiqLoc } from '@/lib/ai/aiqContext';

/** 새 사실을 말하는 문장인가(주제 단어) — 숫자가 같이 있을 때만 검사 대상이 된다 */
export const AIQ_TOPIC: Record<AiqLoc, RegExp> = {
    ko: /장외|다크\s?풀|FINRA|반영한\s*변동|내재\s*변동|옵션\s*예상\s*변동|예상\s*변동|변동폭|스트래들|13F|보고\s*기관|기관\s*(?:보유|투자자)|상위\s*보유|랭킹|순위|실적\s*발표|D-\d/i,
    en: /off-exchange|dark[\s-]?pool|FINRA|implied move|price[sd]?\s+in|straddle|13F|institutions?\s+(?:report|hold)|ranking|ranked|earnings\s+(?:on|date|countdown)|D-\d/i,
    ja: /場外|ダークプール|FINRA|想定変動|織り込|ストラドル|13F|報告機関|機関投資家|ランキング|順位|決算発表|D-\d/i,
};

/** 13F 문장에서 막는 말 — 분기 증감이 없는 색인이다 */
const HOLDERS_CHANGE: Record<AiqLoc, RegExp> = {
    ko: /(?:기관|운용사|보유자|BlackRock|Vanguard|FMR|State Street)[^.。]{0,30}(?:늘렸|줄였|매수|매도|사들|팔았|확대|축소|추가\s*매수|비중을\s*(?:늘|줄))/,
    en: /(?:institutions?|holders?|funds?|BlackRock|Vanguard|FMR|State Street)[^.]{0,30}\b(?:added|trimmed|bought|sold|increased|reduced|accumulat|dumped|raised|cut)\b/i,
    ja: /(?:機関|運用会社|保有者|BlackRock|Vanguard|FMR|State Street)[^。]{0,30}(?:買い増|売却|積み増|減ら|増や|買っ|売っ)/,
};
/**
 * 「데이터가 제공되지 않아…」류 메타 문장 — 입력이 비었다는 우리 쪽 사정을 사용자에게 말하는 군말이다(리뷰 불만의 slop). 새 입력이 켜진 글에서만 뺀다.
 *   「신규 포지션이 확인되지 않았다」는 관측 사실이라 남긴다 — «제공되지 않았다/없다(데이터)/not provided/unavailable» 만 겨냥한다.
 */
export const AIQ_FILLER: Record<AiqLoc, RegExp> = {
    ko: /제공되지\s*않|제공\s*되지\s*않|제공이\s*안|(?:데이터|자료|정보|수치)(?:가|는|도|를|이)?\s*(?:없어|없다|없습니다|없이|부족해|부족하)|확인할\s*수\s*있는\s*(?:데이터|자료)(?:가|는)?\s*없/,
    en: /\b(?:not|isn['’]t|wasn['’]t|weren['’]t|aren['’]t)\s+(?:been\s+)?(?:provided|given|available|supplied)\b|\bno\s+(?:new\s+|position\s+|session\s+)?(?:data|date)\s+(?:was\s+|is\s+|were\s+)?(?:provided|available|given)\b|\bunavailable\b|\bdata\s+(?:is|was)\s+missing\b/i,
    ja: /提供されて(?:い|お)(?:ない|ません)|提供されなかった|データ(?:が|は)(?:ない|ありません|不足)|情報(?:が|は)(?:ない|ありません|不足)|入手でき(?:ない|ません)/,
};
const IS_13F = /13F|BlackRock|Vanguard|FMR|Fidelity|State Street|Geode|JPMorgan|Morgan Stanley|T\.? ?Rowe|Invesco|Wellington|Capital (?:World|International|Research)/;

const DATE_MARK: Record<AiqLoc, RegExp> = {
    ko: /\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일|\d{4}-\d{2}-\d{2}|마감\s*기준|분기\s*말|분기말|기준일|기준으로|장중/,
    en: /\b\d{1,2}\/\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\d{4}-\d{2}-\d{2}|\bas of\b|\bclose\b|quarter-end|intraday/i,
    ja: /\d{1,2}\/\d{1,2}|\d{1,2}月\s*\d{1,2}日|\d{4}-\d{2}-\d{2}|終値|時点|四半期末|基準|場中/,
};

/** 날짜·기준 시각 표지가 있는가 */
export function hasAsOfMarker(text: string, loc: AiqLoc): boolean {
    return DATE_MARK[loc].test(String(text ?? ''));
}

const plainLen = (t: string) => t.replace(/\s+/g, '').length;

/** 이 문장에 «의미 있는 숫자»가 있는가(1~10 의 단독 정수·날짜 조각은 제외) */
export function hasRealNumber(s: string): boolean {
    const t = s.replace(/\d{1,2}\/\d{1,2}/g, ' ').replace(/\d{1,2}\s*[월月]\s*\d{1,2}\s*[일日]/g, ' ').replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b/gi, ' ').replace(/\{[A-Z0-9_]+\}/g, ' ');
    for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) {
        const v = Number(m[0].replace(/,/g, ''));
        const marked = /[.,]/.test(m[0]) || /^\s?(?:%|배|倍|곳|社|위|位|x|×|B|M|T|억|億|조|兆|만|万)/.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2)) || /[$¥]\s?$/.test(t.slice(Math.max(0, (m.index ?? 0) - 2), m.index));
        if (!(Number.isInteger(v) && v <= 10 && !marked)) return true;
    }
    return false;
}

export interface AiqSlotResult {
    /** 어긋난 문장을 뺀 글 */
    text: string;
    removed: string[];
    /** 주제 숫자가 남아 있는 글인가(= 기준 시각이 필요한 글) */
    cites: boolean;
    asOfMissing: boolean;
    /** 뺀 뒤에도 글이 쓸 만한가(15자 이상 · 원문의 35% 이상) */
    usable: boolean;
    reasons: string[];
}

/**
 * 한 칸(한 언어 글)의 검사·정리. ground = 모델이 본 입력 전체(system + user) — 숫자 대조의 근거.
 * 줄바꿈 구조는 보존한다(레이블 줄 포함). 아무것도 안 뺐으면 원문 그대로.
 */
export function checkAiqSlot(text: string, loc: AiqLoc, ground: string, opts: { forecast?: boolean } = {}): AiqSlotResult {
    const whole = String(text ?? '');
    const removed: string[] = [];
    const reasons: string[] = [];
    let filler = 0;
    const lines = whole.split('\n');
    const outLines = lines.map((line) => {
        const sents = splitSentences(line);
        if (!sents.length) return line;
        const kept: string[] = [];
        for (const s of sents) {
            let bad = false;
            // 새 입력이 들어간 글은 «숫자가 든 모든 문장»을 입력과 대조한다(주제 단어가 없는 «시장 평균보다 8.3%p 낮다» 같은 모델 계산도 잡는다).
            //   면제: 1~10 단독 정수·날짜 조각·자리표({PRICE})·이름 속 숫자(S&P 500·10Y·Q3) — depthNumbers.checkNumberGrounding 규칙.
            if (hasRealNumber(s)) {
                const g = checkNumberGrounding(s, ground);
                if (g.ungrounded.length) { bad = true; reasons.push(`aiq:ungrounded:${g.ungrounded.slice(0, 2).map((u) => u.raw).join(',')}`); }
            }
            if (!bad && IS_13F.test(s) && HOLDERS_CHANGE[loc].test(s)) { bad = true; reasons.push('aiq:13f-change'); }
            if (!bad && AIQ_FILLER[loc].test(s)) { bad = true; filler++; reasons.push('aiq:filler'); }
            // 예측어 문장(유사투자자문 금지선) — Flow·딥 분석은 기존 신뢰 게이트가 이미 빼므로 UC·인텔처럼 그 게이트가 없는 표면만 켠다
            if (!bad && opts.forecast && forecastHitsInSentence(s, loc).length) { bad = true; reasons.push('aiq:forecast'); }
            if (bad) removed.push(s); else kept.push(s);
        }
        if (!removed.length || kept.length === sents.length) return line;
        // 일본어는 문장 사이 공백이 없다
        return kept.reduce((acc, s) => (acc ? acc + (/[。！？]$/.test(acc) ? '' : ' ') + s : s), '');
    });
    const out = removed.length ? outLines.filter((l, i) => l !== '' || lines[i] === '').join('\n').trim() : whole;
    const usable = !removed.length || (plainLen(out) >= 15 && plainLen(out) >= 0.35 * plainLen(whole));
    const cites = splitSentences(out).some((s) => AIQ_TOPIC[loc].test(s) && hasRealNumber(s));
    void filler;
    return { text: out, removed, cites, asOfMissing: cites && !hasAsOfMarker(out, loc), usable, reasons: [...new Set(reasons)] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 측정(전·후 표) — 출력 하나의 지표. 가드와 같은 정의를 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
export interface AiqMetrics {
    /** 숫자 총 개수(1~10 단독 정수 제외) · 입력 근거와 일치한 개수 · 어긋난 개수 */
    numbers: number; grounded: number; ungrounded: number;
    /** 주제(새 사실) 문장 수 · 그중 숫자가 있는 문장 수 · 그중 기준 시각 표지가 같은 문장이나 같은 칸에 있는 수 */
    topicSentences: number; topicWithNumber: number; topicWithAsOf: number;
    /** 칸 안에 날짜·기준 표지가 하나라도 있는가 */
    anyAsOf: boolean;
    /** «데이터가 제공되지 않아…» 류 군말 문장 수 */
    filler: number;
}

export function measureAiqText(text: string, loc: AiqLoc, ground: string): AiqMetrics {
    const g = checkNumberGrounding(text, ground);
    const sents = splitSentences(text);
    let topic = 0, withNum = 0, withAsOf = 0;
    const slotAsOf = hasAsOfMarker(text, loc);
    sents.forEach((s, i) => {
        if (!AIQ_TOPIC[loc].test(s)) return;
        topic++;
        if (hasRealNumber(s)) {
            withNum++;
            if (hasAsOfMarker(s, loc) || (i > 0 && hasAsOfMarker(sents[i - 1], loc)) || (i === 0 && slotAsOf && sents.length <= 2)) withAsOf++;
        }
    });
    return {
        numbers: g.total - g.exempt, grounded: g.grounded, ungrounded: g.ungrounded.length,
        topicSentences: topic, topicWithNumber: withNum, topicWithAsOf: withAsOf, anyAsOf: slotAsOf,
        filler: sents.filter((x) => AIQ_FILLER[loc].test(x)).length,
    };
}

/**
 * 단일 언어 카드(UC)의 글 칸들을 제자리에서 정리한다 — 어긋난 문장은 빼고, 빼고 나면 못 쓰는 칸 이름을 돌려준다(호출자가 코드가 만든 사실 문장으로 대체).
 * asOfMissing 칸 이름도 돌려준다(기록용 — UC 는 교정 재생성을 하지 않는다).
 */
export function sanitizeFieldsAiq(box: Record<string, any>, fields: string[], loc: AiqLoc, ground: string, opts: { forecast?: boolean } = {}): { removed: number; unusable: string[]; asOfMissing: string[]; reasons: string[] } {
    let removed = 0;
    const unusable: string[] = [], asOfMissing: string[] = [], reasons: string[] = [];
    for (const f of fields) {
        const v = box?.[f];
        if (typeof v !== 'string' || !v.trim()) continue;
        const r = checkAiqSlot(v, loc, ground, opts);
        if (r.removed.length) { removed += r.removed.length; reasons.push(...r.reasons); }
        if (!r.usable) { unusable.push(f); continue; }
        if (r.removed.length) box[f] = r.text;
        if (r.asOfMissing) asOfMissing.push(f);
    }
    return { removed, unusable, asOfMissing, reasons: [...new Set(reasons)] };
}
