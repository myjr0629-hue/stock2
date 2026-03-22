/**
 * AWS Secrets Manager Loader for SIGNUM HQ
 * 
 * Production: Loads secrets from AWS Secrets Manager → injects into process.env
 * Development: Falls back to .env.local (no AWS call needed)
 * 
 * Usage: Call loadSecrets() once at app startup (instrumentation.ts)
 * Secrets are cached in-memory — only 1 AWS call per cold start
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const SECRET_NAME = 'signum-hq/api-keys';
const REGION = process.env.AWS_REGION || 'us-east-1';

let loaded = false;

/**
 * Load secrets from AWS Secrets Manager and inject into process.env
 * Safe to call multiple times — only executes once
 */
export async function loadSecrets(): Promise<void> {
    if (loaded) return;

    // Skip in development if .env.local provides the keys
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        console.log('[SecretsManager] Development mode — using .env.local');
        loaded = true;
        return;
    }

    // Need AWS credentials to fetch secrets
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        console.warn('[SecretsManager] AWS credentials not available — using env vars');
        loaded = true;
        return;
    }

    try {
        const client = new SecretsManagerClient({
            region: REGION,
            credentials: { accessKeyId, secretAccessKey },
        });

        const result = await client.send(new GetSecretValueCommand({
            SecretId: SECRET_NAME,
        }));

        if (!result.SecretString) {
            console.warn('[SecretsManager] Empty secret — using env vars');
            loaded = true;
            return;
        }

        const secrets = JSON.parse(result.SecretString) as Record<string, string>;
        let injected = 0;

        for (const [key, value] of Object.entries(secrets)) {
            // Only inject if not already set (env vars take precedence)
            if (!process.env[key] && value) {
                process.env[key] = value;
                injected++;
            }
        }

        console.log(`[SecretsManager] ✅ Loaded ${Object.keys(secrets).length} secrets, injected ${injected} new env vars`);
        loaded = true;
    } catch (error: any) {
        console.error('[SecretsManager] ❌ Failed to load secrets:', error.message);
        console.warn('[SecretsManager] Falling back to env vars');
        loaded = true;
    }
}
