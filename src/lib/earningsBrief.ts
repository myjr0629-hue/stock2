// ============================================================================
// 실적 «관전 포인트» 팩 — 만드는 쪽(/api/cron/earnings-brief)과
// 붙이는 쪽(/api/market/earnings-calendar)이 «같은 키·같은 판정»을 쓰도록 한 곳에 둔다.
// ----------------------------------------------------------------------------
// ★ [2026-09-27] 카드 머리글과 AI 한 줄이 서로 다른 EPS 를 말했다 (ja 화면 실측):
//     MU   머리글 EPS $31.52  ↔  AI 「EPS $31.16がメモリ価格サイクル…」
//     BLK  머리글 EPS $14.25  ↔  AI 「EPS $14.28は…」
//   머리글은 매일 바뀌는 FMP 추정치, AI 문장은 «만든 날»의 추정치를 박제한 것이다.
//   162건 중 22건이 EPS·금액 숫자를 품고 있었고, 그중 5건(CRM·PATH·SNOW·S·SEDG)은
//   «$» 도 「EPS 숫자」 순서도 아닌 「0.18 EPS」 꼴뿐이었다 — $·「EPS 뒤 숫자」만 보면 놓친다.
//   게다가 COST 는 지난 분기(9/24) 문장 「Q4 EPS 6.53」이 12/10 발표 행에 붙어 있었다 —
//   티커로만 찾고, 무엇을 보고 썼는지 남기지 않았기 때문이다.
//   → ① 문장에 머리글 사실(숫자·분기)을 못 쓰게 하고 ② 어느 발표를 보고 썼는지(in)를 남겨
//     읽을 때 «그 발표»일 때만 붙인다.
// ============================================================================

// v4 — v2 는 EPS 숫자·지난 분기 문장·틀린 회사를 품고 있다. 키를 올려 한 번에 걷어낸다.
//   (v3 는 프리뷰 검증에서만 채워졌다 — 영문 이름에 「Inc.」가 붙어 버리고 다시 만들었다. 운영엔 나간 적 없다.)
export const EARNINGS_BRIEF_KEY = 'earnings:brief:v4';

export type BriefLang = 'ko' | 'en' | 'ja';
export interface BriefLine { name: string; watch: string }

/** 이 문장을 «어느 발표 행»을 보고 썼는지 — 캘린더 행 그대로 남긴다. */
export interface BriefInput {
    date: string;           // YYYY-MM-DD (FMP 발표일)
    q: number | null;       // 분기(모르면 null)
    y: number | null;
    eps: number | null;     // 그때의 추정치 — 진단용. 문장에는 쓰지 않는다.
}

export type BriefEntry = Partial<Record<BriefLang, BriefLine>> & { in?: BriefInput; at?: string };
export interface BriefPack { generatedAt: string; source: string; tickers: Record<string, BriefEntry> }

/**
 * 같은 발표인가 — 발표일이 ±30일 안이면 같은 분기다.
 *   분기 발표는 60일 넘게 떨어져 있고, 추정 발표일이 확정일로 바뀌는 폭은 대개 2주 안이다.
 *   그래서 날짜가 조금 옮겨져도 문장은 살리고, 다음 분기 행에는 절대 붙지 않는다.
 *   분기 라벨을 양쪽 다 알면 그것도 같아야 한다.
 */
export const SAME_REPORT_DAYS = 30;
export function sameReport(
    saved: BriefInput | undefined,
    row: { date: string; quarter?: number | null; year?: number | null },
): boolean {
    if (!saved?.date || !row?.date) return false;
    const gap = Math.abs(Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${saved.date}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(gap) || gap > SAME_REPORT_DAYS) return false;
    if (saved.q != null && saved.y != null && row.quarter != null && row.year != null) {
        return saved.q === row.quarter && saved.y === row.year;
    }
    return true;
}

/**
 * 문장이 «머리글이 보여 주는 사실»을 다시 말하는가 — 말하면 언젠가 머리글과 어긋난다.
 *   figure : $·＄ 뒤 숫자, EPS 앞뒤 숫자(「EPS $0.44」「0.41 EPS」「EPS 6.53」), 통화·억/조·billion 단위 숫자
 *   quarter: 분기·회계연도 라벨(Q3 · 3Q · 3분기 · 第3四半期 · 7-9月期 · FY26 · fourth quarter)
 * 제품·규격 숫자(5G · 737 MAX · GLP-1 · 5nm · B200)는 통과한다.
 */
const FIGURE = new RegExp([
    '[$＄]\\s?\\d',
    '(?:EPS|ＥＰＳ|주당\\s*순?이익|1株(?:当たり|あたり)利益)\\s*[:：]?\\s*[$＄]?\\s?[-−]?\\d',
    '\\d[\\d,.]*\\s*(?:EPS|ＥＰＳ)',
    '\\d[\\d,.]*\\s*(?:달러|ドル|dollars?\\b|USD\\b)',
    '\\d[\\d,.]*\\s*(?:억|조|億|兆)',
    '\\d[\\d,.]*\\s*(?:billion|million|trillion|bn\\b|mn\\b)',
].join('|'), 'i');
const QUARTER = new RegExp([
    '\\bQ[1-4]\\b', '\\b[1-4]Q\\b', '[1-4]\\s*분기', '第?\\s*[1-4]\\s*四半期',
    '\\d{1,2}\\s*[-~〜～–]\\s*\\d{1,2}\\s*月期',
    "\\bFY\\s?'?\\d{2,4}\\b", '\\b(?:first|second|third|fourth)[-\\s]quarter\\b',
].join('|'), 'i');

export function headerFactIn(text: string): 'figure' | 'quarter' | null {
    if (FIGURE.test(text)) return 'figure';
    if (QUARTER.test(text)) return 'quarter';
    return null;
}
