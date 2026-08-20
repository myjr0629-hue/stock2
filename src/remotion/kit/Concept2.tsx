/**
 * Concept2 — 개념 트랙 #2 «RSI»
 * ---------------------------------------------------------------------------
 * ★ 소재를 «수요»가 정했다 (2026-08-20 실측)
 *   rsi indicator explained  중앙 33,947 (최고 615K)   ← 1위
 *   what is vwap trading     26,831
 *   market makers explained  15,881
 *   dark pool trading         404
 *   ⇒ 내가 CONCEPT_TRACK.md 에 «8순위»로 적어둔 소재가 실제 수요 1위였다.
 *     추측이 아니라 수요가 순서를 정한다.
 *
 * ★ 시각 문법 — ICT Gems 계급(17.6만) 차용 + 우리 색
 *   레퍼런스 어디도 «숫자 3줄 카드»로 말하지 않는다.
 *   ICT 는 «실제 캔들차트에 실제 레벨»을 짚는다. 그걸 가져오되,
 *   우리는 그 위에 «전수 계산»을 얹는다 — 이건 ICT 도 Primate 도 못 한다.
 *
 * ⛔ 숫자는 전부 실데이터
 *   가격·RSI  Polygon 일봉 · Wilder RSI(14) 자체 계산
 *   베이스레이트 scripts/edge-rsi.mjs — 대형주 12종 · 386건
 *   앱 화면    2026-08-20 실캡처 (RSI 14 = 45.4)
 */

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence,
  interpolate, useCurrentFrame, Easing, staticFile,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { VOICE_AD } from './voice-ad';

const { fontFamily } = loadFont();
export const C2_FPS = 30;
const F = (s: number) => Math.round(s * C2_FPS);
const W = 1080, H = 1920;

const C = {
  ink: '#08101C', accent: '#FFC24D', cyan: '#8FE4F4', green: '#66DFB2',
  red: '#FF98A6', text: '#F7FAFE', dim: 'rgba(224,238,254,0.72)',
};
const seg = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// ── 타임라인 ────────────────────────────────────────────────────────────────
const V = Object.fromEntries(VOICE_AD.lines.map((l) => [l.id, l]));
const ORDER = [
  'c2a', 'c2b',                       // 훅 — 통념
  'c2c', 'c2d', 'c2e', 'c2f', 'c2g',  // 정의 — RSI 가 «무엇을 재는가»
  'c2h', 'c2i',                       // 실제 차트 — AMD 3회 돌파
  'c2j', 'c2k', 'c2l', 'c2m', 'c2n',  // 전수 계산 — 386건
  'c2o', 'c2p',                       // 판정
  'c2q',                              // 페이오프 — 앱
] as const;
const GAP = F(0.16);
const CUTS: { id: string; from: number; len: number }[] = [];
{
  let t = 0;
  for (const id of ORDER) { const len = F(V[id].sec) + GAP; CUTS.push({ id, from: t, len }); t += len; }
}
const at = (id: string) => CUTS.find((c) => c.id === id)!;
const PAYOFF = at('c2q').from;
const CTA_FROM = at('c2q').from + at('c2q').len;
const CTA_LEN = F(4.4);   // 끝 장면이 스쳐 지나가지 않게 (2026-08-21)
export const C2_DURATION = CTA_FROM + CTA_LEN;

type Scene = 'hook' | 'hook2' | 'define' | 'chart' | 'chartMark' | 'base' | 'verdict' | 'payoff';
// ⛔ 첫 컷 <= 2.8초 — 우리 채널 전수에서 «첫컷 시각 ↔ 지속률 -0.90» 은 유일한 신호다.
//    훅이 3.87초짜리 한 장면이면 첫 컷이 거기서 난다 → c2b 에서 한 번 자른다.
const SCENE_AT: [string, Scene][] = [
  ['c2a', 'hook'], ['c2b', 'hook2'], ['c2c', 'define'], ['c2h', 'chart'], ['c2i', 'chartMark'],
  ['c2j', 'base'], ['c2o', 'verdict'], ['c2q', 'payoff'],
];
const sceneOf = (f: number): Scene => {
  let s: Scene = 'hook';
  for (const [id, sc] of SCENE_AT) if (f >= at(id).from) s = sc;
  return s;
};
const SCENE_STARTS = SCENE_AT.map(([id]) => at(id).from);

