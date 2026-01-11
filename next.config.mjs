/** @type {import('next').NextConfig} */
const nextConfig = {
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
                permanent: false, // Temporary redirect until we ensure everyone is migrated
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
        ],
    },
}

export default nextConfig;
