/**
 * 종목 뉴스 번역 검사 — 모델이 낸 한·일 요약 한 건이 «화면에 나가도 되는가» (순수 함수, tests/tickerNews.test.ts · tests/tickerNewsGuard.test.ts 가 고정한다).
 *
 * ★2026-10-10 route.ts 에서 옮겼다(내용은 그대로). 이유: 제공자 사다리(①Haiku 5.5 → 현행 Nova Lite)의 출구 가드와 품질 비교(/api/admin/ai-ab)가
 *   «운영 라우트와 똑같은 검사» 를 써야 하기 때문이다. Next.js 라우트 파일은 임의 export 를 못 한다.
 */
import { amountsOk } from '@/lib/ai/amountGuard';

export const HANGUL = /[가-힣]/, KANA = /[぀-ヿ]/, KANJI = /[一-鿿]/;

/**
 * ★ [2026-09-10] «원문에 없는 회사명»을 잡아 낸다.
 *
 *   첫 판 프롬프트에 예시로 「Anthropic→앤스로픽, NVIDIA→엔비디아」를 넣었더니,
 *   모델이 그 예시를 잘못 붙들어 **NVIDIA 를 「앤스로픽」으로 세 번 오역**했다.
 *   길이·언어 검사는 전부 통과했다 — 회사명이 바뀐 것은 형식으로는 안 잡힌다.
 *   프롬프트에서 예시를 걷어내니 0/5 로 잡혔지만, 프롬프트만 믿지 않는다.
 *   원문에 없는 유명 회사명이 번역에 나타나면 그 항목은 버린다(영어 원문으로 떨어진다).
 */
const GHOST_NAMES: [string, string][] = [
    ['앤스로픽', 'anthropic'], ['오픈AI', 'openai'], ['엔비디아', 'nvidia'],
    ['구글', 'google'], ['알파벳', 'alphabet'], ['애플', 'apple'], ['테슬라', 'tesla'],
    ['마이크로소프트', 'microsoft'], ['아마존', 'amazon'], ['메타', 'meta'],
    ['인텔', 'intel'], ['AMD', 'amd'], ['브로드컴', 'broadcom'], ['넷플릭스', 'netflix'],
];
function hasGhostCompany(translated: string, sourceTitle: string): boolean {
    const src = sourceTitle.toLowerCase();
    return GHOST_NAMES.some(([ko, en]) => translated.includes(ko) && !src.includes(en));
}

/**
 * ★ 기관 약어를 «소리나는 대로» 옮긴 것을 잡는다.
 *   실측: "DOJ Probes $20 Billion Groq Deal" → 「**도잉** 조사가 …」.
 *   DOJ 는 미 법무부다. 금융 뉴스에 자주 나오는 약어라 틀리면 뜻이 통째로 바뀐다.
 *   프롬프트에 대응표를 넣었지만 그것만 믿지 않는다.
 */
const BAD_TRANSLITERATIONS = ['도잉', '도제이', '에스이씨', '에프티씨', '에프디에이', '아이피오', '구로크', '그로크', '미크론', '불립', '베어리시', '불리시'];
function hasBadTransliteration(translated: string): boolean {
    return BAD_TRANSLITERATIONS.some((w) => translated.includes(w));
}

/**
 * ★ 번역문에 «매매 권유»가 남아 있으면 버린다.
 *   헤드라인 필터를 넓혔지만 원문 표현은 무한하다. 두 겹으로 막는다 —
 *   걸리면 그 항목만 영어 원문으로 떨어지므로 화면은 비지 않는다.
 */
const ADVICE_RE = new RegExp([
    '매수\\s*(기회|타이밍|시점|추천)', '매도\\s*(추천|시점)',
    // ★ 「투자자들이 둘 다 **매수해야 한다**」가 첫 판을 통과했다 — 어미 변형을 넓힌다
    '(매수|매도|투자|보유)\\s*해야\\s*(한다|합니다|할)',
    '사야\\s*(한다|할|합니다)', '팔아야\\s*(한다|할|합니다)',
    '담아야', '저가\\s*매수', '하락\\s*매수', '지금\\s*사',
    '(사|살)\\s*(때|타이밍)', '주목할\\s*만한\\s*매수',
    '다음\\s*[A-Z가-힣]+(가|이)\\s*될', '제2의\\s*[A-Z가-힣]+',
    '買い(場|時)', '売り時', '今が買い', '買うべき', '売るべき',
].join('|'));
function hasAdvice(translated: string): boolean {
    return ADVICE_RE.test(translated);
}

/**
 * ★ 원문에 없는 «요일»을 지어냈는지 본다.
 *   실측: 원문 "down over 2% on Thursday" → 「**목요일 화요일** 종가 대비 2% 하락」.
 *   원문엔 요일이 하나인데 번역엔 둘이다. 날짜를 지어내면 사실이 바뀐다.
 *   길이·언어·권유 검사는 전부 통과하는 유형이라 따로 센다.
 */
const KO_DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const EN_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function inventsWeekday(translated: string, sourceTitle: string): boolean {
    const src = sourceTitle.toLowerCase();
    const srcCount = EN_DAYS.filter((d) => src.includes(d)).length;
    const outCount = KO_DAYS.filter((d) => translated.includes(d)).length;
    return outCount > Math.max(srcCount, 0);
}
/**
 * 예측 표현. 실측으로 계속 새 형태가 나와 넓혀 왔다.
 *   「지속될 것으로 예상됨」 — 첫 정규식(예상\s*됩니다)이 «예상됨»을 못 잡았다.
 *   금융 앱에서 예측은 규정 위험이라 조사·어미 변형까지 포괄한다.
 */
