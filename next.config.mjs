import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
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
    experimental: {
        optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
        viewTransition: true,
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

