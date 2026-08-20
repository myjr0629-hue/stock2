// 자동 생성 — scripts/tts-beats.mjs MAXPAIN (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_MAXPAIN: VoiceTrack = {
  base: 'shorts/audio/maxpain',
  hook: { f: 'hook.mp3', sec: 2.32 },
  beats: [
    { f: '00.mp3', sec: 6.89, saySec: 5.33, ask: { f: '00a.mp3', sec: 1.38 } },
    { f: '01.mp3', sec: 7.55, saySec: 5.2, ask: { f: '01a.mp3', sec: 2.17 } },
    { f: '02.mp3', sec: 6.16, saySec: 4.31, ask: { f: '02a.mp3', sec: 1.67 } },
    { f: '03.mp3', sec: 6.89, saySec: 4.78, ask: { f: '03a.mp3', sec: 1.93 } },
    { f: '04.mp3', sec: 7.86, saySec: 5.46, ask: { f: '04a.mp3', sec: 2.22 } },
    { f: '05.mp3', sec: 5.33 },
  ],
  outro: { f: 'outro.mp3', sec: 2.22 },
  loop: { f: 'loop.mp3', sec: 3.11 },
};
