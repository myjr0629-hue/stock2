// 자동 생성 — scripts/tts-beats.mjs CLOSE817 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CLOSE817: VoiceTrack = {
  base: 'shorts/audio/close817',
  hook: { f: 'hook.mp3', sec: 1.3 },
  beats: [
    { f: '00.mp3', sec: 4.12, saySec: 1.9, ask: { f: '00a.mp3', sec: 2.037551 } },
    { f: '01.mp3', sec: 3.9, saySec: 1.9, ask: { f: '01a.mp3', sec: 1.82 } },
    { f: '02.mp3', sec: 3.93, saySec: 1.95, ask: { f: '02a.mp3', sec: 1.8 } },
    { f: '03.mp3', sec: 4.08, saySec: 1.8, ask: { f: '03a.mp3', sec: 2.1 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.65 },
  loop: { f: 'loop.mp3', sec: 2.32 },
};
