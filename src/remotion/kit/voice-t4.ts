// 자동 생성 — scripts/tts-beats.mjs T4 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_T4: VoiceTrack = {
  base: 'shorts/audio/t4',
  hook: { f: 'hook.mp3', sec: 1.62 },
  beats: [
    { f: '00.mp3', sec: 3.5, saySec: 2.12, ask: { f: '00a.mp3', sec: 1.2 } },
    { f: '01.mp3', sec: 4.88, saySec: 2.77, ask: { f: '01a.mp3', sec: 1.93 } },
    { f: '02.mp3', sec: 3.65, saySec: 2.22, ask: { f: '02a.mp3', sec: 1.25 } },
    { f: '03.mp3', sec: 3.88, saySec: 2.32, ask: { f: '03a.mp3', sec: 1.38 } },
    { f: '04.mp3', sec: 4.57, saySec: 2.82, ask: { f: '04a.mp3', sec: 1.57 } },
    { f: '05.mp3', sec: 4.65, saySec: 2.77, ask: { f: '05a.mp3', sec: 1.7 } },
    { f: '06.mp3', sec: 4.2, saySec: 2.69, ask: { f: '06a.mp3', sec: 1.33 } },
    { f: '07.mp3', sec: 5.87, saySec: 3.34, ask: { f: '07a.mp3', sec: 2.35 } },
    { f: '08.mp3', sec: 5.51, saySec: 3.24, ask: { f: '08a.mp3', sec: 2.09 } },
    { f: '09.mp3', sec: 4.49, saySec: 2.32, ask: { f: '09a.mp3', sec: 1.99 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.4 },
  loop: { f: 'loop.mp3', sec: 2.64 },
};
