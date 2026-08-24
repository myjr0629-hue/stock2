// ============================================================================
// _script-source — 게이트들이 읽는 «대본 원문»을 한 군데서 만든다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21)
//   게이트 다섯 곳이 각자 src/remotion/kit/scripts.ts 를 «원문 그대로» 읽어
//   `export const SCRIPT_<태그>` 를 문자열로 찾는다.
//   일본 채널 대본을 scripts-jp.ts 로 분리하자 그 다섯 곳이 전부 «대본 없음»을 냈다.
//   ⇒ 대본 파일이 늘어날 때마다 다섯 군데를 고치는 구조였다. 여기 한 곳으로 모은다.
//
//   ※ 번들해서 «값»으로 읽는 곳(tts-beats, make-srt, cut-audit)은 이 파일이 필요 없다.
//     그쪽은 scripts.ts 의 재수출을 타고 이미 찾아간다.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const FILES = [
  'src/remotion/kit/scripts.ts',
  'src/remotion/kit/scripts-jp.ts',
  // 일본 «실제로 달린 3갈래» 확장판 (2026-08-23). 파일이 늘 때마다 여기만 고친다.
  'src/remotion/kit/scripts-jp2.ts',
  'src/remotion/kit/scripts-jp3.ts',
  'src/remotion/kit/scripts-jp-lf.ts',
  'src/remotion/kit/scripts-us2.ts',
  'src/remotion/kit/scripts-nvda.ts',
  'src/remotion/kit/scripts-jpweek.ts',
  // 미국 채널 · 캐나다 50% 관세 편 (2026-08-24). 처음으로 «시의성» 으로 고른 소재다.
  'src/remotion/kit/scripts-tariff.ts',
];

/** 모든 대본 파일을 이어붙인 원문. 게이트의 문자열 탐색이 이걸 쓴다. */
export function scriptSource() {
  return FILES.filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
}
