// 자동 생성 — scripts/tts-beats.mjs TRIPLEB (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_TRIPLEB: VoiceTrack = {
  base: 'shorts/audio/tripleb',
  hook: { f: 'hook.mp3', sec: 1.35 },
  beats: [
    { f: '00.mp3', sec: 2.8, saySec: 1.35, ask: { f: '00a.mp3', sec: 1.27 } },
    { f: '01.mp3', sec: 2.59, saySec: 1.19, ask: { f: '01a.mp3', sec: 1.22 } },
    { f: '02.mp3', sec: 3.25, saySec: 1.9, ask: { f: '02a.mp3', sec: 1.17 } },
  ],
  outro: { f: 'outro.mp3', sec: 2.35 },
  loop: { f: 'loop.mp3', sec: 1.5 },
};
