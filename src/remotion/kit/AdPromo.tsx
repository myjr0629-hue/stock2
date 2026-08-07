// ============================================================================
// kit/AdPromo — 앱 «광고 영상» 전용 템플릿 (브리핑과 다른 문법)
// ----------------------------------------------------------------------------
// 브리핑(Briefing) = 정보 밀도·자막·데이터 카드.
// 광고(AdPromo)   = 풀블리드 시네마틱(시덴스) + 실앱 디바이스 프레임 + 큰 클레임 한 줄.
//
// 원칙:
//  · ★ 실제 앱 UI 는 반드시 «실캡처»(AppShot) — AI 로 앱 화면을 생성하지 않는다
//    (시덴스는 UI·글자를 왜곡한다. 가짜 UI 는 스토어 정책·신뢰 문제)
//  · 시덴스 클립은 «화면이 안 보이는» 시네마틱 컷에만 (분위기·은유·손·공간)
//  · 컴플라이언스: 수익 약속 0 · 관찰형 클레임만 · 면책 상시 표시
//  · 음성(voice)은 Briefing 과 같은 VoiceTrack 규격 재사용
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence,
  interpolate, staticFile, useCurrentFrame, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { AppShot, type ShotFocus, type ShotCallout } from '../components/AppShot';
import { CANVAS, C } from './spec';
import type { VoiceSeg, VoiceTrack } from './Briefing';

const { fontFamily } = loadFont();
const F = (s: number) => Math.round(s * CANVAS.fps);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 10) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

const LOGO = 'app-icons/signum.png';

// ── 광고 씬 ─────────────────────────────────────────────────────────────────
export type AdScene =
  | {
      kind: 'cine';                 // 시덴스/kling 풀블리드 시네마틱
      src: string;                  // mp4 (public 기준)
      clipSec: number;              // 소재 실길이 (Loop 계산용)
      title: string;                // 큰 클레임 (\n 2줄)
      sub?: string;
      sec: number;
    }
  | {
      kind: 'app';                  // ★ 실앱 캡처 — 디바이스 프레임
      src: string;                  // 1206x2622 캡처
      focus: ShotFocus;
      callout?: ShotCallout;
      title: string;
      sub?: string;
      sec: number;
      bg?: string;                  // 뒤에 깔 이미지 (기본: 다크)
    }
  | {
      kind: 'brand';                // 로고 엔드카드
      bgImg?: string;               // 기본 hf_gold_tunnel
      app: string;
      line: string;
      cta: string;                  // 예: 'FREE · iOS & Android'
      sec: number;
    };

export interface AdPromoProps {
  scenes: AdScene[];
  voice?: VoiceTrack;               // beats[i] ↔ scenes[i]
  disclaimer?: string;
}

export function adDurationOf(p: AdPromoProps) {
  const segSec = (s: AdScene, seg?: VoiceSeg | null) =>
    seg ? Math.max(s.sec, seg.sec + 0.3) : s.sec;
  return p.scenes.reduce((a, s, i) => a + F(segSec(s, p.voice?.beats?.[i])), 0);
}

// ── 조각들 ──────────────────────────────────────────────────────────────────
const Claim: React.FC<{ title: string; sub?: string; instant?: boolean }> = ({ title, sub, instant }) => {
  const anim = useIn(2, 9);
  const a = instant ? 1 : anim;   // 첫 씬 = 쇼츠 썸네일(프레임 0) → 훅 문장이 즉시 보여야 한다
  return (
    <div style={{ position: 'absolute', top: 150, left: 52, right: 52, zIndex: 20 }}>
      <div style={{
        opacity: a, transform: `translateY(${(1 - a) * 14}px)`,
        fontFamily, fontSize: 78, lineHeight: 1.08, fontWeight: 900, color: C.ink,
        letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 8px 34px rgba(0,0,0,0.8)',
      }}>{title}</div>
      {sub && <div style={{
        marginTop: 14, opacity: a, fontFamily, fontSize: 34, fontWeight: 800,
        color: C.head, letterSpacing: '-0.02em', textShadow: '0 4px 18px rgba(0,0,0,0.7)',
      }}>{sub}</div>}
    </div>
  );
};

const Watermark: React.FC = () => (
  <div style={{
    position: 'absolute', top: 44, right: 44, zIndex: 30,
    display: 'flex', alignItems: 'center', gap: 10, opacity: 0.9,
  }}>
    <Img src={staticFile(LOGO)} style={{ width: 44, height: 44, borderRadius: 11 }} />
    <span style={{ fontFamily, fontSize: 22, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(230,238,250,0.92)' }}>SIGNUM HQ</span>
  </div>
);

const CineBg: React.FC<{ src: string; clipSec: number }> = ({ src, clipSec }) => (
  <AbsoluteFill style={{ overflow: 'hidden', background: '#04060B' }}>
    <Loop durationInFrames={Math.max(1, F(clipSec) - 2)} layout="none">
      <OffthreadVideo muted src={staticFile(src)} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        filter: 'saturate(0.9) contrast(1.04) brightness(1.1)',
      }} />
    </Loop>
    <AbsoluteFill style={{
      background: 'linear-gradient(180deg, rgba(4,7,13,0.45) 0%, rgba(4,7,13,0.08) 30%, rgba(4,7,13,0.10) 62%, rgba(4,7,13,0.62) 100%)',
    }} />
    {/* 스크린블렌드 앰비언트 리프트 — 무디톤 유지하며 검수 밝기 하한(샷≥18) 확보 */}
    <AbsoluteFill style={{ background: '#9FB8D8', opacity: 0.085, mixBlendMode: 'screen' }} />
  </AbsoluteFill>
);

