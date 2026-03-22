/**
 * Phase B-1: Create Secrets Manager Secret
 * Stores all sensitive API keys in a single JSON secret
 */
require('dotenv').config({ path: '.env.local', quiet: true });
const REGION = process.env.AWS_REGION || 'us-east-1';
const credentials = { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };

const SECRET_NAME = 'signum-hq/api-keys';

// Keys to store in Secrets Manager (excluding AWS credentials themselves and public keys)
const SECRETS_TO_STORE = {
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    FMP_API_KEY: process.env.FMP_API_KEY,
    FRED_API_KEY: process.env.FRED_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_NEWS_KEY: process.env.GEMINI_NEWS_KEY,
    GEMINI_VERDICT_KEY: process.env.GEMINI_VERDICT_KEY,
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY,
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    EC2_REDIS_PROXY_KEY: process.env.EC2_REDIS_PROXY_KEY,
};

async function main() {
    const { SecretsManagerClient, CreateSecretCommand, UpdateSecretCommand, 
            GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const sm = new SecretsManagerClient({ region: REGION, credentials });

    // Filter out undefined values
    const secretData = {};
    let count = 0;
    for (const [key, val] of Object.entries(SECRETS_TO_STORE)) {
        if (val) {
            secretData[key] = val;
            count++;
            console.log(`  ✓ ${key} (${val.substring(0, 8)}...)`);
        } else {
            console.log(`  ⊘ ${key} (not set, skipping)`);
        }
    }

    console.log(`\nStoring ${count} secrets in "${SECRET_NAME}"...`);

    // Try to create, if exists then update
    try {
        await sm.send(new CreateSecretCommand({
            Name: SECRET_NAME,
            Description: 'SIGNUM HQ API keys and secrets',
            SecretString: JSON.stringify(secretData),
        }));
        console.log(`✅ Secret "${SECRET_NAME}" CREATED`);
    } catch (e) {
        if (e.name === 'ResourceExistsException') {
            await sm.send(new UpdateSecretCommand({
                SecretId: SECRET_NAME,
                SecretString: JSON.stringify(secretData),
            }));
            console.log(`✅ Secret "${SECRET_NAME}" UPDATED`);
        } else {
            console.error('❌ Failed:', e.message);
            return;
        }
    }

    // Verify: read it back
    console.log('\nVerifying...');
    const result = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
    const parsed = JSON.parse(result.SecretString);
    const storedKeys = Object.keys(parsed);
    console.log(`✅ Verified: ${storedKeys.length} keys stored`);
    storedKeys.forEach(k => console.log(`  ✓ ${k}`));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
