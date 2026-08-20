// 자동 생성 — scripts/tts-beats.mjs GOOGL812 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_GOOGL812: VoiceTrack = {
  base: 'shorts/audio/googl812',
  hook: { f: 'hook.mp3', sec: 1.91 },
  beats: [
    { f: '00.mp3', sec: 5.19, saySec: 3.16, ask: { f: '00a.mp3', sec: 1.85 } },
    { f: '01.mp3', sec: 4.33, saySec: 2.77, ask: { f: '01a.mp3', sec: 1.38 } },
    { f: '02.mp3', sec: 5.64, saySec: 3.47, ask: { f: '02a.mp3', sec: 1.99 } },
    { f: '03.mp3', sec: 6.34, saySec: 3.76, ask: { f: '03a.mp3', sec: 2.4 } },
    { f: '04.mp3', sec: 5.93, saySec: 3.84, ask: { f: '04a.mp3', sec: 1.91 } },
    { f: '05.mp3', sec: 6.43, saySec: 4.26, ask: { f: '05a.mp3', sec: 1.99 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.95 },
  loop: { f: 'loop.mp3', sec: 2.64 },
};
