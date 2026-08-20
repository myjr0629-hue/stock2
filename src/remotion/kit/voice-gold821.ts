// 자동 생성 — scripts/tts-beats.mjs GOLD821 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_GOLD821: VoiceTrack = {
  base: 'shorts/audio/gold821',
  hook: { f: 'hook.mp3', sec: 1.25 },
  beats: [
    { f: '00.mp3', sec: 4.15, saySec: 2.05, ask: { f: '00a.mp3', sec: 1.92 } },
    { f: '01.mp3', sec: 3.65, saySec: 1.87, ask: { f: '01a.mp3', sec: 1.6 } },
    { f: '02.mp3', sec: 3.15, saySec: 1.82, ask: { f: '02a.mp3', sec: 1.15 } },
    { f: '03.mp3', sec: 2.7, saySec: 1.37, ask: { f: '03a.mp3', sec: 1.15 } },
    { f: '04.mp3', sec: 3.53, saySec: 2.05, ask: { f: '04a.mp3', sec: 1.3 } },
    { f: '05.mp3', sec: 3.45, saySec: 1.52, ask: { f: '05a.mp3', sec: 1.75 } },
    { f: '06.mp3', sec: 3.45, saySec: 1.57, ask: { f: '06a.mp3', sec: 1.7 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.19 },
  loop: { f: 'loop.mp3', sec: 1.85 },
};
