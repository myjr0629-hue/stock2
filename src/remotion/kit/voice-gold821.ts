// 자동 생성 — scripts/tts-beats.mjs GOLD821 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_GOLD821: VoiceTrack = {
  base: 'shorts/audio/gold821',
  hook: { f: 'hook.mp3', sec: 1.25 },
  beats: [
    { f: '00.mp3', sec: 4.15, saySec: 2.05, ask: { f: '00a.mp3', sec: 1.92 } },
    { f: '01.mp3', sec: 3.67, saySec: 1.87, ask: { f: '01a.mp3', sec: 1.62 } },
    { f: '02.mp3', sec: 2.65, saySec: 1.25, ask: { f: '02a.mp3', sec: 1.22 } },
    { f: '03.mp3', sec: 3.27, saySec: 1.77, ask: { f: '03a.mp3', sec: 1.32 } },
    { f: '04.mp3', sec: 3.35, saySec: 1.65, ask: { f: '04a.mp3', sec: 1.52 } },
    { f: '05.mp3', sec: 3.05, saySec: 1.27, ask: { f: '05a.mp3', sec: 1.6 } },
    { f: '06.mp3', sec: 3.47, saySec: 1.57, ask: { f: '06a.mp3', sec: 1.72 } },
    { f: '07.mp3', sec: 3.07, saySec: 1.32, ask: { f: '07a.mp3', sec: 1.57 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.19 },
  loop: { f: 'loop.mp3', sec: 1.85 },
};
