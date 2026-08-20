// 자동 생성 — scripts/tts-beats.mjs FEDGAP817 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_FEDGAP817: VoiceTrack = {
  base: 'shorts/audio/fedgap817',
  hook: { f: 'hook.mp3', sec: 1.97 },
  beats: [
    { f: '00.mp3', sec: 3.5, saySec: 1.95, ask: { f: '00a.mp3', sec: 1.37 } },
    { f: '01.mp3', sec: 3.8, saySec: 1.62, ask: { f: '01a.mp3', sec: 2 } },
    { f: '02.mp3', sec: 4.45, saySec: 1.85, ask: { f: '02a.mp3', sec: 2.42 } },
    { f: '03.mp3', sec: 3.7, saySec: 2.12, ask: { f: '03a.mp3', sec: 1.4 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.75 },
  loop: { f: 'loop.mp3', sec: 3.07 },
};