// ── 실데이터 — AMD 2026-03-26 ~ 2026-06-12 (55 거래일) ─────────────────────
const PRICE = [203.8, 202, 196, 203.4, 210.2, 217.5, 220.2, 221.5, 231.8, 236.6, 245, 246.8, 255.1, 258.1, 278.3, 278.4, 274.9, 284.5, 303.5, 305.3, 347.8, 334.6, 323.2, 337.1, 354.5, 360.5, 341.5, 355.3, 421.4, 408.5, 455.2, 458.8, 448.3, 445.5, 449.7, 424.1, 421, 414.1, 447.6, 449.6, 467.5, 503.9, 495.5, 518.1, 516.1, 510.1, 521.5, 542.5, 523.2, 466.4, 490.3, 475.5, 452.4, 488.4, 511.6];
const RSI = [49.2, 48.1, 44.6, 49.5, 53.6, 57.6, 58.9, 59.7, 64.7, 66.8, 70.1, 70.8, 73.7, 74.7, 80.2, 80.2, 76.9, 79.4, 83.3, 83.6, 88.9, 80.2, 73.5, 76.1, 78.9, 79.8, 69.9, 72.5, 81.2, 76.1, 80.8, 81.1, 77.2, 76.2, 76.7, 67.3, 66.2, 63.8, 69.6, 69.9, 72.6, 77.1, 74.1, 76.7, 76, 73.7, 75.2, 77.8, 70.6, 54.5, 58.8, 55.3, 50.4, 56.9, 60.5];
/** RSI 가 70 을 상향 돌파한 지점과 그 후 5거래일 수익률 (PRICE 로 검산됨) */
const CROSS = [
  { i: 10, pct: 13.6 },   // 2026-04-10  245.0 → 278.4
  { i: 27, pct: 26.2 },   // 2026-05-05  355.3 → 448.3
  { i: 40, pct: 9.1 },    // 2026-05-22  467.5 → 510.1
];
const APP_RSI = 45.4;     // 앱 실캡처

const PX = { x: 92, y: 470, w: W - 184, h: 400 };
const RS = { x: 92, y: 916, w: W - 184, h: 230 };
const P_MIN = 180, P_MAX = 560;
const pyOf = (v: number) => PX.y + PX.h - ((v - P_MIN) / (P_MAX - P_MIN)) * PX.h;
const ryOf = (v: number) => RS.y + RS.h - (v / 100) * RS.h;
const xOf = (i: number) => PX.x + (i / (PRICE.length - 1)) * PX.w;

// ── 자막 ────────────────────────────────────────────────────────────────────
type Chunk = { t: string; hi?: string };
const CHUNKS: Record<string, Chunk[]> = {
  c2a: [{ t: 'RSI above 70 means overbought.', hi: 'overbought' }],
  c2b: [{ t: 'Everyone reads that as sell.', hi: 'sell' }],
  c2c: [{ t: 'Here is what RSI measures.' }],
  c2d: [{ t: 'Average gains against average losses.' }],
  c2e: [{ t: 'Over the last 14 trading days.', hi: '14' }],
  c2f: [{ t: 'Above 70 just means gains won.' }],
  c2g: [{ t: 'It says nothing about what comes next.' }],
  c2h: [{ t: 'AMD crossed 70 three times this spring.', hi: 'three times' }],
  c2i: [{ t: 'Higher five days later every time.', hi: 'every time' }],
  c2j: [{ t: 'So we counted every crossing since 2021.' }],
  c2k: [{ t: '12 large caps.' }, { t: '386 crossings.', hi: '386' }],
  c2l: [{ t: 'Higher in 5 days: 57%.', hi: '57%' }],
  c2m: [{ t: 'On any given day: 53%.', hi: '53%' }],
  c2n: [{ t: 'A four point gap. That is noise.', hi: 'noise' }],
  c2o: [{ t: 'RSI over 70 is not a sell signal.', hi: 'not' }],
  c2p: [{ t: 'It describes the trend you are in.' }],
  c2q: [{ t: 'On AMD right now, RSI is 45.4.', hi: '45.4' }],
};

