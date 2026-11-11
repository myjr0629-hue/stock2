// 체험 종료 날짜·언어 — 순수(React·브라우저 API 없음). 앱 시트(lib/app/trialSave)와 서버 푸시(lib/push/trialPush)가 같이 쓴다.
export type TrialSaveLocale = 'ko' | 'en' | 'ja';
export const toTrialSaveLocale = (l: string): TrialSaveLocale => (l === 'ko' || l === 'ja' ? l : 'en');

/** 종료 날짜 — 시간대(없으면 실행 환경 현지). ko «11월 13일 (금)» · en «Fri, Nov 13» · ja «11月13日(金)» */
export function trialEndDateText(expiresAt: number, locale: string, timeZone?: string): string {
  const loc = toTrialSaveLocale(locale);
  const tag = loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
  const opts: Intl.DateTimeFormatOptions = { month: loc === 'en' ? 'short' : 'long', day: 'numeric', weekday: 'short' };
  try {
    return new Intl.DateTimeFormat(tag, { ...opts, ...(timeZone ? { timeZone } : {}) }).format(new Date(expiresAt));
  } catch {
    return new Intl.DateTimeFormat(tag, opts).format(new Date(expiresAt));
  }
}
