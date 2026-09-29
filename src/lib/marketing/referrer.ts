// ============================================================================
// 리퍼러 → «어디서 왔나» 분류 (순수 함수 — 서버 라우트·클라이언트 홈이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜 (2026-09-30): 폰 클릭의 절반이 자사 홈(from=home)인데, 그 방문자가 어디서 왔는지 알 수 없었다.
//   /app 계열 라우트는 Referer 헤더를 받지만, 홈 버튼을 누르면 Referer 는 «우리 홈» 이다.
//   그래서 홈은 방문한 순간의 document.referrer 를 분류해 링크에 &ref=<분류> 로 싣고,
//   다른 링크(소셜 게시물 등)는 서버가 Referer 헤더를 분류한다.
//
// 개인정보: 주소 «전체»는 어디에도 남기지 않는다. 호스트 → 닫힌 목록의 이름 하나로 바꾸고 끝.
//   (처리방침 2조 3항 «서비스 이용 기록·방문 페이지», 3조 «이용 통계 분석» 범위)
// 키 공간: REF_BUCKETS 밖의 값은 전부 'other' — 레디스 키가 무한히 늘지 않는다.
// ============================================================================

export const REF_BUCKETS = [
  'none', 'self', 'other',
  // 검색
  'google', 'bing', 'naver', 'daum', 'yahoo', 'duckduckgo', 'search_other',
  // AI 답변(인용 링크)
  'ai',
  // 소셜·커뮤니티
  'x', 'bluesky', 'reddit', 'facebook', 'instagram', 'threads', 'linkedin', 'mastodon', 'youtube', 'tiktok',
  'pinterest', 'quora', 'medium', 'note', 'okky', 'geeknews', 'hackernews', 'indiehackers', 'producthunt',
  'kakao', 'tistory', 'github', 'huggingface',
  // 스토어
  'appstore', 'play',
] as const;

export type RefBucket = (typeof REF_BUCKETS)[number];
const SET = new Set<string>(REF_BUCKETS);

export function isRefBucket(x: unknown): x is RefBucket {
  return typeof x === 'string' && SET.has(x);
}

/** 앞에서부터 처음 맞는 것. 순서가 중요하다(play·gemini 가 google 보다 먼저). */
const RULES: Array<[RegExp, RefBucket]> = [
  [/(^|\.)signumhq\.com$/, 'self'],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|you\.com|phind\.com)$|^gemini\.google\.com$|^copilot\.microsoft\.com$/, 'ai'],
  [/^play\.google\.com$/, 'play'],
  [/^apps\.apple\.com$|^itunes\.apple\.com$/, 'appstore'],
  [/(^|\.)google\.[a-z.]{2,6}$|^com\.google\.android\.googlequicksearchbox$|^com\.google\.android\.gm$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)naver\.com$|^com\.nhn\.android\.search$/, 'naver'],
  [/(^|\.)daum\.net$/, 'daum'],
  [/(^|\.)yahoo\.(com|co\.jp|co\.kr)$/, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)(ecosia\.org|search\.brave\.com|yandex\.[a-z]{2,3}|baidu\.com|startpage\.com|qwant\.com)$/, 'search_other'],
  [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$|(^|\.)x\.com$/, 'x'],
  [/(^|\.)(bsky\.app|bsky\.social)$/, 'bluesky'],
  [/(^|\.)reddit\.com$|^redd\.it$/, 'reddit'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(threads\.net|threads\.com)$/, 'threads'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
  [/(^|\.)(mastodon\.social|mastodon\.online|mstdn\.jp|mstdn\.social)$/, 'mastodon'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)pinterest\.[a-z.]{2,6}$|^pin\.it$/, 'pinterest'],
  [/(^|\.)quora\.com$/, 'quora'],
  [/(^|\.)medium\.com$/, 'medium'],
  [/(^|\.)note\.com$/, 'note'],
  [/(^|\.)okky\.kr$/, 'okky'],
  [/^news\.hada\.io$/, 'geeknews'],
  [/^news\.ycombinator\.com$/, 'hackernews'],
  [/(^|\.)indiehackers\.com$/, 'indiehackers'],
  [/(^|\.)producthunt\.com$/, 'producthunt'],
  [/(^|\.)(kakao\.com|kakaocorp\.com)$|^com\.kakao\.talk$/, 'kakao'],
  [/(^|\.)tistory\.com$/, 'tistory'],
  [/(^|\.)(github\.com|github\.io)$/, 'github'],
  [/(^|\.)huggingface\.co$/, 'huggingface'],
];

/** 호스트 이름(또는 android-app:// 패키지 이름) → 분류. 비었으면 'none'. */
export function refBucketFromHost(host: string | null | undefined): RefBucket {
  const h = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return 'none';
  for (const [re, b] of RULES) if (re.test(h)) return b;
  return 'other';
}

/** 주소 전체(Referer 헤더·document.referrer) → 분류. 주소가 아니면 'other', 비었으면 'none'. */
export function refBucketFromUrl(url: string | null | undefined): RefBucket {
  const s = String(url || '').trim();
  if (!s) return 'none';
  try {
    const u = new URL(s);
    // 안드로이드 앱이 보내는 리퍼러: android-app://com.google.android.googlequicksearchbox/…
    if (u.protocol === 'android-app:') return refBucketFromHost(u.host || u.pathname.replace(/^\/+/, '').split('/')[0]);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'other';
    return refBucketFromHost(u.hostname);
  } catch {
    return 'other';
  }
}
