// 자동 생성 — scripts/tts-beats.mjs JPNVDA (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPNVDA: VoiceTrack = {
  base: 'shorts/audio/jpnvda',
  hook: { f: 'hook.mp3', sec: 2.25 },
  beats: [
    { f: '00.mp3', sec: 4.27, saySec: 2.57, ask: { f: '00a.mp3', sec: 1.52 } },
    { f: '01.mp3', sec: 5.08, saySec: 3.05, ask: { f: '01a.mp3', sec: 1.85 } },
    { f: '02.mp3', sec: 3.3, saySec: 1.6, ask: { f: '02a.mp3', sec: 1.52 } },
    { f: '03.mp3', sec: 4.45, saySec: 1.92, ask: { f: '03a.mp3', sec: 2.35 } },
    { f: '04.mp3', sec: 4.5, saySec: 1.97, ask: { f: '04a.mp3', sec: 2.35 } },
    { f: '05.mp3', sec: 4.82, saySec: 2.32, ask: { f: '05a.mp3', sec: 2.32 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.52 },
};
