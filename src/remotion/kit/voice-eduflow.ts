// 자동 생성 — scripts/tts-beats.mjs EDUFLOW (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_EDUFLOW: VoiceTrack = {
  base: 'shorts/audio/eduflow',
  hook: { f: 'hook.mp3', sec: 2.3 },
  beats: [
    { f: '00.mp3', sec: 4.27, saySec: 2.82, ask: { f: '00a.mp3', sec: 1.27 } },
    { f: '01.mp3', sec: 6.02, saySec: 4.42, ask: { f: '01a.mp3', sec: 1.42 } },
    { f: '02.mp3', sec: 3.67 },
  ],
  outro: { f: 'outro.mp3', sec: 1.8 },
  loop: { f: 'loop.mp3', sec: 2.42 },
};
