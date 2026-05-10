// ============================================================================
// Remotion Lambda Helper — AWS Lambda 기반 영상 렌더링 유틸리티
// renderMediaOnLambda() 래퍼 + S3 결과 처리 + 비용 추정
// ============================================================================

// ---------------------------------------------------------------------------
// Lambda 설정 — 환경변수 기반
// ---------------------------------------------------------------------------
const LAMBDA_CONFIG = {
  region: () => process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || 'us-east-1',
  functionName: () => process.env.REMOTION_FUNCTION_NAME || 'remotion-render-4-0',
  serveUrl: () => process.env.REMOTION_SERVE_URL || '',
  bucketName: () => process.env.REMOTION_S3_BUCKET || '',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RenderRequest {
  compositionId: string;
  inputProps: Record<string, any>;
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9';
  imageFormat?: 'jpeg' | 'png';
}

export interface RenderResult {
  status: 'success' | 'error' | 'dry_run';
  videoUrl?: string;
  bucketName?: string;
  renderId?: string;
  estimatedCost?: number;
  durationMs?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------
export async function renderVideo(
  request: RenderRequest,
  dryRun = true
): Promise<RenderResult> {
  if (dryRun) {
    console.log(`[RemotionLambda] DRY_RUN: ${request.compositionId}`);
    return {
      status: 'dry_run',
      estimatedCost: 0.02,
    };
  }

  const serveUrl = LAMBDA_CONFIG.serveUrl();
  const functionName = LAMBDA_CONFIG.functionName();

  // Check if Lambda is configured
  if (!serveUrl || !functionName) {
    console.warn('[RemotionLambda] Lambda not configured — serveUrl or functionName missing');
    console.warn('[RemotionLambda] Set REMOTION_SERVE_URL and REMOTION_FUNCTION_NAME env vars');
    console.warn('[RemotionLambda] Falling back to manifest-only mode');
    return await renderManifestOnly(request);
  }

  const startTime = Date.now();

  try {
    // Dynamic import to avoid bundling issues in Vercel
    const { renderMediaOnLambda, getRenderProgress } = await import('@remotion/lambda/client');

    const region = LAMBDA_CONFIG.region();

    // Trigger render
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: region as any,
      functionName,
      serveUrl,
      composition: request.compositionId,
      inputProps: request.inputProps,
      codec: request.codec || 'h264',
      imageFormat: request.imageFormat || 'jpeg',
      maxRetries: 1,
      privacy: 'public',
      downloadBehavior: { type: 'play-in-browser' },
    });

    console.log(`[RemotionLambda] Render started: ${renderId} in ${bucketName}`);

    // Poll for completion (max 120 seconds)
    let videoUrl = '';
    const maxWaitMs = 120_000;
    const pollInterval = 3000;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      await sleep(pollInterval);
      elapsed += pollInterval;

      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName,
        region: region as any,
      });

      if (progress.done) {
        videoUrl = progress.outputFile || '';
        console.log(`[RemotionLambda] Render complete: ${videoUrl}`);
        break;
      }

      if (progress.fatalErrorEncountered) {
        throw new Error(`Render failed: ${JSON.stringify(progress.errors)}`);
      }

      const pct = Math.round((progress.overallProgress || 0) * 100);
      console.log(`[RemotionLambda] Progress: ${pct}% (${elapsed / 1000}s)`);
    }

    if (!videoUrl) {
      throw new Error('Render timed out after 120 seconds');
    }

    const durationMs = Date.now() - startTime;

    return {
      status: 'success',
      videoUrl,
      bucketName,
      renderId,
      estimatedCost: 0.02,
      durationMs,
    };
  } catch (err: any) {
    console.error(`[RemotionLambda] Error:`, err.message);
    // Fallback to manifest-only mode
    return await renderManifestOnly(request, err.message);
  }
}

// ---------------------------------------------------------------------------
// Fallback: S3 manifest upload (for when Lambda is not yet deployed)
// ---------------------------------------------------------------------------
async function renderManifestOnly(
  request: RenderRequest,
  errorContext?: string
): Promise<RenderResult> {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const region = LAMBDA_CONFIG.region();
    const bucket = process.env.S3_MARKETING_BUCKET || 'signum-marketing';
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    };

    if (!credentials.accessKeyId) {
      return { status: 'error', error: 'AWS credentials not configured' };
    }

    const dateKey = new Date().toISOString().split('T')[0];
    const manifestKey = `videos/manifest/${dateKey}-${request.compositionId}-${Date.now()}.json`;

    const manifest = {
      compositionId: request.compositionId,
      inputProps: request.inputProps,
      codec: request.codec || 'h264',
      status: 'pending_lambda_deploy',
      errorContext,
      createdAt: new Date().toISOString(),
      note: 'Lambda not yet deployed. Deploy with: npx remotion lambda functions deploy',
    };

    const s3 = new S3Client({ region, credentials });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }));

    console.log(`[RemotionLambda] Manifest saved: s3://${bucket}/${manifestKey}`);

    return {
      status: 'error',
      error: errorContext || 'Lambda not deployed — manifest saved for later processing',
      videoUrl: `https://${bucket}.s3.amazonaws.com/${manifestKey}`,
    };
  } catch (e: any) {
    return { status: 'error', error: `Manifest fallback failed: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Lambda 배포 상태 체크
// ---------------------------------------------------------------------------
export async function checkLambdaStatus(): Promise<{
  deployed: boolean;
  functionName?: string;
  serveUrl?: string;
  region?: string;
  message: string;
}> {
  const serveUrl = LAMBDA_CONFIG.serveUrl();
  const functionName = LAMBDA_CONFIG.functionName();
  const region = LAMBDA_CONFIG.region();

  if (!serveUrl) {
    return {
      deployed: false,
      region,
      message: 'REMOTION_SERVE_URL not set. Run: npx remotion lambda sites create src/remotion/index.ts',
    };
  }

  if (!functionName) {
    return {
      deployed: false,
      region,
      message: 'REMOTION_FUNCTION_NAME not set. Run: npx remotion lambda functions deploy',
    };
  }

  return {
    deployed: true,
    functionName,
    serveUrl,
    region,
    message: 'Lambda ready',
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
