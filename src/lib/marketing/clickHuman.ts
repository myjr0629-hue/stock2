// ============================================================================
// 스마트링크 클릭의 «사람 여부» — /app · /app-uc · /app-wim 공용 (2026-10-04)
// ----------------------------------------------------------------------------
// 왜 만들었나 (실측, 2026-10-04):
//   홈의 SIGNUM(/app?from=home)·UC(/app-uc?from=home)·WIM(/app-wim?from=home)·히어로(/app?from=home_hero)
//   네 링크가 «같은 횟수»로 불렸다. 10/2 ref 키: 네 링크 모두 ios|none 14 · ios|self 6 · desktop|self 8 로 «칸까지 똑같다».
//   Vercel 요청 로그: /app-uc 와 /app-wim 이 «같은 밀리초»에 오고(사람은 두 링크를 동시에 못 누른다),
//   같은 묶음이 ~1.0–1.8초 뒤 한 번 더 온다(아이폰 UA 한 번 + 데스크톱 UA 한 번), 바로 뒤에 홈의 로고 이미지들.
//   → 홈을 렌더하며 «페이지 안의 같은 출처 주소를 전부» 가져가는 자동 수집기다. prefetch 아님(일반 <a>, speculation
//     rules 없음), 링크 미리보기 아님(미리보기 봇은 라우트 앞단에서 이미 빠진다), 리다이렉트 체인 아님(각자 302 한 번).
//   그 수집기의 데스크톱 쪽은 Accept-Language 가 없거나(nolang 15) 봇 표지(4)였다. 그런데 기존 집계는
//     ① 봇 판정(UA_BOT_RE)을 «데스크톱»에만 적용했고 ② 아이폰·안드로이드 UA 는 무엇이든 «폰 클릭»으로 셌으며
//     ③ /app-uc·/app-wim 은 기기도 안 세고 /app 과 «같은» mkt:attr:hit:home 키에 더했다(방문 1회 = home 6~8클릭).
//   그래서 «클릭 수 ↔ 설치» 상관이 −0.12 였다.
//
// 판정(순서대로, 하나라도 걸리면 사람 아님):
//   prefetch  Sec-Purpose / Purpose / X-Purpose / X-Moz 에 prefetch·prerender·preview, Next 라우터 prefetch(RSC)
//   bot       UA 에 Mozilla/ 없음 · 수집기 표지(UA_BOT_RE) · 미리보기 봇(PREVIEW_BOT_RE)
//   nolang    Accept-Language 없음 — 사람 브라우저는 항상 보낸다
//   nonnav    GET 이 아님 · Sec-Fetch-Mode 가 navigate 가 아님(fetch·img·XHR) · Sec-Fetch-Dest 가 document 가 아님(iframe 등)
//   nometa    Sec-Fetch-Mode 자체가 없음 — iOS 16.4 미만 등 옛 브라우저이거나 UA 를 흉내 낸 HTTP 클라이언트
//   human     위에 하나도 안 걸린 «사람의 문서 이동»
//
// 집계(원시는 버리지 않는다):
//   원시  mkt:attr:hit:<from>:<날짜> · mkt:attr:hit:<from>:<기기>:<날짜> · mkt:attr:ua:… — 예전 그대로(추세·기존 스크립트 유지)
//   분류  clk:<sg|uc|wim>:<from>:<ET날짜> = {"<기기>|<분류>": n, …}            ← 사람 = "<기기>|human"
//         사람 칸만 덧붙여 «어떻게 들어왔나»를 남긴다: "<기기>|site:<Sec-Fetch-Site>" · "<기기>|ref:<리퍼러 분류>"
//         · "desktop|os:<mac|win|linux|cros|other>"  (닫힌 목록 — 필드가 무한히 늘지 않는다)
//   · 접두사 clk:/clkp: 는 redisClient 복제 정책 밖 → EC2 전용(Upstash 명령 0). 미리보기·로컬은 clkp: (운영 숫자 오염 방지)
//   · 응답 «뒤» after() 에서만 부른다 — 이동(302)·화면 속도에 영향 없음, 실패는 삼킨다. 45일 보존(mkt:attr 와 같음).
//   · 읽기: node scripts/mkt-clicks-human.js [일수]
// 개인정보: UA·IP·주소 원문은 남기지 않는다. 분류 이름만.
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { PREVIEW_BOT_RE } from './linkPreview';
import type { RefBucket } from './referrer';

export type ClickApp = 'sg' | 'uc' | 'wim';
export type ClickDevice = 'android' | 'ios' | 'desktop';
export type ClickClass = 'human' | 'prefetch' | 'bot' | 'nolang' | 'nonnav' | 'nometa';

/** 헤더 읽기만 필요하다(NextRequest.headers·Headers·시험용 Map 모두 맞는다). */
export type HeaderLike = { get(name: string): string | null };

/**
 * 수집기 표지 — /app 의 데스크톱 UA 계열 집계(mkt:attr:ua)와 사람 판정이 «같은 것»을 쓴다(한 곳에만 둔다).
 * ★2026-10-04 보강: 봇 표지가 없는 감사·모니터링·AI 에이전트(AhrefsSiteAudit·Sitebulb·GTmetrix·Datadog·ChatGPT-User·
 *   Perplexity-User·Claude-User·Google 의 AdsBot·InspectionTool·Read-Aloud 등).
 * 주의: 사람의 인앱 브라우저 표지(NAVER·DaumApps·baiduboxapp·YaBrowser·KAKAOTALK 등)는 넣지 않는다 — 넣으면 사람이 빠진다.
 */
