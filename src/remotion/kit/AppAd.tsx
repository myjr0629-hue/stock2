/**
 * AppAd — SIGNUM HQ 앱 광고 · «3D 스마트폰 목업 & UI 모션형»
 * ---------------------------------------------------------------------------
 * 1080x1920 · 30fps · 25초 · 나레이션 + 자막 + 효과음
 *
 * ★ 파는 것은 하나 — 「무료다 · 기관급 지표와 AI 분석이 있다 · 그걸 알림으로 받는다」
 *
 * v5 (2026-08-19 대표 피드백)
 *   ① 컷 길이를 «나레이션 실측»에 묶는다 → 죽은 정지 구간이 사라진다 (30초 → 25초)
 *   ② FREE 를 폰 «위»로. 색은 초록 대신 «흰색» — 어두운 남색 위에서 대비가 최대다
 *   ③ ElevenLabs 나레이션 + 자막
 *   ④ 종이 흔들릴 때 «알림 차임», FREE 가 박힐 때 «임팩트» (합성음 — 저작권 무관)
 *
 * 왜 AI 영상이 아니라 여기서 만드는가 (실측)
 *   Flow·Seedance 는 구도·조명은 훌륭했지만 화면 글자가 재생성되어 무너졌다
 *   (BULLISH→AMLLISH · MACRO BOARD→MACHO BOARG). 여기서는 실캡처를 잘라 보여주기만 한다.
 *
 * ★ 카피·나레이션에 «수치»를 말하지 않는다 — 캡처를 다시 뜨면 시세가 바뀐다.
 */

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, interpolate, useCurrentFrame, Easing, staticFile,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { VOICE_AD } from './voice-ad';

const { fontFamily } = loadFont();

export const APPAD_FPS = 30;
const F = (s: number) => Math.round(s * APPAD_FPS);

// ── 레이아웃 — 실제 아이폰 비율 ─────────────────────────────────────────────
const W = 1080, H = 1920;
const METAL = 7, BEZEL = 6, PAD = METAL + BEZEL;
const SCREEN_W = 452;
const SCREEN_H = Math.round(SCREEN_W * 2.167);      // 19.5:9
const STATUS_H = 46;
const BODY_W = SCREEN_W + PAD * 2, BODY_H = SCREEN_H + PAD * 2;
const BODY_X = (W - BODY_W) / 2, BODY_Y = 566;
const R_SCREEN = Math.round(SCREEN_W * 0.12);
const R_BODY = R_SCREEN + PAD;
const IMG_SCALE = SCREEN_W / 1206;

const C = {
  ink: '#08101C', accent: '#FFB020', cyan: '#3ADDF2', green: '#25E39A',
  violet: '#A78BFA', claude: '#D97757', text: '#F2F7FE', dim: 'rgba(198,216,240,0.66)',
};

const seg = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const ease = Easing.bezier(0.22, 1, 0.36, 1);
type Box = { x: number; y: number; w: number; h: number };

// ── 타임라인 — 나레이션 실측에서 «계산»한다 ────────────────────────────────
// 컷을 손으로 잡지 않는다. 낭독이 끝나면 바로 다음 컷으로 넘어가므로 멈춤이 없다.
const GAP = F(0.2);
const V = Object.fromEntries(VOICE_AD.lines.map((l) => [l.id, l])) as Record<string, typeof VOICE_AD.lines[0]>;
const BASE_ORDER = ['open', 'morn', 'pain', 'gamma', 'whale', 'dark', 'ai', 'close'] as const;
const CTA_LEN = F(4.4);

/**
 * 두 판을 «같은 빌드»에서 뽑는다.
 *   solo — SIGNUM 단독 (앱스토어·랜딩용)
 *   duo  — 마지막에 자매 앱 Undercurrent 를 얹은 판 (채널·크로스 프로모션용)
 * 무UC 판을 따로 관리하면 빌드가 어긋난다 — 실제로 옛 판은 엔딩이 3.2초로 달랐다.
 */
function buildCuts(withUC: boolean) {
  const order = withUC ? [...BASE_ORDER, 'uc'] : [...BASE_ORDER];
  const cuts: { id: string; from: number; len: number; text: string }[] = [];
  let t = 0;
  for (const id of order) {
    const len = F(V[id].sec) + GAP;
    cuts.push({ id, from: t, len, text: V[id].text });
    t += len;
  }
  return { cuts, ctaFrom: t, duration: t + CTA_LEN };
}
const DUO = buildCuts(true), SOLO = buildCuts(false);
export const APPAD_DURATION = DUO.duration;
export const APPAD_DURATION_SOLO = SOLO.duration;

// ── 배경 ────────────────────────────────────────────────────────────────────
/**
 * Studio — 배경 플레이트
 *   실측(2026-08-20): CSS 그라디언트 배경은 «바닥»이 없었다. 중단 46.0 → 하단 18.7 로
 *   계속 어두워져 폰이 «공간»이 아니라 «검은 판» 위에 뜬 것으로 읽혔다.
 *   Flow 로 뽑은 빈 스튜디오 플레이트(바닥·앰버 엣지·반사·헤이즈)를 깐다.
 *   워터마크는 delogo 로 지웠고, 앞뒤를 이어붙여 20초 «핑퐁 루프»라 이음매가 없다.
 */
export const PLATE = 'ad/plate-p1.mp4';
const PLATE_FRAMES = 600;                       // 20초 x 30fps

