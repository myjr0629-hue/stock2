// 자동 생성 — scripts/tts-beats.mjs JPCONS (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPCONS: VoiceTrack = {
  base: 'shorts/audio/jpcons',
  hook: { f: 'hook.mp3', sec: 2.6 },
  beats: [
    { f: '00.mp3', sec: 3.33, saySec: 1.05, ask: { f: '00a.mp3', sec: 2.1 } },
    { f: '01.mp3', sec: 4.62, saySec: 2.02, ask: { f: '01a.mp3', sec: 2.42 } },
    { f: '02.mp3', sec: 3.98, saySec: 2, ask: { f: '02a.mp3', sec: 1.8 } },
    { f: '03.mp3', sec: 3.6, saySec: 1.9, ask: { f: '03a.mp3', sec: 1.52 } },
    { f: '04.mp3', sec: 6.2, saySec: 2.75, ask: { f: '04a.mp3', sec: 3.27 } },
  ],
  loop: { f: 'loop.mp3', sec: 3.15 },
};
