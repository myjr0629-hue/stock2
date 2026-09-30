/**
 * AI 번역·요약의 «금액 자릿수» 검사 — 번역문의 만·억·조(ko)·万·億·兆(ja) 금액이 원문 숫자와 같은 크기인가.
 *
 * ★2026-09-30 운영 실측(종목 뉴스 NVDA):
 *   원문 «History Says Nvidia's Record $150 Billion Buyback Is Good News for the Stock»
 *   ko «… 사상 최대 1,500억 달러 매입 …»(맞다) · ja «… 過去最高1,5000億ドルの買い戻し …» = 1.5兆ドル(10배 틀림)
 *   언어·길이·권유·요일 검사는 전부 통과했다 — 숫자의 «자릿수»는 형식으로는 안 잡힌다.
 *   영어 billion(10^9)을 억(10^8)·億 단위로 옮길 때 0 하나를 더하거나 빼는 실수는 모델이 반복할 수 있다.
 *
 * [원칙] 모델 출력은 «믿지 말고 검사한다» — 저장 «전»과 캐시에서 «나갈 때» 둘 다(newsYearGuard·outputGate 와 같다).
 * [규칙]
 *   · 번역문에서 «단위가 붙은 수»만 본다: 3만 · 1,500억 · 1조 5,000억 · 5천억 · 1500億 · 1兆5000億 · 3万
 *   · 원문 숫자 = 모든 수 × 뒤에 붙은 배수(thousand·million·billion·trillion · K·M·B·T · bn·mn·tn),
 *     범위(«10-12 billion»·«10 to 12 billion»)는 앞 수에도 배수를 붙인다.
 *   · 번역 금액마다 원문 숫자 중 하나와 ±12% 안이어야 한다(«약 1,500억» ← $148 billion 같은 반올림은 통과, 10배는 실패).
 *   · 쉼표 묶음이 3자리가 아니면(«1,5000») 형식 오류로 실패.
 *   · 원문에 수가 하나도 없는데 번역에 금액이 있으면 실패(지어낸 숫자).
 *   실패하면 그 언어를 버린다 — 부르는 쪽이 원문(영어)으로 떨어뜨린다. 틀린 숫자보다 원문이 낫다.
 * 순수 함수만(네트워크·Redis 없음) — 시험: tests/amountGuard.test.ts
 */

export type AmountLang = 'ko' | 'ja';

const EN_MULT: Record<string, number> = {
    thousand: 1e3, k: 1e3,
    million: 1e6, mn: 1e6, mln: 1e6, m: 1e6,
    billion: 1e9, bn: 1e9, b: 1e9,
    trillion: 1e12, tn: 1e12, t: 1e12,
};

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const toNum = (s: string) => Number(s.replace(/,/g, ''));

/** «1,5000»처럼 쉼표 묶음이 3자리가 아닌 수가 있는가 */
export function hasMalformedGrouping(text: string): boolean {
    for (const m of String(text || '').matchAll(/\d+(?:,\d+)+/g)) {
        const parts = m[0].split(',');
        if (parts.slice(1).some((p) => p.length !== 3) || parts[0].length > 3) return true;
    }
    return false;
}

