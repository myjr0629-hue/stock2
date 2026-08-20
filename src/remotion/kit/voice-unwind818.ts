// 자동 생성 — scripts/tts-beats.mjs UNWIND818 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_UNWIND818: VoiceTrack = {
  base: 'shorts/audio/unwind818',
  hook: { f: 'hook.mp3', sec: 1.77 },
  beats: [
    { f: '00.mp3', sec: 4.67, saySec: 2.586122, ask: { f: '00a.mp3', sec: 1.9 } },
    { f: '01.mp3', sec: 4.05, saySec: 2.07, ask: { f: '01a.mp3', sec: 1.8 } },
    { f: '02.mp3', sec: 3.93, saySec: 1.85, ask: { f: '02a.mp3', sec: 1.9 } },
    { f: '03.mp3', sec: 3.48, saySec: 1.6, ask: { f: '03a.mp3', sec: 1.7 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.35 },
  loop: { f: 'loop.mp3', sec: 2.1 },
};
