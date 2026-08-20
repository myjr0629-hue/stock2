// 자동 생성 — scripts/tts-beats.mjs LONGEND818 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_LONGEND818: VoiceTrack = {
  base: 'shorts/audio/longend818',
  hook: { f: 'hook.mp3', sec: 1.45 },
  beats: [
    { f: '00.mp3', sec: 4.15, saySec: 1.97, ask: { f: '00a.mp3', sec: 2 } },
    { f: '01.mp3', sec: 4.22, saySec: 2.12, ask: { f: '01a.mp3', sec: 1.92 } },
    { f: '02.mp3', sec: 3.6, saySec: 1.72, ask: { f: '02a.mp3', sec: 1.7 } },
    { f: '03.mp3', sec: 4.2, saySec: 1.95, ask: { f: '03a.mp3', sec: 2.07 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.67 },
  loop: { f: 'loop.mp3', sec: 2.05 },
};
