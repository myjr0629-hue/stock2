// ============================================================================
// kit/Backdrop — 절차적(procedural) 배경. «배경 자체가 데이터»다.
// ----------------------------------------------------------------------------
// 대표 방침(2026-08-07): "리모션만으로 완벽한 틀. 뉴스 이미지는 쓰지 않는다."
// 스톡 사진도 AI 이미지도 «분위기»만 맞는다. 여기서는 배경을 코드로 그린다:
//   MU 이야기면 배경이 가격 곡선이고, 옵션 이야기면 배경이 스트라이크 사다리다.
//   저작권 0 · 무제한 · 매 종목마다 다른 그림 · 내용과 100% 일치.
//
// AI 이미지(broll)와 영상(kling)은 «액센트»로 남는다 — img / video 모드.
// 힉스필드 무제한 수확분(8/8~)도 같은 자리(video)에 꽂힌다.
//
// ⚠️ 결정론: Math.random() 금지(렌더마다 달라짐). 문자열 시드 → mulberry32.
// ⚠️ 게이트: 평균 밝기 ≥25 · 밝은 화소 ≥15% — 각 모드는 radial 光으로 바닥 밝기를
//    확보한다. 톤(tone)은 Briefing이 비트마다 교대로 줘서 컷 검출을 살린다
//    (V2~V3 교훈: 색만 다르고 밝기가 같으면 사람 눈에도 검출기에도 한 컷이다).
// ============================================================================

import React from 'react';
import { bgGain } from './bg-levels';
import { AbsoluteFill, Easing, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CANVAS } from './spec';

// ── 배경 명세 ────────────────────────────────────────────────────────────────
export type BackdropAccent = 'cool' | 'hot' | 'amber' | 'clash';

export type BackdropSpec =
  | { kind: 'img'; src: string }
  /** startFrom: 클립 «중간»부터 튼다 (컴포지션 프레임). 예 — 금괴·비트코인 클립의 «악수» 장면. */
  | { kind: 'video'; src: string; loopFrames?: number; startFrom?: number }
  | { kind: 'series'; accent?: BackdropAccent; bright?: boolean }   // 가격 곡선 (실데이터 있으면 그걸로)
  | { kind: 'strikes'; accent?: BackdropAccent }  // 풋/콜 스트라이크 사다리
  | { kind: 'ticks'; accent?: BackdropAccent }    // 틱 테이프 숫자 비
  | { kind: 'grid'; accent?: BackdropAccent };    // 펄스 히트맵 그리드

/** 절차 모드가 쓸 실데이터 (없으면 시드 파생 — 장식이므로 수치 주장 아님) */
export interface BackdropData {
  seed?: string;                                   // 보통 티커. 결정론의 뿌리
  series?: number[];                               // 실제 가격 시계열
  strikes?: Array<{ put: number; call: number }>;  // 실제 풋/콜 분포 (0~1 정규화)
}

// ── 결정론 PRNG ─────────────────────────────────────────────────────────────
function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (seed: string, salt: string) => mulberry32(hashStr(seed + '·' + salt));

const ACCENT: Record<BackdropAccent, { a: string; b: string }> = {
  cool: { a: '#3DE38F', b: '#22D3EE' },
  hot: { a: '#FF5C74', b: '#FF9E5C' },
  amber: { a: '#FFB020', b: '#FFD66B' },
  clash: { a: '#FF5C74', b: '#3DE38F' },
};

// 공통 스크림 — 자막·헤드라인 가독성. Bg(구판)와 같은 곡선.
/**
 * ★ 스크림 — 상단을 «왜» 덮는가
 *   비트에는 상단에 Banner(로고+제목)가 올라간다. 그 뒤가 밝으면 글자가 안 읽혀서
 *   0.86 불투명으로 눌렀다. 여기까지는 맞다.
 *
 *   ⚠️ 그런데 «훅에는 Banner 가 없다». 빈 상단을 86% 검정으로 덮고 있었고,
 *   그래서 아무리 밝은 배경을 골라도 렌더 상단이 41.7 로 나왔다 (승자 3편은 176~184).
 *   2026-08-19 실측으로 잡아낸 결함이다.
 *
 *   soft = 훅 전용. 상단은 «거의 투명»하게 두고 하단만 눌러 자막·고지를 지킨다.
 *   훅의 큰 숫자·문장·서브는 «각자 자기 배경 슬래브»를 갖고 있어서 스크림에 안 기댄다.
 */