const Caption: React.FC<{ id: string; len: number }> = ({ id, len }) => {
  const f = useCurrentFrame();
  const cs = CHUNKS[id];
  const speak = len - GAP;
  const w = cs.map((c) => c.t.length);
  const tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  const spans = cs.map((c, i) => { const a = acc; acc += (w[i] / tot) * speak; return { c, a, b: acc }; });
  const cur = spans.find((s) => f >= s.a && f < s.b) || spans[spans.length - 1];
  const local = f - cur.a;
  const o = Math.min(seg(local, -2, 1), 1 - seg(f, len - 4, len));
  const y = interpolate(seg(local, 0, 7), [0, 1], [12, 0], { easing: ease });
  const parts = cur.c.hi
    ? cur.c.t.split(new RegExp(`(${cur.c.hi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
    : [cur.c.t];
  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 1382,      // 72% — DTW 밴드
      display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${y}px)`,
    }}>
      <div style={{
        background: 'rgba(6,11,20,0.93)', borderRadius: 16, padding: '15px 26px',
        fontFamily, fontSize: 45, lineHeight: 1.16, fontWeight: 900, color: '#fff',
        textAlign: 'center', letterSpacing: '-0.02em', border: '2px solid rgba(255,255,255,0.14)',
        boxShadow: '0 14px 40px rgba(0,0,0,0.5)', maxWidth: 900,
      }}>
        {parts.map((p, i) =>
          cur.c.hi && p.toLowerCase() === cur.c.hi.toLowerCase()
            ? <span key={i} style={{
                background: C.accent, color: C.ink, borderRadius: 8, padding: '2px 10px',
                margin: '0 2px', display: 'inline-block',
              }}>{p}</span>
            : <span key={i}>{p}</span>)}
      </div>
    </div>
  );
};

// ── 배경 ────────────────────────────────────────────────────────────────────
const Bg: React.FC = () => {
  const f = useCurrentFrame();
  const drift = interpolate(f, [0, C2_DURATION], [0, -46]);
  return (
    <AbsoluteFill style={{ background: '#22375A' }}>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg,#93B0D8 0%,#6E90BF 44%,#51739E 100%)' }} />
      <div style={{ position: 'absolute', inset: -60, transform: `translateX(${drift}px)` }}>
        <Loop durationInFrames={600}>
          <OffthreadVideo src={staticFile('ad/plate-p1.mp4')} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.34,
              filter: 'brightness(1.5) saturate(0.5)' }} />
        </Loop>
      </div>
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 112% 78% at 50% 46%, rgba(214,234,255,0.4) 0%, rgba(150,190,236,0.2) 58%, rgba(52,80,120,0.1) 100%)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(6,11,20,0.72) 0%, rgba(6,11,20,0.16) 17%, rgba(6,11,20,0) 30%)',
      }} />
    </AbsoluteFill>
  );
};

