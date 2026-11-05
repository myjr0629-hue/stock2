// ============================================================================
// kit/AppPlate — 루프백 화면의 «빈 공간»에 들어가는 앱 2종 + 스토어 배지
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-12): "마지막 부분 빈 공간에 윈도우에서 만든 것처럼 앱 로고 2개 넣어줘"
//
// 왜 자산 파일이 아니라 벡터인가:
//   스토어 배지 PNG 는 저장소에 없다. 예전엔 즉석으로 그려 썼고 그 파일은 남지 않았다.
//   여기서 인라인 SVG 로 그려두면 «자산 의존이 0» 이라 어느 머신에서 렌더해도 깨지지 않는다.
//   (앱 아이콘은 public/app-icons 에 커밋돼 있으므로 그대로 쓴다)
//
// 배치 규칙: 루프백 문장 «아래» 빈 영역. 하단 25%(플랫폼 UI 존)와 티커 테이프는 침범하지 않는다.
// ============================================================================

import React from 'react';
import { AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { StoreBadge } from '../../components/common/StoreBadge';

const INK = '#FFFFFF';
const SUB = 'rgba(214,226,242,0.72)';

export interface AppPlateApp { icon: string; name: string; tagline: string }

export const APPS_TWO: AppPlateApp[] = [
  { icon: 'app-icons/signum.png', name: 'SIGNUM HQ', tagline: 'Options-structure\nintelligence' },
  { icon: 'app-icons/uc.png', name: 'Undercurrent', tagline: 'The money behind\nthe news' },
];

/**
 * 루프백 하단 플레이트. `top` 은 캔버스 기준 절대 y — 루프백 문장 아래로 잡는다.
 * 등장은 살짝 늦게(0.35초) 페이드로 — 루프백 문장을 먼저 읽게 한다.
 */
export const AppPlate: React.FC<{ apps?: AppPlateApp[]; top?: number; fontFamily: string }> = ({
  apps = APPS_TWO, top = 1120, fontFamily,
}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [10, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, [10, 26], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top,
        opacity: o, transform: `translateY(${y}px)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34, fontFamily,
      }}>
        <div style={{ display: 'flex', gap: 56, alignItems: 'flex-start' }}>
          {apps.map((a) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Img src={staticFile(a.icon)} style={{
                width: 104, height: 104, borderRadius: 24,
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>{a.name}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: SUB, whiteSpace: 'pre-line' }}>{a.tagline}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 26 }}>
          <StoreBadge kind="ios" />
          <StoreBadge kind="android" />
        </div>
      </div>
    </AbsoluteFill>
  );
};
