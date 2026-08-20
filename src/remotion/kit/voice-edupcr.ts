// 자동 생성 — scripts/tts-beats.mjs EDUPCR (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUPCR: VoiceTrack = {
  base: 'shorts/audio/edupcr',
  hook: { f: 'hook.mp3', sec: 1.97 },
  beats: [
    { f: '00.mp3', sec: 5.57, saySec: 3.97, ask: { f: '00a.mp3', sec: 1.42 } },
    { f: '01.mp3', sec: 5.4, saySec: 3.37, ask: { f: '01a.mp3', sec: 1.85 } },
    { f: '02.mp3', sec: 4.22 },
  ],
  outro: { f: 'outro.mp3', sec: 1.85 },
  loop: { f: 'loop.mp3', sec: 1.92 },
};
