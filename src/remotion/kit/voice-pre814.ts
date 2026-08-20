// 자동 생성 — scripts/tts-beats.mjs PRE814 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_PRE814: VoiceTrack = {
  base: 'shorts/audio/pre814',
  hook: { f: 'hook.mp3', sec: 2.52 },
  beats: [
    { f: '00.mp3', sec: 5.28, saySec: 3.05, ask: { f: '00a.mp3', sec: 2.05 } },
    { f: '01.mp3', sec: 6.08, saySec: 4.1, ask: { f: '01a.mp3', sec: 1.8 } },
    { f: '02.mp3', sec: 4.15 },
  ],
  outro: { f: 'outro.mp3', sec: 1.22 },
  loop: { f: 'loop.mp3', sec: 2.57 },
};
