// 자동 생성 — scripts/tts-beats.mjs MU812 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_MU812: VoiceTrack = {
  base: 'shorts/audio/mu812',
  hook: { f: 'hook.mp3', sec: 3.19 },
  beats: [
    { f: '00.mp3', sec: 6.11, saySec: 4.68, ask: { f: '00a.mp3', sec: 1.25 } },
    { f: '01.mp3', sec: 5.53, saySec: 3.6, ask: { f: '01a.mp3', sec: 1.75 } },
    { f: '02.mp3', sec: 6.4, saySec: 4.13, ask: { f: '02a.mp3', sec: 2.09 } },
    { f: '03.mp3', sec: 6.71, saySec: 4.49, ask: { f: '03a.mp3', sec: 2.04 } },
    { f: '04.mp3', sec: 6.38, saySec: 4.08, ask: { f: '04a.mp3', sec: 2.12 } },
    { f: '05.mp3', sec: 6.21, saySec: 4.41, ask: { f: '05a.mp3', sec: 1.62 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.95 },
  loop: { f: 'loop.mp3', sec: 2.46 },
};
