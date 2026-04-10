/**
 * Deploy signum-cross-sector-intel Lambda
 * 
 * Creates or updates:
 *   - Lambda function: signum-cross-sector-intel
 *   - EventBridge rule: signum-cross-sector-cron (Mon-Fri 21:50 UTC)
 *   - IAM permissions for EventBridge → Lambda
 * 
 * Usage: node scripts/deploy-cross-sector.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
} = require('@aws-sdk/client-lambda');
const {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} = require('@aws-sdk/client-eventbridge');

const REGION = 'us-east-1';
const FUNCTION_NAME = 'signum-cross-sector-intel';
const RULE_NAME = 'signum-cross-sector-cron';
const ROLE_ARN = process.env.LAMBDA_ROLE_ARN || '';

const lambdaDir = path.join(__dirname, 'lambda-cross-sector');

// Install dependencies
console.log('Installing dependencies...');
execSync('npm install', { cwd: lambdaDir, stdio: 'pipe' });

// Create zip
const zipPath = path.join(__dirname, 'lambda-cross-sector.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
const zipSize = Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 10) / 10;
console.log('Zip:', zipSize + 'MB');

async function deploy() {
  const lambda = new LambdaClient({ region: REGION });
  const zipBuffer = fs.readFileSync(zipPath);

  // Check if function exists
  let functionExists = false;
  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    functionExists = true;
    console.log('Function exists — updating...');
  } catch {
    console.log('Function does not exist — creating...');
  }

  // Detect role ARN
  let roleArn = ROLE_ARN;
  if (!roleArn) {
    try {
      const existing = await lambda.send(new GetFunctionCommand({ FunctionName: 'signum-harvest' }));
      roleArn = existing.Configuration.Role;
      console.log('Using role from signum-harvest:', roleArn);
    } catch {
      console.error('ERROR: Cannot determine Lambda role. Set LAMBDA_ROLE_ARN env var.');
      process.exit(1);
    }
  }

  const envVars = {
    NODE_ENV: 'production',
    POLYGON_API_KEY: process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || '',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
  };

  if (functionExists) {
    await lambda.send(new UpdateFunctionCodeCommand({
      FunctionName: FUNCTION_NAME,
      ZipFile: zipBuffer,
    }));
    console.log('Lambda code updated');

    await new Promise(r => setTimeout(r, 5000));

    await lambda.send(new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Timeout: 900,      // 15 minutes (ensures it never times out)
      MemorySize: 512,   // 512MB is plenty for API calls
      Environment: { Variables: envVars },
    }));
    console.log('Lambda config updated (900s, 512MB)');
  } else {
    await lambda.send(new CreateFunctionCommand({
      FunctionName: FUNCTION_NAME,
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 900,
      MemorySize: 512,
      Environment: { Variables: envVars },
      Description: 'Cross-Sector AI Intelligence Daily Brief Generator (Claude 3.5 Sonnet)',
    }));
    console.log('Lambda function created: ' + FUNCTION_NAME);
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── EventBridge Schedule ──
  console.log('Setting up EventBridge schedule...');
  const eb = new EventBridgeClient({ region: REGION });

  // Cron schedule: 21:50 UTC, Mon-Fri
  // EventBridge cron expression syntax: cron(Minutes Hours Day-of-month Month Day-of-week Year)
  // UTC 21:50 Mon-Fri -> cron(50 21 ? * MON-FRI *)
  await eb.send(new PutRuleCommand({
    Name: RULE_NAME,
    ScheduleExpression: 'cron(50 21 ? * MON-FRI *)',
    State: 'ENABLED',
    Description: 'Trigger signum-cross-sector-intel at 21:50 UTC (17:50 EST) on weekdays',
  }));
  console.log('EventBridge rule created/updated: ' + RULE_NAME + ' (cron(50 21 ? * MON-FRI *))');

  const fnInfo = await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
  const lambdaArn = fnInfo.Configuration.FunctionArn;

  await eb.send(new PutTargetsCommand({
    Rule: RULE_NAME,
    Targets: [{ Id: FUNCTION_NAME + '-target', Arn: lambdaArn }],
  }));
  console.log('EventBridge target set: ' + lambdaArn);

  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: FUNCTION_NAME,
      StatementId: 'EventBridgeInvoke',
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: 'arn:aws:events:' + REGION + ':' + lambdaArn.split(':')[4] + ':rule/' + RULE_NAME,
    }));
    console.log('EventBridge invoke permission added');
  } catch (e) {
    if (e.name === 'ResourceConflictException') {
      console.log('EventBridge permission already exists');
    } else {
      console.warn('Permission warning:', e.message);
    }
  }

  console.log('\\n✅ Deploy complete!');
  console.log('  Function: ' + FUNCTION_NAME);
  console.log('  Schedule: ' + RULE_NAME + ' (Mon-Fri 21:50 UTC)');
  console.log('  Timeout: 900s, Memory: 512MB');
  console.log('\\nTo test manually:');
  console.log('  aws lambda invoke --function-name ' + FUNCTION_NAME + ' --region ' + REGION + ' --no-cli-pager out.json && type out.json');
}

deploy().catch(e => {
  console.error('Deploy error:', e.message);
  process.exit(1);
});
