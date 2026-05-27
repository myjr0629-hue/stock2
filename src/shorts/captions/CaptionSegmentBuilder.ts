// ============================================================================
// CaptionSegmentBuilder — Convert script beats to Remotion caption segments
// Uses ElevenLabs timestamps when available, handcrafted timing otherwise.
// ============================================================================

import type { CaptionSegment, ScriptBeat, VoiceAsset } from '../types';

const MAX_CAPTION_LENGTH = 45;  // chars per segment
const FPS = 30;

/** Build caption segments from script beats (no voice timestamps) */
export function buildCaptionsFromBeats(beats: ScriptBeat[], fps = FPS): CaptionSegment[] {
  const captions: CaptionSegment[] = [];
  let id = 0;

  for (const beat of beats) {
    const words = beat.text.split(/\s+/);
    const beatDuration = beat.endSec - beat.startSec;
    const wordsPerSecond = words.length / beatDuration;

    // Split into phrase-sized chunks
    let chunk = '';
    let chunkStart = beat.startSec;

    for (let i = 0; i < words.length; i++) {
      const candidate = chunk ? `${chunk} ${words[i]}` : words[i];

      if (candidate.length > MAX_CAPTION_LENGTH && chunk.length > 0) {
        // Emit current chunk
        const chunkDuration = (chunk.split(/\s+/).length / wordsPerSecond);
        captions.push({
          id: `cap-${id++}`,
          text: chunk,
          startFrame: Math.round(chunkStart * fps),
          endFrame: Math.round((chunkStart + chunkDuration) * fps),
          emphasis: beat.emphasis?.some(e => chunk.toLowerCase().includes(e.toLowerCase())),
        });
        chunkStart += chunkDuration;
        chunk = words[i];
      } else {
        chunk = candidate;
      }
    }

    // Emit remaining chunk
    if (chunk) {
      captions.push({
        id: `cap-${id++}`,
        text: chunk,
        startFrame: Math.round(chunkStart * fps),
        endFrame: Math.round(beat.endSec * fps),
        emphasis: beat.emphasis?.some(e => chunk.toLowerCase().includes(e.toLowerCase())),
      });
    }
  }

  return captions;
}

/** Build caption segments from ElevenLabs word-level timestamps */
export function buildCaptionsFromTimestamps(voice: VoiceAsset, fps = FPS): CaptionSegment[] {
  if (!voice.timestamps || voice.timestamps.length === 0) {
    return [];
  }

  const captions: CaptionSegment[] = [];
  let id = 0;
  let chunk = '';
  let chunkStartMs = voice.timestamps[0].startMs;

  for (let i = 0; i < voice.timestamps.length; i++) {
    const ts = voice.timestamps[i];
    const candidate = chunk ? `${chunk} ${ts.word}` : ts.word;

    if (candidate.length > MAX_CAPTION_LENGTH && chunk.length > 0) {
      captions.push({
        id: `cap-${id++}`,
        text: chunk,
        startFrame: Math.round((chunkStartMs / 1000) * fps),
        endFrame: Math.round((ts.startMs / 1000) * fps),
      });
      chunk = ts.word;
      chunkStartMs = ts.startMs;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) {
    const lastTs = voice.timestamps[voice.timestamps.length - 1];
    captions.push({
      id: `cap-${id++}`,
      text: chunk,
      startFrame: Math.round((chunkStartMs / 1000) * fps),
      endFrame: Math.round((lastTs.endMs / 1000) * fps),
    });
  }

  return captions;
}