const Scrim: React.FC<{ soft?: boolean }> = ({ soft }) => (
  <AbsoluteFill style={{
    background: soft
      ? 'linear-gradient(180deg, rgba(4,7,13,0.06) 0%, rgba(4,7,13,0.08) 34%, rgba(4,7,13,0.20) 62%, rgba(4,7,13,0.76) 100%)'
      : 'linear-gradient(180deg, rgba(4,7,13,0.80) 0%, rgba(4,7,13,0.30) 24%, rgba(4,7,13,0.18) 52%, rgba(4,7,13,0.78) 100%)',
  }} />
);

// 바닥 광 — 게이트 밝기 하한 확보 (완전 검정 배경 금지)
const Glow: React.FC<{ accent: BackdropAccent }> = ({ accent }) => (
  <AbsoluteFill style={{
    background: `radial-gradient(circle at 50% 38%, rgba(36,58,96,0.72) 0%, rgba(14,24,44,0.42) 46%, rgba(5,7,12,0) 78%),
                 radial-gradient(circle at 82% 78%, ${ACCENT[accent].a}22 0%, transparent 52%)`,
  }} />
);

// ── series: 가격 곡선 ───────────────────────────────────────────────────────
function seededWalk(seed: string, n = 64) {
  const r = rngFor(seed, 'walk');
  const out: number[] = []; let v = 0;
  for (let i = 0; i < n; i++) { v += (r() - 0.48) * 2; out.push(v); }
  return out;
}
/**
 * ★ series — «진짜 주가 곡선» 배경 (2026-08-19 전면 개편)
 *
 *   대표 지적: "텍스트만 잔뜩 넣지 말고 영상이 받쳐줘야 한다. 그 영상은 뉴스일 수도,
 *              실제 회사 뉴스 클립일 수도 있다."
 *   실측이 그걸 뒷받침한다 — 우리 비트 프레임의 «67%»가 오버레이였고, 배경으로 쓰던
 *   b-roll(웨이퍼 로봇팔 등)은 그 종목과 «아무 관계가 없는» 장식이었다.
 *
 *   뉴스 클립은 저작권이 걸린다. 대신 «우리 데이터로 그 종목의 실제 궤적을 그린다».
 *   100% 우리 것이고, 그 종목 얘기이고, 주장을 «화면이 증명»한다.
 *
 *   bright=true 면 밝은 판. 대표 지시: "어두운 게 고급인 줄 아는 건 왜 그러냐."
 *   실측: 지속률 상위 3편 상단 밝기 176~184 / 우리 직전편 41.7.
 */
