// 자동 생성 — scripts/tts-beats.mjs USRATE (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_USRATE: VoiceTrack = {
  base: 'shorts/audio/usrate',
  hook: { f: 'hook.mp3', sec: 1.67 },
  beats: [
    { f: '00.mp3', sec: 3.1, saySec: 1.5, ask: { f: '00a.mp3', sec: 1.42 } },
    { f: '01.mp3', sec: 3.75, saySec: 1.62, ask: { f: '01a.mp3', sec: 1.95 } },
    { f: '02.mp3', sec: 3.45, saySec: 1.55, ask: { f: '02a.mp3', sec: 1.72 } },
    { f: '03.mp3', sec: 3.3, saySec: 1.6, ask: { f: '03a.mp3', sec: 1.52 } },
    { f: '04.mp3', sec: 3.93, saySec: 1.85, ask: { f: '04a.mp3', sec: 1.9 } },
    { f: '05.mp3', sec: 3.2, saySec: 1.7, ask: { f: '05a.mp3', sec: 1.32 } },
    { f: '06.mp3', sec: 3.65, saySec: 2.02, ask: { f: '06a.mp3', sec: 1.45 } },
    { f: '07.mp3', sec: 3.63, saySec: 2, ask: { f: '07a.mp3', sec: 1.45 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.1 },
};
