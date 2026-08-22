// 자동 생성 — scripts/tts-beats.mjs JPEARN (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPEARN: VoiceTrack = {
  base: 'shorts/audio/jpearn',
  hook: { f: 'hook.mp3', sec: 3.3 },
  beats: [
    { f: '00.mp3', sec: 3.8, saySec: 2.45, ask: { f: '00a.mp3', sec: 1.17 } },
    { f: '01.mp3', sec: 4.1, saySec: 2.2, ask: { f: '01a.mp3', sec: 1.72 } },
    { f: '02.mp3', sec: 4.83, saySec: 2.2, ask: { f: '02a.mp3', sec: 2.45 } },
    { f: '03.mp3', sec: 3.88, saySec: 1.3, ask: { f: '03a.mp3', sec: 2.4 } },
    { f: '04.mp3', sec: 5.95, saySec: 3.07, ask: { f: '04a.mp3', sec: 2.7 } },
  ],
  loop: { f: 'loop.mp3', sec: 3.2 },
};