const Studio: React.FC = () => (
  <AbsoluteFill style={{ background: '#04070C' }}>
    <Loop durationInFrames={PLATE_FRAMES}>
      <OffthreadVideo src={staticFile(PLATE)} muted
        style={{ width: '100%', height: '100%', objectFit: 'cover',
          // 광고 원본 평균 밝기 48.7~51.3 (실측). 플레이트 자체를 올린다
          filter: 'brightness(2.15) saturate(0.92)' }} />
    </Loop>
    {/* 상단 스크림 — 카피가 헤이즈 위에서도 또렷하게 */}
    <AbsoluteFill style={{
      background: 'linear-gradient(180deg, rgba(4,8,16,0.55) 0%, rgba(4,8,16,0.16) 22%, rgba(4,8,16,0) 42%)',
    }} />
    {/* ★ 바닥 광 확장 — 플레이트의 바닥 풀이 가운데에만 좁다.
        실측: 중단 74.6 vs 최하단 26.0 으로 아래가 어두워 «방»이 아니라 «검은 판»으로 읽혔다.
        넓고 낮은 광원을 깔아 바닥면을 좌우로 이어준다. */}
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse 92% 26% at 50% 92%, rgba(150,186,232,0.30) 0%, rgba(120,156,206,0.14) 46%, rgba(0,0,0,0) 78%)',
    }} />
    {/* 바닥 앞쪽 앰버 바운스 — 플레이트의 엣지 라인을 좌우로 잇는다 */}
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse 96% 8% at 50% 74%, rgba(214,152,74,0.20) 0%, rgba(0,0,0,0) 72%)',
    }} />
    {/* 비네트 — 시선을 가운데로. 바닥을 죽이지 않게 약하게 */}
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse 88% 72% at 50% 50%, rgba(0,0,0,0) 52%, rgba(2,5,10,0.38) 100%)',
    }} />
  </AbsoluteFill>
);

// ── 마크 ────────────────────────────────────────────────────────────────────
const AppleMark: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.11 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.22 1.18-2.4 1.2-2.46-.03-.01-2.31-.89-2.33-3.53zM14.88 5.9c.61-.74 1.02-1.77.9-2.79-.88.04-1.94.58-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.59-1.23z" />
  </svg>
);

const PlayMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M3.6 2.3c-.25.26-.4.67-.4 1.2v17c0 .53.15.94.4 1.2l.09.08 9.53-9.53v-.22L3.69 2.5l-.09-.2z" fill="#00A0FF" />
    <path d="M16.4 15.44l-3.18-3.19v-.22l3.18-3.19.07.04 3.77 2.14c1.08.61 1.08 1.61 0 2.23l-3.77 2.14-.07.05z" fill="#FFBC00" />
    <path d="M16.47 15.39l-3.25-3.25-9.62 9.62c.36.38.94.42 1.6.05l11.27-6.42z" fill="#FF3A44" />
    <path d="M16.47 8.89L5.2 2.47c-.66-.37-1.24-.33-1.6.05l9.62 9.62 3.25-3.25z" fill="#00D46A" />
  </svg>
);

/** 클로드 마크 — 광선이 빙 돌아가며 밝아진다 (생각하는 중) */
const ClaudeMark: React.FC<{ size: number; local: number }> = ({ size, local }) => {
  const R = 50, cx = 50, cy = 50;
  const LEN = [1, 0.66, 0.86, 0.66, 1, 0.66, 0.86, 0.66, 1, 0.66, 0.86, 0.66];
  const breathe = 1 + 0.055 * Math.sin(local / 9);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
      style={{ transform: `scale(${breathe})`, filter: 'drop-shadow(0 0 14px rgba(217,119,87,0.55))' }}>
      {LEN.map((l, i) => {
        const ph = Math.sin(local / 5.2 - i * 0.52);
        const o = 0.55 + 0.45 * Math.max(0, ph);
        const grow = 1 + 0.14 * Math.max(0, ph);
        return (
          <rect key={i} x={cx - 3.6} y={cy - R * l * grow} width={7.2} height={R * l * grow} rx={3.6}
            fill={C.claude} opacity={o} transform={`rotate(${i * 30} ${cx} ${cy})`} />
        );
      })}
    </svg>
  );
};

const Bell: React.FC<{ size: number; color: string; stroke?: number }> = ({ size, color, stroke = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

/** 알림 시그니처 — 큰 종이 딸랑딸랑 + 링 파동 */
const BigBell: React.FC<{ local: number; dur: number }> = ({ local, dur }) => {
  const inP = interpolate(local, [0, 10], [0, 1],
    { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) });
  const outP = seg(local, dur - 10, dur);
  const o = inP * (1 - outP);
  const ring = Math.sin(local / 1.8) * Math.exp(-local / 22) * 18;
  return (
    <div style={{
      position: 'absolute', left: '50%', top: BODY_Y - 182, marginLeft: -76,
      width: 152, height: 152, opacity: o, transform: `scale(${inP})`,
    }}>
      {[0, 1].map((i) => {
        const p = ((local - i * 11) % 30) / 30;
        return p < 0 ? null : (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `3px solid ${C.accent}`, opacity: (1 - p) * 0.5 * o,
            transform: `scale(${1 + p * 1.15})`,
          }} />
        );
      })}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: C.accent,
        boxShadow: '0 16px 44px rgba(255,176,32,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `rotate(${ring}deg)`, transformOrigin: '50% 22%',
      }}>
        <Bell size={86} color={C.ink} stroke={2.1} />
      </div>
    </div>
  );
};

