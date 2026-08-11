// 자동 생성 — scripts/tts-beats.mjs CLOSE811 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_CLOSE811: VoiceTrack = {
  base: 'shorts/audio/close811',
  hook: { f: 'hook.mp3', sec: 2.22 },
  beats: [
    { f: '00.mp3', sec: 4.72, saySec: 3.16, ask: { f: '00a.mp3', sec: 1.38 } },
    { f: '01.mp3', sec: 6.38, saySec: 4.21, ask: { f: '01a.mp3', sec: 1.99 } },
    { f: '02.mp3', sec: 6.11, saySec: 3.42, ask: { f: '02a.mp3', sec: 2.51 } },
    { f: '03.mp3', sec: 6.45, saySec: 4.18, ask: { f: '03a.mp3', sec: 2.09 } },
    { f: '04.mp3', sec: 5.75, saySec: 3.66, ask: { f: '04a.mp3', sec: 1.91 } },
    { f: '05.mp3', sec: 6.34, saySec: 3.84, ask: { f: '05a.mp3', sec: 2.32 } },
    { f: '06.mp3', sec: 6.52, saySec: 4.41, ask: { f: '06a.mp3', sec: 1.93 } },
    { f: '07.mp3', sec: 5.88, saySec: 3.24, ask: { f: '07a.mp3', sec: 2.46 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.95 },
  loop: { f: 'loop.mp3', sec: 2.22 },
};
