// 자동 생성 — scripts/tts-beats.mjs REGIME813 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_REGIME813: VoiceTrack = {
  base: 'shorts/audio/regime813',
  hook: { f: 'hook.mp3', sec: 2.17 },
  beats: [
    { f: '00.mp3', sec: 3.62, saySec: 2.02, ask: { f: '00a.mp3', sec: 1.42 } },
    { f: '01.mp3', sec: 6.28, saySec: 4.25, ask: { f: '01a.mp3', sec: 1.85 } },
    { f: '02.mp3', sec: 3.9 },
  ],
  outro: { f: 'outro.mp3', sec: 2.02 },
  loop: { f: 'loop.mp3', sec: 2.12 },
};
