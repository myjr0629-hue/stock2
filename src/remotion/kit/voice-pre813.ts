// 자동 생성 — scripts/tts-beats.mjs PRE813 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_PRE813: VoiceTrack = {
  base: 'shorts/audio/pre813',
  hook: { f: 'hook.mp3', sec: 1.65 },
  beats: [
    { f: '00.mp3', sec: 4.73, saySec: 2.85, ask: { f: '00a.mp3', sec: 1.7 } },
    { f: '01.mp3', sec: 6.23, saySec: 4.25, ask: { f: '01a.mp3', sec: 1.8 } },
    { f: '02.mp3', sec: 5.62, saySec: 4.12, ask: { f: '02a.mp3', sec: 1.32 } },
    { f: '03.mp3', sec: 5.57, saySec: 4.02, ask: { f: '03a.mp3', sec: 1.37 } },
    { f: '04.mp3', sec: 4.52 },
  ],
  outro: { f: 'outro.mp3', sec: 1.97 },
  loop: { f: 'loop.mp3', sec: 2.5 },
};
