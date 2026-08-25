// 자동 생성 — scripts/tts-beats.mjs JPMEM (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPMEM: VoiceTrack = {
  base: 'shorts/audio/jpmem',
  hook: { f: 'hook.mp3', sec: 1.72 },
  beats: [
    { f: '00.mp3', sec: 3.58, saySec: 1.6, ask: { f: '00a.mp3', sec: 1.8 } },
    { f: '01.mp3', sec: 4.47, saySec: 1.92, ask: { f: '01a.mp3', sec: 2.37 } },
    { f: '02.mp3', sec: 3.38, saySec: 1.7, ask: { f: '02a.mp3', sec: 1.5 } },
    { f: '03.mp3', sec: 2.8, saySec: 1.45, ask: { f: '03a.mp3', sec: 1.17 } },
    { f: '04.mp3', sec: 4.1, saySec: 2.17, ask: { f: '04a.mp3', sec: 1.75 } },
    { f: '05.mp3', sec: 4.05, saySec: 2.65, ask: { f: '05a.mp3', sec: 1.22 } },
    { f: '06.mp3', sec: 3.7, saySec: 2.12, ask: { f: '06a.mp3', sec: 1.4 } },
    { f: '07.mp3', sec: 3.68, saySec: 1.95, ask: { f: '07a.mp3', sec: 1.55 } },
  ],
  loop: { f: 'loop.mp3', sec: 3.5 },
};
