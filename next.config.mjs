/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            {
                source: '/guardian',
                destination: '/intel-guardian',
                permanent: true,
            },
        ]
    },
}

export default nextConfig;
