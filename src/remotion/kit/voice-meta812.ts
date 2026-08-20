// 자동 생성 — scripts/tts-beats.mjs META812 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_META812: VoiceTrack = {
  base: 'shorts/audio/meta812',
  hook: { f: 'hook.mp3', sec: 1.8 },
  beats: [
    { f: '00.mp3', sec: 6.44, saySec: 4.41, ask: { f: '00a.mp3', sec: 1.85 } },
    { f: '01.mp3', sec: 6.37, saySec: 4.44, ask: { f: '01a.mp3', sec: 1.75 } },
    { f: '02.mp3', sec: 5.72, saySec: 3.19, ask: { f: '02a.mp3', sec: 2.35 } },
    { f: '03.mp3', sec: 5.36, saySec: 3.06, ask: { f: '03a.mp3', sec: 2.12 } },
    { f: '04.mp3', sec: 5.04, saySec: 3.53, ask: { f: '04a.mp3', sec: 1.33 } },
    { f: '05.mp3', sec: 6.35, saySec: 4.13, ask: { f: '05a.mp3', sec: 2.04 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.35 },
  loop: { f: 'loop.mp3', sec: 2.22 },
};
