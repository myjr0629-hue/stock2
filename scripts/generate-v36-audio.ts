import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// .env.local 환경 변수 로드
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (Premium deep male voice)
const API_KEY = process.env.ELEVENLABS_API_KEY || 'b3451158cdb18eadbb505d7e0cc9a45996970a5fcde79f0c52c47a1422c1f9b8';

// MISSION 43 절대 스크립트 사양 정의
const segmentDefinitions = [
  {
    id: 'hook',
    voice: "$420 million in off-exchange flow just hit SPY.",
    caption: "$420M OFF-EXCHANGE FLOW JUST HIT SPY",
    visualIntent: "show large flow alert, SPY ticker and $420M badges",
    emphasis: ["$420M", "OFF-EXCHANGE", "FLOW", "SPY"]
  },
  {
    id: 'wall',
    voice: "It is clustering near the six hundred dollar wall.",
    caption: "CLUSTERING NEAR THE $600 WALL",
    visualIntent: "highlight SPY $600 resistance wall",
    emphasis: ["CLUSTERING", "$600 WALL"]
  },
  {
    id: 'contrast',
    voice: "Most charts show price. They do not show this layer.",
    caption: "MOST CHARTS SHOW PRICE. NOT THIS LAYER.",
    visualIntent: "normal candlestick chart vs hidden structural contrast scanner sweep",
    emphasis: ["MOST CHARTS", "NOT THIS LAYER"]
  },
  {
    id: 'unmask',
    voice: "SignumHQ maps the wall, the floor, and the flip.",
    caption: "SIGNUMHQ MAPS WALL / FLOOR / FLIP",
    visualIntent: "reveal Call Wall, Put Floor, Gamma Flip under terminal scanning",
    emphasis: ["SIGNUMHQ", "WALL", "FLOOR", "FLIP"]
  },
  {
    id: 'regime',
    voice: "This is not a price call. It is a pressure map.",
    caption: "NOT A PRICE CALL. A PRESSURE MAP.",
    visualIntent: "zoom and screen shake tension to show gap compression",
    emphasis: ["NOT A PRICE CALL", "PRESSURE MAP"]
  },
  {
    id: 'cta',
    voice: "See the hidden market structure at SignumHQ dot com.",
    caption: "SEE THE HIDDEN MARKET STRUCTURE — SIGNUMHQ.COM",
    visualIntent: "outro screen, lock in domain box",
    emphasis: ["HIDDEN MARKET STRUCTURE", "SIGNUMHQ.COM"]
  }
];

// ffmpeg 및 ffprobe 경로 감지
let ffprobePath = 'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe';
let ffmpegPath = 'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe';
if (!fs.existsSync(ffprobePath)) ffprobePath = 'ffprobe';
if (!fs.existsSync(ffmpegPath)) ffmpegPath = 'ffmpeg';

async function main() {
  console.log('======================================================================');
  console.log('STARTING V36 TTS GENERATION & TIMELINE SYNCHRONIZATION PIPELINE');
  console.log('======================================================================');

  const audioDir = path.join(__dirname, '..', 'public', 'shorts', 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const segmentDurations: number[] = [];

  for (let i = 0; i < segmentDefinitions.length; i++) {
    const seg = segmentDefinitions[i];
    const outPath = path.join(audioDir, `v36_seg_${i}.mp3`);

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
      // Fallback rough estimate based on character counts
      duration = seg.voice.length * 0.075 + 0.4;
      console.log(`[Fallback Estimate] Duration: ${duration.toFixed(3)}s`);
    }

    segmentDurations.push(duration);
  }

  // 누적 타임라인 계산 (Cumulative Sync)
  console.log('\n----------------------------------------------------------------------');
  console.log('CALCULATING CUMULATIVE NARRATIVE TIMELINE (SSOT)');
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
  console.log(`\n>>> Total Cumulative Duration: ${finalDurationSec.toFixed(3)}s`);

  // mockMarketPressureBriefV36.ts 코드 자동 작성
  const mockFilePath = path.join(__dirname, '..', 'src', 'shorts', 'data', 'mockMarketPressureBriefV36.ts');
  console.log(`\nWriting SSoT mock file to: ${mockFilePath}...`);

  const mockFileContent = `// ============================================================================
// MarketPressureBrief V36 — SSoT (Single Source of Truth) Timeline
// Generated programmatically via scripts/generate-v36-audio.ts
// ============================================================================
import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

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

export function createMockMarketPressureBriefV36Input(): ShortsVideoInput {
  return {
    videoId: \`mock-market-pressure-v36-spy-\${Date.now()}\`,
    template: 'MarketPressureBriefV36' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V36 SSoT Audio Caption Lock',
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
      color: seg.id === 'cta' ? '#22d3ee' : undefined
    })),
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600.00,
      putFloor: 580.00,
      gammaFlipLevel: 588.00,
      nearestWall: 'call',
      distancePercent: 1.3,
      darkPoolNotional: 420000000,
      darkPoolPercentile: 91,
      offExchangeVolumeRatio: 2.4,
      flowDirection: 'clustered near upper structure',
      regime: 'negative gamma pressure zone',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video', provider: 'replicate', isMock: false },
    voice: { 
      audioUrl: 'shorts/audio/v36_voice.mp3', 
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
  console.log('MERGING SEGMENTS INTO MASTER VOICE AUDIO (public/shorts/audio/v36_voice.mp3)');
  console.log('----------------------------------------------------------------------');

  const concatListPath = path.join(audioDir, 'concat_list.txt');
  let concatText = '';
  for (let i = 0; i < segmentDefinitions.length; i++) {
    // FFmpeg concat demuxer는 상대 경로를 선호함
    concatText += `file 'v36_seg_${i}.mp3'\n`;
  }
  fs.writeFileSync(concatListPath, concatText, 'utf8');

  const masterAudioPath = path.join(audioDir, 'v36_voice.mp3');
  try {
    // ffmpeg concat demuxer 가동
    const mergeCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${masterAudioPath}"`;
    console.log(`Executing: ${mergeCmd}`);
    execSync(mergeCmd, { stdio: 'inherit' });
    console.log(`\n[SUCCESS] Master audio file written successfully: ${masterAudioPath}`);
  } catch (err: any) {
    console.error('[Error] FFmpeg merging failed:', err.message);
    process.exit(1);
  } finally {
    // 임시 concat 리스트 파일 삭제
    if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
  }

  console.log('\n======================================================================');
  console.log('MISSION 43 V36 AUDIO ENGINE PIPELINE COMPLETE!');
  console.log('======================================================================');
}

main().catch(err => {
  console.error('[Pipeline Fatal Error]:', err);
  process.exit(1);
});
