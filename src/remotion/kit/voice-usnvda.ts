// 자동 생성 — scripts/tts-beats.mjs USNVDA (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_USNVDA: VoiceTrack = {
  base: 'shorts/audio/usnvda',
  hook: { f: 'hook.mp3', sec: 2.02 },
  beats: [
    { f: '00.mp3', sec: 3.22, saySec: 1.52, ask: { f: '00a.mp3', sec: 1.52 } },
    { f: '01.mp3', sec: 3.35, saySec: 1.65, ask: { f: '01a.mp3', sec: 1.52 } },
    { f: '02.mp3', sec: 3.3, saySec: 2, ask: { f: '02a.mp3', sec: 1.12 } },
    { f: '03.mp3', sec: 2.97, saySec: 1.42, ask: { f: '03a.mp3', sec: 1.37 } },
    { f: '04.mp3', sec: 3.43, saySec: 1.7, ask: { f: '04a.mp3', sec: 1.55 } },
    { f: '05.mp3', sec: 3.82, saySec: 2.02, ask: { f: '05a.mp3', sec: 1.62 } },
    { f: '06.mp3', sec: 3.2, saySec: 1.37, ask: { f: '06a.mp3', sec: 1.65 } },
  ],
  loop: { f: 'loop.mp3', sec: 2.55 },
};
