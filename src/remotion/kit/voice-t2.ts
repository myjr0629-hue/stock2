// 자동 생성 — scripts/tts-beats.mjs T2 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_T2: VoiceTrack = {
  base: 'shorts/audio/t2',
  hook: { f: 'hook.mp3', sec: 2.09 },
  beats: [
    { f: '00.mp3', sec: 4.44, saySec: 2.09, ask: { f: '00a.mp3', sec: 2.17 } },
    { f: '01.mp3', sec: 4.38, saySec: 2.87, ask: { f: '01a.mp3', sec: 1.33 } },
    { f: '02.mp3', sec: 5.46, saySec: 3.11, ask: { f: '02a.mp3', sec: 2.17 } },
    { f: '03.mp3', sec: 4.26, saySec: 2.46, ask: { f: '03a.mp3', sec: 1.62 } },
    { f: '04.mp3', sec: 4.02, saySec: 2.51, ask: { f: '04a.mp3', sec: 1.33 } },
    { f: '05.mp3', sec: 3.47, saySec: 1.85, ask: { f: '05a.mp3', sec: 1.44 } },
    { f: '06.mp3', sec: 3.49, saySec: 1.93, ask: { f: '06a.mp3', sec: 1.38 } },
    { f: '07.mp3', sec: 5.88, saySec: 3.58, ask: { f: '07a.mp3', sec: 2.12 } },
    { f: '08.mp3', sec: 4.34, saySec: 1.99, ask: { f: '08a.mp3', sec: 2.17 } },
    { f: '09.mp3', sec: 4.36, saySec: 2.51, ask: { f: '09a.mp3', sec: 1.67 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.4 },
  loop: { f: 'loop.mp3', sec: 2.51 },
};