const SeriesBg: React.FC<{ data: BackdropData; accent: BackdropAccent; dur: number; bright?: boolean }> = ({ data, accent, dur, bright }) => {
  const f = useCurrentFrame();
  const s = data.series && data.series.length >= 8 ? data.series : seededWalk(data.seed ?? 'SIG');
  // 화면을 «가득» 채운다. 예전엔 H=760 짜리를 하단에 깔아 장식으로만 썼다.
  const W = CANVAS.w * 1.35, H = CANVAS.h;
  const lo = Math.min(...s), hi = Math.max(...s), sp = hi - lo || 1;
  const pts = s.map((x, i) => [
    (i / (s.length - 1)) * W,
    H - ((x - lo) / sp) * (H * 0.62) - H * 0.20,
  ] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} ${W},${H} 0,${H}`;
  const pan = interpolate(f, [0, dur], [0, -(W - CANVAS.w)], { extrapolateRight: 'clamp' });
  const col = ACCENT[accent].a;
  const grid = bright ? 'rgba(10,20,40,0.10)' : 'rgba(255,255,255,0.06)';
  return (
    <AbsoluteFill style={{
      background: bright
        ? 'linear-gradient(180deg, #F2F5FA 0%, #E4EAF3 42%, #D2DBE8 100%)'
        : '#05070C',
    }}>
      {!bright && <Glow accent={accent} />}
      {/* 격자 — 「차트」임을 0.3초에 알린다 */}
      <svg width={CANVAS.w} height={CANVAS.h} style={{ position: 'absolute', inset: 0 }}>
        {[...Array(9)].map((_, k) => (
          <line key={k} x1="0" x2={CANVAS.w} y1={(k + 1) * (CANVAS.h / 10)} y2={(k + 1) * (CANVAS.h / 10)} stroke={grid} strokeWidth="2" />
        ))}
      </svg>
      <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, transform: `translateX(${pan}px)` }}>
        <defs>
          <linearGradient id="bkA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={bright ? 0.30 : 0.34} />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#bkA)" />
        <polyline points={line} fill="none" stroke={col} strokeWidth="18" strokeLinejoin="round" opacity={bright ? 0.18 : 0.28} style={{ filter: 'blur(14px)' }} />
        <polyline points={line} fill="none" stroke={col} strokeWidth={bright ? 9 : 5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {!bright && <Scrim />}
    </AbsoluteFill>
  );
};

// ── strikes: 풋/콜 사다리 ───────────────────────────────────────────────────
const StrikesBg: React.FC<{ data: BackdropData; accent: BackdropAccent }> = ({ data, accent }) => {
  const f = useCurrentFrame();
  const r = rngFor(data.seed ?? 'SIG', 'strikes');
  const rows = data.strikes && data.strikes.length >= 6
    ? data.strikes.slice(0, 13)
    : Array.from({ length: 13 }, () => ({ put: 0.2 + r() * 0.8, call: 0.2 + r() * 0.8 }));
  const { a, b } = ACCENT[accent];
  const rowH = CANVAS.h / (rows.length + 1);
  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      <Glow accent={accent} />
      {rows.map((row, i) => {
        const pulse = 0.4 + 0.22 * Math.sin(f / 14 + i * 1.7);
        const y = rowH * (i + 0.5);
        const putW = row.put * (CANVAS.w * 0.36);
        const callW = row.call * (CANVAS.w * 0.36);
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', top: y, right: CANVAS.w / 2 + 30, width: putW, height: 26, borderRadius: 13, background: `linear-gradient(90deg, transparent, ${a})`, opacity: pulse }} />
            <div style={{ position: 'absolute', top: y, left: CANVAS.w / 2 + 30, width: callW, height: 26, borderRadius: 13, background: `linear-gradient(90deg, ${b}, transparent)`, opacity: pulse }} />
          </React.Fragment>
        );
      })}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: CANVAS.w / 2 - 1, width: 2, background: 'rgba(255,255,255,0.14)' }} />
      <Scrim />
    </AbsoluteFill>
  );
};

// ── ticks: 틱 테이프 숫자 비 ────────────────────────────────────────────────
const TicksBg: React.FC<{ data: BackdropData; accent: BackdropAccent }> = ({ data, accent }) => {
  const f = useCurrentFrame();
  const seed = data.seed ?? 'SIG';
  const cols = 7;
  const { a, b } = ACCENT[accent];
  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      <Glow accent={accent} />
      {Array.from({ length: cols }, (_, c) => {
        const r = rngFor(seed, `col${c}`);
        const speed = 0.35 + r() * 0.5;
        const x = (c + 0.5) * (CANVAS.w / cols);
        const drift = (f * speed) % 220;
        return (
          <div key={c} style={{ position: 'absolute', left: x - 70, top: -220 + drift - 110, width: 140 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const v = (80 + r() * 860).toFixed(2);
              const up = r() > 0.45;
              return (
                <div key={i} style={{
                  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 30, fontWeight: 700,
                  color: i % 4 === 0 ? (up ? b : a) : 'rgba(214,226,244,0.5)',
                  opacity: 0.34, textAlign: 'center', lineHeight: 2.2,
                }}>{up ? '▲' : '▼'} {v}</div>
              );
            })}
          </div>
        );
      })}
      <Scrim />
    </AbsoluteFill>
  );
};

// ── grid: 펄스 히트맵 ───────────────────────────────────────────────────────
const GridBg: React.FC<{ data: BackdropData; accent: BackdropAccent }> = ({ data, accent }) => {
  const f = useCurrentFrame();
  const r = rngFor(data.seed ?? 'SIG', 'grid');
  const COLS = 7, ROWS = 12, gap = 10;
  const cw = (CANVAS.w - gap * (COLS + 1)) / COLS;
  const ch = (CANVAS.h - gap * (ROWS + 1)) / ROWS;
  const { a, b } = ACCENT[accent];
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => ({
    hot: r() > 0.62, phase: r() * Math.PI * 2, base: 0.05 + r() * 0.12,
  }));
  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      <Glow accent={accent} />
      {cells.map((cell, i) => {
        const cx = i % COLS, cy = Math.floor(i / COLS);
        const pulse = cell.base + 0.10 * (1 + Math.sin(f / 17 + cell.phase)) / 2;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: gap + cx * (cw + gap), top: gap + cy * (ch + gap),
            width: cw, height: ch, borderRadius: 14,
            background: cell.hot ? a : b, opacity: pulse,
          }} />
        );
      })}
      <Scrim />
    </AbsoluteFill>
  );
};

/**
 * ── 클립 부재 폴백 (2026-08-12, 윈도우 실측으로 추가) ────────────────────────
 * 배경 클립(public/shorts/bg/**)은 .gitignore 라 머신마다 «있을 수도, 없을 수도» 있다.
 * 그런데 대본과 bglib.json 은 커밋되므로, 클립을 못 받은 머신에서는 없는 파일을
 * 가리키게 되고 OffthreadVideo 가 404 → **프레임 0 에서 렌더가 통째로 죽는다.**
 * (BriefingT4 실측: `Received a status code of 404 ... morning-06-city-waking-above-golden.mp4`)
 *
 * REMOTION_BG=off 로 돌리면 shorts/bg/** 배경만 절차 배경으로 갈아끼운다.
 * 레이아웃·자막·타이밍·밝기 검수는 이 상태로 전부 가능하다. 클립이 오면 스위치를 뗀다.
 * 절차 배경 종류는 src 해시로 고르므로 컷마다 달라지고, 같은 대본이면 항상 같다(재현성).
 */
const BG_OFF = process.env.REMOTION_BG === 'off';
const FALLBACK_KINDS = ['series', 'strikes', 'ticks', 'grid'] as const;

function bgAvailable(spec: BackdropSpec): BackdropSpec {
  if (!BG_OFF) return spec;
  if (spec.kind !== 'video' && spec.kind !== 'img') return spec;
  if (!spec.src.startsWith('shorts/bg/')) return spec;   // 커밋된 자산(broll·hf)은 그대로 쓴다
  let h = 2166136261;
  for (let i = 0; i < spec.src.length; i++) { h ^= spec.src.charCodeAt(i); h = Math.imul(h, 16777619); }
  return { kind: FALLBACK_KINDS[(h >>> 0) % FALLBACK_KINDS.length] };
}

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Backdrop: React.FC<{
  spec: BackdropSpec;
  dur: number;
  data?: BackdropData;
  /** 인접 컷과 밝기 차를 만들어 컷이 «읽히게» 한다 (Briefing이 교대로 줌) */
  tone?: number;
  /**
   * ★ 크래시 줌 — «훅 전용». 첫 13프레임(0.43초)에 1.26배에서 1.0배로 빨려든다.
   *   2026-08-19 실측: 지속률 상위 3편의 공통점은 «첫 순간에 화면이 움직인다»였고,
   *   우리 훅은 배경 video 케이스에 스케일 애니메이션이 «아예 없어» 완전 정지였다.
   *   (img 케이스에는 1.05→1.14 램프가 있었는데 video 케이스만 빠져 있었다)
   */
  punch?: boolean;
}> = ({ spec: rawSpec, dur, data = {}, tone = 1, punch = false }) => {
  const f = useCurrentFrame();
  const spec = bgAvailable(rawSpec);
  const pz = punch
    ? interpolate(f, [0, 13], [1.26, 1.0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
    : 1;
  const inner = (() => {
    switch (spec.kind) {
      case 'img': {
        const t = interpolate(f, [0, dur], [0, 1], { extrapolateRight: 'clamp' });
        return (
          <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
            <Img src={staticFile(spec.src)} style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: `scale(${(1.05 + t * 0.09) * pz})`, transformOrigin: '50% 42%',
              filter: `saturate(0.88) contrast(1.04) brightness(${bgGain(spec.src)})`,
            }} />
            <Scrim soft={punch} />
          </AbsoluteFill>
        );
      }
      case 'video':
        // OffthreadVideo 는 loop 프로퍼티가 없다 → <Loop> 로 감싼다.
        // 148f = kling_terminal.mp4 실측 5.041s × 30fps 에서 안전 마진 3f.
        return (
          <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
            <Loop durationInFrames={spec.loopFrames ?? 148} layout="none">
              <OffthreadVideo muted startFrom={spec.startFrom} src={staticFile(spec.src)} style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', objectFit: 'cover',
                transform: `scale(${pz})`, transformOrigin: '50% 42%',
                filter: `saturate(0.9) brightness(${bgGain(spec.src)})`,
              }} />
            </Loop>
            <Scrim soft={punch} />
          </AbsoluteFill>
        );
      case 'series': return <SeriesBg data={data} accent={spec.accent ?? 'cool'} dur={dur} bright={spec.bright} />;
      case 'strikes': return <StrikesBg data={data} accent={spec.accent ?? 'clash'} />;
      case 'ticks': return <TicksBg data={data} accent={spec.accent ?? 'cool'} />;
      case 'grid': return <GridBg data={data} accent={spec.accent ?? 'cool'} />;
    }
  })();
  return <AbsoluteFill style={{ filter: tone === 1 ? undefined : `brightness(${tone})` }}>{inner}</AbsoluteFill>;
};
