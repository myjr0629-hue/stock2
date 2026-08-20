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

const INK = '#FFFFFF';
const SUB = 'rgba(214,226,242,0.72)';

/** 애플 마크 — 단순 실루엣 */
const AppleMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={INK} aria-hidden>
    <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.2 5.6c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3z" />
  </svg>
);

/** 구글플레이 삼각 마크 — 4색 */
const PlayMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M3.6 2.2 13.9 12 3.6 21.8c-.3-.2-.5-.6-.5-1.1V3.3c0-.5.2-.9.5-1.1z" fill="#34D2FF" />
    <path d="M17.6 8.3 13.9 12 3.6 2.2c.3-.2.8-.2 1.2 0l12.8 6.1z" fill="#4AE08A" />
    <path d="M21 10.9c.7.4.7 1.8 0 2.2l-3.4 1.6L13.9 12l3.7-3.7L21 10.9z" fill="#FFCE3D" />
    <path d="M17.6 15.7 4.8 21.8c-.4.2-.9.2-1.2 0L13.9 12l3.7 3.7z" fill="#FF5C74" />
  </svg>
);

const StoreBadge: React.FC<{ kind: 'ios' | 'android' }> = ({ kind }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    background: '#0A0D14', border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: 14, padding: '14px 26px', minWidth: 300,
  }}>
    {kind === 'ios' ? <AppleMark size={40} /> : <PlayMark size={40} />}
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
      <span style={{ fontSize: 19, fontWeight: 700, color: SUB, letterSpacing: '0.02em' }}>
        {kind === 'ios' ? 'Download on the' : 'GET IT ON'}
      </span>
      <span style={{ fontSize: 33, fontWeight: 800, color: INK, letterSpacing: '-0.01em' }}>
        {kind === 'ios' ? 'App Store' : 'Google Play'}
      </span>
    </div>
  </div>
);

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