// ── 알림 배너 ───────────────────────────────────────────────────────────────
const NotificationCard: React.FC<{ title: string; body: string; local: number; dur: number }> = ({
  title, body, local, dur,
}) => {
  const inP = interpolate(local, [0, 13], [0, 1],
    { extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) });
  const outP = seg(local, dur - 10, dur);
  const y = interpolate(inP, [0, 1], [-130, 0]) - outP * 140;
  const o = Math.min(inP * 1.4, 1) * (1 - outP);
  return (
    <div style={{
      position: 'absolute', left: 11, right: 11, top: STATUS_H + 6,
      transform: `translateY(${y}px)`, opacity: o,
      background: 'rgba(28,34,46,0.93)', borderRadius: 20,
      border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 44px rgba(0,0,0,0.6)',
      padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <Img src={staticFile('app-icons/signum.png')} style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{ fontFamily, fontSize: 15, fontWeight: 800, color: 'rgba(226,236,250,0.72)', letterSpacing: '0.06em' }}>SIGNUM HQ</span>
          <span style={{ fontFamily, fontSize: 14, fontWeight: 600, color: 'rgba(226,236,250,0.5)' }}>now</span>
        </div>
        <div style={{ fontFamily, fontSize: 19, fontWeight: 900, color: '#fff' }}>{title}</div>
        <div style={{ fontFamily, fontSize: 16, fontWeight: 600, color: 'rgba(226,236,250,0.8)', lineHeight: 1.28, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
};

// ── 리프트아웃 · 콜아웃 · 터치 ──────────────────────────────────────────────
const LiftTile: React.FC<{
  src: string; box: Box; scroll: number; local: number; dur: number; color: string; label: string;
}> = ({ src, box, scroll, local, dur, color, label }) => {
  const inP = interpolate(local, [0, 13], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const outP = seg(local, dur - 8, dur);
  const p = inP * (1 - outP);
  const w = box.w * IMG_SCALE, h = box.h * IMG_SCALE;
  const x0 = PAD + box.x * IMG_SCALE;
  const y0 = PAD + STATUS_H + box.y * IMG_SCALE - scroll * IMG_SCALE;
  const wide = w > SCREEN_W * 0.6;
  const sc = 1 + p * (wide ? 0.58 : 1.15);
  const dx = p * (wide ? 0 : (box.x < 400 ? -104 : 104));
  const dy = p * (wide ? -66 : -132);
  return (
    <div style={{
      position: 'absolute', left: x0, top: y0, width: w, height: h,
      transform: `translate3d(${dx}px,${dy}px,${p * 200}px) scale(${sc})`,
      opacity: p, borderRadius: 13, border: `3px solid ${color}`,
      boxShadow: `0 26px 70px rgba(0,0,0,0.66), 0 0 34px ${color}66`, background: '#0A0F18',
    }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', width: SCREEN_W, display: 'block',
          left: -box.x * IMG_SCALE, top: -box.y * IMG_SCALE,
        }} />
      </div>
      <div style={{
        position: 'absolute', left: -3, top: -31, padding: '5px 12px', borderRadius: 7,
        background: color, color: C.ink, fontFamily, fontSize: 17, fontWeight: 900,
        letterSpacing: '0.07em', whiteSpace: 'nowrap',
      }}>{label}</div>
    </div>
  );
};

const Callout: React.FC<{ box: Box; scroll: number; local: number; color: string }> = ({
  box, scroll, local, color,
}) => {
  const pop = interpolate(local, [0, 9], [0.91, 1], { extrapolateRight: 'clamp', easing: ease });
  const blink = 0.62 + 0.38 * Math.sin(local / 3.6);
  const fade = interpolate(local, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute',
      left: box.x * IMG_SCALE, top: STATUS_H + box.y * IMG_SCALE - scroll * IMG_SCALE,
      width: box.w * IMG_SCALE, height: box.h * IMG_SCALE,
      border: `3px solid ${color}`, borderRadius: 11,
      boxShadow: `0 0 24px ${color}88`, opacity: fade * blink, transform: `scale(${pop})`,
    }} />
  );
};

const Touch: React.FC<{ local: number; dur: number }> = ({ local, dur }) => {
  const p = seg(local, 0, dur);
  const y = interpolate(p, [0, 1], [SCREEN_H * 0.72, SCREEN_H * 0.26], { easing: ease });
  const o = interpolate(p, [0, 0.12, 0.78, 1], [0, 0.95, 0.88, 0]);
  return (
    <div style={{
      position: 'absolute', left: SCREEN_W * 0.6, top: y,
      width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.10) 58%, rgba(255,255,255,0) 70%)',
      border: '3px solid rgba(255,255,255,0.6)', opacity: o,
    }} />
  );
};

// ── 폰 ──────────────────────────────────────────────────────────────────────
const StatusBar: React.FC = () => (
  <div style={{
    position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: STATUS_H,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 30px', color: '#EDEFF4', fontFamily, fontSize: 16, fontWeight: 700,
  }}>
    <span>9:41</span>
    <div style={{
      position: 'absolute', left: '50%', top: 9, width: 92, height: 27,
      marginLeft: -46, borderRadius: 14, background: '#000',
    }} />
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
      {[6, 9, 12, 15].map((h, i) => (
        <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: '#EDEFF4' }} />
      ))}
      <div style={{ width: 26, height: 14, borderRadius: 4, border: '2px solid #EDEFF4', marginLeft: 5, padding: 1.5 }}>
        <div style={{ width: '76%', height: '100%', borderRadius: 2, background: '#EDEFF4' }} />
      </div>
    </div>
  </div>
);

