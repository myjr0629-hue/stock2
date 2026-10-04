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
//   (App Store 쪽 대응물은 ASC 캠페인 링크(`pt=&ct=&mt=8`) — 2026-10-04 연결, appleUrlWithCampaign() 참고.)
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
 * 스토어 «맞춤 표면» 등록부 — from 태그별로 다른 스토어 페이지를 보여준다.
 *
 * 왜 필요했나 (2026-09-18): Play 맞춤 스토어 등록정보와 App Store 맞춤 제품 페이지(CPP)를
 * 만들어 놨는데 스마트링크가 기본 페이지로만 보내서 «트래픽 0» 이었다. 여기서 붙인다.
 *
 * 안전성 실측(2026-09-18, 심사중 상태에서 확인):
 *   · 존재하지 않는 `ppid` → apps.apple.com 301 (기본 제품 페이지로 간다)
 *   · 존재하지 않는 `listing` → play.google.com 200 (기본 등록정보로 폴백)
 *   즉 «심사 통과 전이거나 값이 틀려도 링크가 깨지지 않는다.» 그래서 승인 전에 붙여도 안전하다.
 */
export type StoreApp = 'signum' | 'uc' | 'wim';

/** Play 맞춤 스토어 등록정보가 «있는» from 태그. 없으면 안 붙인다(붙여도 무해하지만 의도를 남긴다). */
const PLAY_CUSTOM_LISTINGS: Record<StoreApp, ReadonlySet<string>> = {
  signum: new Set(['home']),
  uc: new Set<string>(),
  wim: new Set<string>(),
};

/**
 * App Store 맞춤 제품 페이지(CPP): from 태그 → ppid.
 * ★2026-09-23: 한국어 독자 채널용 CPP «ko naver (from=naver_blog)» 승인(Apple 메일, 제출 ID 08234251…).
 *   첫 스크린샷이 의회 거래·옵션 지도인 ko 세트 — 네이버·티스토리·OKKY 등 l=ko 링크로 오는 사람에게 보인다.
 */
const KO_NAVER_CPP = '8202cd7d-a522-41a8-b372-47e0e2806c8c';
const APPLE_CUSTOM_PRODUCT_PAGES: Record<StoreApp, Readonly<Record<string, string>>> = {
  signum: {
    home: 'a0522489-c6f8-4050-8e56-bc89b27f0927',
    naver_blog: KO_NAVER_CPP, naver_kin: KO_NAVER_CPP, tistory: KO_NAVER_CPP, okky: KO_NAVER_CPP,
    naver_sa: KO_NAVER_CPP, daum: KO_NAVER_CPP, kr_media: KO_NAVER_CPP,
    // ★2026-10-04 폰 클릭 상위 태그 매핑(ASC API 로 승인·로케일·스크린샷 확인). 8202cd7d 는 en-US·ko 두 로케일이고
    //   첫 장이 «의회 거래 → 옵션 지도 → 플로우»(en-1-congress·en-2-options·en-3-flow / ko-…)인 «데이터 먼저» 페이지다.
    //   geeknews = 한국 개발자 커뮤니티(okky 와 같은 결) · threads = 한국어 본글 위주(영어 사용자는 en-US 판을 본다)
    //   · hf_datasets = 의회 거래·공매도 데이터셋 독자(첫 장 «의회 거래»와 내용이 같다).
    //   indiehackers 는 연결하지 않는다 — 제작기 독자에게 맞는 CPP 가 없다(web home 은 «웹에서 본 그 화면» 문구라 결이 다르다).
    //   threads_jp 도 연결하지 않는다 — 8202cd7d 에 ja 로케일이 없다.
    geeknews: KO_NAVER_CPP, threads: KO_NAVER_CPP, hf_datasets: KO_NAVER_CPP,
  },
  uc: { home: 'f2559d55-be1a-41a1-989b-5940a5ff4d8a' },
  wim: { home: '4347070b-174a-4620-bd93-942caca7cf2c' },
};

const join = (url: string, qs: string) => `${url}${url.includes('?') ? '&' : '?'}${qs}`;

