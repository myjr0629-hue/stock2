// ============================================================================
// kit/PhoneAd — 「공중에 뜬 폰 + 살아 움직이는 차트 + FREE」 앱 광고
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-19), 기존 AdPromo 를 보고:
//   "고래·트레이더·폰글로우 앞 컷들은 필요 없다. 광고로 쓸 수 없는 수준이다."
//   "주가가 «막 움직이는» 화면을 배경으로, 공중에 폰 화면을 띄우고,
//    맥스페인이나 감마가 «무엇인지» 코멘트를 하고,
//    「이 앱 쓰면 free 로 이런 걸 볼 수 있구나」 하는 느낌이 있어야 한다."
//   "어두우면 고급스럽다는 편견을 버려라." ← 세 번째 지적. 이 파일은 «밝은 판»이 기본이다.
//
// 설계 3원칙
//  1) 배경은 «가만히 있지 않는다» — 실제 가격 곡선이 계속 흐르고 눈금이 지나간다.
//  2) 폰은 «공중에 뜬다» — 큰 그림자 + 미세 회전 + 부유. 화면 안은 «실캡처»만.
//  3) 지표는 «이름 + 한 줄 정의»를 같이 준다. 이름만 던지면 광고가 아니라 암호다.
//
// ⚠️ 앱 화면은 실캡처만 (endcards.ts §8). AI 가 그린 UI 는 컴플라이언스 사고다.
// ⚠️ 수치 약속·수익 약속 없음. 「무엇을 보여주는 도구인가」만 말한다.
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();
const W = 1080, H = 1920, FPS = 30;

/** 밝은 판 — 대표 지시 반영 */
const SKY_TOP = '#F4F7FC';
const SKY_MID = '#E6EDF7';
const SKY_BOT = '#D3DEEC';
const INK = '#0B1220';
const GREEN = '#0FA968';
const AMBER = '#FFB020';

export interface AdScene {
  /** 폰 안 캡처 (public 기준) */
  shot: string;
  /** 화면에서 «확대할 영역» — 0~1 비율. 없으면 전체 */
  focus?: { x: number; y: number; w: number };
  /** 지표 이름 (대문자, 크게) */
  term: string;
  /** 그게 «무엇인지» 한 줄 — 이게 떠먹여주는 부분이다 */
  define: string;
  sec: number;
}

export interface PhoneAdProps {
  /** 배경에 흐를 «실제» 가격 시계열 */
  series: number[];
  scenes: AdScene[];
  /** 마지막 FREE 카드 길이(초) */
  ctaSec: number;
  storeLine: string;
  disclaimer: string;
}

// ── 배경: 살아 움직이는 가격 차트 (밝은 판) ─────────────────────────────────
const LiveChart: React.FC<{ series: number[]; dur: number }> = ({ series, dur }) => {
  const f = useCurrentFrame();
  const s = series.length >= 8 ? series : [1, 2, 3, 4, 5, 6, 7, 8];
  const CW = W * 2.2, CH = H;
  const lo = Math.min(...s), hi = Math.max(...s), sp = hi - lo || 1;
  const pts = s.map((x, i) => [
    (i / (s.length - 1)) * CW,
    CH - ((x - lo) / sp) * (CH * 0.52) - CH * 0.24,
  ] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} ${CW},${CH} 0,${CH}`;
  // 계속 흐른다 — 「가만히 있지 않는다」
  const pan = interpolate(f, [0, dur], [0, -(CW - W)], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${SKY_TOP} 0%, ${SKY_MID} 46%, ${SKY_BOT} 100%)` }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {[...Array(14)].map((_, k) => (
          <line key={k} x1="0" x2={W} y1={(k + 1) * (H / 15)} y2={(k + 1) * (H / 15)}
            stroke="rgba(11,18,32,0.07)" strokeWidth="2" />
        ))}
      </svg>
      <svg width={CW} height={CH} style={{ position: 'absolute', top: 0, left: 0, transform: `translateX(${pan}px)` }}>
        <defs>
          <linearGradient id="pa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.26" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#pa)" />
        <polyline points={line} fill="none" stroke={GREEN} strokeWidth="22" opacity="0.16"
          strokeLinejoin="round" style={{ filter: 'blur(16px)' }} />
        <polyline points={line} fill="none" stroke={GREEN} strokeWidth="10"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </AbsoluteFill>
  );
};

