/**
 * 섹터 이름 — AI 입력은 영어로, 화면 글은 기존 그대로.
 *
 * 왜: 가디언 인사이트 입력 줄(자금 흐름·5일 유입/유출·STEALTH)에 한국어 섹터명(사이버보안·필수소비재·반도체·커뮤니케이션 …)이 그대로 들어간다.
 *   한 호출이 ko·en·ja 세 칸을 쓰는데, Haiku 5.5 는 그 한국어 단어를 일본어·영어 칸에 «그대로 옮겨» 언어 혼입 가드에 걸렸다
 *   (HAIKU55-AB 12.3: 일본어 칸 Hangul 은 전부 입력의 섹터 라벨 25~31자. 입력 라벨만 영어로 바꾸면 5.5 가드 통과 11/12).
 * 어떻게: 프롬프트에 들어갈 때만 영어 이름으로(`sectorLabelForAi`). 한국어 칸에 영어 라벨이 그대로 남으면 원래 한국어 이름으로 되돌린다(`restoreKoSectorNames`)
 *   — 화면의 한국어 문구는 예전과 같은 섹터 이름을 쓴다. 일본어 칸은 모델이 쓴 일본어 그대로(영어 라벨이 남았으면 표준 일본어 이름으로).
 * 원천 이름표는 universePolicy.SECTOR_MAP 의 name(SSOT) — 새 섹터가 생기면 여기에도 영어 이름을 추가한다(없으면 원래 이름을 그대로 둔다).
 */

/** 한국어 섹터명(SECTOR_MAP.name) → 영어 이름 */
export const SECTOR_NAME_EN: Readonly<Record<string, string>> = {
    '기술주': 'Technology',
    '커뮤니케이션': 'Communication Services',
    '임의소비재': 'Consumer Discretionary',
    '에너지': 'Energy',
    '금융': 'Financials',
    '헬스케어': 'Health Care',
    '산업재': 'Industrials',
    '소재': 'Materials',
    '필수소비재': 'Consumer Staples',
    '부동산': 'Real Estate',
    '유틸리티': 'Utilities',
    'AI 전력망': 'AI Power Grid',
    '반도체': 'Semiconductors',
    '사이버보안': 'Cybersecurity',
    '클린에너지': 'Clean Energy',
    '안전자산': 'Safe Haven Assets',
};

/** 영어 이름 → 일본어 표준 이름(영어 라벨이 일본어 글에 그대로 남았을 때만 쓴다) */
export const SECTOR_NAME_JA: Readonly<Record<string, string>> = {
    'Technology': 'テクノロジー',
    'Communication Services': 'コミュニケーション',
    'Consumer Discretionary': '一般消費財',
    'Energy': 'エネルギー',
    'Financials': '金融',
    'Health Care': 'ヘルスケア',
    'Industrials': '資本財',
    'Materials': '素材',
    'Consumer Staples': '生活必需品',
    'Real Estate': '不動産',
    'Utilities': '公益事業',
    'AI Power Grid': 'AI電力網',
    'Semiconductors': '半導体',
    'Cybersecurity': 'サイバーセキュリティ',
    'Clean Energy': 'クリーンエネルギー',
    'Safe Haven Assets': '安全資産',
};

const EN_TO_KO: ReadonlyArray<readonly [string, string]> = Object.entries(SECTOR_NAME_EN)
    .map(([ko, en]) => [en, ko] as const)
    .sort((a, b) => b[0].length - a[0].length);   // 긴 이름 먼저(«Clean Energy» 가 «Energy» 보다 먼저)

/** AI 입력용 섹터 이름 — 표에 없으면 그대로 */
export function sectorLabelForAi(koName: string): string {
    return SECTOR_NAME_EN[koName] ?? koName;
}

/**
 * 문장 속 영어 라벨을 되돌린다. 라틴 단어에 붙어 있는 경우(«Constellation Energy»·«Energy Transfer»)는 회사·고유명사이므로 건드리지 않는다.
 * 한 번에 모든 이름을 훑으므로 되돌린 한국어/일본어가 다시 바뀌지 않는다.
 */
function restoreWith(text: string, pairs: ReadonlyArray<readonly [string, string]>): { text: string; replaced: number } {
    let replaced = 0;
    let out = String(text ?? '');
    for (const [from, to] of pairs) {
        // 앞뒤가 라틴 단어에 붙어 있으면 회사·고유명사다(«Constellation Energy»·«Energy Transfer»): 앞 단어가 라틴이거나, 뒤에 «대문자+소문자» 단어가 이어지면 건드리지 않는다.
        const re = new RegExp(`(?<![A-Za-z]\\s?)(?<![A-Za-z])${from.replace(/ /g, '\\s')}(?![A-Za-z])(?!\\s[A-Z][a-z])`, 'g');
        out = out.replace(re, () => { replaced++; return to; });
    }
    return { text: out, replaced };
}

/** 한국어 글: 영어로 남은 섹터 라벨 → 원래 한국어 이름 */
export function restoreKoSectorNames(text: string): { text: string; replaced: number } {
    return restoreWith(text, EN_TO_KO);
}

const EN_TO_JA: ReadonlyArray<readonly [string, string]> = Object.entries(SECTOR_NAME_JA).sort((a, b) => b[0].length - a[0].length);
/** 일본어 글: 영어로 남은 섹터 라벨 → 표준 일본어 이름 */
export function restoreJaSectorNames(text: string): { text: string; replaced: number } {
    return restoreWith(text, EN_TO_JA);
}
