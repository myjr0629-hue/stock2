/**
 * 푸시 본문 «AI 한 줄» (2026-10-12, 브랜치 feat/push-ai-line) — 순수 함수만(네트워크·Redis 없음).
 *
 * 왜: 모닝·마감 푸시가 전원에게 정적 문구(«…준비됐습니다»)로 나갔다. 같은 시각에 이미 만든 3개 언어 AI 글이 Redis 에 있다.
 *   → 그 글의 «첫 문장»을 그 언어로 약 90자 안에서 잘라 본문에 쓴다(추가 AI 호출 0).
 *
 * 원칙
 *   1) 숫자는 원문 그대로 — 새로 만들거나 고치지 않는다. 자를 때도 숫자·괄호 중간에서 자르지 않는다(원문을 slice 만 한다).
 *   2) 조금이라도 의심되면 정적 문구로 돌아간다(null 반환): 템플릿·degraded·오늘 것이 아님·언어 혼입·거절문·
 *      금지어(매수·매도·추천·목표가·예측 …)·예측어(lib/ai/trustLayer)·금액 자릿수 불일치(lib/ai/amountGuard)·지어낸 연도.
 *   3) 금융 공통어(GEX·VIX·P/C·Max Pain)는 원문 그대로 둔다(번역·치환 없음).
 *
 * 시험: tests/pushAiLine.test.ts (10/6 모닝 · 10/9 마감 운영 실제 본문으로 고정)
 */
import { splitSentences, forecastHitsInSentence } from '@/lib/ai/trustLayer';
import { checkAmounts, hasUnitAmounts } from '@/lib/ai/amountGuard';
import { adviceHit } from '@/lib/ai/adviceGuard';

export type PushLocale = 'ko' | 'en' | 'ja';
export const PUSH_LOCALES: PushLocale[] = ['ko', 'en', 'ja'];

/**
 * 본문 글자 수 상한(코드 포인트, «…» 포함). 지시: «약 90자».
 * 영어는 반각이라 같은 90자가 한·일 글의 절반 폭이다 → 영어만 110 으로 둔다(그래도 한·일 90자보다 화면에서 짧다).
 */
export const PUSH_LINE_MAX: Record<PushLocale, number> = { ko: 90, ja: 90, en: 110 };

const ELLIPSIS = '…';

// ── 금지어 — 투자 권유·목표가·예측으로 읽힐 수 있는 말. 걸리면 정적 문구(오탐은 무해: 정적 문구가 나갈 뿐) ──
// 2026-10-14: 목록과 판정을 lib/ai/adviceGuard 로 옮겼다 — «사고팔라는 말»은 막고 «시장 서술»(売り優勢 · 매수세 · selling pressure)은 통과시킨다.
//   (10/13 모닝 푸시 일본어 본문이 «半導体に売りが集中している» 한 문장 때문에 정적 문구로 나갔다.) 이 파일의 호출자(signalLine · todayPicksLine 포함)는 그대로 bannedHit 를 쓴다.