const Count: React.FC<{ to: number; from: number; dur: number; prefix?: string; suffix?: string; digits?: number }> =
  ({ to, from, dur, prefix = '', suffix = '', digits = 0 }) => {
    const f = useCurrentFrame();
    const v = interpolate(f, [from, from + dur], [0, to],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return <>{prefix}{v.toFixed(digits)}{suffix}</>;
  };

const Enter: React.FC<{ at: number; children: React.ReactNode }> = ({ at: a, children }) => {
  const f = useCurrentFrame();
  const p = seg(f, a - 2, a);
  return <AbsoluteFill style={{ opacity: p, transform: `scale(${0.99 + p * 0.01})` }}>{children}</AbsoluteFill>;
};
const Flash: React.FC<{ at: number }> = ({ at: a }) => {
  const f = useCurrentFrame();
  const o = f >= a - 1 && f < a + 4 ? 0.4 * (1 - (f - a + 1) / 5) : 0;
  return o > 0 ? <AbsoluteFill style={{ background: '#EAF3FF', opacity: o }} /> : null;
};

// ── 장면 1 · 훅 — 통념을 «게이지»로 보여준다 ────────────────────────────────
const SceneHook: React.FC = () => {
  const f = useCurrentFrame();
  const val = interpolate(f, [4, 30], [40, 72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const bStart = at('c2b').from;
  const CX = W / 2, CY = 820, R = 250;
  const ang = (v: number) => Math.PI * (1 - v / 100);
  const px = (v: number, r: number) => [CX + Math.cos(ang(v)) * r, CY - Math.sin(ang(v)) * r];
  const [nx, ny] = px(val, R - 26);
  const arc = (a: number, b: number, r: number) => {
    const [x1, y1] = px(a, r), [x2, y2] = px(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 468, textAlign: 'center', fontFamily,
        fontSize: 27, fontWeight: 900, color: C.dim, letterSpacing: '0.14em',
      }}>RELATIVE STRENGTH INDEX &middot; 14</div>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={arc(0, 70, R)} stroke="rgba(226,240,255,0.34)" strokeWidth={26} fill="none" strokeLinecap="round" />
        <path d={arc(70, 100, R)} stroke={C.red} strokeWidth={26} fill="none" strokeLinecap="round" opacity={0.9} />
        <path d={arc(0, val, R)} stroke={C.accent} strokeWidth={26} fill="none" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 16px ${C.accent})` }} />
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#fff" strokeWidth={9} strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 12px #fff)' }} />
        <circle cx={CX} cy={CY} r={18} fill="#fff" />
      </svg>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: CY - 178, textAlign: 'center', fontFamily,
        fontSize: 128, fontWeight: 900, color: '#fff', letterSpacing: '-0.05em',
        textShadow: '0 6px 30px rgba(0,0,0,0.7)',
      }}><Count to={72} from={4} dur={26} digits={0} /></div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: CY + 44, textAlign: 'center', fontFamily,
        fontSize: 40, fontWeight: 900, color: C.red, letterSpacing: '0.08em', opacity: seg(f, 26, 40),
      }}>OVERBOUGHT</div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: CY + 116, textAlign: 'center', fontFamily,
        fontSize: 46, fontWeight: 900, color: C.text, letterSpacing: '0.02em',
        opacity: seg(f, bStart - at('c2a').from + 6, bStart - at('c2a').from + 22),
      }}>&ldquo;SELL&rdquo;&nbsp; &mdash;&nbsp; everyone</div>
    </AbsoluteFill>
  );
};

// ── 장면 2 · 정의 — 오른 날 합 vs 내린 날 합 ────────────────────────────────
const SceneDefine: React.FC = () => {
  const f = useCurrentFrame();
  const a0 = at('c2c').from;
  const grow = seg(f, a0 + 8, a0 + 40);
  const GAIN = 0.72, LOSS = 0.28;                 // «오른 날이 이겼다» 를 보여주는 비율
  const BW = W - 260, BX = 130, BY = 620, BH = 96;
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: BX, top: 500, fontFamily, fontSize: 27, fontWeight: 900,
        color: C.text, letterSpacing: '0.1em',
      }}>LAST 14 TRADING DAYS</div>
      {[
        { k: 'AVERAGE GAIN', v: GAIN, c: C.green, y: BY },
        { k: 'AVERAGE LOSS', v: LOSS, c: C.red, y: BY + 168 },
      ].map((r, i) => (
        <div key={r.k}>
          <div style={{
            position: 'absolute', left: BX, top: r.y - 44, fontFamily, fontSize: 30, fontWeight: 900,
            color: C.text, letterSpacing: '0.04em',
          }}>{r.k}</div>
          <div style={{
            position: 'absolute', left: BX, top: r.y, width: BW, height: BH,
            borderRadius: 12, background: 'rgba(10,20,36,0.5)', border: '2px solid rgba(226,240,255,0.24)',
          }} />
          <div style={{
            position: 'absolute', left: BX, top: r.y, width: BW * r.v * grow, height: BH,
            borderRadius: 12, background: r.c, opacity: 0.92,
            boxShadow: `0 0 26px ${r.c}66`,
          }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', left: BX, right: BX, top: BY + 322, textAlign: 'center', fontFamily,
        fontSize: 44, fontWeight: 900, color: C.accent, letterSpacing: '0.02em',
        opacity: seg(f, at('c2f').from - a0, at('c2f').from - a0 + 16),
      }}>gains won &rarr; RSI goes up</div>
      <div style={{
        position: 'absolute', left: BX, right: BX, top: BY + 396, textAlign: 'center', fontFamily,
        fontSize: 36, fontWeight: 800, color: C.dim,
        opacity: seg(f, at('c2g').from - a0, at('c2g').from - a0 + 16),
      }}>that is the whole formula</div>
    </AbsoluteFill>
  );
};

// ── 장면 3 · 실제 차트 + RSI 패널 (ICT 계급 문법) ───────────────────────────
const SceneChart: React.FC<{ marks: boolean }> = ({ marks }) => {
  const f = useCurrentFrame();
  const a0 = at('c2h').from;
  const draw = seg(f, a0 + 4, a0 + 46);
  const n = Math.max(2, Math.round(PRICE.length * draw));
  const pts = PRICE.slice(0, n).map((v, i) => `${xOf(i).toFixed(1)},${pyOf(v).toFixed(1)}`).join(' ');
  const rpts = RSI.slice(0, n).map((v, i) => `${xOf(i).toFixed(1)},${ryOf(v).toFixed(1)}`).join(' ');
  const m0 = at('c2i').from;
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: PX.x, top: PX.y - 42, fontFamily, fontSize: 28, fontWeight: 900,
        color: C.text, letterSpacing: '0.06em',
      }}>AMD &middot; DAILY</div>
      <div style={{
        position: 'absolute', left: PX.x, width: PX.w, textAlign: 'right', top: PX.y - 42,
        fontFamily, fontSize: 24, fontWeight: 800, color: C.dim,
      }}>MAR &ndash; JUN 2026</div>

      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.cyan} stopOpacity="0.3" />
            <stop offset="100%" stopColor={C.cyan} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[200, 300, 400, 500].map((v) => (
          <g key={v}>
            <line x1={PX.x} y1={pyOf(v)} x2={PX.x + PX.w} y2={pyOf(v)} stroke="rgba(232,244,255,0.18)" strokeWidth={1} />
            <text x={PX.x + 8} y={pyOf(v) - 8} fill="rgba(236,246,255,0.78)" fontFamily={fontFamily}
              fontSize={20} fontWeight={800}>{'$' + v}</text>
          </g>
        ))}
        <polygon points={`${PX.x},${PX.y + PX.h} ${pts} ${xOf(n - 1)},${PX.y + PX.h}`} fill="url(#pf)" />
        <polyline points={pts} fill="none" stroke={C.cyan} strokeWidth={5} strokeLinejoin="round"
          strokeLinecap="round" style={{ filter: `drop-shadow(0 0 9px ${C.cyan})` }} />

        {/* RSI 패널 — 이게 ICT 문법의 핵심. «지표를 실제로 그린다» */}
        <rect x={RS.x} y={RS.y} width={RS.w} height={RS.h} fill="rgba(10,20,36,0.42)"
          stroke="rgba(226,240,255,0.22)" strokeWidth={2} rx={10} />
        <line x1={RS.x} y1={ryOf(70)} x2={RS.x + RS.w} y2={ryOf(70)} stroke={C.red}
          strokeWidth={4} strokeDasharray="12 8" opacity={0.95} />
        <line x1={RS.x} y1={ryOf(30)} x2={RS.x + RS.w} y2={ryOf(30)} stroke="rgba(226,240,255,0.3)"
          strokeWidth={2} strokeDasharray="10 8" />
        <polyline points={rpts} fill="none" stroke={C.accent} strokeWidth={4} strokeLinejoin="round"
          strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${C.accent})` }} />

        {/* 돌파 지점 — 가격·RSI 두 패널을 세로선으로 «잇는다» */}
        {marks && CROSS.map((c, k) => {
          const on = seg(f, m0 + 4 + k * 12, m0 + 18 + k * 12);
          if (on < 0.02 || c.i >= n) return null;
          return (
            <g key={c.i} opacity={on}>
              <line x1={xOf(c.i)} y1={PX.y} x2={xOf(c.i)} y2={RS.y + RS.h}
                stroke={C.accent} strokeWidth={2} strokeDasharray="6 6" opacity={0.75} />
              <circle cx={xOf(c.i)} cy={ryOf(RSI[c.i])} r={11} fill={C.accent}
                style={{ filter: `drop-shadow(0 0 12px ${C.accent})` }} />
              <circle cx={xOf(c.i)} cy={pyOf(PRICE[c.i])} r={9} fill="#fff" />
            </g>
          );
        })}
      </svg>

      <div style={{
        position: 'absolute', left: RS.x + 10, top: RS.y + 8, fontFamily, fontSize: 22,
        fontWeight: 900, color: C.accent, letterSpacing: '0.08em',
      }}>RSI 14</div>
      <div style={{
        position: 'absolute', left: RS.x + RS.w - 76, top: ryOf(70) - 30, fontFamily, fontSize: 24,
        fontWeight: 900, color: C.red, letterSpacing: '0.04em',
      }}>70</div>

      {/* 돌파 후 5일 수익률 — 라벨 */}
      {marks && CROSS.map((c, k) => {
        const on = seg(f, m0 + 10 + k * 12, m0 + 24 + k * 12);
        if (on < 0.05) return null;
        return (
          <div key={c.i} style={{
            position: 'absolute', left: Math.min(W - 190, Math.max(8, xOf(c.i) - 82)),
            top: pyOf(PRICE[c.i]) - 66, opacity: on,
            background: C.green, color: C.ink, borderRadius: 9, padding: '6px 12px',
            fontFamily, fontSize: 27, fontWeight: 900, whiteSpace: 'nowrap',
            boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
          }}>+{c.pct}%</div>
        );
      })}
    </AbsoluteFill>
  );
};

