// 자동 생성 — scripts/tts-beats.mjs OPEX821 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_OPEX821: VoiceTrack = {
  base: 'shorts/audio/opex821',
  hook: { f: 'hook.mp3', sec: 1.52 },
  beats: [
    { f: '00.mp3', sec: 3.37, saySec: 1.57, ask: { f: '00a.mp3', sec: 1.62 } },
    { f: '01.mp3', sec: 2.92, saySec: 1.42, ask: { f: '01a.mp3', sec: 1.32 } },
    { f: '02.mp3', sec: 3.78, saySec: 2.05, ask: { f: '02a.mp3', sec: 1.55 } },
    { f: '03.mp3', sec: 2.95, saySec: 1.17, ask: { f: '03a.mp3', sec: 1.6 } },
    { f: '04.mp3', sec: 4.13, saySec: 1.85, ask: { f: '04a.mp3', sec: 2.1 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.65 },
  loop: { f: 'loop.mp3', sec: 1.82 },
};
