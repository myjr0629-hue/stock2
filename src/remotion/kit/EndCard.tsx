// ============================================================================
// kit/EndCard — 3앱 공용 엔드카드 (정본: SHORTS_FRAMEWORK_V3 §6-1)
// ----------------------------------------------------------------------------
// 105f(3.5s) 기본 / 210f(7s) 확장. 비트 경계는 105f 기준 비율로 스케일한다.
//
//  E0 SEAM   0–5     직전 비트 지배색 라이트 스윕 1회 + 플레이트 페이드인
//  E1 REVEAL 6–50    폰 + 궤도 패널 «동시» 진입 (scale .88→1, rotateY −8°→0°)
//  E2 LOCKUP 51–80   아이콘 오버슈트 + 앱이름 좌→우 마스크 + CTA 필 라이즈
//  E3 ASK    81–104  CTA → loopAsk 크로스페이드(같은 y) · 마지막 6f 완전 정지
//
// 카메라는 전 구간 «단일 무브»: rotateY −7°→+5°, scale 1.06→0.98.
// ⚠️ 화이트 플래시 금지 — 휘도 델타 ≤20% (광과민성 + 검출기 우회 회피).
// ⚠️ 앱 화면은 실캡처만. redact=true 면 마젠타 단색 (i2v 레퍼런스 업로드용).
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { CANVAS, SAFE } from './spec';
import { ENDCARD, ENDCARD_FRAMES, type AppKey } from './endcards';

const { fontFamily } = loadFont();

