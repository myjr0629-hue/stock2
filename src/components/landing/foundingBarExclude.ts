/**
 * StickyFoundingBar 를 그리지 않는 경로 — ★2026-11-13 실적 SEO 페이지(11/12 신설).
 *   · 왜: /earnings 허브·/earnings/<SYMBOL> 은 앱 설치가 목적(/app?from=seo_<ticker>)인데
 *     PC 비로그인·무료 방문자에게 웹 PRO 가격 띠($69 → $49/월, 웹 Stripe)가 함께 떠
 *     앱 가격(미국 $9.99/월)과 혼선을 준다.
 *   · 범위: 이 두 경로만. /earnings-week 등 다른 모든 경로의 띠 동작·문구·가격은 그대로.
 *   · 판정은 컴포넌트(클라이언트 usePathname) 안에서 — [locale]/layout 은 클라이언트 이동 때
 *     다시 그려지지 않아, 레이아웃 서버 판정만으로는 홈 → 실적 이동 시 띠가 남는다.
 *   · usePathname(next-intl)은 로케일 접두를 뗀 경로를 주지만, 접두가 붙은 경로도 같은 결과.
 */
const EXCLUDED = /^(?:\/(?:ko|en|ja))?\/earnings(?:\/[^/?#]+)?\/?$/;

export function isFoundingBarExcludedPath(pathname: string | null | undefined): boolean {
    return EXCLUDED.test(pathname || '');
}
