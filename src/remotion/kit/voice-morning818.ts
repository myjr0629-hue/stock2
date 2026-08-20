// 자동 생성 — scripts/tts-beats.mjs MORNING818 (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_MORNING818: VoiceTrack = {
  base: 'shorts/audio/morning818',
  hook: { f: 'hook.mp3', sec: 3.47 },
  beats: [
    { f: '00.mp3', sec: 4.12, saySec: 2.47, ask: { f: '00a.mp3', sec: 1.47 } },
    { f: '01.mp3', sec: 5.33, saySec: 2.8, ask: { f: '01a.mp3', sec: 2.35 } },
    { f: '02.mp3', sec: 4.42, saySec: 1.97, ask: { f: '02a.mp3', sec: 2.27 } },
    { f: '03.mp3', sec: 3.75, saySec: 1.62, ask: { f: '03a.mp3', sec: 1.95 } },
  ],
  outro: { f: 'outro.mp3', sec: 1.87 },
  loop: { f: 'loop.mp3', sec: 3.07 },
};
