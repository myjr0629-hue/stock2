// 자동 생성 — scripts/tts-beats.mjs CPI812 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CPI812: VoiceTrack = {
  base: 'shorts/audio/cpi812',
  hook: { f: 'hook.mp3', sec: 1.75 },
  beats: [
    { f: '00.mp3', sec: 6.01, saySec: 4.31, ask: { f: '00a.mp3', sec: 1.52 } },
    { f: '01.mp3', sec: 5.88, saySec: 3.19, ask: { f: '01a.mp3', sec: 2.51 } },
    { f: '02.mp3', sec: 5.22, saySec: 3, ask: { f: '02a.mp3', sec: 2.04 } },
    { f: '03.mp3', sec: 5.23, saySec: 2.93, ask: { f: '03a.mp3', sec: 2.12 } },
    { f: '04.mp3', sec: 5.54, saySec: 3.37, ask: { f: '04a.mp3', sec: 1.99 } },
    { f: '05.mp3', sec: 6.71, saySec: 4.41, ask: { f: '05a.mp3', sec: 2.12 } },
  ],
  outro: { f: 'outro.mp3', sec: 3.47 },
  loop: { f: 'loop.mp3', sec: 2.35 },
};
