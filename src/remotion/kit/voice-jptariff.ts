// 자동 생성 — scripts/tts-beats.mjs JPTARIFF (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPTARIFF: VoiceTrack = {
  base: 'shorts/audio/jptariff',
  hook: { f: 'hook.mp3', sec: 2.1 },
  beats: [
    { f: '00.mp3', sec: 3.73, saySec: 1.9, ask: { f: '00a.mp3', sec: 1.65 } },
    { f: '01.mp3', sec: 4.2, saySec: 2.05, ask: { f: '01a.mp3', sec: 1.97 } },
    { f: '02.mp3', sec: 3.1, saySec: 1.42, ask: { f: '02a.mp3', sec: 1.5 } },
    { f: '03.mp3', sec: 3, saySec: 1.6, ask: { f: '03a.mp3', sec: 1.22 } },
    { f: '04.mp3', sec: 4.27, saySec: 1.72, ask: { f: '04a.mp3', sec: 2.37 } },
    { f: '05.mp3', sec: 3.53, saySec: 1.8, ask: { f: '05a.mp3', sec: 1.55 } },
    { f: '06.mp3', sec: 3.03, saySec: 1.85, ask: { f: '06a.mp3', sec: 1 } },
    { f: '07.mp3', sec: 3.42, saySec: 1.37, ask: { f: '07a.mp3', sec: 1.87 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.82 },
};
