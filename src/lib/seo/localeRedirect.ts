// 언어 없는 주소(/flow/NVDA 등) → 기본 언어(/en/…) 리다이렉트를 «영구(308)»로 바꿀지 판정한다.
//
// 왜 (2026-09-30 Search Console 실측): next-intl 은 언어 없는 주소를 늘 307(임시)로 보낸다. 임시라서 구글이
//   /flow/NIO(노출 55·9위)와 /en/flow/NIO(노출 12)를 «다른 페이지»로 따로 색인해 신호를 나눠 먹고 있었다
//   (/flow/SOFI·ORCL·MRVL·ANET·NVDA·RIVN·SMH, /learn/put-call-ratio 도 같은 모양). 사이트맵·내부 링크엔 언어 없는 주소가 0 이다 —
//   예전 주소 체계 때 구글이 기억한 주소가 307 이라 계속 살아 있다.
//
// 규칙: 언어 선호가 «전혀 없는» 요청(Accept-Language 없음·NEXT_LOCALE 쿠키 없음 = 크롤러의 모양)만 308.
//   사람은 브라우저가 늘 Accept-Language 를 보내므로 지금처럼 언어별 307(ko→/ko, ja→/ja)을 그대로 받는다.
//   홈(/)은 지금 가장 많이 클릭되는 주소라 건드리지 않는다. 대상은 «같은 경로에 기본 언어만 붙인» 리다이렉트뿐.
export function shouldMakeLocaleRedirectPermanent(input: {
    status: number;
    location: string | null;
    pathname: string;
    acceptLanguage: string | null;
    hasLocaleCookie: boolean;
    locales: readonly string[];
    defaultLocale: string;
}): boolean {
    const { status, location, pathname, acceptLanguage, hasLocaleCookie, locales, defaultLocale } = input;
    if (status !== 307 || !location) return false;
    if (pathname === '/' || pathname === '') return false;
    if (hasLocaleCookie) return false;
    if (acceptLanguage && acceptLanguage.trim() !== '') return false;
    const first = pathname.split('/')[1] || '';
    if (locales.includes(first)) return false;
    let target: string;
    try {
        target = new URL(location, 'https://x.invalid').pathname;
    } catch {
        return false;
    }
    return target === `/${defaultLocale}${pathname}`;
}
