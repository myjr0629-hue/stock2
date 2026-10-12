/**
 * 인텔 종목 분석(/api/intel/perplexity-analysis) — 배치 분할·토큰 예산·잘린 응답 처리 (순수 함수, tests/intelBatch.test.ts 가 고정한다).
 *
 * ★ 2026-10-10 «잘림» 수리 — 근거(운영 실측):
 *   · 예전: maxTokens = 종목수 × 800, 한 호출에 최대 10종목. 운영 호출 9건 중 8건이 가드(JSON 파싱)를 못 넘었다(평균 출력 5,548토큰 = 상한에 걸림,
 *     p50 52.5초 · p95 60.3초 — 라우트 한도 60초·화면 대기 45초).
 *   · 종목 7개 실제 응답(Haiku 4.5, 상한 5,600): 총 8,447자 = 종목당 1,085~1,326자 → 종목당 약 700~760토큰. 상한 800 은 평균에 10% 여유뿐이라
 *     긴 종목이 하나만 섞여도 JSON 이 닫히지 않는다. Haiku 5.5 는 토큰이 약 30% 더 나온다(토큰화) → 종목당 ~1,000.
 *   · 상한만 올리면 «잘림» 이 «시간 초과» 로 바뀐다 — 4.5 출력 속도가 약 100~138토큰/초라 10종목(≈9,000토큰)은 55초를 넘는다.
 *     그래서 종목을 최대 3개씩 나눠 «동시에» 부른다(7종목 = 3+2+2, 10종목 = 3+3+2+2). 호출당 약 2,000~2,800토큰 ≈ 17~27초.
 *     (첫 배포는 4개씩이었다: 10종목 요청 43.6·46.3초로 화면 대기 45초에 걸려 3개로 줄였다.)
 *   · 실측 종목당 출력(Haiku 4.5): 733(4종목 재생)·1,158(1종목 재생)·5.5 는 1,092(4종목 재생) 토큰 — 상한 1,400 은 최대 관측치의 1.2배.
 *     3개씩 바꾼 뒤 운영 12묶음의 최대 출력 2,998토큰(상한 4,500 의 67%).
 *   · 상한은 종목당 1,400(4.5 평균의 약 1.9배·5.5 평균의 약 1.4배). 과금은 «쓴 만큼» 이라 상한을 넉넉히 둬도 비용은 같다.
 */

/** 한 호출에 담는 종목 수 상한 (4→3: 10종목 실측 4개씩이면 43.6·46.3초 — 화면 대기 45초에 걸린다. 3개씩이면 가장 긴 호출이 ~7초 짧아진다) */
export const INTEL_BATCH_MAX = 3;
/** 종목당 출력 토큰 상한 (한·영·일 3개 언어 분석 1건 ≈ 700~1,000토큰) */
export const INTEL_TOKENS_PER_STOCK = 1400;
/** JSON 껍데기(`{"analyses":[…]}`·키 이름) 몫 */
export const INTEL_TOKENS_BASE = 300;

export function intelMaxTokens(stockCount: number): number {
    const n = Number.isFinite(stockCount) && stockCount > 0 ? Math.floor(stockCount) : 1;
    return INTEL_TOKENS_BASE + INTEL_TOKENS_PER_STOCK * n;
}

/** 균등 분할 — 7종목은 [4,3], 10종목은 [4,3,3] (마지막에 1종목만 외롭게 남기지 않는다) */
export function splitIntelBatches<T>(items: readonly T[], max: number = INTEL_BATCH_MAX): T[][] {
    const size = Math.max(1, Math.floor(max));
    if (items.length === 0) return [];
    const batches = Math.ceil(items.length / size);
    const base = Math.floor(items.length / batches);
    const extra = items.length % batches;
    const out: T[][] = [];
    let at = 0;
    for (let b = 0; b < batches; b++) {
        const len = base + (b < extra ? 1 : 0);
        out.push(items.slice(at, at + len));
        at += len;
    }
    return out;
}

import { proseReasons, scriptPurityReasons, waivedBySource } from '@/lib/ai/ladderGates';

