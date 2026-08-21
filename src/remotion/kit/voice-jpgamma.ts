// 자동 생성 — scripts/tts-beats.mjs JPGAMMA (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_JPGAMMA: VoiceTrack = {
  base: 'shorts/audio/jpgamma',
  hook: { f: 'hook.mp3', sec: 2.17 },
  beats: [
    { f: '00.mp3', sec: 3.22, saySec: 0.92, ask: { f: '00a.mp3', sec: 2.12 } },
    { f: '01.mp3', sec: 3.9, saySec: 2.15, ask: { f: '01a.mp3', sec: 1.57 } },
    { f: '02.mp3', sec: 3.3, saySec: 1.32, ask: { f: '02a.mp3', sec: 1.8 } },
    { f: '03.mp3', sec: 3.95, saySec: 2.32, ask: { f: '03a.mp3', sec: 1.45 } },
    { f: '04.mp3', sec: 4.65, saySec: 1.52, ask: { f: '04a.mp3', sec: 2.95 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.62 },
  loop: { f: 'loop.mp3', sec: 1.85 },
};
