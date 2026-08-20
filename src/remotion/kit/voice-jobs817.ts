// 자동 생성 — scripts/tts-beats.mjs JOBS817 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JOBS817: VoiceTrack = {
  base: 'shorts/audio/jobs817',
  hook: { f: 'hook.mp3', sec: 3.07 },
  beats: [
    { f: '00.mp3', sec: 4.02, saySec: 2.17, ask: { f: '00a.mp3', sec: 1.67 } },
    { f: '01.mp3', sec: 4.2, saySec: 2.55, ask: { f: '01a.mp3', sec: 1.47 } },
    { f: '02.mp3', sec: 3.5, saySec: 2.1, ask: { f: '02a.mp3', sec: 1.22 } },
    { f: '03.mp3', sec: 4, saySec: 1.87, ask: { f: '03a.mp3', sec: 1.95 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.6 },
  loop: { f: 'loop.mp3', sec: 2.25 },
};
