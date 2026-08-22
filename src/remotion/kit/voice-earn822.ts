// 자동 생성 — scripts/tts-beats.mjs EARN822 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EARN822: VoiceTrack = {
  base: 'shorts/audio/earn822',
  hook: { f: 'hook.mp3', sec: 2.07 },
  beats: [
    { f: '00.mp3', sec: 3.48, saySec: 1.4, ask: { f: '00a.mp3', sec: 1.9 } },
    { f: '01.mp3', sec: 3.77, saySec: 1.67, ask: { f: '01a.mp3', sec: 1.92 } },
    { f: '02.mp3', sec: 2.92, saySec: 1.22, ask: { f: '02a.mp3', sec: 1.52 } },
    { f: '03.mp3', sec: 3.02, saySec: 1.22, ask: { f: '03a.mp3', sec: 1.62 } },
    { f: '04.mp3', sec: 3.68, saySec: 1.65, ask: { f: '04a.mp3', sec: 1.85 } },
    { f: '05.mp3', sec: 3.85, saySec: 1.77, ask: { f: '05a.mp3', sec: 1.9 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.55 },
  loop: { f: 'loop.mp3', sec: 1.97 },
};
