// 자동 생성 — scripts/tts-beats.mjs CPIOUT (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CPIOUT: VoiceTrack = {
  base: 'shorts/audio/cpiout',
  hook: { f: 'hook.mp3', sec: 1.99 },
  beats: [
    { f: '00.mp3', sec: 5.69, saySec: 3.66, ask: { f: '00a.mp3', sec: 1.85 } },
    { f: '01.mp3', sec: 5.27, saySec: 4.02, ask: { f: '01a.mp3', sec: 1.07 } },
    { f: '02.mp3', sec: 6.06, saySec: 4.55, ask: { f: '02a.mp3', sec: 1.33 } },
    { f: '03.mp3', sec: 5.27, saySec: 3.76, ask: { f: '03a.mp3', sec: 1.33 } },
    { f: '04.mp3', sec: 5.98, saySec: 3.89, ask: { f: '04a.mp3', sec: 1.91 } },
    { f: '05.mp3', sec: 6.48, saySec: 4.18, ask: { f: '05a.mp3', sec: 2.12 } },
  ],
  outro: { f: 'outro.mp3', sec: 3.37 },
  loop: { f: 'loop.mp3', sec: 2.32 },
};
