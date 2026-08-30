// ============================================================================
// storeRedirect — /app · /app-uc · /app-wim 이 공유하는 스토어 스마트링크 로직
// ----------------------------------------------------------------------------
// 왜 만들었나 (2026-08-22 실측):
//   세 라우트가 `?from=<채널>` 을 Redis 카운터에 기록해 «클릭»은 세고 있었지만,
//   Play 링크에 `referrer=` 가 없어 Play Console 이 «어느 채널이 설치를
//   만들었는지»를 볼 수 없었다. 클릭은 아는데 설치는 모르는 상태였다.
//
//   Play Install Referrer 는 스토어 URL 의 `referrer` 파라미터를 그대로 받아
//   Play Console → 획득 보고서에 utm_source/medium/campaign 으로 집계한다.
//   (App Store 쪽 대응물은 ASC 캠페인 링크(`ct=`)인데 그건 콘솔에서 발급해야 해서
//    여기서 임의로 만들 수 없다 — 발급되면 appendAppleCt() 로 확장할 자리를 남겼다.)
//
// 규칙: from 태그는 [a-z0-9_]{1,24} 로 제한한다. 임의 문자열을 그대로 흘리면
//       Redis 키 공간이 무한히 늘고 Play 리포트도 쓰레기로 오염된다.
// ============================================================================

const FROM_RE = /^[a-z0-9_]{1,24}$/;

/**
 * from 태그를 정규화한다. 형식에 안 맞으면 null (측정 생략, 리다이렉트는 그대로).
 *
 * ⚠️ 하이픈은 «조용히 버려지는» 함정이었다. 2026-08-31 에 새 SEO 페이지가
 *    `from=seo-darkpool` 을 달았는데, 정규식이 하이픈을 안 받아서 install
 *    referrer 도 클릭 카운터도 **에러 없이** 사라졌다(안드로이드 UA 로 실제
 *    리다이렉트를 재 보고서야 알았다). 이제 하이픈을 밑줄로 흡수한다 —
 *    태그를 잘못 쓴 쪽을 벌하는 것보다 측정을 살리는 편이 낫다.
 */
export function normalizeFrom(raw: string | null | undefined): string | null {
  const f = (raw || '').toLowerCase().replace(/-/g, '_');
  return FROM_RE.test(f) ? f : null;
}

/**
 * Play 스토어 URL 에 install referrer 를 붙인다.
 * referrer 값 자체가 `utm_source=...&utm_medium=...` 형태의 «인코딩된 쿼리»다.
 */
export function playUrlWithReferrer(baseUrl: string, from: string | null): string {
  if (!from) return baseUrl;
  const referrer = `utm_source=${from}&utm_medium=smartlink&utm_campaign=signumhq_web`;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}referrer=${encodeURIComponent(referrer)}`;
}

/**
 * App Store 캠페인 링크(`ct=`) 자리. ASC 에서 캠페인을 발급받으면 여기서 붙인다.
 * 지금은 발급 전이라 원본을 그대로 돌려준다 — 임의 값을 넣으면 조용히 무시되고
 * «측정되는 줄 알았는데 아니었다»가 되므로 넣지 않는다.
 */
export function appleUrlWithCampaign(baseUrl: string, _from: string | null): string {
  return baseUrl;
}
