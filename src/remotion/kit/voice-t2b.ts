// 자동 생성 — scripts/tts-beats.mjs T2B (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_T2B: VoiceTrack = {
  base: 'shorts/audio/t2b',
  hook: { f: 'hook.mp3', sec: 1.52 },
  beats: [
    { f: '00.mp3', sec: 6.08, saySec: 4.62, ask: { f: '00a.mp3', sec: 1.28 } },
    { f: '01.mp3', sec: 4.36, saySec: 2.74, ask: { f: '01a.mp3', sec: 1.44 } },
    { f: '02.mp3', sec: 5.04, saySec: 2.82, ask: { f: '02a.mp3', sec: 2.04 } },
    { f: '03.mp3', sec: 5.93, saySec: 3.58, ask: { f: '03a.mp3', sec: 2.17 } },
    { f: '04.mp3', sec: 5.27, saySec: 3.24, ask: { f: '04a.mp3', sec: 1.85 } },
    { f: '05.mp3', sec: 5.46, saySec: 3.29, ask: { f: '05a.mp3', sec: 1.99 } },
    { f: '06.mp3', sec: 4.94, saySec: 3.06, ask: { f: '06a.mp3', sec: 1.7 } },
    { f: '07.mp3', sec: 5.17, saySec: 3.19, ask: { f: '07a.mp3', sec: 1.8 } },
    { f: '08.mp3', sec: 4.96, saySec: 2.69, ask: { f: '08a.mp3', sec: 2.09 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.35 },
  loop: { f: 'loop.mp3', sec: 2.59 },
};