const Phone: React.FC<{
  rotY: number; rotX: number; lift: number; scale: number; dx?: number; opacity?: number;
  screen: React.ReactNode; onScreen?: React.ReactNode; overlay?: React.ReactNode;
}> = ({ rotY, rotX, lift, scale, dx = 0, opacity = 1, screen, onScreen, overlay }) => (
  <div style={{
    position: 'absolute', left: BODY_X + dx, top: BODY_Y + lift, width: BODY_W, height: BODY_H,
    opacity,
    transform: `perspective(2000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`,
    transformStyle: 'preserve-3d',
  }}>
    <div style={{
      position: 'absolute', left: -56, top: BODY_H - 28, width: BODY_W + 112, height: 150,
      borderRadius: '50%', background: 'rgba(2,4,9,0.62)', filter: 'blur(40px)',
    }} />
    <div style={{
      position: 'absolute', inset: 0, borderRadius: R_BODY,
      background: 'linear-gradient(102deg,#E6ECF6 0%,#AAB7C9 20%,#68758A 50%,#9AA8BC 74%,#DCE4F0 100%)',
      boxShadow: '0 34px 80px rgba(0,0,0,0.55)',
    }} />
    <div style={{
      position: 'absolute', inset: METAL - 1, borderRadius: R_BODY - METAL + 1,
      background: '#04050A', boxShadow: 'inset 0 0 6px rgba(0,0,0,0.9)',
    }} />
    {[[184, 38], [248, 74], [336, 74]].map(([t, h], i) => (
      <div key={i} style={{
        position: 'absolute', left: -4, top: t, width: 5, height: h,
        borderRadius: 2.5, background: 'linear-gradient(90deg,#DAE3F0,#69768A)',
      }} />
    ))}
    <div style={{
      position: 'absolute', right: -4, top: 292, width: 5, height: 112,
      borderRadius: 2.5, background: 'linear-gradient(270deg,#DAE3F0,#69768A)',
    }} />
    <div style={{
      position: 'absolute', left: PAD, top: PAD, width: SCREEN_W, height: SCREEN_H,
      borderRadius: R_SCREEN, overflow: 'hidden', background: '#070A10',
    }}>
      {screen}
      <StatusBar />
      {onScreen}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(128deg, rgba(226,238,255,0.14) 0%, rgba(226,238,255,0.04) 25%, rgba(255,255,255,0) 46%)',
      }} />
    </div>
    {overlay}
  </div>
);

// ── 카피 · 자막 ─────────────────────────────────────────────────────────────
type BeatIcon = 'bell' | 'claude' | null;

const Label: React.FC<{ kicker: string; title: string; local: number; dur: number; icon?: BeatIcon }> = ({
  kicker, title, local, dur, icon,
}) => {
  const inP = seg(local, 0, 8);
  const outP = seg(local, dur - 6, dur);
  const o = Math.min(inP, 1 - outP);
  const y = interpolate(inP, [0, 1], [26, 0], { easing: ease }) - outP * 14;
  return (
    <div style={{
      position: 'absolute', left: 70, right: 70, top: 128,
      opacity: o, transform: `translateY(${y}px)`, fontFamily,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 11,
        padding: '8px 18px', borderRadius: 8, background: C.accent,
        color: C.ink, fontSize: 24, fontWeight: 900, letterSpacing: '0.1em', marginBottom: 14,
      }}>
        {icon === 'bell' && <Bell size={26} color={C.ink} />}
        {kicker}
      </div>
      <div style={{
        fontSize: 72, lineHeight: 1.02, fontWeight: 900, color: C.text,
        letterSpacing: '-0.035em', whiteSpace: 'pre-line',
      }}>{title}</div>
      {icon === 'claude' && <ClaudeBadge local={local} />}
    </div>
  );
};

const ClaudeBadge: React.FC<{ local: number }> = ({ local }) => {
  const p = seg(local, 8, 22);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 18, marginTop: 24,
      padding: '14px 32px 14px 20px', borderRadius: 999,
      background: 'rgba(217,119,87,0.17)', border: `2.5px solid ${C.claude}99`,
      opacity: p, transform: `translateY(${(1 - p) * 14}px)`,
    }}>
      <ClaudeMark size={68} local={local} />
      <span style={{ fontFamily, fontSize: 34, fontWeight: 900, color: '#F6DECD', letterSpacing: '0.03em' }}>
        POWERED BY CLAUDE
      </span>
    </div>
  );
};

/**
 * AppBadge — 폰 위에 붙는 «어느 앱인가» 라벨.
 *   한쪽에만 붙이면 나머지가 무엇인지 추측 대상이 된다(대표 지적, 2026-08-20).
 *   양쪽에 붙이고 «테두리 색»을 달리해 두 개의 다른 제품임을 즉시 읽히게 한다.
 */
const AppBadge: React.FC<{
  icon: string; name: string; tint: string; left: number; top: number; opacity: number;
}> = ({ icon, name, tint, left, top, opacity }) => (
  <div style={{
    position: 'absolute', left, top, transform: 'translateX(-50%)', opacity,
    display: 'flex', alignItems: 'center', gap: 11,
    padding: '7px 15px 7px 8px', borderRadius: 999,
    background: 'rgba(8,12,20,0.86)', border: `2px solid ${tint}`,
    whiteSpace: 'nowrap', boxShadow: `0 8px 26px rgba(0,0,0,0.5)`,
  }}>
    <Img src={staticFile(icon)} style={{ width: 33, height: 33, borderRadius: 9 }} />
    <span style={{
      fontFamily, fontSize: 22, fontWeight: 900, color: '#F2F7FE', letterSpacing: '0.03em',
    }}>{name}</span>
  </div>
);

/** 자막 — 나레이션과 «같은 문자열». 폰 아래, 고지 위 */
const Caption: React.FC<{ text: string; local: number; dur: number }> = ({ text, local, dur }) => {
  const o = Math.min(seg(local, 0, 5), 1 - seg(local, dur - 5, dur));
  return (
    <div style={{
      // ★ 2026-08-20 — 1640 은 자막띠 86.5~88.3% 로 쇼츠 UI 를 침범했다(실측).
      //   레퍼런스 밴드(DTW 76~80%)로 내린다.
      position: 'absolute', left: 88, right: 88, top: 1382,
      display: 'flex', justifyContent: 'center', opacity: o,
    }}>
      <div style={{
        background: 'rgba(6,10,18,0.86)', borderRadius: 14, padding: '13px 22px',
        fontFamily, fontSize: 38, lineHeight: 1.24, fontWeight: 800, color: '#fff',
        textAlign: 'center', letterSpacing: '-0.015em',
        border: '1px solid rgba(255,255,255,0.09)',
      }}>{text}</div>
    </div>
  );
};

