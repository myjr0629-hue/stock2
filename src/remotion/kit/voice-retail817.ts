// 자동 생성 — scripts/tts-beats.mjs RETAIL817 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_RETAIL817: VoiceTrack = {
  base: 'shorts/audio/retail817',
  hook: { f: 'hook.mp3', sec: 2.35 },
  beats: [
    { f: '00.mp3', sec: 8.58, saySec: 5.15, ask: { f: '00a.mp3', sec: 3.25 } },
    { f: '01.mp3', sec: 7.23, saySec: 4.25, ask: { f: '01a.mp3', sec: 2.8 } },
    { f: '02.mp3', sec: 9.82, saySec: 6.72, ask: { f: '02a.mp3', sec: 2.92 } },
    { f: '03.mp3', sec: 5.45, saySec: 3.37, ask: { f: '03a.mp3', sec: 1.9 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.55 },
  loop: { f: 'loop.mp3', sec: 2.32 },
};
