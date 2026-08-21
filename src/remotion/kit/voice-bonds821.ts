// 자동 생성 — scripts/tts-beats.mjs BONDS821 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_BONDS821: VoiceTrack = {
  base: 'shorts/audio/bonds821',
  hook: { f: 'hook.mp3', sec: 1.15 },
  beats: [
    { f: '00.mp3', sec: 3.7, saySec: 1.8, ask: { f: '00a.mp3', sec: 1.72 } },
    { f: '01.mp3', sec: 4.23, saySec: 2, ask: { f: '01a.mp3', sec: 2.05 } },
    { f: '02.mp3', sec: 3.28, saySec: 1.65, ask: { f: '02a.mp3', sec: 1.45 } },
    { f: '03.mp3', sec: 3.4, saySec: 1.42, ask: { f: '03a.mp3', sec: 1.8 } },
    { f: '04.mp3', sec: 3.8, saySec: 1.8, ask: { f: '04a.mp3', sec: 1.82 } },
    { f: '05.mp3', sec: 4, saySec: 1.65, ask: { f: '05a.mp3', sec: 2.168163 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.15 },
  loop: { f: 'loop.mp3', sec: 1.9 },
};
