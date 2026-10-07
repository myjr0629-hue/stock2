/**
 * «글 속 숫자는 재료에 있는 숫자여야 한다» — 재료(사실)가 작고 닫혀 있는 표면(섹터 한 줄 해석 등)의 출구 검사. 순수 함수만.
 *
 * ★2026-10-07 앱 강화 T5: 섹터 AI 해석(cron/sector-headlines)은 «Do not invent numbers»를 프롬프트로만 시키고 출구 검사가 없었다.
 *   재료(섹터별 사실: 상승·하락 수, 평균, 선두·후미 등락률, 격차)에 없는 숫자가 글에 있으면 그 언어의 글은 쓰지 않는다.
 */

const decimalsOf = (s: string) => { const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

export interface NumHit { written: string; value: number; index: number }

/** 글 속 숫자 — 부호·쉼표·소수 포함. 연도(19xx·20xx 네 자리)는 제외. */
export function numbersInText(text: string): NumHit[] {
    const out: NumHit[] = [];
    const re = /[+\-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+\-−]?\d+(?:\.\d+)?/g;
    let m: RegExpExecArray | null;
    const s = String(text ?? '');
    while ((m = re.exec(s))) {
        const written = m[0].replace('−', '-');
        const digits = written.replace(/[^\d]/g, '');
        if (/^(?:19|20)\d{2}$/.test(digits) && !/[.,]/.test(written)) continue;       // 연도
        const prev = s[m.index - 1];
        if (prev && /[A-Za-z]/.test(prev)) continue;                                  // «S&P500»·«Q3»·«H100» 같은 이름 속 숫자
        const value = Number(written.replace(/,/g, ''));
        if (Number.isFinite(value)) out.push({ written, value, index: m.index });
    }
    return out;
}

/**
 * 재료에 없는 숫자 목록(비면 통과). allowed 는 재료의 숫자들(부호 무시) — 글이 «5.8%»를 «약 6»으로 반올림해도 허용한다
 * (정수 표기는 ±0.5, 소수 표기는 그 자릿수의 반올림 오차 + 0.005).
 */
export function ungroundedNumbers(text: string, allowed: number[]): string[] {
    const abs = allowed.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v));
    const bad: string[] = [];
    for (const h of numbersInText(text)) {
        const w = h.written.replace(/^[+-]/, '').replace(/,/g, '');
        const tol = 0.5 * Math.pow(10, -decimalsOf(w)) + 0.005;
        const v = Math.abs(h.value);
        if (!abs.some((a) => Math.abs(a - v) <= tol || (decimalsOf(w) === 0 && Math.abs(Math.round(a) - v) < 0.5))) bad.push(h.written);
    }
    return bad;
}
