// 자동 생성 — scripts/tts-beats.mjs TARIFF (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_TARIFF: VoiceTrack = {
  base: 'shorts/audio/tariff',
  hook: { f: 'hook.mp3', sec: 1.52 },
  beats: [
    { f: '00.mp3', sec: 3.6, saySec: 2.05, ask: { f: '00a.mp3', sec: 1.37 } },
    { f: '01.mp3', sec: 4, saySec: 1.92, ask: { f: '01a.mp3', sec: 1.9 } },
    { f: '02.mp3', sec: 4.05, saySec: 1.85, ask: { f: '02a.mp3', sec: 2.02 } },
    { f: '03.mp3', sec: 3.63, saySec: 1.65, ask: { f: '03a.mp3', sec: 1.8 } },
    { f: '04.mp3', sec: 3, saySec: 1.32, ask: { f: '04a.mp3', sec: 1.5 } },
    { f: '05.mp3', sec: 2.57, saySec: 1.37, ask: { f: '05a.mp3', sec: 1.02 } },
    { f: '06.mp3', sec: 3.17, saySec: 1.32, ask: { f: '06a.mp3', sec: 1.67 } },
    { f: '07.mp3', sec: 3.92, saySec: 1.72, ask: { f: '07a.mp3', sec: 2.02 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.87 },
};
