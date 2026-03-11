/**
 * SIGNUM HQ — Lambda v5 Update Script
 * Updates existing 'signum-harvest' Lambda with current lambda-harvest/index.js
 * 
 * Usage: node scripts/update-lambda.js
 */

require('dotenv').config({ path: '.env.local' });

const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-harvest';

const config = {
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
};

if (!config.credentials.accessKeyId) {
  console.error('ERROR: Set AWS credentials in .env.local');
  process.exit(1);
}

const lambda = new LambdaClient(config);

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  SIGNUM Lambda v5 Update — squeeze + IV     ║');
  console.log('╚══════════════════════════════════════════════╝');

  const lambdaDir = path.join(__dirname, 'lambda-harvest');
  const zipPath = path.join(__dirname, 'lambda-harvest-v5.zip');

  // 1. Verify index.js exists
  const indexPath = path.join(lambdaDir, 'index.js');
  if (!fs.existsSync(indexPath)) {
    console.error('ERROR: lambda-harvest/index.js not found');
    process.exit(1);
  }

  // Check v5 marker
  const code = fs.readFileSync(indexPath, 'utf8');
  if (code.includes('squeezeScore')) {
    console.log('✅ Verified: index.js contains squeeze/IV calculations (v5)');
  } else {
    console.error('WARNING: index.js may not have v5 squeeze/IV code');
  }

  // 2. Ensure node_modules exist
  console.log('📦 Checking dependencies...');
  if (!fs.existsSync(path.join(lambdaDir, 'node_modules'))) {
    console.log('   Installing dependencies...');
    execSync('npm install --production', { cwd: lambdaDir, stdio: 'inherit' });
  } else {
    console.log('   Dependencies already installed');
  }

  // 3. Create zip
  console.log('📦 Creating zip package...');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });

  const zipSize = fs.statSync(zipPath).size;
  console.log(`   Zip size: ${(zipSize / 1024 / 1024).toFixed(1)}MB`);

  // 4. Verify Lambda exists
  try {
    const func = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    console.log(`✅ Lambda found: ${FUNCTION_NAME} (Runtime: ${func.Configuration.Runtime})`);
  } catch (e) {
    console.error(`ERROR: Lambda '${FUNCTION_NAME}' not found. Run aws-setup-lambda.js first.`);
    process.exit(1);
  }

  // 5. Update Lambda code
  console.log('⚡ Uploading to AWS Lambda...');
  const zipBuffer = fs.readFileSync(zipPath);
  await lambda.send(new UpdateFunctionCodeCommand({
    FunctionName: FUNCTION_NAME,
    ZipFile: zipBuffer,
  }));

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ✅ Lambda v5 Update Complete!               ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Function: signum-harvest                    ║');
  console.log('║  Version:  v5 (squeeze + ATM IV + IV Skew)   ║');
  console.log('║  Schedule: Every 5 min (EventBridge)         ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Cleanup
  fs.unlinkSync(zipPath);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
