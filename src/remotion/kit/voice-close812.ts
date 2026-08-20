// 자동 생성 — scripts/tts-beats.mjs CLOSE812 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CLOSE812: VoiceTrack = {
  base: 'shorts/audio/close812',
  hook: { f: 'hook.mp3', sec: 2.32 },
  beats: [
    { f: '00.mp3', sec: 5.92, saySec: 4.41, ask: { f: '00a.mp3', sec: 1.33 } },
    { f: '01.mp3', sec: 5.85, saySec: 3.76, ask: { f: '01a.mp3', sec: 1.91 } },
    { f: '02.mp3', sec: 5.28, saySec: 3.06, ask: { f: '02a.mp3', sec: 2.04 } },
    { f: '03.mp3', sec: 5.35, saySec: 3.89, ask: { f: '03a.mp3', sec: 1.28 } },
    { f: '04.mp3', sec: 6.29, saySec: 4.31, ask: { f: '04a.mp3', sec: 1.8 } },
    { f: '05.mp3', sec: 7.41, saySec: 4.49, ask: { f: '05a.mp3', sec: 2.74 } },
  ],
  outro: { f: 'outro.mp3', sec: 3.37 },
  loop: { f: 'loop.mp3', sec: 2.64 },
};
