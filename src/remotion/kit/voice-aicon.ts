// 자동 생성 — scripts/tts-beats.mjs AICON (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_AICON: VoiceTrack = {
  base: 'shorts/audio/aicon',
  hook: { f: 'hook.mp3', sec: 1.75 },
  beats: [
    { f: '00.mp3', sec: 3.4, saySec: 1.72, ask: { f: '00a.mp3', sec: 1.5 } },
    { f: '01.mp3', sec: 3.53, saySec: 1.9, ask: { f: '01a.mp3', sec: 1.45 } },
    { f: '02.mp3', sec: 2.93, saySec: 1.3, ask: { f: '02a.mp3', sec: 1.45 } },
    { f: '03.mp3', sec: 4.35, saySec: 2.17, ask: { f: '03a.mp3', sec: 2 } },
    { f: '04.mp3', sec: 3.73, saySec: 1.65, ask: { f: '04a.mp3', sec: 1.9 } },
    { f: '05.mp3', sec: 3.25, saySec: 1.42, ask: { f: '05a.mp3', sec: 1.65 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.77 },
  loop: { f: 'loop.mp3', sec: 2.12 },
};