/** 거절·사과문(모델이 답을 거부한 글이 저장된 경우) */
const REFUSAL = /죄송|답변(?:을|할)\s?수\s?없|I\s+(?:can(?:no|')t|am\s+unable|apologi[sz]e)|\bAs an AI\b|申し訳|お答えできません/i;

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const KANA = /[぀-ヿ]/;
const KANJI = /[一-鿿]/;

/** 걸린 금지어(첫 번째) — 없으면 null */
export function bannedHit(text: string): string | null {
  return adviceHit(text);
}

/** 그 언어의 글자가 맞나 — ko 는 한글 필수, en 은 한글·가나 없음, ja 는 가나·한자 필수·한글 없음 */
export function scriptOk(text: string, locale: PushLocale): boolean {
  const t = String(text || '');
  if (locale === 'ko') return HANGUL.test(t);
  if (locale === 'en') return !HANGUL.test(t) && !KANA.test(t);
  return (KANA.test(t) || KANJI.test(t)) && !HANGUL.test(t);
}

/** 오늘 연도가 아닌 4자리 연도(19xx·20xx)가 있나 — AI 가 날짜를 모르면 연도를 지어낸다(9/23 «2025년 1월 10일» 사고) */
export function foreignYear(text: string, currentYear: number): string | null {
  const re = /(^|[^\d,.])((?:19|20)\d{2})(?![\d,.]\d)/g;
  let m: RegExpExecArray | null;
  const t = String(text || '');
  while ((m = re.exec(t))) {
    if (Number(m[2]) === currentYear) continue;
    // 지수 이름(Russell 2000 · 러셀 2000 · ラッセル2000)은 연도가 아니다
    if (/(?:Russell|러셀|ラッセル)\s?$/i.test(t.slice(Math.max(0, m.index - 10), m.index + m[1].length))) continue;
    return m[2];
  }
  return null;
}

/** 글머리의 마크다운·레이블 흔적을 걷어 낸다(«## », «**», «- », «[현황] »). 글자·숫자는 건드리지 않는다. */
function cleanLine(s: string): string {
  return s
    .replace(/^\s*(?:#{1,6}\s+|[-*•·]\s+|>\s+)/, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*\[[^\]\n]{1,40}\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 글의 «첫 문장». 제목처럼 보이는 짧은 머리줄(15자 미만)은 건너뛴다. 없으면 null.
 * 문장 나누기는 lib/ai/trustLayer.splitSentences(소수점·약어를 문장 끝으로 오인하지 않는다).
 */
export function firstSentence(text: string): string | null {
  // 굵게 표시(**…**)는 먼저 걷는다 — «…함.**» 처럼 마침표 뒤에 붙으면 문장 끝을 못 찾는다
  for (const raw of splitSentences(String(text || '').replace(/\*\*|__/g, ''))) {
    const s = cleanLine(raw);
    if (s.replace(/\s/g, '').length >= 15) return s;
  }
  return null;
}

const OPEN = '([{（［｛「『';
const CLOSE = ')]}）］｝」』';
/** 영어 절을 잇는 접속어(공백 뒤) */
const CONJ_EN = /^ (?:and|while|but|as|whereas|amid|with)\b/i;
/** 영어 글 끝에 매달리면 어색한 기능어 — 잘린 끝이 이것이면 한 낱말 더 뒤로 */
const DANGLING_EN = /\s+(?:and|or|with|at|to|of|in|on|for|the|a|an|by|from|as|but|while|amid|after|before|than|vs)$/i;

/**
 * 한 줄을 max 자(코드 포인트, «…» 포함) 안으로 자른다. 원문 slice 만 한다(글자를 바꾸지 않는다).
 *   ① 절 경계(«, » «、» «，» «; » «—»)  ② 낱말 경계(공백 — 단 뒤가 숫자·부호면 아님: «S&P 500»·«at 7,864» 를 가르지 않는다)
 *   둘 다 괄호 밖에서만. 너무 짧아지면(상한의 40% 미만) 다음 방법으로. 잘랐으면 끝 문장부호를 떼고 «…».
 */
export function clipLine(line: string, max: number): string {
  const chars = Array.from(String(line || '').trim());
  if (chars.length <= max) return chars.join('');
  const limit = max - 1; // «…» 자리
  const minLen = Math.floor(max * 0.4);

  // 괄호 깊이(각 위치 «앞»까지)
  const depth: number[] = [];
  let d = 0;
  for (let i = 0; i < chars.length; i++) {
    depth.push(d);
    if (OPEN.includes(chars[i])) d++;
    else if (CLOSE.includes(chars[i])) d = Math.max(0, d - 1);
  }

  let clauseCut = -1; // 잘라 낼 끝(exclusive)
  let conjCut = -1;
  let wordCut = -1;
  for (let i = 1; i < Math.min(chars.length, limit + 1); i++) {
    if (depth[i] !== 0) continue;
    const c = chars[i];
    const next = chars[i + 1];
    // 절 경계: 구분 부호 «앞»에서 자른다
    if ((c === ',' && next === ' ') || c === '、' || c === '，' || c === '；' || (c === ';' && next === ' ') || c === '—' || c === '–') {
      if (i >= minLen) clauseCut = i;
    }
    // 영어 접속어 앞(« and » « while » « but » …)은 «약한» 절 경계(구분 부호가 없을 때만 쓴다) — 10/12 운영 첫 발송 «… (+0.09%) and NASDAQ 100 futures…» 처럼
    // 숫자 없는 이름만 남기지 않고 «… (+0.09%)…» 에서 끊는다
    if (c === ' ' && i >= minLen && CONJ_EN.test(chars.slice(i, i + 10).join(''))) conjCut = i;
    // 낱말 경계: 공백 «앞»에서 자른다 — 뒤가 숫자·부호(+ - $ ( %)로 시작하면 숫자를 앞말과 떼어 놓게 되므로 아님
    if (c === ' ' && next !== undefined && !/[\d+\-$€¥₩(%]/.test(next)) {
      if (i >= minLen) wordCut = i;
    }
  }

  let end = clauseCut > 0 ? clauseCut : conjCut > 0 ? conjCut : wordCut;
  let out: string;
  if (end > 0) {
    out = chars.slice(0, end).join('');
    // 영어 끝의 기능어 정리(«… and» → «…»)
    for (let k = 0; k < 3 && DANGLING_EN.test(out); k++) {
      const trimmed = out.replace(DANGLING_EN, '');
      if (Array.from(trimmed).length < minLen) break;
      out = trimmed;
    }
  } else {
    // 경계가 없다(공백 없는 긴 일본어 등) — 괄호 밖·숫자 밖에서 뒤로 물러나며 자른다
    end = limit;
    while (end > minLen && (depth[end] !== 0 || /[\d.,%+\-$]/.test(chars[end - 1]) || /[\d.,%]/.test(chars[end] || ''))) end--;
    out = chars.slice(0, end).join('');
  }
  out = out.replace(/[\s,、，;；:：·・—–\-]+$/u, '');
  return out + ELLIPSIS;
}

export interface AiLineResult {
  /** 본문으로 쓸 한 줄 — null 이면 정적 문구 */
  line: string | null;
  /** 판정 사유(드라이런·통계용): ok · no-text · not-today · template · script · refusal · banned:<말> · forecast:<id> · amount · year:<연도> · no-sentence */
  reason: string;
}

export interface LineGuardOpts {
  locale: PushLocale;
  /** 금액 자릿수 대조 기준(같은 날 영어판 글) — ko·ja 에서 단위 금액(만·억·조·万·億·兆)이 있을 때만 쓴다 */
  englishSource?: string | null;
  /** 오늘(ET) 연도 */
  currentYear: number;
  max?: number;
}

/** 글 → 첫 문장 → 검사 → 자르기. 하나라도 걸리면 line=null(정적 문구). */
export function aiLineFromText(text: string | null | undefined, o: LineGuardOpts): AiLineResult {
  if (typeof text !== 'string' || text.trim().length < 20) return { line: null, reason: 'no-text' };
  const sentence = firstSentence(text);
  if (!sentence) return { line: null, reason: 'no-sentence' };
  if (!scriptOk(sentence, o.locale)) return { line: null, reason: 'script' };
  if (REFUSAL.test(sentence)) return { line: null, reason: 'refusal' };
  const banned = bannedHit(sentence);
  if (banned) return { line: null, reason: `banned:${banned}` };
  const fc = forecastHitsInSentence(sentence, o.locale);
  if (fc.length) return { line: null, reason: `forecast:${fc[0].id}` };
  const yr = foreignYear(sentence, o.currentYear);
  if (yr) return { line: null, reason: `year:${yr}` };
  if (o.locale !== 'en' && hasUnitAmounts(sentence)) {
    // 대조할 영어판이 없으면 금액 문장은 내보내지 않는다(닫힌 쪽으로 실패)
    if (!o.englishSource || !checkAmounts(o.englishSource, sentence, o.locale).ok) return { line: null, reason: 'amount' };
  }
  const line = clipLine(sentence, o.max ?? PUSH_LINE_MAX[o.locale]);
  if (line.replace(/\s/g, '').length < 10) return { line: null, reason: 'too-short' };
  return { line, reason: 'ok' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 모닝 — guardian:morning_briefing:{ko,en,ja}
// ─────────────────────────────────────────────────────────────────────────────

export interface MorningBriefRecord {
  briefing?: string;
  date?: string;
  source?: string;
  degraded?: boolean;
  generatedAt?: string;
}

/** 저장된 모닝 브리핑이 «오늘(ET)의 진짜 AI 판»인가 — /api/guardian/briefing 의 isRealAiBriefing 과 같은 판정 + 날짜 */
export function morningBriefState(b: MorningBriefRecord | null | undefined, todayET: string, todayUS: string): 'ok' | 'no-text' | 'not-today' | 'template' {
  if (!b || typeof b.briefing !== 'string' || !b.briefing.trim()) return 'no-text';
  if (b.date !== todayET && b.date !== todayUS) return 'not-today';
  if (String(b.source || '') !== 'claude' || b.degraded === true) return 'template';
  return 'ok';
}

/** ET 오늘 — en-CA(YYYY-MM-DD) · en-US(M/D/YYYY, 생성기가 쓰는 형식) · 연도 */
export function etToday(now = new Date()): { iso: string; us: string; year: number } {
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const us = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  return { iso, us, year: Number(iso.slice(0, 4)) };
}

export function morningAiLines(
  briefs: Partial<Record<PushLocale, MorningBriefRecord | null>>,
  now = new Date(),
): Record<PushLocale, AiLineResult> {
  const { iso, us, year } = etToday(now);
  const enState = morningBriefState(briefs.en, iso, us);
  const englishSource = enState === 'ok' ? briefs.en!.briefing! : null;
  const out = {} as Record<PushLocale, AiLineResult>;
  for (const l of PUSH_LOCALES) {
    const st = morningBriefState(briefs[l], iso, us);
    out[l] = st === 'ok'
      ? aiLineFromText(briefs[l]!.briefing, { locale: l, englishSource, currentYear: year })
      : { line: null, reason: st };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 마감 — 크로스섹터 브리프 structured.marketOverview.summary.{ko,en,ja}
// (앱이 실제로 보여 주는 판 = lib/ai/crossBriefServe.selectServedBrief 가 고른 것)
// ─────────────────────────────────────────────────────────────────────────────

export function closingAiLines(brief: any, briefDate: string | null, todayET: string, year: number): Record<PushLocale, AiLineResult> {
  const out = {} as Record<PushLocale, AiLineResult>;
  const summary = brief?.structured?.marketOverview?.summary;
  const sameDay = !!briefDate && briefDate === todayET;
  const englishSource = typeof summary?.en === 'string' ? summary.en : null;
  for (const l of PUSH_LOCALES) {
    if (!summary || typeof summary[l] !== 'string') { out[l] = { line: null, reason: 'no-text' }; continue; }
    if (!sameDay) { out[l] = { line: null, reason: 'not-today' }; continue; }
    out[l] = aiLineFromText(summary[l], { locale: l, englishSource, currentYear: year });
  }
  return out;
}
