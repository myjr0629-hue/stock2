/**
 * Next.js Instrumentation — runs once on server startup (cold start)
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * Loads secrets from AWS Secrets Manager before any API route runs
 */

export async function register() {
    // Only run on server (not Edge runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { loadSecrets } = await import('@/lib/aws/secretsManager');
        await loadSecrets();
    }
}