// 씬 경계 5프레임 화이트 플래시 — 어두운 동일계열 배경끼리의 컷을 «보이게» 한다
// (브리핑과 동일 기법: 컷 감지·시청 리듬 둘 다 살린다)
const CutFlash: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 1, 5], [0, 0.5, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: '#EAF2FF', opacity: o, zIndex: 50, pointerEvents: 'none' }} />;
};

// ── 본체 ────────────────────────────────────────────────────────────────────
export const AdPromo: React.FC<AdPromoProps> = (p) => {
  let cursor = 0;
  const spans = p.scenes.map((s, i) => {
    const seg = p.voice?.beats?.[i];
    const len = F(seg ? Math.max(s.sec, seg.sec + 0.3) : s.sec);
    const from = cursor; cursor += len;
    return { s, from, len, seg };
  });

  return (
    <AbsoluteFill style={{ background: '#04060B' }}>
      {spans.map(({ s, from, len, seg }, i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          {seg && p.voice && <Audio src={staticFile(`${p.voice.base}/${seg.f}`)} />}

          {s.kind === 'cine' && (<>
            <CineBg src={s.src} clipSec={s.clipSec} />
            <Claim title={s.title} sub={s.sub} instant={i === 0} />
          </>)}

          {s.kind === 'app' && (
            <AppScene s={s} />
          )}

          {s.kind === 'brand' && (
            <BrandCard s={s} />
          )}

          {i > 0 && <CutFlash />}
        </Sequence>
      ))}

      <Watermark />

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none', zIndex: 40 }}>
        <div style={{ fontFamily, marginBottom: 26, fontSize: 19, fontWeight: 700, color: 'rgba(214,224,240,0.66)' }}>
          {p.disclaimer ?? 'Informational only. Not investment advice.'}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const AppScene: React.FC<{ s: Extract<AdScene, { kind: 'app' }> }> = ({ s }) => {
  const f = useCurrentFrame();
  const a = useIn(3, 10);
  // 디바이스 프레임 폭 — 화면 중앙, 살짝 떠오르며 등장 + 느린 부유
  const float = Math.sin(f / 26) * 5;
  const W = 700, H = 1150;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: s.bg ? undefined : '#04060B' }}>
        {s.bg && <Img src={staticFile(s.bg)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.5) saturate(0.8)' }} />}
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 46%, rgba(34,80,120,0.36) 0%, rgba(4,6,11,0.9) 74%)' }} />
      </AbsoluteFill>
      <Claim title={s.title} sub={s.sub} />
      <div style={{
        position: 'absolute', left: (CANVAS.w - W) / 2, top: 430 + float,
        opacity: a, transform: `scale(${0.96 + a * 0.04})`,
        borderRadius: 44, padding: 14, background: '#0B0F18',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 40px 110px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}>
        <AppShot src={s.src} focus={s.focus} callout={s.callout} width={W} height={H} radius={32} />
      </div>
    </AbsoluteFill>
  );
};

const BrandCard: React.FC<{ s: Extract<AdScene, { kind: 'brand' }> }> = ({ s }) => {
  const a = useIn(2, 12), b = useIn(12, 10);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img src={staticFile(s.bgImg ?? 'shorts/broll/hf/hf_gold_tunnel.png')}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 44%, rgba(4,6,11,0.12) 0%, rgba(4,6,11,0.66) 78%)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: a }}>
          <Img src={staticFile(LOGO)} style={{ width: 150, height: 150, borderRadius: 36, margin: '0 auto 22px', display: 'block', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }} />
          <div style={{ fontFamily, fontSize: 84, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em', textShadow: '0 6px 30px rgba(0,0,0,0.7)' }}>{s.app}</div>
          <div style={{ fontFamily, marginTop: 10, fontSize: 30, fontWeight: 700, color: 'rgba(235,242,252,0.95)' }}>{s.line}</div>
          <div style={{
            marginTop: 26, display: 'inline-block', opacity: b, fontFamily, fontSize: 30,
            fontWeight: 900, color: '#0A0E16', background: C.head, borderRadius: 999, padding: '16px 44px',
            boxShadow: '0 10px 30px rgba(255,176,32,0.35)',
          }}>{s.cta}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
