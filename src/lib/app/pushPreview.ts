// ============================================================================
// 첫 실행 알림 단계의 «실제 푸시 미리보기» — 순수 규칙 (2026-10-12)
// ----------------------------------------------------------------------------
// 모닝 푸시 본문은 «오늘(ET)의 진짜 AI 모닝 브리핑»의 첫 문장이다(lib/push/aiLine.morningAiLines — 템플릿·degraded·오늘 아님·금지어·예측어·연도·금액 검사).
// 첫 실행 화면은 «이런 알림이 옵니다»를 보여 주는 자리라 같은 검사를 그대로 쓰되 «오늘 것이어야 한다»만 풀어 최근 4일(주말·휴장 걸침)까지 받는다.
// 새로 만들거나 고치는 글자는 없다 — 푸시가 실제로 쓰는 글(원문 slice)을 그대로 보여 준다. 걸리는 게 있으면 null(화면은 설명 글로 대신한다).
// ============================================================================
import { aiLineFromText, etToday, type MorningBriefRecord, type PushLocale } from '@/lib/push/aiLine';
import { daysBetweenYmd } from '@/lib/marketCalendar';

/** 모닝 브리핑 저장본의 날짜(YYYY-MM-DD 또는 생성기가 쓰는 M/D/YYYY) → ISO. 모르면 null */
export function briefDateIso(d: unknown): string | null {
  const s = String(d ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : null;
}

export const PREVIEW_MAX_AGE_DAYS = 4;

export interface MorningPreview { body: string | null; date: string | null; reason: string }

export function morningPreview(
  briefs: Partial<Record<PushLocale, MorningBriefRecord | null>>,
  loc: PushLocale,
  now = new Date(),
): MorningPreview {
  const rec = briefs[loc];
  const { iso, year } = etToday(now);
  if (!rec || typeof rec.briefing !== 'string' || !rec.briefing.trim()) return { body: null, date: null, reason: 'no-text' };
  if (String(rec.source || '') !== 'claude' || rec.degraded === true) return { body: null, date: null, reason: 'template' };
  const date = briefDateIso(rec.date);
  const age = date ? daysBetweenYmd(date, iso) : null;
  if (!date || age == null || age < 0 || age > PREVIEW_MAX_AGE_DAYS) return { body: null, date: null, reason: 'not-recent' };
  const en = briefs.en;
  const englishSource = en && String(en.source || '') === 'claude' && en.degraded !== true && typeof en.briefing === 'string' ? en.briefing : null;
  const r = aiLineFromText(rec.briefing, { locale: loc, englishSource, currentYear: year });
  return r.line ? { body: r.line, date, reason: 'ok' } : { body: null, date: null, reason: r.reason };
}
