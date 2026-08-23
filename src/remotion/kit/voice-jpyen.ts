// 자동 생성 — scripts/tts-beats.mjs JPYEN (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPYEN: VoiceTrack = {
  base: 'shorts/audio/jpyen',
  hook: { f: 'hook.mp3', sec: 2.25 },
  beats: [
    { f: '00.mp3', sec: 4.57, saySec: 3.02, ask: { f: '00a.mp3', sec: 1.37 } },
    { f: '01.mp3', sec: 4.63, saySec: 2.35, ask: { f: '01a.mp3', sec: 2.1 } },
    { f: '02.mp3', sec: 4.95, saySec: 3.22, ask: { f: '02a.mp3', sec: 1.55 } },
    { f: '03.mp3', sec: 4.33, saySec: 2.35, ask: { f: '03a.mp3', sec: 1.8 } },
    { f: '04.mp3', sec: 4.9, saySec: 2.4, ask: { f: '04a.mp3', sec: 2.32 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.75 },
};
