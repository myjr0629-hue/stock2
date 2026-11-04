import { APPS } from '@/lib/seo/apps';

/**
 * 스마트 앱 배너·manifest 는 «<head> 안에» 직접 그린다 (2026-09-30 운영 실측)
 * Next 15.5 는 사람(htmlLimitedBots 밖)에게 메타데이터를 «스트리밍»한다 — /ko 아이폰·안드로이드 응답에서
 * <meta name="apple-itunes-app"> 와 <link rel="manifest"> 가 </head> 뒤 약 46KB 본문에 있었다(구글봇만 head).
 *   · 애플: 스마트 앱 배너 태그는 head 에 두라고 한다 — 본문·스크립트로 넣은 태그는 배너를 보장하지 않는다.
 *   · 크롬(Blink): manifest 는 head 의 <link rel=manifest> 만 읽는다 → related_applications(Play 앱 설치 안내)가 안 뜬다.
 * 유입 1위가 자사 웹(from=home)이라 설치 전환의 첫 관문이다. 정적 태그라 속도 영향은 없다.
 * 앱 고르기는 예전 metadata 규칙 그대로: /undercurrent·/flow/*·/tickers·/learn → Undercurrent · /wim → WIM · 나머지 → SIGNUM.
 */
export function smartBannerAppId(path: string, fromShare = false, earningsIntent = false): string {
  const rest = path.replace(/^\/(en|ko|ja)(?=\/|$)/, '') || '/';
  // ★11/5 실적 의도 종목 페이지(7일 안 회사 확정 실적 — lib/seo/tickerEarningsIntent.upcoming)만 SIGNUM — 본문 «실적 예상 vs 실제» 블록이 SIGNUM 의 기능이다.
  //   그 밖의 /flow/* (실적 7일 밖)는 아래 기존 규칙 그대로 Undercurrent. 인자를 주지 않는 다른 호출자는 결과가 바뀌지 않는다.
  if (earningsIntent && /^\/flow\/[^/]+\/?$/.test(rest)) return APPS.signum.appleId;
  // 공유 링크(from=share)로 온 /flow/* 는 SIGNUM — 공유는 SIGNUM 앱(Command·흐름)에서 나가고 착지 카드도 SIGNUM 을 권한다.
  //   예전엔 맨 위 배너만 UC 를 권해 한 화면에서 두 앱을 권했다(2026-09-30 공유 루프 통합 검증).
  if (fromShare && /^\/flow\//.test(rest)) return APPS.signum.appleId;
  if (/^\/(undercurrent|tickers|learn)(\/|$)/.test(rest) || /^\/flow\//.test(rest)) return APPS.undercurrent.appleId;
  if (/^\/wim(\/|$)/.test(rest)) return APPS.wim.appleId;
  return APPS.signum.appleId;
}

/** /{locale}/flow/{TICKER} 의 티커(대문자) — 종목 페이지가 아니면 null. 루트 레이아웃이 실적 의도 판정에 쓴다. */
export function flowTickerOf(path: string): string | null {
  const rest = path.replace(/^\/(en|ko|ja)(?=\/|$)/, '') || '/';
  const m = rest.match(/^\/flow\/([^/?#]+)\/?$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).toUpperCase(); } catch { return null; }
}
