import createNextIntlPlugin from 'next-intl/plugin';
import { createRequire } from 'node:module';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * 구글봇에게 메타데이터(canonical·hreflang·title·description)를 «<head> 안에» 준다.
 *
 * 왜 (2026-09-30 실측): Next 15.5 는 메타데이터를 «스트리밍»한다 — 머리말을 먼저 보내고 canonical·title 을
 *   본문 끝에 붙인다. head 에 넣어 주는 건 `htmlLimitedBots` 목록의 봇뿐이고, 구글봇은 «JS 를 실행하니 괜찮다»며
 *   목록에서 빠져 있다(node_modules/next/dist/shared/lib/router/utils/is-bot.js 의 HEADLESS_BROWSER_BOT_UA_RE,
 *   server/lib/streaming-metadata.js 의 shouldServeStreamingMetadata).
 *   - 운영 /en/flow/MSI: Bingbot 은 canonical 이 head(2,790 < </head> 5,167), 구글봇은 body(104,035 > 2,602).
 *     홈(/en·/ko·/ja)·종목 6,768쪽·설명·가격 페이지 전부 같다.
 *   - 구글은 body 의 canonical 을 받지 않는다 → Search Console URL 검사: 색인된 /flow/NIO 가
 *     «User-declared canonical: None»(9/24 구글봇 스마트폰 크롤). 색인 제외 «사용자 canonical 없는 중복» 649쪽(검증 실패).
 *   그래서 구글봇을 목록에 더한다. 사람(브라우저·앱 웹뷰)은 목록에 없으니 스트리밍 그대로 — 사용자 화면·속도 무변경.
 *   ⚠ Search Console «실시간 테스트»(Google-InspectionTool)는 원래 목록에 있어 head 로 받는다 — 그 화면만 보면 «정상»으로 속는다.
 */
const NEXT_15_5_HTML_LIMITED_BOTS = // Next 가 목록 파일을 옮겼을 때만 쓰는 사본(15.5.9 판 그대로)
    '[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight';
function headMetadataBots() {
    let nextDefault = NEXT_15_5_HTML_LIMITED_BOTS;
    try {
        nextDefault = createRequire(import.meta.url)('next/dist/shared/lib/router/utils/html-bots').HTML_LIMITED_BOT_UA_RE.source;
    } catch { /* 사본으로 — 링크 미리보기 봇(트위터·슬랙 등)이 head 를 잃지 않게 */ }
    return new RegExp(`Googlebot|${nextDefault}`, 'i');
}

/**
 * 배포마다 바뀌는 빌드 스탬프.
 * 서비스 워커 캐시 이름에 넣어 «배포하면 옛 캐시가 반드시 지워지게» 한다.
 * (Vercel 은 커밋 SHA 를 준다. 로컬/직접 빌드면 시각으로 대체)
 */
const BUILD_STAMP =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.VERCEL_DEPLOYMENT_ID?.slice(-12) ||
    String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        // Avoid Vercel OOM during Next's separate type validation pass.
        ignoreBuildErrors: true,
    },
    // [PERF] X-Powered-By 헤더 제거 (보안 + 미미한 바이트 절감)
    poweredByHeader: false,
    // 구글봇에게 canonical·hreflang·title 을 head 안에 — 위 headMetadataBots 주석 참조
    htmlLimitedBots: headMetadataBots(),
    outputFileTracingExcludes: {
        '*': [
            './snapshots/**',
            './.next/cache/**',
        ],
    },
    // [PERF] 패키지 import 최적화 — lucide-react tree-shaking 강화
    // [Remotion] Prevent bundling issues with Remotion renderer in Next.js
    serverExternalPackages: ['@remotion/renderer'],
    experimental: {
        optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
    },
    async redirects() {
        return [
            {
                source: '/guardian',
                destination: '/intel-guardian',
                permanent: true,
            },
            {
                source: '/tier-01',
                destination: '/intel',
                permanent: false,
            },
        ]
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'logo.clearbit.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'assets.parqet.com',
            },
            // [PERF] next/image 적용 대비 — 주식 로고 이미지 도메인
            {
                protocol: 'https',
                hostname: 'financialmodelingprep.com',
            },
        ],
    },
}

export default withNextIntl(nextConfig);