// ── 스토어 배지 ─────────────────────────────────────────────────────────────
const StoreBadge: React.FC<{ kind: 'apple' | 'play' }> = ({ kind }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 22px', borderRadius: 13, background: '#000',
    border: '1.5px solid rgba(255,255,255,0.34)', fontFamily,
  }}>
    {kind === 'apple' ? <AppleMark size={38} color="#fff" /> : <PlayMark size={36} />}
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
        {kind === 'apple' ? 'Download on the' : 'GET IT ON'}
      </span>
      <span style={{ fontSize: 25, fontWeight: 800, color: '#fff' }}>
        {kind === 'apple' ? 'App Store' : 'Google Play'}
      </span>
    </div>
  </div>
);

/** 엔드카드 — 로고 → FREE → 폰 → 스토어. FREE 가 폰 «위»에 온다 */
const EndCard: React.FC<{ local: number; withUC: boolean }> = ({ local, withUC }) => {
  const p = seg(local, 2, 16);
  const logoP = interpolate(seg(local, 0, 18), [0, 1], [0.74, 1], { easing: Easing.out(Easing.back(1.6)) });
  // FREE 는 «꽝» 하고 박힌다 — 임팩트음과 같은 프레임
  const hit = seg(local, 14, 15);
  const freeS = interpolate(seg(local, 14, 30), [0, 1], [1.5, 1], { easing: Easing.out(Easing.cubic) });
  const freeO = seg(local, 13, 17);
  const shock = (1 - seg(local, 14, 26)) * hit;
  return (
    <>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 110,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        opacity: p, transform: `scale(${logoP})`, fontFamily,
      }}>
        <Img src={staticFile('app-icons/signum.png')} style={{
          width: 150, height: 150, borderRadius: 36,
          boxShadow: '0 26px 64px rgba(0,0,0,0.6), 0 0 44px rgba(58,221,242,0.22)',
        }} />
        <div style={{ fontSize: 74, fontWeight: 900, color: C.text, letterSpacing: '-0.035em', marginTop: 18 }}>
          SIGNUM HQ
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.dim, marginTop: 6 }}>
          Institutional options data · AI briefings · Alerts
        </div>
      </div>

      {/* ★ FREE — 폰 위. 흰 판에 잉크 글자 (초록보다 대비가 크고 촌스럽지 않다) */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 466,
        display: 'flex', justifyContent: 'center', opacity: freeO,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -14, borderRadius: 26, border: '5px solid #fff',
            opacity: shock * 0.8, transform: `scale(${1 + (1 - freeS) * 0.5})`,
          }} />
          <div style={{
            padding: '10px 74px', borderRadius: 20, background: '#fff', color: C.ink,
            fontFamily, fontSize: 128, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1.06,
            transform: `scale(${freeS})`, boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          }}>FREE</div>
        </div>
      </div>

      <div style={{
        position: 'absolute', left: 0, right: 0, top: 1496,
        display: 'flex', justifyContent: 'center', gap: 16,
        opacity: p, transform: `translateY(${(1 - p) * 24}px)`,
      }}>
        <StoreBadge kind="apple" />
        <StoreBadge kind="play" />
      </div>

      {/* 두 앱이 «별개 제품»이고 만든 곳이 같다는 것을 한 줄로 못박는다.
          단독 판(solo)에는 앱이 하나뿐이라 이 줄을 쓰지 않는다. */}
      {withUC && <div style={{
        position: 'absolute', left: 0, right: 0, top: 1622, textAlign: 'center',
        fontFamily, fontSize: 23, fontWeight: 700, color: 'rgba(198,216,240,0.62)',
        letterSpacing: '0.03em', opacity: p,
      }}>
        Two separate apps from SIGNUM HQ, LLC
      </div>}
    </>
  );
};

// ── 화면 세그먼트 ───────────────────────────────────────────────────────────
type Segment = { src: string; from: number; to: number; scroll: (f: number) => number };
const SRC_DASH = 'ad/tall-dash.png';
const SRC_CMD = 'ad/tall-command-overview.png';
const SRC_WHALE = 'ad/tall-whale.png';
const SRC_AI = 'ad/tall-command-ai.png';
const SRC_UC = 'ad/tall-undercurrent.png';   // 자매 앱 — 실캡처

/** 화면 세그먼트 — 시작 프레임이 판(solo/duo)마다 달라서 «함수»로 만든다 */
function buildSegments(S_PAIN: number, S_WHALE: number, S_AI: number,
  S_UC: number, CTA_FROM: number, DUR: number): Segment[] {
  return [
  {
    src: SRC_DASH, from: 0, to: S_PAIN,
    scroll: (f) => interpolate(f, [0, 40, 56, S_PAIN], [0, 60, 220, 860],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }),
  },
  {
    src: SRC_CMD, from: S_PAIN, to: S_WHALE,
    scroll: (f) => interpolate(f, [S_PAIN, S_WHALE], [214, 288],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  },
  {
    src: SRC_WHALE, from: S_WHALE, to: S_AI,
    scroll: (f) => interpolate(f, [S_WHALE, S_WHALE + 26, S_WHALE + 78, S_WHALE + 104],
      [1300, 1420, 1420, 1700],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }),
  },
  {
    src: SRC_AI, from: S_AI, to: S_UC,
    scroll: (f) => interpolate(f, [S_AI, S_AI + 24, S_AI + 74, S_UC],
      [1120, 1232, 1292, 1860],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }),
  },
  {
    // 마지막은 Command 페이지로 마무리
    src: SRC_CMD, from: S_UC, to: DUR,
    scroll: (f) => interpolate(f, [S_UC, DUR], [230, 150],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease }),
  },
  ];
}
const TR = 8;

