/**
 * Thumb — 쇼츠 «썸네일» 정지 화면 (1080x1920)
 * ---------------------------------------------------------------------------
 * 왜 필요한가: 쇼츠도 채널 그리드·검색 결과에서 «정지 이미지»로 먼저 만난다.
 *   우리 유입 검색어의 90%가 티커였다 → 티커 로고와 숫자가 «가장 크게» 보여야 한다.
 *
 * 설계 원칙 (2026-08-19 대표 지시 반영)
 *   · 「상식이 뒤집히는 지점」을 한눈에 — 두 숫자를 «크기 차이»로 대비시킨다
 *   · 로고를 쓴다. 글자만 있으면 스크롤에서 안 걸린다
 *   · 하단 340px 은 비운다 — 쇼츠 그리드에서 제목이 덮는 영역
 *   · 숫자는 대본과 «같은 값»만 쓴다 (실측 검증본)
 */

import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();

export type ThumbProps = {
  kicker: string;
  /** 위(주인공) 티커 */
  a: { sym: string; label: string; value: string };
  /** 아래(대조) 티커 */
  b: { sym: string; label: string; value: string };
  /** 가운데 배지 — 배수·핵심 한 마디 */
  badge: string;
  foot: string;
};

export const THUMB_AMD819: ThumbProps = {
  kicker: 'SAME YEAR · SAME AI TRADE',
  a: { sym: 'AMD', label: 'AMD', value: '+117%' },
  b: { sym: 'NVDA', label: 'NVIDIA', value: '+16%' },
  badge: '7×',
  foot: 'SIGNUM HQ',
};

const C = {
  bg0: '#101B2E', bg1: '#070B14',
  green: '#25E39A', dimGreen: '#6E8F86',
  text: '#F3F8FF', amber: '#FFB020', ink: '#08101C',
};

const Row: React.FC<{
  sym: string; label: string; value: string; big: boolean;
}> = ({ sym, label, value, big }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: big ? 38 : 30,
    opacity: big ? 1 : 0.72,
  }}>
    <div style={{
      width: big ? 156 : 112, height: big ? 156 : 112, borderRadius: big ? 34 : 26,
      background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: big ? '0 18px 44px rgba(0,0,0,0.5)' : '0 10px 26px rgba(0,0,0,0.4)',
      flexShrink: 0,
    }}>
      <Img src={staticFile(`shorts/logos/${sym}.png`)}
        style={{ width: big ? 114 : 80, height: big ? 114 : 80, objectFit: 'contain' }} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily, fontSize: big ? 52 : 42, fontWeight: 800, color: C.text,
        letterSpacing: '0.04em', opacity: 0.82,
      }}>{label}</div>
      <div style={{
        fontFamily, fontSize: big ? 212 : 124, lineHeight: 0.96, fontWeight: 900,
        color: big ? C.green : C.dimGreen, letterSpacing: '-0.05em',
        textShadow: big ? '0 10px 40px rgba(37,227,154,0.32)' : 'none',
      }}>{value}</div>
    </div>
  </div>
);

export const Thumb: React.FC<ThumbProps> = ({ kicker, a, b, badge, foot }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg,${C.bg0} 0%,${C.bg1} 100%)` }}>
    {/* 키라이트 */}
    <div style={{
      position: 'absolute', left: -320, top: -420, width: 1180, height: 1180,
      borderRadius: '50%', filter: 'blur(160px)', background: 'rgba(96,150,220,0.42)',
    }} />
    <div style={{
      position: 'absolute', right: -300, top: 700, width: 900, height: 900,
      borderRadius: '50%', filter: 'blur(170px)', background: 'rgba(37,227,154,0.16)',
    }} />

    <div style={{ position: 'absolute', left: 76, right: 76, top: 486 }}>
      <div style={{
        display: 'inline-block', padding: '12px 24px', borderRadius: 10, background: C.amber,
        color: C.ink, fontFamily, fontSize: 36, fontWeight: 900, letterSpacing: '0.08em',
      }}>{kicker}</div>

      <div style={{ marginTop: 84 }}><Row {...a} big /></div>

      {/* 대비 배지 — «몇 배인가»가 한눈에 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, margin: '54px 0 54px 4px' }}>
        <div style={{
          padding: '10px 30px', borderRadius: 14, background: C.text, color: C.ink,
          fontFamily, fontSize: 88, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05,
        }}>{badge}</div>
        <div style={{
          height: 4, flex: 1, borderRadius: 2,
          background: 'linear-gradient(90deg,rgba(243,248,255,0.6),rgba(243,248,255,0))',
        }} />
      </div>

      <Row {...b} big={false} />
    </div>

    {/* 하단 340px 은 비운다 — 쇼츠 그리드에서 제목이 덮는다 */}
    <div style={{
      position: 'absolute', left: 76, bottom: 300,
      fontFamily, fontSize: 38, fontWeight: 900, color: 'rgba(214,230,250,0.72)',
      letterSpacing: '0.16em',
    }}>{foot}</div>
  </AbsoluteFill>
);
