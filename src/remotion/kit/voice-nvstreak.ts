// 자동 생성 — scripts/tts-beats.mjs NVSTREAK (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_NVSTREAK: VoiceTrack = {
  base: 'shorts/audio/nvstreak',
  hook: { f: 'hook.mp3', sec: 1.95 },
  beats: [
    { f: '00.mp3', sec: 3.05, saySec: 1.5, ask: { f: '00a.mp3', sec: 1.37 } },
    { f: '01.mp3', sec: 3.13, saySec: 1.45, ask: { f: '01a.mp3', sec: 1.5 } },
    { f: '02.mp3', sec: 3.62, saySec: 1.52, ask: { f: '02a.mp3', sec: 1.92 } },
    { f: '03.mp3', sec: 3.3, saySec: 1.4, ask: { f: '03a.mp3', sec: 1.72 } },
    { f: '04.mp3', sec: 2.72, saySec: 1.35, ask: { f: '04a.mp3', sec: 1.19 } },
    { f: '05.mp3', sec: 2.98, saySec: 1.4, ask: { f: '05a.mp3', sec: 1.4 } },
    { f: '06.mp3', sec: 3.38, saySec: 1.55, ask: { f: '06a.mp3', sec: 1.65 } },
    { f: '07.mp3', sec: 3.38, saySec: 1.55, ask: { f: '07a.mp3', sec: 1.65 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.8 },
};
