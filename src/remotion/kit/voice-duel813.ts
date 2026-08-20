// 자동 생성 — scripts/tts-beats.mjs DUEL813 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_DUEL813: VoiceTrack = {
  base: 'shorts/audio/duel813',
  hook: { f: 'hook.mp3', sec: 1.32 },
  beats: [
    { f: '00.mp3', sec: 5.35, saySec: 3.9, ask: { f: '00a.mp3', sec: 1.27 } },
    { f: '01.mp3', sec: 5.6, saySec: 3.77, ask: { f: '01a.mp3', sec: 1.65 } },
    { f: '02.mp3', sec: 6.25, saySec: 4.32, ask: { f: '02a.mp3', sec: 1.75 } },
    { f: '03.mp3', sec: 7.35, saySec: 5.4, ask: { f: '03a.mp3', sec: 1.77 } },
    { f: '04.mp3', sec: 5.7, saySec: 4.35, ask: { f: '04a.mp3', sec: 1.17 } },
    { f: '05.mp3', sec: 6.15, saySec: 4.42, ask: { f: '05a.mp3', sec: 1.55 } },
    { f: '06.mp3', sec: 5.7 },
  ],
  outro: { f: 'outro.mp3', sec: 2.3 },
  loop: { f: 'loop.mp3', sec: 2.5 },
};