const REDACT = '#FF00E5';           // 형광 마젠타 — 1px 어긋나도 육안에 즉시 잡힌다
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * CTA 필 위의 글자색 — 액센트 밝기로 정한다.
 * 고정 색으로 두면 UC(#C4441A) 처럼 «어두운 액센트 + 어두운 글자»가 나온다(실측 대비 3.3:1).
 */
function ctaInkOn(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? '#0B0F18' : '#FFFFFF';
}

export interface EndCardProps {
  app: AppKey;
  /** 105 (기본) 또는 210 */
  frames?: number;
  /** 직전 비트의 지배색 — 이음매 스윕에 쓴다 */
  seamColor?: string;
  /** 그날 대본의 루프 문장. 없으면 앱별 폴백 */
  loopAsk?: string;
  /** i2v 레퍼런스용 — 화면을 단색으로 덮는다 */
  redact?: boolean;
}

export const EndCard: React.FC<EndCardProps> = ({
  app, frames = ENDCARD_FRAMES.short, seamColor, loopAsk, redact = false,
}) => {
  const S = ENDCARD[app];
  const f = useCurrentFrame();
  const k = frames / ENDCARD_FRAMES.short;               // 105f 기준 비율
  const B = { seam: 6 * k, reveal: 51 * k, lockup: 81 * k };
  const HOLD = 6;                                        // 마지막 6f 완전 정지

  // 카메라 — 정지 구간에서는 시간이 멈춘다
  const fc = Math.min(f, frames - HOLD);
  const camT = frames - HOLD <= 0 ? 1 : fc / (frames - HOLD);
  const camRotY = interpolate(camT, [0, 1], [-7, 5]);
  const camScale = interpolate(camT, [0, 1], [1.06, 0.98]);

  // E2 진입 «컷» 확보 — 플래시 대신 그룹 스케일 스텝
  const stepScale = interpolate(fc, [B.reveal - 2, B.reveal + 4], [0.94, 1.02], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── E0 SEAM ──────────────────────────────────────────────────────────────
  const plateIn = interpolate(fc, [0, B.seam + 6 * k], [0, 1], { extrapolateRight: 'clamp' });
  const sweepX = interpolate(fc, [0, B.seam + 8 * k], [-0.5, 1.4], { extrapolateRight: 'clamp' });
  const sweepOp = interpolate(fc, [0, B.seam * 0.6, B.seam + 8 * k], [0, 0.5, 0], { extrapolateRight: 'clamp' });

  // ── E1 REVEAL ────────────────────────────────────────────────────────────
  const rv = ease(interpolate(fc, [B.seam, B.reveal], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const phoneScale = interpolate(rv, [0, 1], [0.88, 1]);
  const phoneRotY = interpolate(rv, [0, 1], [-8, 0]);

  // ── E2 LOCKUP ────────────────────────────────────────────────────────────
  const lk = interpolate(fc, [B.reveal, B.lockup], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconScale = interpolate(lk, [0, 0.55, 1], [0.62, 1.08, 1.0], { extrapolateRight: 'clamp' });
  const nameMask = interpolate(lk, [0.2, 0.85], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaY = interpolate(lk, [0.45, 1], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaOp = interpolate(lk, [0.45, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ── E3 ASK — CTA ↔ loopAsk 크로스페이드 (같은 y, 레이아웃 점프 0) ─────────
  const ask = interpolate(fc, [B.lockup + 4 * k, B.lockup + 14 * k], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── 레이아웃 정본 ─────────────────────────────────────────────────────────
  // 락업(아이콘·이름·한줄·CTA·면책)은 «하나의 하단 고정 컬럼»이다.
  // 절대배치로 흩어 놓으면 서로 겹친다(2026-08-11 실측: 아이콘이 폰을,
  // CTA 가 태그라인을 덮었다). 컬럼으로 묶으면 구조적으로 겹칠 수 없다.
  const COL_BOTTOM = CANVAS.h - SAFE.bottom + 8;   // 면책 아래끝이 SAFE 안에 들어온다
  const PHONE_W = 377, PHONE_H = 770;
  const ctaInk = ctaInkOn(S.accent);
  const PHONE_CY = 685;                            // 폰 아래끝 ≈ 1070 → 컬럼과 안 겹친다
  const screenStyle: React.CSSProperties = redact
    ? { background: REDACT }
    : {};

  return (
    <AbsoluteFill style={{ background: S.bezel, fontFamily, overflow: 'hidden' }}>
      {/* 배경 플레이트 — 없으면 액센트 그라디언트로 폴백 */}
      <AbsoluteFill style={{ opacity: plateIn }}>
        {S.plate ? (
          <Loop durationInFrames={148} layout="none">
            <OffthreadVideo
              muted
              src={staticFile(S.plate)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: S.plateFilter }}
            />
          </Loop>
        ) : (
          <AbsoluteFill style={{
            background: `radial-gradient(120% 80% at 50% 28%, ${S.accent}22 0%, transparent 62%), ${S.bezel}`,
          }} />
        )}
      </AbsoluteFill>

      {/* E0 — 이음매 라이트 스윕 (직전 비트 색을 물고 들어온다) */}
      <AbsoluteFill style={{
        opacity: sweepOp,
        background: `linear-gradient(105deg, transparent ${sweepX * 100 - 22}%, ${seamColor ?? S.accent}88 ${sweepX * 100}%, transparent ${sweepX * 100 + 22}%)`,
        mixBlendMode: 'screen',
      }} />

      {/* 카메라 그룹 */}
      <AbsoluteFill style={{
        perspective: 1600,
        transform: `scale(${camScale * stepScale})`,
      }}>
        <AbsoluteFill style={{ transform: `rotateY(${camRotY}deg)`, transformStyle: 'preserve-3d' }}>

          {/* 궤도 패널 — 폰과 «동시» 진입 */}
          {S.panels.slice(0, 3).map((p, i) => {
            const pos = [
              { x: -330, y: -230, rot: -12, s: 0.44 },
              { x: 340, y: -60, rot: 10, s: 0.40 },
              { x: -300, y: 300, rot: 8, s: 0.38 },
            ][i];
            return (
              <div key={p} style={{
                position: 'absolute', left: '50%', top: PHONE_CY + 24,
                width: PHONE_W, height: PHONE_H,
                transform: `translate(-50%,-50%) translate(${pos.x * rv}px, ${pos.y * rv}px) rotate(${pos.rot}deg) scale(${pos.s * interpolate(rv, [0, 1], [0.8, 1])})`,
                opacity: rv * 0.92,
                borderRadius: 34, overflow: 'hidden',
                background: S.panel,
                boxShadow: '0 24px 70px rgba(0,0,0,0.42)',
                border: `2px solid ${S.accent}44`,
              }}>
                {redact ? <div style={{ width: '100%', height: '100%', background: REDACT }} />
                  : <Img src={staticFile(p)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
              </div>
            );
          })}

          {/* 폰 */}
          <div style={{
            position: 'absolute', left: '50%', top: PHONE_CY,
            width: PHONE_W, height: PHONE_H,
            transform: `translate(-50%,-50%) scale(${phoneScale}) rotateY(${phoneRotY}deg)`,
            opacity: interpolate(rv, [0, 0.25], [0, 1], { extrapolateRight: 'clamp' }),
            borderRadius: 52, padding: 12, background: S.bezel,
            boxShadow: `0 40px 120px rgba(0,0,0,0.55), 0 0 0 2px ${S.accent}55`,
          }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden', ...screenStyle }}>
              {!redact && (
                <Img src={staticFile(S.hero)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
              )}
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* ── 락업 컬럼 — 아이콘 · 이름 · 한 줄 · CTA · 면책 (하단 고정, 겹침 불가) ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: COL_BOTTOM,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <Img src={staticFile(S.icon)} style={{
          width: 96, height: 96, borderRadius: 22,
          transform: `scale(${iconScale})`, opacity: Math.min(1, lk * 3),
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }} />

        <div style={{
          overflow: 'hidden',
          WebkitMaskImage: `linear-gradient(90deg, #000 ${nameMask}%, transparent ${nameMask}%)`,
          maskImage: `linear-gradient(90deg, #000 ${nameMask}%, transparent ${nameMask}%)`,
        }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: S.ink, letterSpacing: '-0.03em', lineHeight: 1.08 }}>
            {S.name}
          </span>
        </div>

        <span style={{ fontSize: 28, fontWeight: 600, color: S.ink, opacity: 0.76 * Math.min(1, lk * 2) }}>
          {S.tagline}
        </span>

        {/* CTA ↔ loopAsk — 같은 자리에서 교차 (레이아웃 점프 0) */}
        <div style={{
          display: 'grid', marginTop: 4,
          transform: `translateY(${ctaY}px)`, opacity: ctaOp,
        }}>
          <span style={{
            gridArea: '1/1', padding: '16px 34px', borderRadius: 999,
            background: S.accent, color: ctaInk, fontSize: 34, fontWeight: 800,
            whiteSpace: 'nowrap', opacity: 1 - ask,
          }}>{S.cta}</span>
          <span style={{
            gridArea: '1/1', padding: '16px 34px', borderRadius: 999,
            background: S.accent, color: ctaInk, fontSize: 34, fontWeight: 800,
            whiteSpace: 'nowrap', opacity: ask,
          }}>{loopAsk ?? S.loopAskFallback}</span>
        </div>

        {/* 면책 — f0 부터 항상 보인다 (브리핑 전역 면책은 여기까지 오지 않는다) */}
        <span style={{ marginTop: 4, fontSize: 26, fontWeight: 700, color: S.ink, opacity: 0.85 }}>
          {S.disclaimer}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const ENDCARD_CANVAS = CANVAS;
