// 자동 생성 — scripts/tts-beats.mjs JPTARIFF (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPTARIFF: VoiceTrack = {
  base: 'shorts/audio/jptariff',
  hook: { f: 'hook.mp3', sec: 2.02 },
  beats: [
    { f: '00.mp3', sec: 3.73, saySec: 1.75, ask: { f: '00a.mp3', sec: 1.8 } },
    { f: '01.mp3', sec: 4.45, saySec: 2.32, ask: { f: '01a.mp3', sec: 1.95 } },
    { f: '02.mp3', sec: 3.23, saySec: 1.65, ask: { f: '02a.mp3', sec: 1.4 } },
    { f: '03.mp3', sec: 3.02, saySec: 1.67, ask: { f: '03a.mp3', sec: 1.17 } },
    { f: '04.mp3', sec: 7.15, saySec: 3.75, ask: { f: '04a.mp3', sec: 3.22 } },
    { f: '05.mp3', sec: 3.58, saySec: 2, ask: { f: '05a.mp3', sec: 1.4 } },
    { f: '06.mp3', sec: 3.27, saySec: 1.92, ask: { f: '06a.mp3', sec: 1.17 } },
    { f: '07.mp3', sec: 3.07, saySec: 1.47, ask: { f: '07a.mp3', sec: 1.42 } },
  ],
  loop: { f: 'loop.mp3', sec: 3.5 },
};
