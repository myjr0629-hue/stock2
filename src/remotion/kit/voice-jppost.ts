// 자동 생성 — scripts/tts-beats.mjs JPPOST (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPPOST: VoiceTrack = {
  base: 'shorts/audio/jppost',
  hook: { f: 'hook.mp3', sec: 2.42 },
  beats: [
    { f: '00.mp3', sec: 3.75, saySec: 2.1, ask: { f: '00a.mp3', sec: 1.47 } },
    { f: '01.mp3', sec: 4.33, saySec: 2.35, ask: { f: '01a.mp3', sec: 1.8 } },
    { f: '02.mp3', sec: 3.08, saySec: 1.3, ask: { f: '02a.mp3', sec: 1.6 } },
    { f: '03.mp3', sec: 5.5, saySec: 3.4, ask: { f: '03a.mp3', sec: 1.92 } },
    { f: '04.mp3', sec: 3.37, saySec: 1.57, ask: { f: '04a.mp3', sec: 1.62 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.62 },
};
