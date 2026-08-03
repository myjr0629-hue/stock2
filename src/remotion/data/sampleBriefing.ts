// ============================================================================
// sampleBriefing — 2026-08-03 장중 실측 데이터로 만든 샘플 대본
// ----------------------------------------------------------------------------
// 전부 우리 API에서 그대로 읽은 실숫자다. 지어낸 값 없음.
//   /api/live/quotes         10:26 ET : SPY +1.01 · QQQ +0.93 · SMH -0.39
//                                       MU -1.73 · AVGO -2.02 · SOXL -3.33 · SOXS +3.06
//   /api/chart?symbol=SOXL&range=1d    : 387개 1분봉 → 30점 균등 다운샘플
//   앱 캡처(Command/SOXL)              : 영어 UI, 실시간. 자막은 이 화면의 숫자를 인용하지 않는다
//
// ⚠️ 원칙 — «영상 안에 숫자는 한 소스에서만 온다»
//   1차 샘플은 대본에 `$107.55`를 박아놓고 앱 캡처에는 다른 가격이 찍혀,
//   한 영상 안에서 가격이 두 개가 됐다. 시세는 초 단위로 움직이므로
//   «캡처 시점»과 «대본 시점»을 맞추는 건 근본적으로 경주다.
//   2차 시도로 «MAX PAIN·GAMMA FLIP 같은 장중 고정 레벨은 써도 된다»고 봤는데,
//   재캡처에서 GAMMA FLIP이 $96.80 → $94.00으로 바뀌었다. 고정이 아니었다.
//   → 최종 규칙: **실앱 화면이 나오는 컷의 자막에는 그 화면이 표시하는 숫자를
//     하나도 다시 쓰지 않는다.** 자막은 «무엇을 보여주는지»(라벨)만 말하고,
//     숫자는 화면이 말하게 둔다. 그래야 캡처와 대본의 시점 경주 자체가 사라진다.
//
// 포맷 원칙 (.agent/VIDEO_ENGINE_SPEC.md)
//   §4-A 시장 전체 → 그 안의 한 종목. 오늘 소재가 정확히 그것이다 —
//        지수는 올랐는데(SPY +1.01%) 반도체 3배 레버리지는 무너졌다(SOXL -3.33%).
//   §3-C 텍스트 2단 티어: 헤드라인(문장) / 콜아웃(숫자+라벨)
//   §3-E 13 CPS · 진입 0.4초 차감 후 글자수 예산
//
// 컴플라이언스: 관찰형만. 전부 현재/과거 사실. 예측·매수매도·방향 암시 0.
// (BUFFER_OPS §0-7 — "headed toward" 류 프레이밍도 금지)
// ============================================================================

import type { BriefingProps } from '../compositions/BriefingV1';

// SOXL 8/3 장중 실제 1분봉을 30점으로 균등 다운샘플 (앱 PRICE HISTORY와 같은 형태)
const SOXL_INTRADAY = [
  117.54, 117.02, 112.79, 114.12, 115.54, 115.50, 115.21, 114.20, 113.67, 113.76,
  111.48, 109.46, 110.59, 111.17, 108.67, 109.05, 109.20, 107.60, 105.47, 106.60,
  106.60, 106.37, 106.37, 106.22, 107.19, 102.15, 102.54, 107.43, 107.79, 110.91,
];

export const SAMPLE_BRIEFING: BriefingProps = {
  // 0:00–0:03 훅 — 초대형 숫자 하나. 지수가 «올랐다»는 사실부터.
  hookLabel: 'S&P 500 TODAY',      // 13자 ≤20 ✅
  hookValue: '+1.01%',
  hookUp: true,

  // 0:03–0:07 긴장 — 38자 ≤47 ✅
  tension: 'The index is green. Semis are not.',
  dateLine: 'Aug 3 · US market open',

  // 0:07–0:12 증거1 — 36자 ≤60 ✅
  evidence1: 'SMH -0.39%   MU -1.73%   AVGO -2.02%',
  evidenceSeries: SOXL_INTRADAY,

  // 0:12–0:15 · 0:15–0:18 콜아웃 2연타 — 같은 테이프, 반대 방향
  callout2a: { label: 'SOXL  3X SEMIS', value: '-3.33%', up: false },
  callout2b: { label: 'SOXS  INVERSE', value: '+3.06%', up: true },

  // 0:18–0:23 증거3 — 실앱 화면. 숫자 0개, 라벨만. 전부 화면에 실제로 있는 항목. 35자 ≤60 ✅
  evidence3: 'Max pain. Gamma flip. Total premium.',
  appShot: 'shorts/appshots/signum-cmd.png',

  // 0:23–0:26 페이오프 — 25자 ≤34 ✅. 사후 서술, 예측 아님.
  payoff: 'One tape.\nTwo directions.',

  // 0:26–0:32 아웃트로 — 앱 1개(3앱 로테이션 §3-D)
  outroApp: 'SIGNUM HQ',
  outroLine: 'The tape institutions leave behind',
  outroShot: 'shorts/appshots/signum-dash.png',
};