/**
 * Play 스토어 URL 에 install referrer 를 붙인다.
 * referrer 값 자체가 `utm_source=...&utm_medium=...` 형태의 «인코딩된 쿼리»다.
 */
export function playUrlWithReferrer(
  baseUrl: string,
  from: string | null,
  app: StoreApp = 'signum',
  // PC 넘겨주기 화면의 «Google Play 에서 내 폰에 설치» 버튼은 pc_play — Play 획득 보고서에서 PC→폰 원격 설치를 따로 본다(2026-09-30)
  medium: 'smartlink' | 'pc_play' = 'smartlink',
  // 리딤 코드 링크(/app?code=)의 안드로이드 설치는 utm_content=code — 코드 링크에서 온 설치를 Play 획득 보고서에서 따로 본다(2026-10-04 G0).
  //   생략하면 예전 문자열 그대로(코드 없는 링크는 한 글자도 안 바뀐다).
  content?: 'code',
): string {
  if (!from) return baseUrl;
  const referrer = `utm_source=${from}&utm_medium=${medium}&utm_campaign=signumhq_web${content ? `&utm_content=${content}` : ''}`;
  let out = join(baseUrl, `referrer=${encodeURIComponent(referrer)}`);
  if (PLAY_CUSTOM_LISTINGS[app].has(from)) out = join(out, `listing=${from}`);
  return out;
}

/**
 * App Store 캠페인 링크 — `pt=<제공자 토큰>&ct=<from 태그>&mt=8` (2026-10-04 연결).
 * 왜: iOS 폰 클릭 152 → 앱스토어 «비검색» 조회 11(7%)인데, 토큰이 없어 «어느 채널이 iOS 설치를 만들었나»를 잴 수 없었다.
 *   ASC → 분석 → 유입 경로 → 캠페인 → «캠페인 링크 생성»이 만든 공식 링크와 같은 모양이다
 *   (https://apps.apple.com/app/apple-store/id6783130444?pt=…&ct=…&mt=8 — 10/4 화면에서 판독). 같은 제공자라 UC·WIM 도 같은 pt.
 *   ASC «캠페인»은 서로 다른 Apple 계정 5개 이상 설치된 캠페인만 보여 준다(애플 임계값).
 * pt 는 비밀이 아니지만 저장소가 공개라 코드에 박지 않고 설정값(Vercel 환경변수 APPLE_CAMPAIGN_PT)으로 둔다.
 *   설정이 없거나 형식이 틀리면 «원본 그대로» — 링크는 절대 깨지지 않는다(예전과 같은 동작).
 */
export function applePt(env: string | undefined = process.env.APPLE_CAMPAIGN_PT): string | null {
  const v = (env || '').trim();
  return /^\d{4,12}$/.test(v) ? v : null;
}

export function appleUrlWithCampaign(baseUrl: string, from: string | null, pt: string | null = applePt()): string {
  if (!from || !pt) return baseUrl;
  return join(baseUrl, `pt=${pt}&ct=${encodeURIComponent(from)}&mt=8`);
}

/**
 * App Store 맞춤 제품 페이지(CPP)를 붙인다 — `?ppid=<uuid>`.
 * 해당 from 태그에 CPP 가 없으면 원본을 그대로 돌려준다.
 */
export function appleUrlWithProductPage(
  baseUrl: string,
  from: string | null,
  app: StoreApp = 'signum',
): string {
  const ppid = from ? APPLE_CUSTOM_PRODUCT_PAGES[app][from] : undefined;
  return ppid ? join(baseUrl, `ppid=${ppid}`) : baseUrl;
}

/**
 * iOS 302 목적지 = CPP(ppid, 있을 때만) + 캠페인(pt·ct·mt). /app · /app-uc · /app-wim 이 같은 것을 쓴다.
 *   예: https://apps.apple.com/app/…/id6783130444?ppid=a0522489-…&pt=129…&ct=home&mt=8
 */
export function appleStoreUrl(
  baseUrl: string,
  from: string | null,
  app: StoreApp = 'signum',
  pt: string | null = applePt(),
): string {
  return appleUrlWithCampaign(appleUrlWithProductPage(baseUrl, from, app), from, pt);
}