/** 원문(영어) 숫자 — 배수 적용 · 범위는 앞 수에도 배수 */
export function sourceAmounts(text: string): number[] {
    const s = String(text || '');
    const re = new RegExp(String.raw`(${NUM})\s*(trillion|billion|million|thousand|mln|tn|bn|mn|[tbmk])?(?![a-z])`, 'gi');
    const toks: { v: number; mult: number; end: number; start: number }[] = [];
    for (const m of s.matchAll(re)) {
        const v = toNum(m[1]);
        if (!Number.isFinite(v)) continue;
        const unit = (m[2] || '').toLowerCase();
        toks.push({ v, mult: unit ? EN_MULT[unit] ?? 1 : 1, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
    // 범위: «10-12 billion» «10 to 12 billion» «$10–$12B» → 앞 수에도 뒤 배수
    for (let i = 0; i < toks.length - 1; i++) {
        const a = toks[i], b = toks[i + 1];
        if (a.mult === 1 && b.mult > 1 && /^\s*(?:-|–|—|to|~)\s*\$?\s*$/i.test(s.slice(a.end, b.start))) a.mult = b.mult;
    }
    const out: number[] = [];
    for (const t of toks) { out.push(t.v * t.mult); if (t.mult !== 1) out.push(t.v); }
    return out;
}

const KO_BIG: Record<string, number> = { '만': 1e4, '억': 1e8, '조': 1e12 };
const JA_BIG: Record<string, number> = { '万': 1e4, '億': 1e8, '兆': 1e12 };
const KO_SMALL: Record<string, number> = { '천': 1e3, '백': 1e2 };
const JA_SMALL: Record<string, number> = { '千': 1e3, '百': 1e2 };

/** 번역문의 «단위가 붙은» 금액(환산값) — 1조 5,000억처럼 이어진 묶음은 합친다 */
export function translatedAmounts(text: string, lang: AmountLang): number[] {
    const s = String(text || '');
    const BIG = lang === 'ko' ? KO_BIG : JA_BIG;
    const SMALL = lang === 'ko' ? KO_SMALL : JA_SMALL;
    const bigCls = Object.keys(BIG).join(''), smallCls = Object.keys(SMALL).join('');
    // 수 [천|백 [수]] 큰단위 — «5천억» «1천500억» «1,500억» «1.5조»
    const re = new RegExp(String.raw`(${NUM})\s*(?:([${smallCls}])\s*(${NUM})?)?\s*([${bigCls}])`, 'g');
    const groups: { v: number; unit: number; start: number; end: number }[] = [];
    for (const m of s.matchAll(re)) {
        const a = toNum(m[1]);
        const small = m[2] ? SMALL[m[2]] : 1;
        const b = m[3] ? toNum(m[3]) : 0;
        const unit = BIG[m[4]];
        const v = (m[2] ? a * small + b : a) * unit;
        if (Number.isFinite(v)) groups.push({ v, unit, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
        let v = groups[i].v, unit = groups[i].unit, end = groups[i].end;
        // 이어진 작은 단위 묶음을 합친다(«1조 5,000억» «1兆5000億»)
        while (i + 1 < groups.length && groups[i + 1].unit < unit && /^\s*$/.test(s.slice(end, groups[i + 1].start))) {
            i++; v += groups[i].v; unit = groups[i].unit; end = groups[i].end;
        }
        out.push(v);
    }
    return out;
}

export interface AmountCheck { ok: boolean; reason: string | null }

/**
 * 번역문 금액이 원문과 맞는가. refs 는 원문 외에 «같은 항목의 영어 필드»처럼 믿을 만한 참고 글(선택).
 * 번역문에 단위 금액이 없으면 검사할 것이 없으므로 통과(쉼표 형식 오류는 따로 본다).
 */
export function checkAmounts(source: string, translated: string, lang: AmountLang, refs: string[] = []): AmountCheck {
    const t = String(translated || '');
    if (!t) return { ok: true, reason: null };
    if (hasMalformedGrouping(t)) return { ok: false, reason: 'malformed-grouping' };
    const got = translatedAmounts(t, lang);
    if (!got.length) return { ok: true, reason: null };
    const want = [source, ...refs].flatMap((x) => sourceAmounts(x)).filter((x) => x > 0);
    if (!want.length) return { ok: false, reason: `invented:${got[0]}` };
    for (const g of got) {
        if (!want.some((w) => Math.abs(g - w) / w <= 0.12)) return { ok: false, reason: `mismatch:${g}` };
    }
    return { ok: true, reason: null };
}

export const amountsOk = (source: string, translated: string, lang: AmountLang, refs: string[] = []): boolean =>
    checkAmounts(source, translated, lang, refs).ok;
