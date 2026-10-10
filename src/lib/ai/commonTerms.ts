// ============================================================================
// 금융 공통어 — AI 글에서도 «번역하지 않는다».
//
// 대표 지시(2026-10-08 00시): «금융지표언어라면 공통으로 사용하라는 것이 원칙이다. 모두 한글·일본어로 번역할 필요는 없다는 것이다.
//   금융 공통어라면 일반적으로 사용하는 언어라면 유지하도록 해».
// 실측(10/7 운영 AI 글): 한국어·일본어 글에 «맥스 페인(21)·콜월(25)·감마 플립(45)» / «マックスペイン(9)·コールウォール(5)·ガンマフリップ(17)» 처럼
//   영어 그대로여야 할 지표 이름이 소리 나는 대로 옮겨져 있었다(같은 화면의 정적 문구는 «Max Pain·Call Wall·Gamma Flip» 이 다수).
//
// 이 규칙은 «모델에게 주는 한 단락»이다. callBedrock(모든 AI 호출의 단일 입구)과 직접 호출 4곳(UC·모닝브리핑·종목 뉴스·실적 브리핑)의
// system 앞에 붙는다. 현지 표준 용어(미결제약정·建玉·공매도·空売り)는 그대로 쓴다 — 줄임말이 아니라 풀어 쓸 때는 현지 표준어.
// ============================================================================

/** 줄임말·지표 약어 — 어느 언어 글에서도 그대로 */
export const COMMON_TERM_ABBREVIATIONS = [
    'GEX', 'VIX', 'P/C', 'RSI', 'SMA', 'EMA', 'MACD', 'VWAP', 'IV', 'OI', 'RLSI', 'IFS', 'OPI', 'UOA',
] as const;

/** 여러 단어로 된 지표 이름 — 한국어·일본어 글에서도 영어 그대로. (대소문자가 섞여 있어 언어 게이트의 «라틴 글자 비율»에는 별도 허용이 필요하다) */
export const COMMON_TERM_NAMES = ['Max Pain', 'Call Wall', 'Put Wall', 'Put Floor', 'Gamma Flip'] as const;

/** 소리 나는 대로 옮긴 표기 — 규칙에 «이렇게 쓰지 말라»고 보여 주는 예 */
export const TRANSLITERATIONS_TO_AVOID: Record<(typeof COMMON_TERM_NAMES)[number], string> = {
    'Max Pain': '맥스페인·맥스 페인 / マックスペイン',
    'Call Wall': '콜월·콜 월·콜 벽 / コールウォール',
    'Put Wall': '풋월·풋 월 / プットウォール',
    'Put Floor': '풋플로어·풋 플로어 / プットフロア',
    'Gamma Flip': '감마플립·감마 플립 / ガンマフリップ',
};

/** 현지 표준 용어 — 줄임말이 아니라 풀어 쓸 때는 이쪽이 맞다(유지) */
export const LOCAL_STANDARD_TERMS = '미결제약정 / 建玉 (open interest) · 공매도 / 空売り (short selling) · 내재변동성 / インプライド・ボラティリティ (implied volatility)';

/** 모델에게 주는 규칙 한 단락 — 모든 system 프롬프트 앞에 붙는다(영어 지시 + 한·일 예시) */
export function financeTermsRule(): string {
    const names = COMMON_TERM_NAMES.map((n) => `"${n}" (not ${TRANSLITERATIONS_TO_AVOID[n]})`).join('; ');
    return `<finance_terms>
Market indicator names are common financial language. In EVERY language — including Korean and Japanese text — write them exactly as below. Never translate them and never transliterate them by sound.
- Abbreviations: ${COMMON_TERM_ABBREVIATIONS.join(', ')}.
- Names: ${names}.
- Terms with an established local standard keep that local form (spell the abbreviation out in the local word, not by sound): ${LOCAL_STANDARD_TERMS}.
</finance_terms>

`;
}

/**
 * 영어 지표 이름(여러 단어, 대소문자 혼합)을 걷어 낸다 — 언어 게이트가 «한글 글 속 영어 비율»을 잴 때 쓴다.
 * 이름 사이 공백·하이픈·줄바꿈 변형(«Max-Pain»·«Call  Wall»)도 같은 이름으로 본다.
 */
const NAME_RE = new RegExp(`\\b(?:${COMMON_TERM_NAMES.map((n) => n.replace(' ', '[\\s-]+')).join('|')})\\b`, 'gi');
export function stripCommonTermNames(text: string): string {
    return text.replace(NAME_RE, ' ');
}

/**
 * 출력 쪽 복원 — 모델이 규칙(financeTermsRule)을 어기고 지표 이름을 소리 나는 대로 옮겼을 때 «영어 그대로» 로 되돌린다.
 *
 * ★2026-10-10 근거: 규칙을 system 맨 앞에 두고 입력 라벨까지 «Call Wall / Put Floor / Max Pain» 으로 띄어 써도 인텔 종목 분석의 한·일 글에서
 *   «콜월·풋플로어·コールウォール·マックスペイン» 음차가 줄지 않았다(새 응답 18종목: 라벨 수리 전 48건·11종목 → 후 41건·13종목). 프롬프트 지시만으로는 못 막는다.
 *   음차 표기는 정해진 몇 가지뿐(TRANSLITERATIONS_TO_AVOID)이라 결정적으로 되돌릴 수 있고, 되돌린 글은 «$88 Call Wall과 $84 Max Pain» 처럼 읽힌다.
 * 데이터 줄의 붙여 쓴 라벨(CallWall·PutFloor·MaxPain)을 그대로 따라 쓴 것도 띄어 쓴 이름으로 맞춘다(실측: «$282.5 CallWall과 $270 PutFloor»).
 * 한국어 조사(과·을·이)는 그대로 붙는다. «콜 월요일» 같은 일반 단어를 건드리지 않게 «월» 뒤 «요일» 은 제외한다.
 */
const TRANSLIT_RESTORE: ReadonlyArray<readonly [RegExp, string]> = [
    [/맥스\s?페인|マックス\s?ペイン|\bMaxPain\b/g, 'Max Pain'],
    [/콜\s?월(?!요일)|콜\s?벽|コール\s?ウォール|\bCallWall\b/g, 'Call Wall'],
    [/풋\s?월(?!요일)|プット\s?ウォール|\bPutWall\b/g, 'Put Wall'],
    [/풋\s?플로어|プット\s?フロア|\bPutFloor\b/g, 'Put Floor'],
    [/감마\s?플립|ガンマ\s?フリップ|\bGammaFlip\b/g, 'Gamma Flip'],
];

export function restoreCommonTermNames(text: string): { text: string; replaced: number } {
    let replaced = 0;
    let out = String(text ?? '');
    for (const [re, name] of TRANSLIT_RESTORE) out = out.replace(re, () => { replaced++; return name; });
    return { text: out, replaced };
}
