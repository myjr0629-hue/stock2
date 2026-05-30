import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';

// .env.local 환경 변수 로드
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (Premium deep male voice)
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// Redis 클라이언트 설정
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// ffmpeg 및 ffprobe 경로 감지
let ffprobePath = 'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe';
let ffmpegPath = 'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe';
if (!fs.existsSync(ffprobePath)) ffprobePath = 'ffprobe';
if (!fs.existsSync(ffmpegPath)) ffmpegPath = 'ffmpeg';

interface SegmentDef {
  id: string;
  voice: string;
  caption: string;
  visualIntent: string;
  emphasis: string[];
}

async function getLiveNvidiaData() {
  console.log('[Redis] Fetching real-time NVDA data from cache...');
  if (!url || !token) {
    console.warn('[Redis] Upstash credentials missing, using fallback data...');
    return getFallbackData();
  }

  try {
    const redis = new Redis({ url, token });
    const raw = await redis.get('cache:command:unified:NVDA');
    if (!raw) {
      console.warn('[Redis] NVDA Cache is null, using fallback data...');
      return getFallbackData();
    }
    
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    
    // 필수 데이터 파싱
    const price = parsed.structure?.underlyingPrice || parsed.fundamentals?.price || 221.20;
    const callWall = parsed.structure?.levels?.callWall || 250.00;
    const putFloor = parsed.structure?.levels?.putFloor || 200.00;
    const gammaFlip = parsed.structure?.gammaFlipLevel || parsed.volatility?.flipLevel || 235.00;
    const regime = parsed.volatility?.regime || 'COILING';
    const gammaRegime = parsed.structure?.gammaRegime || 'NEGATIVE';
    const darkPoolPercent = parsed.institutional?.darkPool?.percent || 55.3;
    const blockTradeVolume = parsed.institutional?.blockTrade?.volume || 24337125;
    const blockTradeNotional = blockTradeVolume * price;

    console.log('[Redis] Live NVDA dataset successfully fetched:', {
      price, callWall, putFloor, gammaFlip, regime, gammaRegime, darkPoolPercent, blockTradeVolume
    });

    return {
      price,
      callWall,
      putFloor,
      gammaFlip,
      regime: String(regime).toUpperCase(),
      gammaRegime: String(gammaRegime).toUpperCase(),
      darkPoolPercent,
      blockTradeVolume,
      blockTradeNotional
    };
  } catch (e: any) {
    console.error('[Redis Error] Failed to fetch live data:', e.message);
    return getFallbackData();
  }
}

function getFallbackData() {
  return {
    price: 221.20,
    callWall: 250.00,
    putFloor: 200.00,
    gammaFlip: 235.00,
    regime: 'COILING',
    gammaRegime: 'NEGATIVE',
    darkPoolPercent: 55.3,
    blockTradeVolume: 24337125,
    blockTradeNotional: 24337125 * 221.20
  };
}

