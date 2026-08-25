// 자동 생성 — scripts/tts-beats.mjs MEMSPLIT (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_MEMSPLIT: VoiceTrack = {
  base: 'shorts/audio/memsplit',
  hook: { f: 'hook.mp3', sec: 2.15 },
  beats: [
    { f: '00.mp3', sec: 2.9, saySec: 1.55, ask: { f: '00a.mp3', sec: 1.17 } },
    { f: '01.mp3', sec: 3.15, saySec: 1.3, ask: { f: '01a.mp3', sec: 1.67 } },
    { f: '02.mp3', sec: 3.03, saySec: 1.55, ask: { f: '02a.mp3', sec: 1.3 } },
    { f: '03.mp3', sec: 3.05, saySec: 1.7, ask: { f: '03a.mp3', sec: 1.17 } },
    { f: '04.mp3', sec: 3.38, saySec: 1.55, ask: { f: '04a.mp3', sec: 1.65 } },
    { f: '05.mp3', sec: 3, saySec: 1.57, ask: { f: '05a.mp3', sec: 1.25 } },
    { f: '06.mp3', sec: 3.45, saySec: 1.82, ask: { f: '06a.mp3', sec: 1.45 } },
    { f: '07.mp3', sec: 3.68, saySec: 1.85, ask: { f: '07a.mp3', sec: 1.65 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.32 },
};
