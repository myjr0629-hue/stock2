// 자동 생성 — scripts/tts-beats.mjs JPOPEX (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPOPEX: VoiceTrack = {
  base: 'shorts/audio/jpopex',
  hook: { f: 'hook.mp3', sec: 2.47 },
  beats: [
    { f: '00.mp3', sec: 2.24, saySec: 0.87, ask: { f: '00a.mp3', sec: 1.19 } },
    { f: '01.mp3', sec: 3.75, saySec: 1.75, ask: { f: '01a.mp3', sec: 1.82 } },
    { f: '02.mp3', sec: 4.42, saySec: 2.32, ask: { f: '02a.mp3', sec: 1.92 } },
    { f: '03.mp3', sec: 2.7, saySec: 1.3, ask: { f: '03a.mp3', sec: 1.22 } },
    { f: '04.mp3', sec: 3.58, saySec: 1.55, ask: { f: '04a.mp3', sec: 1.85 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.87 },
  loop: { f: 'loop.mp3', sec: 2.07 },
};