/** 인텔 글의 거절문 판정 — 좁은 목록. «as an AI infrastructure play» 같은 평범한 말은 거절문이 아니다(«as an AI language model/assistant» 만) */
const INTEL_REFUSAL = /(\bI (?:cannot|can't|can not|am unable|apologize|must decline)\b|\bI'm (?:sorry|unable)\b|\bcannot (?:provide|assist|help)\b|\bunable to (?:provide|assist)\b|\bas an AI (?:language model|assistant|model)\b|죄송합니다|요청을 처리할 수 없|申し訳ありません|対応できません)/i;
const intelRefusalReasons = (t: string): string[] => { const m = String(t || '').match(INTEL_REFUSAL); return m ? [`refusal:${m[0].slice(0, 30)}`] : []; };

export interface IntelAnalysis { ticker: string; ko: string; en: string; ja: string }

const isFull = (a: any): a is IntelAnalysis =>
    !!a && typeof a === 'object'
    && typeof a.ticker === 'string' && a.ticker.trim() !== ''
    && ['ko', 'en', 'ja'].every((k) => typeof a[k] === 'string' && a[k].trim() !== '');

/**
 * `"analyses":[ {…}, {…}, {…(잘림` 에서 «완전히 닫힌 항목»만 건져 낸다.
 * 닫힌 항목은 ticker·ko·en·ja 가 모두 온전한 JSON 객체라 그 자체로 올바른 분석이다 — 잘린 한 건만 버린다.
 * (잘린 문장을 화면에 내보내는 일은 없다: 닫히지 않은 항목은 여기서 빠진다.)
 */
export function salvageClosedItems(text: string): any[] {
    const src = String(text || '');
    const key = src.indexOf('"analyses"');
    const open = key >= 0 ? src.indexOf('[', key) : -1;
    if (open < 0) return [];
    const items: any[] = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = open + 1; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') { if (depth === 0) start = i; depth++; continue; }
        if (c === '}') {
            depth--;
            if (depth === 0 && start >= 0) {
                try { items.push(JSON.parse(src.slice(start, i + 1))); } catch { /* 깨진 항목은 건너뛴다 */ }
                start = -1;
            }
            if (depth < 0) break;
            continue;
        }
        if (c === ']' && depth === 0) break;
    }
    return items;
}

export interface ParsedIntel {
    /** 요청한 종목 중 3개 언어가 모두 온전한 분석 */
    analyses: IntelAnalysis[];
    /** 응답이 JSON 으로 온전히 읽혔나(false 면 일부만 건졌거나 전부 못 읽음) */
    complete: boolean;
    /** 닫히지 않은 항목을 버렸나 */
    salvaged: boolean;
}

/**
 * 모델 응답 → 분석 목록. 요청하지 않은 종목(지어낸 티커)과 3개 언어가 다 안 찬 항목은 버린다.
 * 온전한 JSON 이면 그대로, 잘렸거나 깨졌으면 닫힌 항목만.
 */
export function parseIntelAnalyses(text: string, requested: readonly string[]): ParsedIntel {
    const want = new Set(requested.map((t) => String(t).toUpperCase()));
    const pick = (arr: any[]): IntelAnalysis[] => {
        const seen = new Set<string>();
        const out: IntelAnalysis[] = [];
        for (const a of arr) {
            if (!isFull(a)) continue;
            const tk = a.ticker.trim().toUpperCase();
            if (!want.has(tk) || seen.has(tk)) continue;
            seen.add(tk);
            out.push({ ticker: tk, ko: a.ko, en: a.en, ja: a.ja });
        }
        return out;
    };
    const raw = String(text || '');
    try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed?.analyses) ? parsed.analyses : [];
        return { analyses: pick(arr), complete: true, salvaged: false };
    } catch { /* 잘림·군말 — 아래에서 건진다 */ }
    return { analyses: pick(salvageClosedItems(raw)), complete: false, salvaged: true };
}


/**
 * ★2026-10-12 aiq55 — 인텔 종목 분석의 사다리 출구 가드(Haiku 5.5 ① 용). 이전엔 jsonKeysGate(['analyses']) 뿐이었다(JSON 이면 통과).
 *   요청한 종목이 모두 3개 언어로 왔고, 각 언어 글이 언어 비율·거절문·마크다운·연도·문자 체계 혼입을 통과해야 한다.
 *   연도·거절 표현이 재료(프롬프트)에 이미 있으면 모델이 지어낸 것이 아니다(waivedBySource — 두 모델에 같은 잣대).
 *   금융 공통어 음차(«콜월»)는 걸지 않는다 — 출구에서 결정적으로 되돌린다(restoreCommonTermNames).
 */
export function intelAnalysesGate(tickers: readonly string[], source: string) {
    return (text: string): boolean | string | { ok: boolean; reasons: string[] } => {
        const parsed = parseIntelAnalyses(text, tickers);
        if (parsed.analyses.length < tickers.length) return `missing:${tickers.length - parsed.analyses.length}`;
        const reasons: string[] = [];
        for (const a of parsed.analyses) {
            for (const loc of ['ko', 'en', 'ja'] as const) {
                const v = a[loc];
                // 거절문 판정은 «좁은 목록»(refusalReasons: I cannot·죄송·申し訳 …)으로 — 넓은 목록(outputGate)은 인텔 글의 평범한 말 «as an AI infrastructure play»·«AI 모델»·«AIモデル»(AI 기업을 다루는 글)을 거절문으로 오인해
                //   ① 를 버리고 느린 현행(p50 24s)으로 넘겼다(10/12 시험 1/16 묶음).
                const r = [...proseReasons(v, loc, 40).filter((x) => !waivedBySource(x, source) && !x.startsWith('refusal:')), ...intelRefusalReasons(v), ...scriptPurityReasons(v, loc)];
                for (const x of r) { if (reasons.length < 4) reasons.push(`${a.ticker}:${loc}:${x.slice(0, 50)}`); }
            }
        }
        return reasons.length ? { ok: false, reasons } : true;
    };
}
