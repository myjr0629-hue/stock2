// 자동 생성 — scripts/tts-beats.mjs EDUSQZ (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUSQZ: VoiceTrack = {
  base: 'shorts/audio/edusqz',
  hook: { f: 'hook.mp3', sec: 2.32 },
  beats: [
    { f: '00.mp3', sec: 5.58, saySec: 4.1, ask: { f: '00a.mp3', sec: 1.3 } },
    { f: '01.mp3', sec: 5.52, saySec: 3.37, ask: { f: '01a.mp3', sec: 1.97 } },
    { f: '02.mp3', sec: 2.92 },
  ],
  outro: { f: 'outro.mp3', sec: 1.9 },
  loop: { f: 'loop.mp3', sec: 2 },
};
