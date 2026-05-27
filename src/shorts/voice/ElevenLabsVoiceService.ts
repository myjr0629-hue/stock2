// ============================================================================
// ElevenLabs Voice Service — Mock-mode ready
// If ELEVENLABS_API_KEY is missing, returns mock VoiceAsset.
// Never prints keys. Never throws fatal errors for prototype.
// ============================================================================

import type { VoiceAsset, WordTimestamp } from '../types';

interface ElevenLabsConfig {
  apiKey?: string;
  voiceId?: string;       // default voice to use
  modelId?: string;       // e.g. 'eleven_turbo_v2_5'
}

function getConfig(): ElevenLabsConfig {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || undefined,
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // "Adam" default
    modelId: 'eleven_turbo_v2_5',
  };
}

/** Check if live ElevenLabs is available */
export function isElevenLabsAvailable(): boolean {
  const cfg = getConfig();
  return !!cfg.apiKey && cfg.apiKey.length > 10;
}

/** Generate voice narration from script text */
export async function generateVoice(scriptText: string): Promise<VoiceAsset> {
  if (!isElevenLabsAvailable()) {
    console.log('[ElevenLabs] API key not configured — returning mock voice asset');
    return createMockVoiceAsset(scriptText);
  }

  // ── Live ElevenLabs API call ──
  // This will be implemented in MISSION 03 when live API calls are authorized
  console.log('[ElevenLabs] Live API available but not yet wired for rendering');
  return createMockVoiceAsset(scriptText);
}

/** Generate voice with word-level timestamps for caption sync */
export async function generateVoiceWithTimestamps(scriptText: string): Promise<VoiceAsset> {
  if (!isElevenLabsAvailable()) {
    console.log('[ElevenLabs] API key not configured — returning mock voice with handcrafted timestamps');
    return createMockVoiceAsset(scriptText);
  }

  // ── Live API: Use /v1/text-to-speech/{voice_id}/with-timestamps endpoint ──
  // Returns character-level timing data for caption sync
  // Will be implemented in MISSION 03
  console.log('[ElevenLabs] Live timestamps API not yet wired');
  return createMockVoiceAsset(scriptText);
}

/** Create a mock voice asset with estimated word timestamps */
function createMockVoiceAsset(scriptText: string): VoiceAsset {
  const words = scriptText.split(/\s+/).filter(w => w.length > 0);
  const avgWordDurationMs = 350; // ~170 WPM narration pace
  const timestamps: WordTimestamp[] = [];

  let cursor = 0;
  for (const word of words) {
    const duration = Math.max(200, word.length * 50 + 100); // longer words take longer
    timestamps.push({
      word,
      startMs: cursor,
      endMs: cursor + duration,
    });
    cursor += duration + 80; // 80ms gap between words
  }

  return {
    audioUrl: '', // no actual audio in mock mode
    durationSec: Math.ceil(cursor / 1000),
    provider: 'mock',
    isMock: true,
    timestamps,
  };
}