export const PREDICT = /전망|예상\s*(됩니다|된다|됨|되며|상회)|것으로\s*(예상|전망)|상회할|하회할|will\s+(rise|fall|beat|miss|continue)|expected\s+to|予想され/i;

export interface CheckedNews { ko: string; ja: string; impact: string }

/** 모델 출력 한 건을 검사한다 — 언어별로 따로(하나가 오염돼도 나머지는 쓴다). 실패하면 빈 문자열 → 화면은 원문 */
export function checked(ai: any, title: string): CheckedNews {
    const ko = String(ai?.ko || '').trim(), ja = String(ai?.ja || '').trim();
    const okKo = ko.length >= 18 && HANGUL.test(ko) && !PREDICT.test(ko)
                 && !hasGhostCompany(ko, title) && !hasBadTransliteration(ko) && !hasAdvice(ko)
                 && !inventsWeekday(ko, title);
    const okJa = ja.length >= 12 && !HANGUL.test(ja) && (KANA.test(ja) || KANJI.test(ja))
                 && !PREDICT.test(ja) && !hasAdvice(ja);
    // ★ [2026-09-30] 금액 자릿수 — 운영 NVDA «$150 Billion» → ja «1,5000億ドル»(10배). 규칙·사례는 lib/ai/amountGuard.ts
    const amtKo = amountsOk(title, ko, 'ko'), amtJa = amountsOk(title, ja, 'ja');
    const impact = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(ai?.impact)) ? String(ai.impact) : 'NEUTRAL';
    return { ko: okKo && amtKo ? ko : '', ja: okJa && amtJa ? ja : '', impact };
}

// ─────────────────────────────────────────────────────────────────────────────
// 제공자 사다리 출구 가드 (2026-10-10) — ①Haiku 5.5 가 «쓸 수 있는 번역 묶음» 을 냈나
// ─────────────────────────────────────────────────────────────────────────────

/** 묶음 안에서 이 비율 이상이 한·일 모두 검사(checked)를 통과해야 ① 응답을 쓴다. 미달이면 현행(Nova Lite)이 같은 묶음을 다시 번역한다. */
export const NEWS_LADDER_MIN_PASS = 0.6;

export interface NewsBatchVerdict { ok: boolean; reason: string; total: number; pass: number; parsedOk: boolean }

/**
 * 모델 응답(JSON `{"items":[{id,ko,ja,impact}]}`)을 «요청한 제목 목록» 에 맞춰 검사한다.
 * 항목 하나가 떨어지는 것은 정상이다(그 항목만 영어 원문으로 떨어지고 30분 뒤 다시 번역한다) —
 * 묶음 전체가 못 쓸 상태일 때만(JSON 불가 · 항목 대부분 누락/오염) 다음 단으로 넘긴다.
 */
export function judgeNewsBatch(text: string, titles: readonly string[]): NewsBatchVerdict {
    const total = titles.length;
    let parsed: any;
    try {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : String(text || ''));
    } catch { return { ok: false, reason: 'json', total, pass: 0, parsedOk: false }; }
    const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const byId = new Map<number, any>();
    for (const it of items) byId.set(Number(it?.id), it);
    let pass = 0;
    titles.forEach((title, i) => {
        const ai = byId.get(i + 1);
        if (!ai) return;
        const c = checked(ai, title);
        if (c.ko && c.ja) pass++;
    });
    const need = Math.ceil(total * NEWS_LADDER_MIN_PASS);
    return pass >= need
        ? { ok: true, reason: '', total, pass, parsedOk: true }
        : { ok: false, reason: `items:${pass}/${total}`, total, pass, parsedOk: true };
}

/** runLadder 의 validate 로 쓰는 형태 */
export const tickerNewsGate = (titles: readonly string[]) => (text: string): boolean | string => {
    const v = judgeNewsBatch(text, titles);
    return v.ok ? true : v.reason;
};

/** 품질 비교용 — 요청 제목별로 한·일이 각각 검사를 통과했는가 (id 순서 = 제목 순서) */
export function newsItemVerdicts(text: string, titles: readonly string[]): Array<{ id: number; ko: boolean; ja: boolean; present: boolean }> {
    let items: any[] = [];
    try {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : String(text || ''));
        items = Array.isArray(parsed?.items) ? parsed.items : [];
    } catch { /* 모두 absent */ }
    const byId = new Map<number, any>();
    for (const it of items) byId.set(Number(it?.id), it);
    return titles.map((title, i) => {
        const ai = byId.get(i + 1);
        if (!ai) return { id: i + 1, ko: false, ja: false, present: false };
        const c = checked(ai, title);
        return { id: i + 1, ko: !!c.ko, ja: !!c.ja, present: true };
    });
}

/** 캡처된 종목 뉴스 프롬프트(사용자 메시지)에서 제목 목록을 되찾는다: `Headlines (n):\n[ {id,title,source}, … ]\nJSON only.` */
export function titlesFromNewsPrompt(userPrompt: string): string[] {
    const a = userPrompt.indexOf('['), b = userPrompt.lastIndexOf(']');
    if (a < 0 || b <= a) return [];
    try {
        const arr = JSON.parse(userPrompt.slice(a, b + 1));
        return Array.isArray(arr) ? arr.map((x: any) => String(x?.title || '')) : [];
    } catch { return []; }
}
