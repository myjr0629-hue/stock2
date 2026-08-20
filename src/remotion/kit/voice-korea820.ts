// 자동 생성 — scripts/tts-beats.mjs KOREA820 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_KOREA820: VoiceTrack = {
  base: 'shorts/audio/korea820',
  hook: { f: 'hook.mp3', sec: 1.82 },
  beats: [
    { f: '00.mp3', sec: 3.32, saySec: 1.62, ask: { f: '00a.mp3', sec: 1.52 } },
    { f: '01.mp3', sec: 2.82, saySec: 1.47, ask: { f: '01a.mp3', sec: 1.17 } },
    { f: '02.mp3', sec: 3.93, saySec: 1.95, ask: { f: '02a.mp3', sec: 1.8 } },
    { f: '03.mp3', sec: 4.05, saySec: 2.12, ask: { f: '03a.mp3', sec: 1.75 } },
    { f: '04.mp3', sec: 3.43, saySec: 1.7, ask: { f: '04a.mp3', sec: 1.55 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.75 },
  loop: { f: 'loop.mp3', sec: 2.72 },
};
