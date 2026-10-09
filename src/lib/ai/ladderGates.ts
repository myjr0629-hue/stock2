/**
 * 사다리 출구 가드 모음 — ①② 응답이 «쓸 수 있는 글인가»를 호출 지점 밖에서도 같은 규칙으로 판정한다.
 * (순수 함수. 라우트의 진짜 출구 게이트가 있는 곳은 그 게이트를 그대로 쓰고, 여기 것은 «구조 + 언어 + 거절 + 연도» 공통 검사다.)
 *
 * 쓰임: ① callBedrock/runLadder 의 validate — 실패하면 다음 단(현행 Bedrock Haiku 4.5)으로 넘어간다.
 *       ② 품질 비교 엔드포인트(/api/admin/ai-ab) — 같은 입력에 현행/Haiku 5.5 를 나란히 돌려 통과율을 센다.
 */
import { cleanInsight, validateInsight, type GateLocale } from '@/lib/ai/outputGate';
import { checkAmounts } from '@/lib/ai/amountGuard';
import { COMMON_TERM_ABBREVIATIONS, COMMON_TERM_NAMES, TRANSLITERATIONS_TO_AVOID } from '@/lib/ai/commonTerms';
import type { GateResult } from '@/lib/ai/llmLadder';

const HANGUL = /[가-힣]/;
const KANA = /[぀-ヿ]/;
const KANJI = /[一-鿿]/;

/** 한 언어의 산문 한 덩어리 — 언어 비율·거절문·마크다운·연도 (outputGate.validateInsight) */
export function proseReasons(text: string, locale: GateLocale, minLength = 10): string[] {
    const cleaned = cleanInsight(String(text ?? ''));
    return validateInsight(cleaned, locale, { minLength }).reasons;
}

export const textGate = (locale: GateLocale, minLength = 10) => (text: string): GateResult => {
    const reasons = proseReasons(text, locale, minLength);
    return reasons.length ? { ok: false, reasons } : true;
};

function parseObj(text: string): any | null {
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** JSON 객체이고 필수 키가 있다 */
export const jsonKeysGate = (keys: string[]) => (text: string): GateResult => {
    const o = parseObj(text);
    if (!o || Array.isArray(o)) return 'json';
    const miss = keys.filter((k) => o[k] == null || o[k] === '');
    return miss.length ? `missing:${miss.join(',')}` : true;
};

/** {ko,en,ja} 세 칸이 각자 언어 규칙을 통과한다 */
export const triLangGate = (paths: { ko: string; en: string; ja: string } = { ko: 'ko', en: 'en', ja: 'ja' }) => (text: string): GateResult => {
    const o = parseObj(text);
    if (!o) return 'json';
    const reasons: string[] = [];
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const v = o[paths[loc]];
        if (typeof v !== 'string') { reasons.push(`${loc}:missing`); continue; }
        const r = proseReasons(v, loc, 20);
        if (r.length) reasons.push(`${loc}:${r[0]}`);
    }
    return reasons.length ? { ok: false, reasons } : true;
};

/** 뉴스 다이제스트 배열 — 항목의 KR 요약은 한글, JP 요약은 가나/한자, EN 요약은 한글·가나 없음. 5건 중 80% 이상. */
export function newsDigestGate(text: string): GateResult {
    let arr: any;
    try { arr = JSON.parse(text); } catch { return 'json'; }
    if (!Array.isArray(arr) || arr.length === 0) return 'empty-array';
    let good = 0;
    for (const it of arr) {
        const kr = String(it?.summaryKR || ''), en = String(it?.summaryEN || ''), jp = String(it?.summaryJP || '');
        if (HANGUL.test(kr) && !KANA.test(kr) && !HANGUL.test(en) && !KANA.test(en) && (KANA.test(jp) || KANJI.test(jp)) && !HANGUL.test(jp)) good++;
    }
    return good >= Math.ceil(arr.length * 0.8) ? true : { ok: false, reasons: [`lang:${good}/${arr.length}`] };
}

/** 금융 공통어를 소리 나는 대로 옮겼나(한·일 글) — 규칙(commonTerms)이 «이렇게 쓰지 말라»고 보여 준 표기 */
const TRANSLIT_RE = /(맥스\s?페인|콜\s?월|풋\s?월|풋\s?플로어|감마\s?플립|マックスペイン|コールウォール|プットウォール|プットフロア|ガンマフリップ)/;
export function translitReasons(text: string): string[] {
    const m = String(text || '').match(TRANSLIT_RE);
    return m ? [`transliterated:${m[0]}`] : [];
}

/** 원문 대비 금액 자릿수(억·조·億 10배 오류) — ko/ja 에서만 */
export function amountReasons(source: string, text: string, loc: 'ko' | 'en' | 'ja'): string[] {
    if (loc === 'en') return [];
    const r = checkAmounts(source, text, loc);
    return r.ok ? [] : [`amount:${r.reason ?? ''}`];
}

