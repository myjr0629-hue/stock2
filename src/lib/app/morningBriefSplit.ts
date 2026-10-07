/**
 * AI 모닝브리핑 본문을 «본문 + 마지막 한 문장(핵심 전망 상자)»로 나눈다 — 앱 전용(MorningBrief.tsx).
 *
 * ★ 2026-10-07 — 소수점이 문장 끝으로 잘리던 결함 수리.
 *   옛 규칙 `text.match(/[^.。!?！？]+[.。!?！？]+/g)` 은 «+0.48%» 의 «.» 도 문장 끝으로 보고 자른 뒤 `join(' ')` 으로 이어
 *   「+0. 48%」「금리 5. 31%」「$11. 9B」로 깨뜨렸고, 마지막 문장이 숫자 중간(«…오일이 -2.» | «17% 하락하는 등…»)에서 갈라졌다.
 *   (API 응답은 정상 — 화면의 이 규칙만 틀렸다.) 또 끝맺음 부호 없이 끝난 꼬리 글은 통째로 버려졌다.
 *
 * 원칙
 *   1) 본문을 «다시 조립하지 않는다» — 자를 위치만 찾고 원문을 그대로 slice 한다(공백·소수점·약어가 바뀔 수 없다).
 *   2) 숫자 안의 점(0.48 · .48 · 11.9B · 5.31%)은 문장 끝이 아니다. 약어의 점(U.S. · a.m. · Inc. · Oct.)도 아니다.
 *   3) lookbehind(`(?<=…)`·`(?<!…)`)를 쓰지 않는다 — 앱 iOS 최소 15.0(WKWebView 16.3 이하)은 구문 오류로 번들 전체가 죽는다.
 *      아래는 평범한 정규식 + 문자 검사만 쓴다.
 */

/** 뒤에 점이 붙어도 문장이 끝나지 않는 영문 약어(소문자 비교). 한 글자 약어(U.S. · a.m.)는 코드에서 따로 거른다. */
const ABBREVIATIONS = new Set([
  'inc', 'corp', 'co', 'ltd', 'llc', 'plc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'jr', 'sr',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** 끝맺음 부호 바로 뒤에 붙어 문장에 딸려 가는 닫는 따옴표·괄호 */
const CLOSERS = ')]}"\'”’」』）］｝';

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);
const isCjk = (c: string | undefined): boolean => c !== undefined && /[぀-ヿ㐀-鿿가-힯]/.test(c);

/** text[dotIdx] 의 ASCII «.» 한 개가 문장 끝이 맞는가 */
function dotEndsSentence(text: string, dotIdx: number): boolean {
  const next = text[dotIdx + 1];
  // ① 소수점: 0.48 · .48 · 5.31%  → 점 바로 뒤가 숫자
  if (isDigit(next)) return false;
  // ② 약어: 점 바로 앞 영문 낱말
  let s = dotIdx;
  while (s > 0 && /[A-Za-z]/.test(text[s - 1])) s--;
  const word = text.slice(s, dotIdx);
  if (word.length === 1) {
    const before = text[s - 1];
    if (before === '.') return false;                            // a.m. · e.g. · U.S. 의 마지막 점(앞 글자가 점)
    if (/[A-Z]/.test(word) && !isDigit(before) && before !== '&') return false;   // J. P. Morgan · U.S 같은 대문자 한 글자(숫자 뒤 «5G.»·«10X.»·«S&P.» 는 문장 끝)
  } else if (word && ABBREVIATIONS.has(word.toLowerCase())) {
    return false;                                                // Inc. · Corp. · Oct.
  }
  // ③ 뒤가 공백·끝·닫는 부호면 끝(영·한 문장의 보통 모양)
  if (isSpace(next) || CLOSERS.indexOf(next as string) >= 0) return true;
  // ④ 한글·일본어가 점 바로 뒤에 붙은 «…함.오늘» 도 끝으로 본다(ASCII 약어·주소·소수점은 위에서 걸렀다)
  if (isCjk(next)) return true;
  // ⑤ 그 밖(example.com · v1.2 · S&P500.5x)은 끝이 아니다
  return false;
}

/**
 * 문장이 끝나는 위치(끝맺음 부호·닫는 부호 «뒤» 인덱스) 목록. 오름차순.
 * 끝맺음 부호 없이 끝난 꼬리 글은 여기 들어가지 않는다(splitOutlook 이 따로 센다).
 */
export function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?。！？]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const run = m[0];
    let after = start + run.length;
    while (after < text.length && CLOSERS.indexOf(text[after]) >= 0) after++;   // 닫는 따옴표·괄호는 문장에 딸려 간다

    let endsHere: boolean;
    if (/[。！？!?]/.test(run)) {
      endsHere = true;                                           // 전각 부호 · ! ? 는 예전과 같이 끝
    } else if (run.length > 1) {
      endsHere = isSpace(text[start + run.length]) || after >= text.length;   // «..» «...» 말줄임 — 뒤가 공백·끝이면 끝
    } else {
      endsHere = dotEndsSentence(text, start);
    }
    if (endsHere) ends.push(after);
  }
  return ends;
}

/**
 * 본문을 «본문 + 마지막 문장»으로 나눈다. 문장이 3개 미만이면 상자 없이 통째로 본문(outlook = null).
 * body + outlook 은 공백만 빼면 항상 원문과 같다(글자 손실·삽입 0).
 */
export function splitOutlook(text: string): { body: string; outlook: string | null } {
  const ends = sentenceEnds(text);
  // 끝맺음 부호 없이 끝난 꼬리 글도 한 문장으로 센다(옛 규칙은 이 꼬리를 통째로 버렸다)
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  const hasTail = text.slice(lastEnd).trim().length > 0;
  const boundaries = hasTail ? [...ends, text.length] : ends;
  if (boundaries.length >= 3) {
    const cut = boundaries[boundaries.length - 2];               // 마지막 문장은 «끝에서 두 번째 경계» 다음부터
    const body = text.slice(0, cut).trim();
    const outlook = text.slice(cut).trim();
    if (body && outlook) return { body, outlook };
  }
  return { body: text.trim(), outlook: null };
}
