// 자동 생성 — scripts/tts-beats.mjs JP10D (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JP10D: VoiceTrack = {
  base: 'shorts/audio/jp10d',
  hook: { f: 'hook.mp3', sec: 1.8 },
  beats: [
    { f: '00.mp3', sec: 3.7, saySec: 2.2, ask: { f: '00a.mp3', sec: 1.32 } },
    { f: '01.mp3', sec: 4.22, saySec: 2.52, ask: { f: '01a.mp3', sec: 1.52 } },
    { f: '02.mp3', sec: 4.6, saySec: 2.22, ask: { f: '02a.mp3', sec: 2.2 } },
    { f: '03.mp3', sec: 3.7, saySec: 2.02, ask: { f: '03a.mp3', sec: 1.5 } },
    { f: '04.mp3', sec: 4.95, saySec: 2.52, ask: { f: '04a.mp3', sec: 2.25 } },
    { f: '05.mp3', sec: 4.6, saySec: 2.75, ask: { f: '05a.mp3', sec: 1.67 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.55 },
};
