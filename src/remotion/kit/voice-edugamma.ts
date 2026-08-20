// 자동 생성 — scripts/tts-beats.mjs EDUGAMMA (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUGAMMA: VoiceTrack = {
  base: 'shorts/audio/edugamma',
  hook: { f: 'hook.mp3', sec: 2.27 },
  beats: [
    { f: '00.mp3', sec: 5.47, saySec: 3.72, ask: { f: '00a.mp3', sec: 1.57 } },
    { f: '01.mp3', sec: 7.2, saySec: 5.3, ask: { f: '01a.mp3', sec: 1.72 } },
    { f: '02.mp3', sec: 3.35 },
  ],
  outro: { f: 'outro.mp3', sec: 1.95 },
  loop: { f: 'loop.mp3', sec: 2.82 },
};
