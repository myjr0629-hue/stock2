// 자동 생성 — scripts/tts-beats.mjs EDUDARK (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUDARK: VoiceTrack = {
  base: 'shorts/audio/edudark',
  hook: { f: 'hook.mp3', sec: 1.95 },
  beats: [
    { f: '00.mp3', sec: 5.6, saySec: 3.87, ask: { f: '00a.mp3', sec: 1.55 } },
    { f: '01.mp3', sec: 5.85, saySec: 3.85, ask: { f: '01a.mp3', sec: 1.82 } },
    { f: '02.mp3', sec: 3.6 },
  ],
  outro: { f: 'outro.mp3', sec: 2.17 },
  loop: { f: 'loop.mp3', sec: 1.8 },
};