const BEATS: { id: string; kicker: string; title: string; icon?: BeatIcon }[] = [
  { id: 'open', kicker: 'SIGNUM HQ', title: 'EVERY SIGNAL.\nONE SCREEN.' },
  { id: 'morn', kicker: 'MORNING BRIEFING', title: 'STRAIGHT TO\nYOUR PHONE', icon: 'bell' },
  { id: 'pain', kicker: 'MAX PAIN', title: 'WHERE PRICE\nGETS PULLED' },
  { id: 'gamma', kicker: 'GAMMA FLIP', title: 'WHERE DEALERS\nFLIP SIDES' },
  { id: 'whale', kicker: 'WHALE FLOW', title: 'SEE THE BIG\nMONEY MOVE' },
  { id: 'dark', kicker: 'DARK POOL', title: 'WHERE SIZE\nHIDES' },
  { id: 'ai', kicker: 'AI DEEP ANALYSIS', title: 'THE WHOLE BOOK,\nONE LINE', icon: 'claude' },
  { id: 'close', kicker: 'CLOSING BRIEFING', title: 'EVERY DAY,\nWHEN IT SHUTS', icon: 'bell' },
  { id: 'uc', kicker: 'ALSO FROM SIGNUM HQ', title: 'UNDERCURRENT' },
];

const LIFTS = [
  { at: 'pain', off: 8, dur: 60, segIdx: 1, box: { x: 93, y: 749, w: 325, h: 227 }, color: C.accent, label: 'MAX PAIN' },
  { at: 'gamma', off: 8, dur: 70, segIdx: 1, box: { x: 440, y: 749, w: 325, h: 227 }, color: C.cyan, label: 'GAMMA FLIP' },
  { at: 'whale', off: 8, dur: 74, segIdx: 2, box: { x: 93, y: 1685, w: 499, h: 158 }, color: C.green, label: 'WHALE OPTIONS' },
  { at: 'dark', off: 8, dur: 52, segIdx: 2, box: { x: 93, y: 1986, w: 325, h: 201 }, color: C.violet, label: 'DARK POOL' },
];
const RINGS = [{ at: 'ai', off: 10, dur: 56, segIdx: 3, box: { x: 48, y: 1519, w: 1111, h: 135 }, color: C.claude }];
const NOTIFS = [
  { at: 'morn', off: 6, dur: 54, title: 'Morning Briefing is ready', body: 'Futures, macro and risk — before the bell.' },
  { at: 'close', off: 6, dur: 50, title: 'Closing Briefing is ready', body: 'What moved, what hid, and what the AI read.' },
];
const BELLS = [{ at: 'morn', off: 2, dur: 58 }, { at: 'close', off: 2, dur: 52 }];
const SWIPES = [{ at: 'open', off: 22, dur: 18 }, { at: 'ai', off: 62, dur: 18 }];

// ── 본체 ────────────────────────────────────────────────────────────────────
/** 컷 플래시 — 광고가 «한 컷»이면 컷/분 0 이 된다. 비트마다 컷을 만든다 */
const AdCut: React.FC<{ at: number }> = ({ at: a }) => {
  const f = useCurrentFrame();
  const o = f >= a - 1 && f < a + 4 ? 0.36 * (1 - (f - a + 1) / 5) : 0;
  return o > 0 ? <AbsoluteFill style={{ background: '#EAF3FF', opacity: o }} /> : null;
};