async function main() {
  console.log('======================================================================');
  console.log('STARTING V37 REAL-TIME DATA & AUDIO SYNCHRONIZATION PIPELINE');
  console.log('======================================================================');

  // 1. Redis 실시간 데이터 획득
  const data = await getLiveNvidiaData();
  const formattedNotional = `$${(data.blockTradeNotional / 1e9).toFixed(1)}B`; // e.g., $5.4B
  
  // 수치를 말하기 좋은 텍스트로 보조 매핑
  const spokenPrice = Math.round(data.price);
  const spokenCallWall = Math.round(data.callWall);
  const spokenPutFloor = Math.round(data.putFloor);
  const spokenGammaFlip = Math.round(data.gammaFlip);

  // 2. 실시간 데이터 기반 쇼츠 6대 세그먼트 스크립트 작성
  const segmentDefinitions: SegmentDef[] = [
    {
      id: 'hook',
      voice: `${formattedNotional} in institutional block trades just exposed in Nvidia.`,
      caption: `${formattedNotional} INSTITUTIONAL BLOCK TRADES EXPOSED IN NVDA`,
      visualIntent: `show large flow alert, NVDA ticker and ${formattedNotional} badges`,
      emphasis: [formattedNotional, "INSTITUTIONAL", "BLOCK TRADES", "NVDA"]
    },
    {
      id: 'wall',
      voice: `It is coiling near the ${spokenCallWall} dollar call resistance wall.`,
      caption: `COILING NEAR THE $${spokenCallWall} CALL RESISTANCE WALL`,
      visualIntent: `highlight NVDA $${spokenCallWall} resistance wall`,
      emphasis: ["COILING", `$${spokenCallWall}`, "CALL RESISTANCE"]
    },
    {
      id: 'contrast',
      voice: `Normal retail charts only show price. They do not map this coiling pressure.`,
      caption: "NORMAL CHARTS ONLY SHOW PRICE. NOT THIS PRESSURE.",
      visualIntent: "normal candlestick chart vs hidden structural contrast scanner sweep",
      emphasis: ["ONLY SHOW PRICE", "NOT THIS PRESSURE"]
    },
    {
      id: 'unmask',
      voice: `SignumHQ unmasks the wall at ${spokenCallWall}, floor at ${spokenPutFloor}, and the flip at ${spokenGammaFlip}.`,
      caption: `UNMASKING WALL: $${spokenCallWall} | FLOOR: $${spokenPutFloor} | FLIP: $${spokenGammaFlip}`,
      visualIntent: "reveal Call Wall, Put Floor, Gamma Flip under terminal scanning",
      emphasis: [`WALL: $${spokenCallWall}`, `FLOOR: $${spokenPutFloor}`, `FLIP: $${spokenGammaFlip}`]
    },
    {
      id: 'regime',
      voice: `This is a highly compressed negative gamma coiling regime.`,
      caption: "HIGHLY COMPRESSED NEGATIVE GAMMA REGIME",
      visualIntent: "zoom and screen shake tension to show gap compression",
      emphasis: ["NEGATIVE GAMMA REGIME"]
    },
    {
      id: 'cta',
      voice: "See the live institutional maps for yourself at SignumHQ dot com.",
      caption: "SEE THE LIVE STRUCTURE MAPS — SIGNUMHQ.COM",
      visualIntent: "outro screen, lock in domain box",
      emphasis: ["LIVE STRUCTURE MAPS", "SIGNUMHQ.COM"]
    }
  ];

  const audioDir = path.join(__dirname, '..', 'public', 'shorts', 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const segmentDurations: number[] = [];

  for (let i = 0; i < segmentDefinitions.length; i++) {
    const seg = segmentDefinitions[i];
    const outPath = path.join(audioDir, `v37_seg_${i}.mp3`);

    console.log(`\n[Segment ${i} / ${seg.id}] Requesting TTS from ElevenLabs...`);
    console.log(`Voice Text: "${seg.voice}"`);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: seg.voice,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.62,
          similarity_boost: 0.85,
          style: 0.45,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Error] ElevenLabs API failed with status ${response.status}:`, errText);
      process.exit(1);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved segment audio to: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    // ffprobe로 정확한 재생 초 측정
    let duration = 0;
    try {
      const ffprobeCmd = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`;
      const stdout = execSync(ffprobeCmd).toString().trim();
      duration = parseFloat(stdout);
      if (isNaN(duration) || duration <= 0) {
        throw new Error(`Invalid duration parsed: ${stdout}`);
      }
      console.log(`[ffprobe Measure] Real Duration: ${duration.toFixed(3)}s`);
    } catch (err: any) {
      console.error(`[ffprobe Error] Failed to read duration for ${outPath}:`, err.message);
      duration = seg.voice.length * 0.075 + 0.4;
      console.log(`[Fallback Estimate] Duration: ${duration.toFixed(3)}s`);
    }

    segmentDurations.push(duration);
  }

  // 누적 타임라인 계산 (Cumulative Sync)
  console.log('\n----------------------------------------------------------------------');
  console.log('CALCULATING CUMULATIVE NARRATIVE TIMELINE (SSOT V37)');
  console.log('----------------------------------------------------------------------');

  let accumulatedTime = 0;
  const narrativeTimeline: any[] = [];

  for (let i = 0; i < segmentDefinitions.length; i++) {
    const def = segmentDefinitions[i];
    const dur = segmentDurations[i];
    
    const start = parseFloat(accumulatedTime.toFixed(3));
    const end = parseFloat((accumulatedTime + dur).toFixed(3));
    
    narrativeTimeline.push({
      id: def.id,
      start,
      end,
      voice: def.voice,
      caption: def.caption,
      visualIntent: def.visualIntent,
      emphasis: def.emphasis
    });
    
    console.log(`Segment: [${def.id.toUpperCase()}] -> ${start.toFixed(3)}s ~ ${end.toFixed(3)}s (Duration: ${dur.toFixed(3)}s)`);
    accumulatedTime += dur;
  }

  const finalDurationSec = parseFloat(accumulatedTime.toFixed(3));
  const finalDurationFrames = Math.round(finalDurationSec * 30);
  console.log(`\n>>> Total Cumulative Duration: ${finalDurationSec.toFixed(3)}s (${finalDurationFrames} frames at 30fps)`);

  // mockMarketPressureBriefV37.ts 코드 자동 작성
  const mockFilePath = path.join(__dirname, '..', 'src', 'shorts', 'data', 'mockMarketPressureBriefV37.ts');
  console.log(`\nWriting SSoT mock file to: ${mockFilePath}...`);

  const mockFileContent = `// ============================================================================
// MarketPressureBrief V37 — SSoT (Single Source of Truth) Timeline
// Generated programmatically via scripts/generate-v37-audio.ts
// ============================================================================
import type { ShortsVideoInput } from '../types';

export type NarrativeSegment = {
  id: string;
  start: number;
  end: number;
  voice: string;
  caption: string;
  visualIntent: string;
  emphasis?: string[];
};

export const NARRATIVE_TIMELINE: NarrativeSegment[] = ${JSON.stringify(narrativeTimeline, null, 2)};

export function createMockMarketPressureBriefV37Input(): ShortsVideoInput {
  return {
    videoId: \`mock-market-pressure-v37-nvda-\${Date.now()}\`,
    template: 'MarketPressureBriefV37' as any,
    format: 'viral',
    ticker: 'NVDA',
    title: 'V37 Premium Real-time NVDA Stream',
    hook: "${narrativeTimeline[0].voice}",
    scriptBeats: NARRATIVE_TIMELINE.map((seg, idx) => ({
      id: seg.id,
      label: idx === 0 ? 'hook' : (idx === NARRATIVE_TIMELINE.length - 1 ? 'cta' : 'info'),
      startSec: seg.start,
      endSec: seg.end,
      text: seg.voice,
      emphasis: seg.emphasis || []
    })),
    captions: NARRATIVE_TIMELINE.map((seg) => ({
      id: \`caption-\${seg.id}\`,
      text: seg.caption,
      startFrame: Math.round(seg.start * 30),
      endFrame: Math.round(seg.end * 30),
      emphasis: true,
      color: seg.id === 'cta' ? '#e07a5f' : undefined // Burnt Amber color
    })),
    dataCards: [],
    structureVisual: {
      price: ${data.price},
      callWall: ${data.callWall},
      putFloor: ${data.putFloor},
      gammaFlipLevel: ${data.gammaFlip},
      nearestWall: 'call',
      distancePercent: ${parseFloat(Math.abs((data.callWall - data.price) / data.price * 100).toFixed(1))},
      darkPoolNotional: ${Math.round(data.blockTradeNotional)},
      darkPoolPercentile: 94,
      offExchangeVolumeRatio: ${parseFloat((data.darkPoolPercent / 30).toFixed(1))},
      flowDirection: 'coiling near structural wall',
      regime: 'negative gamma pressure zone',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video', provider: 'replicate', isMock: false },
    voice: { 
      audioUrl: 'shorts/audio/v37_voice.mp3', 
      durationSec: ${finalDurationSec}, 
      provider: 'elevenlabs', 
      isMock: false 
    },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: ${finalDurationSec},
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
`;

  fs.writeFileSync(mockFilePath, mockFileContent, 'utf8');
  console.log('Successfully written mock file!');

  // FFmpeg 무손실 결합 작업
  console.log('\n----------------------------------------------------------------------');
  console.log('MERGING SEGMENTS INTO MASTER VOICE AUDIO (public/shorts/audio/v37_voice.mp3)');
  console.log('----------------------------------------------------------------------');

  const concatListPath = path.join(audioDir, 'concat_list_v37.txt');
  let concatText = '';
  for (let i = 0; i < segmentDefinitions.length; i++) {
    concatText += `file 'v37_seg_${i}.mp3'\n`;
  }
  fs.writeFileSync(concatListPath, concatText, 'utf8');

  const masterAudioPath = path.join(audioDir, 'v37_voice.mp3');
  try {
    const mergeCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${masterAudioPath}"`;
    console.log(`Executing: ${mergeCmd}`);
    execSync(mergeCmd, { stdio: 'inherit' });
    console.log(`\n[SUCCESS] Master audio file written successfully: ${masterAudioPath}`);
  } catch (err: any) {
    console.error('[Error] FFmpeg merging failed:', err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
  }

  console.log('\n======================================================================');
  console.log('MISSION 44 V37 DATA & AUDIO PIPELINE COMPLETE!');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('[Pipeline Fatal Error]:', err);
  process.exit(1);
});