// ── 장면 4 · 전수 계산 — 우리 색 ────────────────────────────────────────────
// ⛔ 첫 판은 c2j(2.3초) 동안 «아이브로우와 자막만» 떠서 본문이 비었다.
//    게이트의 «빈 화면» 검출이 1.4초 @ 18.5s 로 잡았다. 이탈 지점이다.
//    → 장면이 시작하는 «그 프레임»부터 화면이 차 있어야 한다.
//      「세었다」를 말로만 하지 않고 «실제로 세는 그림»으로 채운다.
const SceneBase: React.FC = () => {
  const f = useCurrentFrame();
  const a0 = at('c2j').from;
  const local = f - a0;
  const COLS = 26, ROWS = 15, CELL = 22, TOTAL = 386;
  const GX = 96, GY = 556;
  const shown = Math.round(interpolate(local, [2, 46], [0, TOTAL],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }));
  const rows: [string, string, number, string][] = [
    ['CROSSINGS SINCE 2021', '386', at('c2k').from, C.text],
    ['HIGHER IN 5 DAYS', '57%', at('c2l').from, C.green],
    ['ANY GIVEN DAY', '53%', at('c2m').from, C.text],
  ];
  const gap = seg(f, at('c2n').from, at('c2n').from + 18);
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: GX, top: 486, fontFamily, fontSize: 26, fontWeight: 900,
        color: C.accent, letterSpacing: '0.12em', opacity: seg(local, 0, 6),
      }}>SIGNUM BASE RATE &middot; 12 LARGE CAPS</div>

      {/* 세는 그림 — 돌파 한 건이 점 하나. 장면 시작 프레임부터 찬다 */}
      <div style={{ position: 'absolute', left: GX, top: GY, width: COLS * CELL, height: ROWS * CELL }}>
        {Array.from({ length: TOTAL }).map((_, k) => {
          const on = k < shown;
          return (
            <div key={k} style={{
              position: 'absolute',
              left: (k % COLS) * CELL, top: Math.floor(k / COLS) * CELL,
              width: CELL - 6, height: CELL - 6, borderRadius: 4,
              background: on ? C.accent : 'rgba(226,240,255,0.12)',
              boxShadow: on && k > shown - 26 ? `0 0 10px ${C.accent}` : 'none',
            }} />
          );
        })}
      </div>
      <div style={{
        position: 'absolute', left: GX + COLS * CELL + 44, top: GY - 10, fontFamily,
        opacity: seg(local, 2, 12),
      }}>
        <div style={{ fontSize: 92, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
          {shown}
        </div>
        <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, color: C.dim, letterSpacing: '0.06em' }}>
          CROSSINGS
        </div>
        <div style={{ marginTop: 26, fontSize: 26, fontWeight: 800, color: C.dim, lineHeight: 1.4 }}>
          12 large caps<br />since 2021
        </div>
      </div>

      {rows.slice(1).map(([k, v, t0, col], i) => {
        const on = seg(f, t0, t0 + 14);
        return (
          <div key={k} style={{
            position: 'absolute', left: GX, right: 96, top: 926 + i * 122,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(10,20,36,0.66)', border: '2px solid rgba(226,240,255,0.24)',
            borderRadius: 16, padding: '20px 26px',
            opacity: on, transform: `translateX(${(1 - on) * -40}px)`,
          }}>
            <span style={{ fontFamily, fontSize: 33, fontWeight: 900, color: C.text, letterSpacing: '0.02em' }}>{k}</span>
            <span style={{ fontFamily, fontSize: 50, fontWeight: 900, color: col }}>{v}</span>
          </div>
        );
      })}

      <div style={{
        position: 'absolute', left: GX, right: 96, top: 1180, textAlign: 'center',
        opacity: gap, fontFamily,
      }}>
        <div style={{ fontSize: 60, fontWeight: 900, color: C.accent, letterSpacing: '-0.03em' }}>
          <Count to={4} from={at('c2n').from + 2} dur={20} suffix=" points" />
          <span style={{ fontSize: 32, color: C.dim }}>{'   z = 1.48'}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 장면 5 · 판정 ───────────────────────────────────────────────────────────