export const AppAd: React.FC<{ withUC?: boolean }> = ({ withUC = true }) => {
  const f = useCurrentFrame();
  const { cuts: CUTS, ctaFrom: CTA_FROM, duration: APPAD_DUR } = withUC ? DUO : SOLO;
  const at = (id: string) => CUTS.find((c) => c.id === id) ?? CUTS[CUTS.length - 1];
  const S_PAIN = at('pain').from, S_WHALE = at('whale').from;
  const S_AI = at('ai').from, S_UC = withUC ? at('uc').from : CTA_FROM;
  const SEGMENTS = buildSegments(S_PAIN, S_WHALE, S_AI, S_UC, CTA_FROM, APPAD_DUR);

  const rotY = interpolate(f, [0, 30, S_PAIN, S_WHALE, S_AI, CTA_FROM, APPAD_DURATION],
    [-9, -3, 2, -2, 2, -1, -3], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
  const rotX = interpolate(f, [0, 30, APPAD_DURATION], [5, 1.5, 2.5], { extrapolateRight: 'clamp' });

  const rise = interpolate(f, [0, 26], [190, 0], { extrapolateRight: 'clamp', easing: ease });
  const bob = Math.sin(f / 42) * 6;
  const punch = CUTS.slice(1).reduce((acc, c) =>
    acc + interpolate(f, [c.from, c.from + 4, c.from + 13], [0, 0.022, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), 0);
  // ★ 자매 앱 소개 — 메인 폰이 왼쪽으로 비켜서고 Undercurrent 폰이 오른쪽에서 들어온다.
  //   CTA 직전에 빠진다 — 마지막 화면은 SIGNUM 하나로 끝나야 메시지가 흐려지지 않는다.
  // ★ 자매 앱 — 등장 후 «끝까지 남는다». CTA 에서는 시그넘 폰 뒤로 물러나 살짝 걸친다.
  const ucIn = withUC ? seg(f, S_UC, S_UC + 20) : 0;
  const ctaP = seg(f, CTA_FROM, CTA_FROM + 26);
  const pairP = ucIn * (1 - ctaP);                    // 둘이 «나란히» 선 정도
  const ucDx = (1 - ctaP) * interpolate(ucIn, [0, 1], [540, 192]) + ctaP * 232;
  const ucScale0 = -0.2 * ucIn + 0.12 * ctaP;         // CTA 에선 덜 줄여 화면이 보이게
  const ucLift0 = 34 - 54 * ctaP;                     // 위로 올릴수록 «멀리» 있는 것으로 읽힌다
  const badgeP = seg(f, S_UC + 26, S_UC + 44);
  const lift = rise + bob + ctaP * 62;
  const scale = interpolate(f, [0, 24], [0.94, 1], { extrapolateRight: 'clamp', easing: ease })
    + punch - ctaP * 0.38;

  return (
    <AbsoluteFill style={{ background: '#060A12' }}>
      <Studio />

      {/* ── 오디오 ── */}
      {CUTS.slice(1).map((c) => <AdCut key={`x-${c.id}`} at={c.from} />)}
      {CUTS.map((c) => (
        <Sequence key={`a-${c.id}`} from={c.from} durationInFrames={c.len + 12}>
          <Audio src={staticFile(`${VOICE_AD.base}/${c.id}.mp3`)} />
        </Sequence>
      ))}
      <Sequence from={CTA_FROM + 6} durationInFrames={CTA_LEN}>
        <Audio src={staticFile(`${VOICE_AD.base}/free.mp3`)} />
      </Sequence>
      {BELLS.map((b, i) => (
        <Sequence key={`s-${i}`} from={at(b.at).from + b.off} durationInFrames={46}>
          <Audio src={staticFile(`${VOICE_AD.base}/sfx-bell.mp3`)} volume={0.5} />
        </Sequence>
      ))}
      <Sequence from={CTA_FROM + 14} durationInFrames={30}>
        <Audio src={staticFile(`${VOICE_AD.base}/sfx-impact.mp3`)} volume={0.62} />
      </Sequence>

      {/* 자매 앱 폰 — «메인 폰보다 먼저» 그려 뒤에 놓는다 */}
      {ucIn > 0.012 && (
        <Phone
          rotY={7 - 5 * pairP} rotX={rotX + 0.5} lift={lift + ucLift0}
          dx={ucDx} scale={scale + ucScale0} opacity={ucIn}
          screen={
            <Img src={staticFile(SRC_UC)} style={{
              position: 'absolute', left: 0, width: SCREEN_W, display: 'block',
              top: STATUS_H - interpolate(f, [S_UC, APPAD_DURATION], [30, 620],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * IMG_SCALE,
            }} />
          }
        />
      )}

      {ucIn > 0.012 && badgeP > 0.01 && (
        <>
          <AppBadge
            icon="app-icons/signum.png" name="SIGNUM HQ" tint="rgba(58,221,242,0.85)"
            left={BODY_X + -192 * pairP + BODY_W / 2 - 26 * (1 - pairP)}
            top={BODY_Y + lift + (BODY_H * (1 - (scale - 0.2 * pairP))) / 2 - 70}
            opacity={badgeP}
          />
          <AppBadge
            icon="app-icons/uc.png" name="UNDERCURRENT" tint="rgba(217,90,32,0.9)"
            left={BODY_X + ucDx + BODY_W / 2}
            top={BODY_Y + lift + ucLift0 + (BODY_H * (1 - (scale + ucScale0))) / 2 - 70}
            opacity={badgeP}
          />
        </>
      )}

      <Phone
        rotY={rotY - 4 * pairP} rotX={rotX} lift={lift} dx={-192 * pairP}
        scale={scale - 0.2 * pairP}
        screen={SEGMENTS.map((s, i) => {
          if (f < s.from - TR || f >= s.to) return null;
          const inX = i === 0 ? 0
            : interpolate(f, [s.from - TR, s.from], [SCREEN_W, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
          const next = SEGMENTS[i + 1];
          const outX = next
            ? interpolate(f, [next.from - TR, next.from], [0, -SCREEN_W],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
            : 0;
          const scroll = s.scroll(f);
          return (
            <div key={`${s.src}-${i}`} style={{
              position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SCREEN_H,
              transform: `translateX(${inX + outX}px)`,
            }}>
              <Img src={staticFile(s.src)} style={{
                position: 'absolute', left: 0, top: STATUS_H - scroll * IMG_SCALE,
                width: SCREEN_W, display: 'block',
              }} />
              {RINGS.filter((r) => r.segIdx === i && f >= at(r.at).from + r.off
                && f < at(r.at).from + r.off + r.dur).map((r, k) => (
                  <Callout key={k} box={r.box} scroll={scroll}
                    local={f - (at(r.at).from + r.off)} color={r.color} />
                ))}
            </div>
          );
        })}
        onScreen={NOTIFS.filter((n) => f >= at(n.at).from + n.off && f < at(n.at).from + n.off + n.dur)
          .map((n, i) => (
            <NotificationCard key={i} title={n.title} body={n.body}
              local={f - (at(n.at).from + n.off)} dur={n.dur} />
          ))}
        overlay={
          <>
            {LIFTS.filter((l) => f >= at(l.at).from + l.off && f < at(l.at).from + l.off + l.dur)
              .map((l, k) => (
                <LiftTile key={k} src={SEGMENTS[l.segIdx].src} box={l.box}
                  scroll={SEGMENTS[l.segIdx].scroll(f)}
                  local={f - (at(l.at).from + l.off)} dur={l.dur} color={l.color} label={l.label} />
              ))}
            {SWIPES.filter((s) => f >= at(s.at).from + s.off && f < at(s.at).from + s.off + s.dur)
              .map((s, i) => (
                <div key={i} style={{ position: 'absolute', left: PAD, top: PAD, width: SCREEN_W, height: SCREEN_H }}>
                  <Touch local={f - (at(s.at).from + s.off)} dur={s.dur} />
                </div>
              ))}
          </>
        }
      />

      {BELLS.filter((b) => f >= at(b.at).from + b.off && f < at(b.at).from + b.off + b.dur)
        .map((b, i) => <BigBell key={i} local={f - (at(b.at).from + b.off)} dur={b.dur} />)}

      {BEATS.filter((b) => CUTS.some((c) => c.id === b.id)).map((b) => {
        const c = at(b.id);
        return (
          <Sequence key={b.id} from={c.from} durationInFrames={c.len}>
            <BeatLabel kicker={b.kicker} title={b.title} icon={b.icon} dur={c.len} />
            <CaptionWrap text={c.text} dur={c.len} />
          </Sequence>
        );
      })}

      <Sequence from={CTA_FROM}>
        <EndCardWrap withUC={withUC} />
      </Sequence>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center',
        fontFamily, fontSize: 19, fontWeight: 600, color: 'rgba(196,214,238,0.5)',
      }}>
        Informational only. Not investment advice.
      </div>
    </AbsoluteFill>
  );
};

const BeatLabel: React.FC<{ kicker: string; title: string; icon?: BeatIcon; dur: number }> = (p) => (
  <Label kicker={p.kicker} title={p.title} local={useCurrentFrame()} dur={p.dur} icon={p.icon} />
);
const CaptionWrap: React.FC<{ text: string; dur: number }> = ({ text, dur }) => (
  <Caption text={text} local={useCurrentFrame()} dur={dur} />
);
const EndCardWrap: React.FC<{ withUC: boolean }> = ({ withUC }) =>
  <EndCard local={useCurrentFrame()} withUC={withUC} />;

// ════════════════════════════════════════════════════════════════════════════
// AppAdTag — 쇼츠 «뒤에 붙이는» 축약본 (8초 안쪽)
// ----------------------------------------------------------------------------
// 왜 짧아야 하는가 (실측 근거)
//   시청자는 흥미를 잃는 «절대 시점»에 나간다. 뒤에 뭘 붙여도 시청 «초»는 그대로인데
//   분모(총 길이)만 커져서 평균 조회율이 깎인다. 09_AMD 20.7초 · 60% 가정 기준:
//     +3초 → 52%  ·  +5초 → 48%  ·  +10초 → 41%  ·  +24초(완품) → 28%
//   평균 조회율은 쇼츠 배포의 주 신호다. 그래서 «가장 짧게, 할 말만» 한다.
//
// 담는 것 3개뿐 — 기관급 데이터 / 알림 / 무료.
// 완품과 같은 부품(폰·알림·엔드카드)을 재사용하므로 디자인이 갈라지지 않는다.
// ════════════════════════════════════════════════════════════════════════════
const TAG_ORDER = ['tag1', 'tag2', 'tag3'] as const;
const TAG_GAP = F(0.12);
const TAG_CUTS: { id: string; from: number; len: number; text: string }[] = [];
{
  let t = 0;
  for (const id of TAG_ORDER) {
    const len = F(V[id].sec) + TAG_GAP;
    TAG_CUTS.push({ id, from: t, len, text: V[id].text });
    t += len;
  }
}
const TAG_CTA_FROM = TAG_CUTS[1].from + TAG_CUTS[1].len;   // 세 번째 줄부터 엔드카드
export const APPAD_TAG_DURATION = TAG_CUTS[2].from + TAG_CUTS[2].len + F(1.1);

export const AppAdTag: React.FC = () => {
  const f = useCurrentFrame();
  const tAt = (id: string) => TAG_CUTS.find((c) => c.id === id)!;

  const rise = interpolate(f, [0, 16], [150, 0], { extrapolateRight: 'clamp', easing: ease });
  const bob = Math.sin(f / 40) * 5;
  const ctaP = seg(f, TAG_CTA_FROM, TAG_CTA_FROM + 18);
  const lift = rise + bob + ctaP * 62;
  const scale = interpolate(f, [0, 14], [0.94, 1], { extrapolateRight: 'clamp', easing: ease })
    - ctaP * 0.38;
  const rotY = interpolate(f, [0, 20, TAG_CTA_FROM], [-8, -2, 0], { extrapolateRight: 'clamp' });

  const b2 = tAt('tag2').from;
  const scroll = interpolate(f, [0, tAt('tag1').len, TAG_CTA_FROM], [230, 300, 180],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

  return (
    <AbsoluteFill style={{ background: '#060A12' }}>
      <Studio />

      {TAG_CUTS.map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={c.len + 10}>
          <Audio src={staticFile(`${VOICE_AD.base}/${c.id}.mp3`)} />
        </Sequence>
      ))}
      <Sequence from={b2 + 2} durationInFrames={40}>
        <Audio src={staticFile(`${VOICE_AD.base}/sfx-bell.mp3`)} volume={0.5} />
      </Sequence>
      <Sequence from={TAG_CTA_FROM + 8} durationInFrames={26}>
        <Audio src={staticFile(`${VOICE_AD.base}/sfx-impact.mp3`)} volume={0.6} />
      </Sequence>

      <Phone
        rotY={rotY} rotX={2} lift={lift} scale={scale}
        screen={
          <Img src={staticFile(SRC_CMD)} style={{
            position: 'absolute', left: 0, top: STATUS_H - scroll * IMG_SCALE,
            width: SCREEN_W, display: 'block',
          }} />
        }
        onScreen={f >= b2 + 4 && f < b2 + 46
          ? <NotificationCard title="Morning Briefing is ready"
              body="Futures, macro and risk — before the bell." local={f - (b2 + 4)} dur={42} />
          : null}
        overlay={
          <>
            {f >= 10 && f < 62 && (
              <LiftTile src={SRC_CMD} box={{ x: 93, y: 749, w: 325, h: 227 }} scroll={scroll}
                local={f - 10} dur={52} color={C.accent} label="MAX PAIN" />
            )}
          </>
        }
      />

      {f >= b2 && f < b2 + 50 && <BigBell local={f - b2} dur={50} />}

      {TAG_CUTS.slice(0, 2).map((c) => (
        <Sequence key={`cap-${c.id}`} from={c.from} durationInFrames={c.len}>
          <CaptionWrap text={c.text} dur={c.len} />
        </Sequence>
      ))}

      <Sequence from={TAG_CTA_FROM}>
        <EndCardWrap withUC={false} />
      </Sequence>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center',
        fontFamily, fontSize: 19, fontWeight: 600, color: 'rgba(196,214,238,0.5)',
      }}>
        Informational only. Not investment advice.
      </div>
    </AbsoluteFill>
  );
};
