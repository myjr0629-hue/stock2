// ═══════════════════════════════════════════════════════════════════
// S3 Marketing Bucket Setup Script
// 실행: node scripts/setup_marketing_s3.js
// signum-marketing 버킷 생성 + CORS + Public Access 설정
// ═══════════════════════════════════════════════════════════════════

require('dotenv').config({ path: '.env.local' });
const {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
} = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.S3_MARKETING_BUCKET || 'signum-marketing';

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function main() {
  console.log(`\n🪣 Setting up S3 bucket: ${BUCKET} in ${REGION}\n`);

  // 1. Check if bucket exists
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log('✅ Bucket already exists');
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      console.log('📦 Creating bucket...');
      try {
        const createParams = { Bucket: BUCKET };
        // us-east-1 doesn't need LocationConstraint
        if (REGION !== 'us-east-1') {
          createParams.CreateBucketConfiguration = { LocationConstraint: REGION };
        }
        await s3.send(new CreateBucketCommand(createParams));
        console.log('✅ Bucket created');
      } catch (ce) {
        if (ce.name === 'BucketAlreadyOwnedByYou') {
          console.log('✅ Bucket already owned by you');
        } else {
          console.error('❌ Create failed:', ce.message);
          return;
        }
      }
    } else {
      console.error('❌ HeadBucket error:', e.message);
      return;
    }
  }

  // 2. Set CORS for audio/video access from browser
  console.log('\n🌐 Setting CORS...');
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedOrigins: [
            'https://www.signumhq.com',
            'https://signumhq.com',
            'http://localhost:3000',
          ],
          MaxAgeSeconds: 86400,
        }],
      },
    }));
    console.log('✅ CORS configured');
  } catch (e) {
    console.error('⚠️ CORS setup failed:', e.message);
  }

  // 3. Allow public read (for TTS audio and video files)
  console.log('\n🔓 Setting public access...');
  try {
    await s3.send(new PutPublicAccessBlockCommand({
      Bucket: BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    }));
    console.log('✅ Public access enabled');
  } catch (e) {
    console.error('⚠️ Public access setup failed:', e.message);
  }

  // 4. Bucket policy for public read on specific prefixes
  console.log('\n📜 Setting bucket policy...');
  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadForMarketing',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: [
          `arn:aws:s3:::${BUCKET}/tts/*`,
          `arn:aws:s3:::${BUCKET}/videos/*`,
          `arn:aws:s3:::${BUCKET}/bgm/*`,
          `arn:aws:s3:::${BUCKET}/images/*`,
        ],
      }],
    };
    await s3.send(new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify(policy),
    }));
    console.log('✅ Bucket policy set');
  } catch (e) {
    console.error('⚠️ Policy setup failed:', e.message);
  }

  console.log(`
══════════════════════════════════════════
  S3 Marketing Bucket Setup Complete
  Bucket: ${BUCKET}
  Region: ${REGION}
  
  Folder structure:
  ├── tts/          (Polly TTS audio files)
  │   ├── en/
  │   ├── ko/
  │   └── ja/
  ├── videos/       (Rendered video HTML + manifests)
  │   ├── pulse/
  │   ├── news/
  │   └── manifest/
  ├── bgm/          (Background music tracks)
  └── images/       (Marketing images)
══════════════════════════════════════════
  `);
}

main().catch(e => console.error('FATAL:', e));
