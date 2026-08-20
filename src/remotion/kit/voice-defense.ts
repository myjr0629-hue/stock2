// 자동 생성 — scripts/tts-beats.mjs DEFENSE (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_DEFENSE: VoiceTrack = {
  base: 'shorts/audio/defense',
  hook: { f: 'hook.mp3', sec: 2.09 },
  beats: [
    { f: '00.mp3', sec: 5.59, saySec: 3.24, ask: { f: '00a.mp3', sec: 2.17 } },
    { f: '01.mp3', sec: 6.74, saySec: 3.79, ask: { f: '01a.mp3', sec: 2.77 } },
    { f: '02.mp3', sec: 6.68, saySec: 4.41, ask: { f: '02a.mp3', sec: 2.09 } },
    { f: '03.mp3', sec: 6.11, saySec: 3.94, ask: { f: '03a.mp3', sec: 1.99 } },
    { f: '04.mp3', sec: 5.41, saySec: 3.24, ask: { f: '04a.mp3', sec: 1.99 } },
    { f: '05.mp3', sec: 5.88, saySec: 3.58, ask: { f: '05a.mp3', sec: 2.12 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.51 },
  loop: { f: 'loop.mp3', sec: 1.67 },
};
