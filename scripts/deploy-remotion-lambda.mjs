#!/usr/bin/env node
// ============================================================================
// Remotion Lambda 배포 가이드 + 자동화 스크립트
// 실행: node scripts/deploy-remotion-lambda.mjs
// ============================================================================

import { execSync } from 'child_process';

const REGION = process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || 'us-east-1';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║           SIGNUM HQ — Remotion Lambda 배포 가이드           ║
╚══════════════════════════════════════════════════════════════╝

필수 환경변수 확인:
  AWS_ACCESS_KEY_ID:      ${process.env.AWS_ACCESS_KEY_ID ? '✅ 설정됨' : '❌ 미설정'}
  AWS_SECRET_ACCESS_KEY:  ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ 설정됨' : '❌ 미설정'}
  AWS_REGION:             ${REGION}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 1: IAM 정책 확인
   AWS IAM 사용자에 다음 정책이 필요합니다:
   - remotion-executionrole-policy
   - remotion-userpolicy
   
   공식 문서: https://remotion.dev/docs/lambda/permissions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 2: Lambda 함수 배포
   명령어: npm run remotion:deploy-fn

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 3: 사이트 (Remotion 번들) S3 업로드
   명령어: npm run remotion:deploy-site
   
   완료 후 출력되는 URL을 Vercel 환경변수에 설정:
   REMOTION_SERVE_URL = https://[bucket].s3.[region].amazonaws.com/sites/signum-shorts/...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 4: Vercel 환경변수 설정
   Vercel Dashboard → Settings → Environment Variables:
   
   REMOTION_SERVE_URL       = (Step 3에서 받은 URL)
   REMOTION_FUNCTION_NAME   = (Step 2에서 받은 함수명)
   REMOTION_AWS_REGION      = ${REGION}
   REMOTION_S3_BUCKET       = (Step 2에서 생성된 버킷명)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 5: 테스트 렌더링
   curl "https://signumhq.com/api/cron/render-video?type=pulse&lang=en&dry_run=false&secret=YOUR_CRON_SECRET"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Step 6: Vercel cron dry_run 해제
   vercel.json에서 dry_run=true → dry_run=false로 변경

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 예상 비용 (월간):
   Lambda 렌더링: ~$0.60/영상 × 20영상/월 = ~$12/월
   S3 스토리지:   ~$0.50/월
   Polly TTS:     ~$4/월 (3개국어 × 20영상)
   ────────────────────────────────
   총 추정:       ~$16.50/월
`);

// Auto-check current state
console.log('🔍 현재 상태 확인 중...\n');

try {
  const result = execSync('npx remotion lambda functions ls', { encoding: 'utf-8', timeout: 15000 });
  console.log('Lambda 함수 목록:');
  console.log(result);
} catch (e) {
  console.log('⚠️  Lambda 함수를 확인할 수 없습니다 (AWS 자격 증명 또는 네트워크 확인 필요)\n');
}

try {
  const result = execSync('npx remotion lambda sites ls', { encoding: 'utf-8', timeout: 15000 });
  console.log('배포된 사이트 목록:');
  console.log(result);
} catch (e) {
  console.log('⚠️  배포된 사이트를 확인할 수 없습니다\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('위 단계를 순서대로 진행하세요. 문제 발생 시 status 엔드포인트로 확인:');
console.log('  GET /api/cron/render-video?status=true');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
