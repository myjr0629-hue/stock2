// 자동 생성 — scripts/tts-beats.mjs COPPER (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_COPPER: VoiceTrack = {
  base: 'shorts/audio/copper',
  hook: { f: 'hook.mp3', sec: 2.09 },
  beats: [
    { f: '00.mp3', sec: 5.53, saySec: 3.42, ask: { f: '00a.mp3', sec: 1.93 } },
    { f: '01.mp3', sec: 4.31, saySec: 2.51, ask: { f: '01a.mp3', sec: 1.62 } },
    { f: '02.mp3', sec: 4.83, saySec: 3.16, ask: { f: '02a.mp3', sec: 1.49 } },
    { f: '03.mp3', sec: 7.05, saySec: 4.55, ask: { f: '03a.mp3', sec: 2.32 } },
    { f: '04.mp3', sec: 6.29, saySec: 3.79, ask: { f: '04a.mp3', sec: 2.32 } },
    { f: '05.mp3', sec: 4.49, saySec: 2.74, ask: { f: '05a.mp3', sec: 1.57 } },
    { f: '06.mp3', sec: 6.97, saySec: 4.26, ask: { f: '06a.mp3', sec: 2.53 } },
  ],
  outro: { f: 'outro.mp3', sec: 3.24 },
  loop: { f: 'loop.mp3', sec: 2.95 },
};
