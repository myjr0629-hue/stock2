// 자동 생성 — scripts/tts-beats.mjs EDUVWAP (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUVWAP: VoiceTrack = {
  base: 'shorts/audio/eduvwap',
  hook: { f: 'hook.mp3', sec: 2.12 },
  beats: [
    { f: '00.mp3', sec: 5.57, saySec: 3.62, ask: { f: '00a.mp3', sec: 1.77 } },
    { f: '01.mp3', sec: 5.5, saySec: 3.5, ask: { f: '01a.mp3', sec: 1.82 } },
    { f: '02.mp3', sec: 3.95 },
  ],
  outro: { f: 'outro.mp3', sec: 1.9 },
  loop: { f: 'loop.mp3', sec: 2.8 },
};
