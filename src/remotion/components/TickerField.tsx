// ============================================================================
// TickerField — 그날 주목 종목의 «실제 심볼»을 배경에 흩뿌린다
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-11):
//   "그날 주목할 만한 종목들 심볼·티커가 군데군데 박혀 있는 것도 좋다"
//   "일반인들은 종목 심볼에 더 눈이 가는 것이 사실이고"
//   "너무 다큐스럽게 만들 필요는 없다. 쇼츠니까"
//
// 규칙:
//  · **실제 로고 파일만** 흩뿌린다 (public/shorts/logos/*). 글자 배지는 제외 —
//    배경에 텍스트가 떠다니면 자막과 싸우고, 「무겁게」 보인다.
//  · 위치는 «결정론적»이다. 같은 티커·같은 시드면 항상 같은 자리에 뜬다.
//  · 자막·헤드라인 영역(중앙 세로 밴드)은 피한다 — 가독성이 먼저다.
//  · 아주 천천히 부유한다. 시선을 뺏지 않고 «있다»는 것만 알린다.
// ============================================================================

import React from 'react';
import { Img, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { resolveSymbol } from '../kit/symbols';
import { CANVAS } from '../kit/spec';

/** 문자열 → 안정 정수 (같은 티커는 항상 같은 자리) */
function h(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

export const TickerField: React.FC<{
  /** 그날 주목 종목. 로고 파일이 없는 건 «조용히» 빠진다 */
  tickers: string[];
  /** 같은 영상 안에서 배치를 고정하는 시드 */
  seed?: string;
  /** 기본 0.13 — 더 올리면 자막과 싸운다 */
  opacity?: number;
  /** 히어로로 이미 크게 쓰고 있는 심볼 — 배경에 또 뿌리면 «중복»으로 보인다 */
  exclude?: string[];
}> = ({ tickers, seed = '', opacity = 0.13, exclude }) => {
  const f = useCurrentFrame();
  const skip = new Set((exclude ?? []).map((x) => x.toUpperCase()));
  const marks = tickers
    .filter((t) => !skip.has(t.toUpperCase()))
    .map((t) => ({ t, s: resolveSymbol(t) }))
    .filter((m) => m.s.kind === 'logo');          // ★ 실 로고만. 글자 배지는 배경에 안 쓴다
  if (!marks.length) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {marks.map(({ t, s }, i) => {
        const k = h(`${seed}|${t}`);
        // 좌우 «바깥 띠»에만 배치 — 가운데는 헤드라인·비주얼·자막 자리다
        // ★ 배치 금지 구역 — 헤드라인·비주얼·자막이 사는 곳
        //   세로: 화면 하단 52% 아래 전부 (훅 문장 · 비트 자막 · 면책)
        //   가로: 잘리지 않게 양 끝에서 6% 안쪽부터
        //   (2026-08-11 실측: 왼쪽 2% 배치가 훅 헤드라인 뒤에 걸리고 좌상단이 잘렸다)
        const leftSide = (k >> 3) % 2 === 0;
        const x = leftSide ? 6 + (k % 9) : 72 + (k % 12);          // %
        const y = 8 + ((k >> 7) % 38);                             // % → 8~46%
        const size = 92 + ((k >> 11) % 60);
        const drift = interpolate(
          (f + (k % 90)) % 300, [0, 150, 300], [0, 14, 0],
        );
        const spin = interpolate((f + (k % 120)) % 600, [0, 600], [-4, 4]);
        return (
          <div
            key={`${t}-${i}`}
            style={{
              position: 'absolute',
              left: `${x}%`, top: `${y}%`,
              width: size, height: size,
              transform: `translateY(${drift}px) rotate(${spin}deg)`,
              opacity,
              borderRadius: Math.round(size * 0.24),
              background: 'rgba(255,255,255,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              filter: 'saturate(1.05)',
            }}
          >
            <Img
              src={staticFile((s as { src: string }).src)}
              style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }}
            />
          </div>
        );
      })}
    </div>
  );
};

export const TICKER_FIELD_CANVAS = CANVAS;
