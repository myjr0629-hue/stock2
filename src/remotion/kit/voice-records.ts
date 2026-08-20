// 자동 생성 — scripts/tts-beats.mjs RECORDS (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_RECORDS: VoiceTrack = {
  base: 'shorts/audio/records',
  hook: { f: 'hook.mp3', sec: 2.93 },
  beats: [
    { f: '00.mp3', sec: 4.57, saySec: 2.95, ask: { f: '00a.mp3', sec: 1.44 } },
    { f: '01.mp3', sec: 6.5, saySec: 4, ask: { f: '01a.mp3', sec: 2.32 } },
    { f: '02.mp3', sec: 5.64, saySec: 3.19, ask: { f: '02a.mp3', sec: 2.27 } },
    { f: '03.mp3', sec: 6.58, saySec: 4.49, ask: { f: '03a.mp3', sec: 1.91 } },
    { f: '04.mp3', sec: 5.59, saySec: 3.24, ask: { f: '04a.mp3', sec: 2.17 } },
    { f: '05.mp3', sec: 6.95, saySec: 4.78, ask: { f: '05a.mp3', sec: 1.99 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.77 },
  loop: { f: 'loop.mp3', sec: 2.12 },
};
