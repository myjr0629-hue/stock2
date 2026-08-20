// 자동 생성 — scripts/tts-beats.mjs MEMCORR (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_MEMCORR: VoiceTrack = {
  base: 'shorts/audio/memcorr',
  hook: { f: 'hook.mp3', sec: 2 },
  beats: [
    { f: '00.mp3', sec: 2.7, saySec: 1.45, ask: { f: '00a.mp3', sec: 1.07 } },
    { f: '01.mp3', sec: 2.87, saySec: 1.42, ask: { f: '01a.mp3', sec: 1.27 } },
    { f: '02.mp3', sec: 3.28, saySec: 1.85, ask: { f: '02a.mp3', sec: 1.25 } },
    { f: '03.mp3', sec: 3.88, saySec: 2.4, ask: { f: '03a.mp3', sec: 1.3 } },
    { f: '04.mp3', sec: 3.43, saySec: 1.85, ask: { f: '04a.mp3', sec: 1.4 } },
    { f: '05.mp3', sec: 3.3, saySec: 2.07, ask: { f: '05a.mp3', sec: 1.05 } },
    { f: '06.mp3', sec: 4.25, saySec: 2.55, ask: { f: '06a.mp3', sec: 1.52 } },
    { f: '07.mp3', sec: 2.95, saySec: 1.65, ask: { f: '07a.mp3', sec: 1.12 } },
    { f: '08.mp3', sec: 3.07, saySec: 1.72, ask: { f: '08a.mp3', sec: 1.17 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.92 },
  loop: { f: 'loop.mp3', sec: 2.92 },
};
