import type { MetadataRoute } from 'next';
import { publicBase } from '@/lib/net/publicBase';

// Tell crawlers the site is open and where the sitemap is. (None existed before —
// which is why programmatic pages weren't being discovered.) Keep API/admin/app-shell
// out of the index; content pages (incl. /flow/[ticker]) are crawlable.
export default function robots(): MetadataRoute.Robots {
  const base = publicBase();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // ⛔ 2026-08-22 실측: 아래 패턴들이 «로케일 프리픽스»를 못 덮고 있었다.
      //   Disallow: /app-view/  는 /app-view/ 만 막고 실제 경로인 /en/app-view/ 는 못 막는다.
      //   그래서 앱 화면 전체(/en/app-view/dash 등)와 /ko/login, /ja/settings 가
      //   Googlebot 에 200 으로 열려 있었다 — 크롤 예산 낭비이자 저품질 색인 위험이다.
      //   next-intl 이 모든 실경로에 /{locale} 을 붙이므로 와일드카드가 필요하다.
      disallow: [
        '/api/', '/admin/',
        '/app-view/', '/*/app-view/',
        '/login', '/*/login',
        '/settings', '/*/settings',
        // ⛔ 2026-08-22 실측: 아래 6개는 «게이트된 웹 터미널 셸»인데 Googlebot 에
        //   HTTP 200 + index,follow 로 열려 있었고 사이트맵엔 없었다.
        //   자체 metadata 가 없어 «홈과 제목이 완전히 동일»했다 → 홈 제목을 희석하고
        //   저품질 중복으로 색인될 위험이 있었다. 크롤 예산도 낭비된다
        //   (지금 진짜로 크롤해야 할 티커 페이지가 1,800개다).
        //   판정 기준: 자체 metadata 유무 = 공개 의도 유무.
        //   `/radar` 는 자체 metadata 가 있는 «의도적 공개 페이지»라 제외하지 않는다.
        '/dashboard', '/*/dashboard',
        // '/intel' 은 접두사 매칭이라 '/intel-guardian' 도 함께 막힌다.
        // Bing Site Scan(2026-08-22)이 H1 누락으로 잡아낸 4페이지 중 하나였고,
        // 자체 metadata 가 없어 역시 홈 제목을 물려받는 앱 셸이다.
        '/intel', '/*/intel',
        '/quant-radar', '/*/quant-radar',
        '/watchlist', '/*/watchlist',
        '/portfolio', '/*/portfolio',
        // ⚠️ 반드시 '$' 를 붙인다. robots 의 Disallow 는 «접두사» 매칭이라
        //   '/ticker' 라고 쓰면 오늘 만든 허브 '/tickers' 까지 통째로 막힌다.
        '/ticker$', '/*/ticker$',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    // AI 답변엔진용 안내(신흥 규약). robots.txt 가 «가지 마라»면 llms.txt 는
    // «여기를 봐라»다 — 인용은 참조 도메인이 2개뿐인 지금 링크만큼 값어치가 있다.
    host: base,
  };
}