// ── 공중에 뜬 폰 ────────────────────────────────────────────────────────────
const FloatingPhone: React.FC<{ shot: string; focus?: AdScene['focus']; dur: number }> = ({ shot, focus, dur }) => {
  const f = useCurrentFrame();
  const inP = interpolate(f, [0, 14], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const bob = Math.sin((f / FPS) * 1.5) * 9;                 // 부유
  const rotY = interpolate(f, [0, dur], [-9, 5]);            // 단일 무브
  const scale = interpolate(inP, [0, 1], [0.86, 1]);

  // 상단 문구(TermCard)와 «겹치지 않게» 줄이고 내린다 — 1차 렌더에서 겹쳤다
  const PH_W = 500, PH_H = 1030, BEZ = 14;
  const DROP = 130;
  const SC_W = PH_W - BEZ * 2, SC_H = PH_H - BEZ * 2;
  // focus 가 있으면 그 영역을 화면에 «꽉» 채운다
  const z = focus ? 1 / focus.w : 1;
  const ox = focus ? -focus.x * SC_W * z : 0;
  const oy = focus ? -focus.y * (SC_W * z * (2622 / 1206)) : 0;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', perspective: 1600 }}>
      <div style={{
        width: PH_W, height: PH_H, borderRadius: 56, background: '#0A0E16',
        padding: BEZ, opacity: inP,
        transform: `translateY(${DROP + (1 - inP) * 40 + bob}px) scale(${scale}) rotateY(${rotY}deg)`,
        boxShadow: '0 60px 130px rgba(11,18,32,0.42), 0 12px 34px rgba(11,18,32,0.28)',
        border: '3px solid rgba(255,255,255,0.55)',
      }}>
        <div style={{ width: SC_W, height: SC_H, borderRadius: 44, overflow: 'hidden', position: 'relative', background: '#070B12' }}>
          <Img src={staticFile(shot)} style={{
            position: 'absolute', top: 0, left: 0,
            width: SC_W * z, transform: `translate(${ox}px, ${oy}px)`,
          }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 지표 이름 + 한 줄 정의 ──────────────────────────────────────────────────
const TermCard: React.FC<{ term: string; define: string }> = ({ term, define }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [3, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 44, right: 44, top: 150, opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>
        <div style={{
          display: 'inline-block', background: AMBER, color: INK, borderRadius: 14,
          padding: '10px 24px 16px', fontFamily, fontSize: 68, fontWeight: 900,
          letterSpacing: '-0.03em', boxShadow: '0 16px 44px rgba(11,18,32,0.28)',
        }}>{term}</div>
        <div style={{
          marginTop: 12, fontFamily, fontSize: 37, lineHeight: 1.22, fontWeight: 800,
          color: INK, maxWidth: 940, textShadow: '0 2px 10px rgba(255,255,255,0.85)',
        }}>{define}</div>
      </div>
    </AbsoluteFill>
  );
};

// ── FREE 카드 ───────────────────────────────────────────────────────────────
const FreeCard: React.FC<{ storeLine: string }> = ({ storeLine }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pop = interpolate(f, [6, 22], [0.82, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: a }}>
      <Img src={staticFile('app-icons/signum.png')} style={{
        width: 176, height: 176, borderRadius: 42, marginBottom: 26,
        boxShadow: '0 26px 60px rgba(11,18,32,0.34)',
      }} />
      <div style={{ fontFamily, fontSize: 62, fontWeight: 900, color: INK, letterSpacing: '-0.03em' }}>SIGNUM HQ</div>
      <div style={{ fontFamily, fontSize: 34, fontWeight: 800, color: 'rgba(11,18,32,0.62)', marginTop: 8 }}>
        Options intel institutions pay for
      </div>
      <div style={{
        marginTop: 34, transform: `scale(${pop})`,
        background: INK, color: '#FFFFFF', borderRadius: 999, padding: '22px 58px 28px',
        fontFamily, fontSize: 96, fontWeight: 900, letterSpacing: '-0.04em',
        boxShadow: '0 26px 64px rgba(11,18,32,0.42)',
      }}>FREE</div>
      {/* 스토어 배지 — 조사 결과 「스토어 배지를 엔드프레임에」가 앱 프로모 관례다 */}
      <div style={{ marginTop: 26, display: 'flex', gap: 16 }}>
        {[['App Store', 'apple'], ['Google Play', 'play']].map(([label, kind]) => (
          <div key={kind} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#FFFFFF', border: '3px solid rgba(11,18,32,0.16)', borderRadius: 18,
            padding: '13px 24px', boxShadow: '0 10px 26px rgba(11,18,32,0.16)',
          }}>
            {kind === 'apple' ? (
              <svg width="34" height="34" viewBox="0 0 24 24" fill={INK}>
                <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.2 5.6c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3z" />
              </svg>
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24">
                <path d="M3.6 2.2 13.9 12 3.6 21.8a1.6 1.6 0 0 1-.6-1.3V3.5c0-.5.2-1 .6-1.3z" fill="#00A0FF" />
                <path d="M17.6 8.3 13.9 12l3.7 3.7 3.1-1.8c1-.6 1-2.2 0-2.8l-3.1-1.8z" fill="#FFBC00" />
                <path d="M3.6 2.2 13.9 12l3.7-3.7L6.3 1.8c-.9-.5-2-.2-2.7.4z" fill="#00E676" />
                <path d="M3.6 21.8 13.9 12l3.7 3.7L6.3 22.2c-.9.5-2 .2-2.7-.4z" fill="#FF3A44" />
              </svg>
            )}
            <span style={{ fontFamily, fontSize: 30, fontWeight: 900, color: INK }}>{label}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const PhoneAd: React.FC<PhoneAdProps> = ({ series, scenes, ctaSec, storeLine, disclaimer }) => {
  const F = (s: number) => Math.round(s * FPS);
  const total = scenes.reduce((a, s) => a + F(s.sec), 0) + F(ctaSec);
  let cur = 0;
  const spans = scenes.map((s) => { const from = cur; const len = F(s.sec); cur += len; return { s, from, len }; });
  return (
    <AbsoluteFill style={{ background: SKY_MID }}>
      {/* 배경은 «전 구간» 끊기지 않고 흐른다 */}
      <LiveChart series={series} dur={total} />
      {spans.map(({ s, from, len }, i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          <FloatingPhone shot={s.shot} focus={s.focus} dur={len} />
          <TermCard term={s.term} define={s.define} />
        </Sequence>
      ))}
      <Sequence from={cur} durationInFrames={F(ctaSec)}>
        <FreeCard storeLine={storeLine} />
      </Sequence>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 42, textAlign: 'center',
        fontFamily, fontSize: 22, fontWeight: 800, color: 'rgba(11,18,32,0.52)',
      }}>{disclaimer}</div>
    </AbsoluteFill>
  );
};

export function phoneAdDuration(p: PhoneAdProps) {
  return Math.round((p.scenes.reduce((a, s) => a + s.sec, 0) + p.ctaSec) * FPS);
}
