// 자동 생성 — scripts/tts-beats.mjs OILSYM (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_OILSYM: VoiceTrack = {
  base: 'shorts/audio/oilsym',
  hook: { f: 'hook.mp3', sec: 2.93 },
  beats: [
    { f: '00.mp3', sec: 5.46, saySec: 3.06, ask: { f: '00a.mp3', sec: 2.22 } },
    { f: '01.mp3', sec: 5.38, saySec: 3.16, ask: { f: '01a.mp3', sec: 2.04 } },
    { f: '02.mp3', sec: 6.48, saySec: 4.13, ask: { f: '02a.mp3', sec: 2.17 } },
    { f: '03.mp3', sec: 4.49, saySec: 2.93, ask: { f: '03a.mp3', sec: 1.38 } },
    { f: '04.mp3', sec: 5.27, saySec: 3.16, ask: { f: '04a.mp3', sec: 1.93 } },
    { f: '05.mp3', sec: 5.93, saySec: 3.58, ask: { f: '05a.mp3', sec: 2.17 } },
  ],
  outro: { f: 'outro.mp3', sec: 3.06 },
  loop: { f: 'loop.mp3', sec: 2.27 },
};