const SceneVerdict: React.FC = () => {
  const f = useCurrentFrame();
  const a0 = at('c2o').from;
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: 88, right: 88, top: 560, fontFamily, fontSize: 66,
        lineHeight: 1.14, fontWeight: 900, color: '#fff', letterSpacing: '-0.035em',
        textShadow: '0 6px 30px rgba(0,0,0,0.7)', opacity: seg(f, 4, 18),
      }}>
        RSI over 70 is<br />
        <span style={{ color: C.red }}>not</span> a sell signal.
      </div>
      <div style={{
        position: 'absolute', left: 88, right: 88, top: 800, fontFamily, fontSize: 42,
        lineHeight: 1.24, fontWeight: 800, color: C.accent, letterSpacing: '-0.01em',
        opacity: seg(f, at('c2p').from - a0, at('c2p').from - a0 + 16),
      }}>It describes the trend<br />you are already in.</div>
      <div style={{
        position: 'absolute', left: 88, right: 88, top: 1010, fontFamily, fontSize: 30,
        fontWeight: 800, color: C.dim, opacity: seg(f, at('c2p').from - a0 + 14, at('c2p').from - a0 + 30),
      }}>386 crossings &middot; 12 large caps &middot; since 2021</div>
    </AbsoluteFill>
  );
};

