// 자동 생성 — scripts/tts-beats.mjs TRIPLE818 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_TRIPLE818: VoiceTrack = {
  base: 'shorts/audio/triple818',
  hook: { f: 'hook.mp3', sec: 2.1 },
  beats: [
    { f: '00.mp3', sec: 2.88, saySec: 1.35, ask: { f: '00a.mp3', sec: 1.35 } },
    { f: '01.mp3', sec: 2.64, saySec: 1.27, ask: { f: '01a.mp3', sec: 1.19 } },
    { f: '02.mp3', sec: 3.45, saySec: 1.92, ask: { f: '02a.mp3', sec: 1.35 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.27 },
  loop: { f: 'loop.mp3', sec: 1.62 },
};