export const UA_BOT_RE = /bot|crawl|spider|slurp|headless|python|curl|wget|go-http|okhttp|java\/|axios|node-fetch|undici|libwww|http-?client|scrapy|externalagent|externalfetcher|preview|monitor|checker|lighthouse|phantom|puppeteer|playwright|ahrefs|sitebulb|gtmetrix|statuscake|site24x7|datadog|newrelic|ia_archiver|zgrab|aiohttp|slimerjs|cypress|chatgpt|claude|anthropic|perplexity|google-?(read-aloud|other|extended)|inspectiontool|adsbot|mediapartners|feedfetcher|apis-google|storebot|vercel/i;

/**
 * 미리보기 봇 판정 — 사람의 «인앱 브라우저»는 빼고 본다.
 * ★2026-10-04: PREVIEW_BOT_RE 의 `Kakao` 가 카카오톡 «인앱 브라우저»(UA 끝에 `KAKAOTALK 10.4.5` / `;KAKAOTALK 2410430`)에도
 *   걸려, 카톡에서 링크를 누른 «사람»이 302 대신 미리보기 HTML 을 받았다 → 집계 0, 그리고 그 HTML 의 meta refresh 는
 *   리퍼러 없는 Play 주소라 안드로이드 설치의 utm_source 가 사라졌다. 카카오 «스크랩 봇»은 `kakaotalk-scrap/1.0` 이라
 *   `KAKAOTALK<공백·/><숫자>` 로 정확히 갈린다.
 */
const IN_APP_HUMAN_RE = /KAKAOTALK[ /]?\d/i;
export function isPreviewBot(ua: string): boolean {
  return PREVIEW_BOT_RE.test(ua) && !IN_APP_HUMAN_RE.test(ua);
}

export function clickDevice(ua: string): ClickDevice {
  return /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'desktop';
}

/** 사람의 문서 이동인가 — 순수 함수(tests/smartLink.test.ts 가 고정한다). */
export function classifyClick(h: HeaderLike, method = 'GET'): ClickClass {
  const purpose = [h.get('sec-purpose'), h.get('purpose'), h.get('x-purpose'), h.get('x-moz')]
    .filter(Boolean).join(' ').toLowerCase();
  if (/prefetch|prerender|preview/.test(purpose) || h.get('next-router-prefetch') != null || h.get('rsc') === '1') {
    return 'prefetch';
  }
  const ua = h.get('user-agent') || '';
  if (!/Mozilla\//.test(ua) || UA_BOT_RE.test(ua) || isPreviewBot(ua)) return 'bot';
  if (!(h.get('accept-language') || '').trim()) return 'nolang';
  if (method.toUpperCase() !== 'GET') return 'nonnav';
  const mode = h.get('sec-fetch-mode');
  if (mode == null) return 'nometa';
  const dest = h.get('sec-fetch-dest');
  if (mode.toLowerCase() !== 'navigate' || (dest != null && dest.toLowerCase() !== 'document')) return 'nonnav';
  return 'human';
}

const SITES = new Set(['same-origin', 'same-site', 'cross-site', 'none']);
function siteOf(h: HeaderLike): string {
  const s = (h.get('sec-fetch-site') || '').toLowerCase();
  return SITES.has(s) ? s : 'other';
}
function desktopOs(ua: string): string {
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'win';
  if (/CrOS/.test(ua)) return 'cros';
  if (/Linux|X11/.test(ua)) return 'linux';
  return 'other';
}

/** 한 번의 요청이 더할 필드들 — 순수 함수(시험용으로 따로 뺀다). */
export function clickFields(h: HeaderLike, method: string, refBucket: RefBucket): string[] {
  const ua = h.get('user-agent') || '';
  const device = clickDevice(ua);
  const cls = classifyClick(h, method);
  const out = [`${device}|${cls}`];
  if (cls === 'human') {
    out.push(`${device}|site:${siteOf(h)}`, `${device}|ref:${refBucket}`);
    if (device === 'desktop') out.push(`desktop|os:${desktopOs(ua)}`);
  }
  return out;
}

function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function clickKey(app: ClickApp, from: string, day: string, vercelEnv = process.env.VERCEL_ENV): string {
  return `${vercelEnv === 'production' ? 'clk' : 'clkp'}:${app}:${from}:${day}`;
}

/** 분류 집계 — 응답 뒤 after() 안에서만 부른다. 태그 없는 클릭은 기존 카운터와 똑같이 세지 않는다. */
export async function recordClick(app: ClickApp, fromRaw: string | null, fields: string[]): Promise<void> {
  const from = (fromRaw || '').toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(from) || fields.length === 0) return;
  try {
    const key = clickKey(app, from, etDate());
    const cur = await getFromCache<Record<string, number>>(key);
    const next: Record<string, number> = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
    for (const f of fields) next[f] = (Number(next[f]) || 0) + 1;
    await setInCache(key, next, 60 * 60 * 24 * 45);
  } catch { /* 집계 실패가 이동을 막지 않는다 */ }
}
