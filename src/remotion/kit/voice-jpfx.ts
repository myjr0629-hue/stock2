// 자동 생성 — scripts/tts-beats.mjs JPFX (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPFX: VoiceTrack = {
  base: 'shorts/audio/jpfx',
  hook: { f: 'hook.mp3', sec: 2.12 },
  beats: [
    { f: '00.mp3', sec: 3.43, saySec: 1.7, ask: { f: '00a.mp3', sec: 1.55 } },
    { f: '01.mp3', sec: 4.55, saySec: 2.52, ask: { f: '01a.mp3', sec: 1.85 } },
    { f: '02.mp3', sec: 3.55, saySec: 1.95, ask: { f: '02a.mp3', sec: 1.42 } },
    { f: '03.mp3', sec: 3.98, saySec: 2.2, ask: { f: '03a.mp3', sec: 1.6 } },
    { f: '04.mp3', sec: 3.3, saySec: 1.77, ask: { f: '04a.mp3', sec: 1.35 } },
    { f: '05.mp3', sec: 4.57, saySec: 1.72, ask: { f: '05a.mp3', sec: 2.67 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.87 },
};