export { COMMON_TERM_ABBREVIATIONS, COMMON_TERM_NAMES, TRANSLITERATIONS_TO_AVOID };

/** 거절·사과문(영어 포함) — 사용자 글에 나가면 안 된다 */
const REFUSAL_ANY = /(I (?:cannot|can't|can not|am unable|apologize|must decline)|I'm (?:sorry|unable)|as an AI|cannot (?:provide|assist|help)|unable to (?:provide|assist)|죄송합니다|요청을 처리할 수 없|申し訳ありません|対応できません)/i;
export function refusalReasons(text: string): string[] {
    const m = String(text || '').match(REFUSAL_ANY);
    return m ? [`refusal:${m[0].slice(0, 30)}`] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 품질 비교용 종합 판정 — 같은 입력의 현행/Haiku 5.5 응답을 «같은 잣대»로 잰다
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeJsonText } from '@/lib/ai/llmRequest';

type Loc3 = 'ko' | 'en' | 'ja';
const KO_KEY = /^(?:ko|kr)$|(?:KR|Kr|_ko|_kr)$/;
const JA_KEY = /^(?:ja|jp)$|(?:JP|Jp|_ja|_jp)$/;
const EN_KEY = /^en$|(?:EN$)|_en$/;

/** JSON 안의 긴 문장(15자 이상)을 언어 표지(키 이름)별로 모은다. singleLocale 이 있으면 모든 문장을 그 언어로 본다. */
export function collectLocaleStrings(v: unknown, singleLocale: Loc3 | null, keyHint: Loc3 | null = null, out: Array<{ loc: Loc3; text: string; path: string }> = [], path = ''): Array<{ loc: Loc3; text: string; path: string }> {
    if (typeof v === 'string') {
        const loc = singleLocale ?? keyHint;
        if (loc && v.trim().length >= 15) out.push({ loc, text: v, path });
        return out;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => collectLocaleStrings(x, singleLocale, keyHint, out, `${path}[${i}]`)); return out; }
    if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
            const hint: Loc3 | null = KO_KEY.test(k) ? 'ko' : JA_KEY.test(k) ? 'ja' : EN_KEY.test(k) ? 'en' : keyHint;
            collectLocaleStrings(x, singleLocale, hint, out, path ? `${path}.${k}` : k);
        }
    }
    return out;
}

export interface EvalInput {
    purpose: string;
    /** 'ko'|'en'|'ja' = 한 언어 호출, 'multi' = 한 호출이 세 언어 */
    locale: Loc3 | 'multi' | null;
    text: string;
    /** 모델이 본 재료(프롬프트) — 금액 자릿수 대조의 원문 */
    source: string;
    expectJson: boolean | 'array';
    truncated?: boolean;
    refusal?: boolean;
}
export interface EvalResult { ok: boolean; reasons: string[]; chars: number; jsonOk: boolean | null }

export function evaluateOutput(i: EvalInput): EvalResult {
    const reasons: string[] = [];
    const text = String(i.text || '');
    if (i.refusal) reasons.push('stop:refusal');
    if (i.truncated) reasons.push('truncated');
    if (!text.trim()) { reasons.push('empty'); return { ok: false, reasons, chars: 0, jsonOk: null }; }
    reasons.push(...refusalReasons(text));
    let jsonOk: boolean | null = null;
    let parsed: unknown = null;
    if (i.expectJson) {
        const j = normalizeJsonText(text, i.expectJson === 'array' ? 'array' : 'object');
        jsonOk = j.ok;
        if (!j.ok) reasons.push('json');
        else parsed = JSON.parse(j.text);
    }
    const single: Loc3 | null = i.locale && i.locale !== 'multi' ? i.locale : null;
    const items: Array<{ loc: Loc3; text: string; path: string }> = parsed != null
        ? collectLocaleStrings(parsed, single)
        : single ? [{ loc: single, text, path: '' }] : [];
    const seen = new Set<string>();
    for (const it of items) {
        for (const r of proseReasons(it.text, it.loc, 15)) { const k = `${it.loc}:${r.split(':')[0]}`; if (!seen.has(k)) { seen.add(k); reasons.push(`${it.loc}:${r.slice(0, 60)}`); } }
        if (it.loc !== 'en') {
            for (const r of translitReasons(it.text)) { const k = `${it.loc}:${r}`; if (!seen.has(k)) { seen.add(k); reasons.push(`${it.loc}:${r}`); } }
            for (const r of amountReasons(i.source, it.text, it.loc)) { const k = `${it.loc}:amt`; if (!seen.has(k)) { seen.add(k); reasons.push(`${it.loc}:${r.slice(0, 60)}`); } }
        }
    }
    return { ok: reasons.length === 0, reasons, chars: text.length, jsonOk };
}
