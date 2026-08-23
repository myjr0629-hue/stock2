// 자동 생성 — scripts/tts-beats.mjs JPRATE (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPRATE: VoiceTrack = {
  base: 'shorts/audio/jprate',
  hook: { f: 'hook.mp3', sec: 1.22 },
  beats: [
    { f: '00.mp3', sec: 3.22, saySec: 1.82, ask: { f: '00a.mp3', sec: 1.22 } },
    { f: '01.mp3', sec: 4.23, saySec: 2.35, ask: { f: '01a.mp3', sec: 1.7 } },
    { f: '02.mp3', sec: 3.57, saySec: 1.92, ask: { f: '02a.mp3', sec: 1.47 } },
    { f: '03.mp3', sec: 3.77, saySec: 2.22, ask: { f: '03a.mp3', sec: 1.37 } },
    { f: '04.mp3', sec: 4.12, saySec: 2.27, ask: { f: '04a.mp3', sec: 1.67 } },
    { f: '05.mp3', sec: 4.43, saySec: 1.65, ask: { f: '05a.mp3', sec: 2.6 } },
  ],
  loop: { f: 'loop.mp3', sec: 3.35 },
};
