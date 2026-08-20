// 자동 생성 — scripts/tts-beats.mjs AMD819 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_AMD819: VoiceTrack = {
  base: 'shorts/audio/amd819',
  hook: { f: 'hook.mp3', sec: 2 },
  beats: [
    { f: '00.mp3', sec: 2.68, saySec: 1.35, ask: { f: '00a.mp3', sec: 1.15 } },
    { f: '01.mp3', sec: 2.9, saySec: 1.47, ask: { f: '01a.mp3', sec: 1.25 } },
    { f: '02.mp3', sec: 2.57, saySec: 1.32, ask: { f: '02a.mp3', sec: 1.07 } },
    { f: '03.mp3', sec: 3.2, saySec: 1.57, ask: { f: '03a.mp3', sec: 1.45 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.45 },
  loop: { f: 'loop.mp3', sec: 1.85 },
};
