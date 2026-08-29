import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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

