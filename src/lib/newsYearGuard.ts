/**
 * 원문에 없는 «연도»를 AI 문장에서 걷어낸다. 걷어낼 수 없으면 그 항목은 내보내지 않는다.
 *
 * ★2026-09-24 실측(대표가 앱 화면에서 발견):
 *   CNBC 원문 «The deal, which was set to expire in November, will now be extended to Jan. 10»
 *   (연도 없음, 2026-09-24 01:53 GMT 발행)이 뉴스 펄스에 «2025년 1월 10일까지»로 나갔다 — KR·EN·JP 셋 다.
 *   기사는 1시간 전 것이었다(신선도 문제 아님). 모델(Haiku 4.5)은 오늘 날짜를 모르면 학습 시점을
 *   «지금»으로 가정하고 연도를 채운다.
 *   bedrockClient 가 이제 모든 호출에 오늘 날짜를 주지만, 모델 출력은 «믿지 말고 검사한다».
 *   누적 캐시는 한 번 들어간 문장을 18시간 동안 다시 만들지 않기 때문에, 검사는 새 항목과
 *   캐시에서 나가는 항목 모두에 건다.
 *
 * 허용하는 연도: 원문(제목·요약)에 있는 연도 + 올해(뉴욕 기준).
 * 그 밖의 연도가 «월·일 앞/뒤»에 붙어 있으면 연도만 지운다
 *   (2025년 1월 10일 → 1월 10일 · 2025年1月10日 → 1月10日 · January 10, 2025 → January 10).
 * 다른 꼴이면(«2025년에», «in 2025» …) 문장을 고칠 수 없으니 항목을 뺀다 — 틀린 문장보다 빈칸이 낫다.
 */

export type GuardedFields = {
    headline?: string;
    summaryKR?: string; summaryEN?: string; summaryJP?: string;
    analysisKR?: string; analysisEN?: string; analysisJP?: string;
    _srcYears?: string[];
};

type Lang = 'KR' | 'EN' | 'JP';
const FIELDS: Array<[keyof GuardedFields, Lang]> = [
    ['summaryKR', 'KR'], ['analysisKR', 'KR'],
    ['summaryEN', 'EN'], ['analysisEN', 'EN'],
    ['summaryJP', 'JP'], ['analysisJP', 'JP'],
];

const MONTH_EN = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';

/** 원문에 나오는 연도(넓게 잡는다 — 허용 목록은 넓어도 해가 없다). */
export function yearsIn(text: string | undefined | null): string[] {
    return [...String(text || '').matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map((m) => m[0]);
}

/** 그 언어의 문장에서 «연도로 쓰인» 숫자만 찾는다(러셀 2000·2000억 같은 수는 연도가 아니다). */
function yearsWritten(text: string, lang: Lang): string[] {
    if (lang === 'KR') return [...text.matchAll(/((?:19|20)\d{2})\s*년/g)].map((m) => m[1]);
    if (lang === 'JP') return [...text.matchAll(/((?:19|20)\d{2})\s*年/g)].map((m) => m[1]);
    const masked = text.replace(/Russell\s+2000/gi, 'Russell');
    // 뒤의 «,»«.»는 문장부호일 때가 많다(«January 10, 2025,») — 막는 건 «2,025»«20.25» 처럼 숫자가 이어질 때뿐.
    return [...masked.matchAll(/(?<!\d|\$|\d[.,])((?:19|20)\d{2})(?!\d|%|[.,]\d)(?!\s*(?:points?|pts|bps?|million|billion|trillion))/gi)].map((m) => m[1]);
}

function stripYear(text: string, year: string, lang: Lang): string {
    if (lang === 'KR') return text.replace(new RegExp(`${year}\\s*년\\s*(?=\\d{1,2}\\s*월)`, 'g'), '');
    if (lang === 'JP') return text.replace(new RegExp(`${year}\\s*年\\s*(?=\\d{1,2}\\s*月)`, 'g'), '');
    return text
        .replace(new RegExp(`(${MONTH_EN}\\s+\\d{1,2}(?:st|nd|rd|th)?),\\s*${year}(?!\\d)`, 'g'), '$1')
        .replace(new RegExp(`(${MONTH_EN})\\s+${year}(?!\\d)`, 'g'), '$1');
}

export function currentYearET(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(now);
}

export type GuardResult<T> = { item: T | null; fixed: string[]; dropped: string | null };

/**
 * 한 항목을 검사한다. item 은 복사본을 돌려준다(원본 불변).
 * srcText: 원문 제목·요약(새 항목). 캐시에서 나오는 옛 항목은 저장된 _srcYears 또는 headline 을 쓴다.
 */
export function guardYears<T extends GuardedFields>(item: T, srcText?: string, now: Date = new Date()): GuardResult<T> {
    const src = item._srcYears ?? yearsIn(srcText ?? item.headline);
    const allowed = new Set<string>([...src, currentYearET(now)]);
    const out: T = { ...item, _srcYears: [...new Set(src)] };
    const fixed: string[] = [];
    for (const [key, lang] of FIELDS) {
        let text = String(out[key] ?? '');
        if (!text) continue;
        for (const y of new Set(yearsWritten(text, lang))) {
            if (allowed.has(y)) continue;
            const next = stripYear(text, y, lang);
            if (next !== text) { fixed.push(`${String(key)}:${y}`); text = next; }
        }
        const left = yearsWritten(text, lang).filter((y) => !allowed.has(y));
        if (left.length) return { item: null, fixed, dropped: `${String(key)}:${left.join(',')}` };
        (out as any)[key] = text;
    }
    return { item: out, fixed, dropped: null };
}