// ── 페이오프 ────────────────────────────────────────────────────────────────
const P_W = 360, P_APP = Math.round(P_W * 2622 / 1206), P_ST = 36, P_PAD = 11;
const P_H = P_ST + P_APP + P_PAD * 2, P_BW = P_W + P_PAD * 2;
const IMG_S = P_W / 1206;
const BOX = { x: 93, y: 1027, w: 325, h: 243 };      // RSI 14 타일 — CALLOUT_COORDS.json 실측

const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const local = f - PAYOFF;
  if (local < -8) return null;
  const rise = interpolate(local, [0, 22], [280, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const o = seg(local, 0, 12);
  const lift = seg(local, 16, 32);
  const scroll = 236;
  return (
    <div style={{ position: 'absolute', left: (W - P_BW) / 2, top: 470 + rise, width: P_BW, height: P_H, opacity: o }}>
      <div style={{
        position: 'absolute', left: -46, top: P_H - 24, width: P_BW + 92, height: 120,
        borderRadius: '50%', background: 'rgba(2,4,9,0.6)', filter: 'blur(34px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 50,
        background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
        boxShadow: '0 28px 66px rgba(0,0,0,0.55)',
      }} />
      <div style={{ position: 'absolute', inset: 6, borderRadius: 44, background: '#04050A' }} />
      <div style={{
        position: 'absolute', left: P_PAD, top: P_PAD, width: P_W, height: P_ST + P_APP,
        borderRadius: 40, overflow: 'hidden', background: '#070A10',
      }}>
        <Img src={staticFile('ad/tall-command-overview.png')} style={{
          position: 'absolute', left: 0, top: P_ST - scroll * IMG_S, width: P_W, display: 'block',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: 8, width: 74, height: 22,
          marginLeft: -37, borderRadius: 11, background: '#000',
        }} />
      </div>
      <div style={{
        position: 'absolute', left: P_BW - 96, top: -34, opacity: seg(local, 10, 22),
        transform: `rotate(-7deg) scale(${0.86 + seg(local, 10, 24) * 0.14})`,
        background: C.accent, color: C.ink, borderRadius: 10, padding: '9px 18px',
        fontFamily, fontSize: 34, fontWeight: 900, letterSpacing: '0.06em',
        boxShadow: '0 10px 30px rgba(0,0,0,0.55)', whiteSpace: 'nowrap',
      }}>FREE</div>
      {lift > 0.01 && (
        <div style={{
          position: 'absolute',
          left: P_PAD + BOX.x * IMG_S, top: P_PAD + P_ST + (BOX.y - scroll) * IMG_S,
          width: BOX.w * IMG_S, height: BOX.h * IMG_S,
          transform: `translate(${-92 * lift}px, ${-124 * lift}px) scale(${1 + lift * 1.3})`,
          borderRadius: 12, border: `3px solid ${C.accent}`, background: '#0A0F18',
          boxShadow: `0 26px 66px rgba(0,0,0,0.7), 0 0 34px ${C.accent}77`, opacity: lift,
        }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 9, overflow: 'hidden' }}>
            <Img src={staticFile('ad/tall-command-overview.png')} style={{
              position: 'absolute', width: P_W, display: 'block',
              left: -BOX.x * IMG_S, top: -BOX.y * IMG_S,
            }} />
          </div>
        </div>
      )}
    </div>
  );
};

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const o = Math.min(seg(f, 2, 12), 1 - seg(f, CTA_FROM - 10, CTA_FROM));
  return (
    <div style={{ position: 'absolute', left: 76, right: 76, top: 152, opacity: o, fontFamily }}>
      <div style={{
        display: 'inline-block', padding: '9px 20px', borderRadius: 9, background: C.accent,
        color: C.ink, fontSize: 25, fontWeight: 900, letterSpacing: '0.1em', marginBottom: 13,
      }}>TECHNICALS &middot; EXPLAINED</div>
      <div style={{
        fontSize: 80, lineHeight: 1.0, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em',
        textShadow: '0 4px 22px rgba(0,0,0,0.55)',
      }}>RSI 70</div>
    </div>
  );
};

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Concept2: React.FC = () => {
  const f = useCurrentFrame();
  const sc = sceneOf(f);
  const lastCut = CUTS.reduce((a, c) => (c.from <= f && c.from > a ? c.from : a), 0);
  const pop = 1 + 0.009 * Math.exp(-(f - lastCut) / 3);
  const sceneStart = SCENE_STARTS.reduce((a, s) => (s <= f && s > a ? s : a), 0);

  return (
    <AbsoluteFill style={{ background: '#0A1220', transform: `scale(${pop})` }}>
      <Bg />

      {CUTS.map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={c.len + 10}>
          <Audio src={staticFile(`${VOICE_AD.base}/${c.id}.mp3`)} />
        </Sequence>
      ))}
      {CUTS.slice(1).map((c) => (
        <Sequence key={`t-${c.id}`} from={c.from - 2} durationInFrames={8}>
          <Audio src={staticFile(`${VOICE_AD.base}/sfx-tick.mp3`)} volume={0.3} />
        </Sequence>
      ))}
      {SCENE_STARTS.slice(1).map((a) => (
        <Sequence key={`w-${a}`} from={a - 5} durationInFrames={22}>
          <Audio src={staticFile(`${VOICE_AD.base}/sfx-whoosh.mp3`)} volume={0.42} />
        </Sequence>
      ))}
      <Sequence from={PAYOFF + 14} durationInFrames={26}>
        <Audio src={staticFile(`${VOICE_AD.base}/sfx-impact.mp3`)} volume={0.5} />
      </Sequence>

      <Enter at={sceneStart}>
        {(sc === 'hook' || sc === 'hook2') && <SceneHook />}
        {sc === 'define' && <SceneDefine />}
        {sc === 'chart' && <SceneChart marks={false} />}
        {sc === 'chartMark' && <SceneChart marks />}
        {sc === 'base' && <SceneBase />}
        {sc === 'verdict' && <SceneVerdict />}
      </Enter>
      {SCENE_STARTS.slice(1).map((a) => <Flash key={a} at={a} />)}

      <Title />
      <Payoff />

      {CUTS.map((c) => (
        <Sequence key={`c-${c.id}`} from={c.from} durationInFrames={c.len}>
          <Caption id={c.id} len={c.len} />
        </Sequence>
      ))}

      {/* CTA — 브리핑과 같은 고정 자산 클립 */}
      <Sequence from={CTA_FROM}>
        <AbsoluteFill style={{ background: '#05070C' }}>
          <OffthreadVideo muted src={staticFile('shorts/outro/outro.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      </Sequence>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center',
        fontFamily, fontSize: 19, fontWeight: 600, color: 'rgba(210,228,250,0.55)',
      }}>Informational only. Not investment advice.</div>
    </AbsoluteFill>
  );
};
