// 자동 생성 — scripts/tts-beats.mjs CLOSE814 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CLOSE814: VoiceTrack = {
  base: 'shorts/audio/close814',
  hook: { f: 'hook.mp3', sec: 2.52 },
  beats: [
    { f: '00.mp3', sec: 1.72 },
    { f: '01.mp3', sec: 6.02, saySec: 3.92, ask: { f: '01a.mp3', sec: 1.92 } },
    { f: '02.mp3', sec: 6.88, saySec: 4.65, ask: { f: '02a.mp3', sec: 2.05 } },
    { f: '03.mp3', sec: 7.95, saySec: 5.6, ask: { f: '03a.mp3', sec: 2.17 } },
    { f: '04.mp3', sec: 5.17, saySec: 3.12, ask: { f: '04a.mp3', sec: 1.87 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.75 },
  loop: { f: 'loop.mp3', sec: 2.67 },
};
