/** 애플 만료일과 유효 판정의 단일 정의. 표시는 기존 관례대로 애플 만료일의 전날이다. */
function expiry(appleMidnight: string, throughExpiryDay = false) {
  const appleExpiresAt = Date.parse(appleMidnight);
  return { appleExpiresAt, validUntil: appleExpiresAt + (throughExpiryDay ? 86400000 : 0) };
}

const DEFAULT_EXPIRY = expiry('2026-10-31T00:00:00-07:00');
const CODE_EXPIRY = new Map([
  // 기존 연장 판정(12/31 하루가 끝나는 1/1 00:00 PST까지)을 유지한다.
  ['SIGNUMPRO', expiry('2026-12-31T00:00:00-08:00', true)],
]);

export function promoExpiry(raw: string | null) {
  return CODE_EXPIRY.get((raw || '').trim().toUpperCase()) ?? DEFAULT_EXPIRY;
}

/** 날짜 값만 만든다. 영어 쿠폰 부제의 NBSP와 카드의 일반 공백을 각각 유지한다. */
export function promoExpiryDate(raw: string | null, lang: 'ko' | 'en' | 'ja', space = ' '): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(promoExpiry(raw).appleExpiresAt);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  // 달력 날짜에서 하루를 빼므로 호스트 시간대·서머타임 전환에 영향받지 않는다.
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day') - 1));
  if (lang !== 'en') return `${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(day);
  return `${month}${space}${day.getUTCDate()}`;
}
