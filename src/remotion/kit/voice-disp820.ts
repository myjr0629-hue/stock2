// 자동 생성 — scripts/tts-beats.mjs DISP820 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_DISP820: VoiceTrack = {
  base: 'shorts/audio/disp820',
  hook: { f: 'hook.mp3', sec: 1.5 },
  beats: [
    { f: '00.mp3', sec: 2.84, saySec: 1.19, ask: { f: '00a.mp3', sec: 1.47 } },
    { f: '01.mp3', sec: 3.25, saySec: 1.72, ask: { f: '01a.mp3', sec: 1.35 } },
    { f: '02.mp3', sec: 3.65, saySec: 1.77, ask: { f: '02a.mp3', sec: 1.7 } },
    { f: '03.mp3', sec: 3.1, saySec: 1.3, ask: { f: '03a.mp3', sec: 1.62 } },
    { f: '04.mp3', sec: 3.35, saySec: 1.65, ask: { f: '04a.mp3', sec: 1.52 } },
    { f: '05.mp3', sec: 3.22, saySec: 1.77, ask: { f: '05a.mp3', sec: 1.27 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.85 },
  loop: { f: 'loop.mp3', sec: 1.62 },
};
