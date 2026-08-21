// 자동 생성 — scripts/tts-beats.mjs BONDS821 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_BONDS821: VoiceTrack = {
  base: 'shorts/audio/bonds821',
  hook: { f: 'hook.mp3', sec: 1.7 },
  beats: [
    { f: '00.mp3', sec: 3.75, saySec: 2.07, ask: { f: '00a.mp3', sec: 1.5 } },
    { f: '01.mp3', sec: 3.4, saySec: 1.45, ask: { f: '01a.mp3', sec: 1.77 } },
    { f: '02.mp3', sec: 2.87, saySec: 1.42, ask: { f: '02a.mp3', sec: 1.27 } },
    { f: '03.mp3', sec: 3.9, saySec: 2.15, ask: { f: '03a.mp3', sec: 1.57 } },
    { f: '04.mp3', sec: 3.05, saySec: 1.4, ask: { f: '04a.mp3', sec: 1.47 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.52 },
  loop: { f: 'loop.mp3', sec: 2.1 },
};
