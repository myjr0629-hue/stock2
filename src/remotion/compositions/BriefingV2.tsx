// ============================================================================
// BriefingV2 — 「SIGNUM 브리핑」 재설계
// ----------------------------------------------------------------------------
// V1이 왜 실패했나 (대표 지적 + 실측, 2026-08-04)
//   ① **이야기가 없다.** 수치만 나열해서 «왜»를 알 수 없다. 보는 사람은 "그래서?"가 된다.
//   ② **자막이 없다.** 무음으로 보는 사람이 대부분인데 라벨만 있고 «문장»이 없었다.
//   ③ **못 만든 다크.** 씬별 밝기 실측: 23·235·26·56·235·29·214·25 — 최대차 212.
//      새까만 씬과 새하얀 씬이 번갈아 = «어두운 영상에 흰 화면이 번쩍».
//      평균밝기 91.8로 게이트는 통과했다. **평균이 분포를 숨겼고 나는 그 숫자에 최적화했다.**
//   ④ **앱 화면이 안 읽힌다.** 다크 UI를 폰 프레임에 축소 → 그냥 어두운 사각형.
//
// 🚫 이번에 지키는 것
//   1. **밝기 밴드 고정** — 모든 씬을 같은 밝기 구간에. 컷은 «구성»으로 만든다(휘도로 X).
//      고급스러운 다크 = 새까만 게 아니라 «깊은 남색 + 하나의 액센트 + 여백 + 층»이다.
//   2. **자막 상시** — 라벨이 아니라 «문장». 무음으로 이해되어야 한다.
//   3. **씬마다 구성이 완전히 다르다** — 같은 배경에 seed만 바꾸지 않는다(V1 실패).
//   4. **앱 화면은 확대해서 한 부분만** — 통째로 줄이면 아무것도 안 읽힌다.
//   5. **서사 = 질문 → 모순 → 증거 → 반전 → 답 → 여운.** 각 컷이 다음 컷을 궁금하게 만든다.
//
// 정본: .agent/VIDEO_ENGINE_SPEC.md
// 컴플라이언스: 관찰형만. 현재/과거 사실. 예측·매수매도·방향 암시 0.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();
const FPS = 30;
export const BRIEFING2_DURATION = 32 * FPS;

// ── 팔레트 ──────────────────────────────────────────────────────────────────
// «고급스러운 다크»의 정의: 순수 검정(#000)이 아니라 깊은 남색. 액센트는 하나.
// 여백을 넉넉히. 경계는 1px 헤어라인. 빛은 소프트 글로우로 «층»을 만든다.
const C = {
  base: '#0B1220',
  deep: '#070C16',
  ink: '#F4F8FF',
  mute: '#8A9AB5',
  line: 'rgba(255,255,255,0.16)',
  accent: '#FFB03A',
  up: '#2EE59D',
  down: '#FF5C7A',
  glass: 'linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))',
  glassLo: 'rgba(255,255,255,0.10)',
};

export interface Briefing2Props {
  dateLine: string;
  /** 씬별 자막 — «문장». 무음으로 읽혀야 한다 */
  cap: string[];
  indexLabel: string; indexPct: string;
  sectorLabel: string; sectorPct: string;
  laggards: Array<{ t: string; pct: string }>;
  bullLabel: string; bullPct: string; bullSeries: number[];
  bearLabel: string; bearPct: string;
  appShot: string;
  /** 앱 캡처에서 확대해 보여줄 영역 (0~1 비율) */
  appFocus: { x: number; y: number; w: number };
  appNote: string;
  payoff: string;
  outroApp: string; outroLine: string;
}

// ── 공통 유틸 ───────────────────────────────────────────────────────────────
const S = (sec: number) => Math.round(sec * FPS);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

function useIn(delay = 0, dur = 18) {
  const f = useCurrentFrame();
  return interpolate(f, [delay, delay + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut,
  });
}

/** 아래에서 떠오르며 나타남 — 슬라이드 + 페이드를 한 동작으로 */
function Rise({ delay = 0, y = 34, children }: { delay?: number; y?: number; children: React.ReactNode }) {
  const p = useIn(delay);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, willChange: 'transform,opacity' }}>
      {children}
    </div>
  );
}

// ── 배경 ────────────────────────────────────────────────────────────────────
// 모든 씬이 «같은 밝기 밴드»를 유지한다. 씬 구분은 구성(레이아웃)이 만든다.
// 층: ①깊은 남색 그라디언트 ②아주 느린 소프트 글로우 ③미세 그리드 ④비네트
function Backdrop({ tilt = 0 }: { tilt?: number }) {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 140) * 6;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${C.base} 0%, ${C.deep} 62%, #050810 100%)` }}>
      {/* 소프트 글로우 — 화면에 «깊이»를 만드는 핵심. 밝기를 밴드 안에서 올려준다 */}
      <AbsoluteFill style={{
        background: `radial-gradient(72% 48% at ${50 + tilt + drift}% 26%, rgba(96,150,255,0.62), transparent 72%)`,
      }} />
      <AbsoluteFill style={{
        background: `radial-gradient(64% 42% at ${20 - tilt}% 82%, rgba(255,176,58,0.42), transparent 74%)`,
      }} />
      <AbsoluteFill style={{
        background: `radial-gradient(52% 34% at ${82 + tilt / 2}% 58%, rgba(140,110,255,0.34), transparent 74%)`,
      }} />
      {/* 헤어라인 그리드 — 데이터 제품다운 질감 */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`v${i}`} x1={`${(i / 12) * 100}%`} x2={`${(i / 12) * 100}%`} y1="0" y2="100%"
            stroke={C.line} strokeWidth="1" />
        ))}
        {Array.from({ length: 23 }).map((_, i) => (
          <line key={`h${i}`} x1="0" x2="100%" y1={`${(i / 22) * 100}%`} y2={`${(i / 22) * 100}%`}
            stroke={C.line} strokeWidth="1" />
        ))}
      </svg>
      {/* 비네트 — 시선을 가운데로 모은다 */}
      <AbsoluteFill style={{
        background: 'radial-gradient(88% 66% at 50% 45%, transparent 52%, rgba(3,6,12,0.34) 100%)',
      }} />
    </AbsoluteFill>
  );
}

// ── 자막 (상시) ─────────────────────────────────────────────────────────────
// 무음 시청자를 위한 «문장». 라벨이 아니다. 하단 고정, 자체 플레이트로 항상 읽힌다.
function Caption({ text, delay = 6 }: { text: string; delay?: number }) {
  const p = useIn(delay, 14);
  return (
    <div style={{
      position: 'absolute', left: 56, right: 56, bottom: 176,
      opacity: p, transform: `translateY(${(1 - p) * 18}px)`,
    }}>
      <div style={{
        display: 'inline-block',
        background: 'linear-gradient(180deg, rgba(28,40,64,0.92), rgba(16,24,42,0.86))',
        border: '1px solid rgba(255,255,255,0.26)', borderRadius: 18,
        padding: '18px 24px', backdropFilter: 'blur(6px)',
      }}>
        <div style={{
          fontFamily, fontSize: 40, lineHeight: 1.34, fontWeight: 800,
          color: C.ink, letterSpacing: '-0.015em',
        }}>{text}</div>
      </div>
    </div>
  );
}

/** 화면 상단 챕터 마커 — 진행감을 준다 */
function Chapter({ n, total, label }: { n: number; total: number; label: string }) {
  const p = useIn(0, 12);
  return (
    <div style={{
      position: 'absolute', top: 74, left: 56, right: 56,
      display: 'flex', alignItems: 'center', gap: 14, opacity: p,
    }}>
      <span style={{ fontFamily, fontSize: 22, fontWeight: 900, color: C.accent, letterSpacing: '0.18em' }}>
        {String(n).padStart(2, '0')}
      </span>
      <div style={{ display: 'flex', gap: 5, flex: 1 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            height: 3, flex: 1, borderRadius: 2,
            background: i < n ? C.accent : 'rgba(255,255,255,0.13)',
          }} />
        ))}
      </div>
      <span style={{ fontFamily, fontSize: 19, fontWeight: 700, color: C.mute, letterSpacing: '0.08em' }}>
        {label}
      </span>
    </div>
  );
}

// ── 숫자 카운트업 ───────────────────────────────────────────────────────────
// 정적 숫자는 «놓여 있고», 올라가는 숫자는 «벌어지는 중»이다. 시선을 잡는다.
function CountPct({ value, size, color, delay = 4 }: {
  value: string; size: number; color: string; delay?: number;
}) {
  const target = parseFloat(value.replace(/[^-\d.]/g, '')) || 0;
  const p = useIn(delay, 26);
  const shown = target * p;
  const sign = target >= 0 ? '+' : '';
  return (
    <span style={{
      fontFamily, fontSize: size, fontWeight: 900, color,
      letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums',
      textShadow: `0 0 46px ${color}44`,
    }}>{sign}{shown.toFixed(2)}%</span>
  );
}

// ── 스파크라인 (좌→우로 그려짐) ─────────────────────────────────────────────
function Spark({ series, color, w, h, delay = 10 }: {
  series: number[]; color: string; w: number; h: number; delay?: number;
}) {
  const p = useIn(delay, 30);
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((v - lo) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <div style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 유리판 — 여백과 층을 만드는 기본 단위 */
function Glass({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.glass, border: `1px solid rgba(255,255,255,0.24)`, borderRadius: 26,
      padding: '30px 32px', boxShadow: '0 18px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.22)',
      ...style,
    }}>{children}</div>
  );
}

// ── 씬 ──────────────────────────────────────────────────────────────────────
export const BriefingV2: React.FC<Briefing2Props> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const T = 6;

  return (
    <AbsoluteFill style={{ background: C.deep }}>

      {/* ── 01 · 0:00–0:05 훅 — «사실 하나»를 크게. 아직 답을 주지 않는다 ── */}
      <Sequence durationInFrames={S(5)}>
        <Backdrop tilt={0} />
        <Chapter n={1} total={6} label={p.dateLine} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 56px 130px' }}>
          <Rise delay={2}>
            <div style={{ fontFamily, fontSize: 30, fontWeight: 800, color: C.mute, letterSpacing: '0.16em' }}>
              {p.indexLabel}
            </div>
          </Rise>
          <div style={{ marginTop: 10 }}>
            <CountPct value={p.indexPct} size={208} color={C.up} delay={6} />
          </div>
          <Rise delay={20}>
            <div style={{ marginTop: 34 }}>
              <Glass style={{ padding: '26px 28px' }}>
                <div style={{ fontFamily, fontSize: 23, fontWeight: 800, color: C.mute, letterSpacing: '0.14em' }}>
                  INTRADAY
                </div>
                <div style={{ marginTop: 14 }}>
                  <Spark series={p.bullSeries} color="#7FB4FF" w={904} h={330} delay={24} />
                </div>
              </Glass>
            </div>
          </Rise>
        </AbsoluteFill>
        <Caption text={p.cap[0]} delay={14} />
      </Sequence>

      {/* ── 02 · 0:05–0:11 모순 — 같은 날, 반대 방향. 두 판을 나란히 ── */}
      <Sequence from={S(5)} durationInFrames={S(6)}>
        <Backdrop tilt={-14} />
        <Chapter n={2} total={6} label="CONTRADICTION" />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 56px 130px', gap: 30 }}>
          <Rise delay={2}>
            <Glass style={{ padding: '46px 36px', background: 'linear-gradient(160deg, rgba(46,229,157,0.22), rgba(255,255,255,0.05))' }}>
              <div style={{ fontFamily, fontSize: 27, fontWeight: 800, color: '#BFF3DD', letterSpacing: '0.12em' }}>
                {p.indexLabel}
              </div>
              <div style={{ marginTop: 8 }}>
                <CountPct value={p.indexPct} size={128} color={C.up} delay={8} />
              </div>
              <div style={{ marginTop: 16, height: 8, borderRadius: 4, background: 'rgba(46,229,157,0.85)', width: '38%' }} />
            </Glass>
          </Rise>
          <Rise delay={12}>
            <Glass style={{ padding: '46px 36px', background: 'linear-gradient(160deg, rgba(255,92,122,0.24), rgba(255,255,255,0.05))' }}>
              <div style={{ fontFamily, fontSize: 27, fontWeight: 800, color: '#FFCFD9', letterSpacing: '0.12em' }}>
                {p.sectorLabel}
              </div>
              <div style={{ marginTop: 8 }}>
                <CountPct value={p.sectorPct} size={128} color={C.down} delay={18} />
              </div>
              <div style={{ marginTop: 16, height: 8, borderRadius: 4, background: 'rgba(255,92,122,0.9)', width: '22%' }} />
            </Glass>
          </Rise>
        </AbsoluteFill>
        <Caption text={p.cap[1]} delay={24} />
      </Sequence>

      {/* ── 03 · 0:11–0:16 증거 — 낙폭 종목이 하나씩 쌓인다 ── */}
      <Sequence from={S(11)} durationInFrames={S(5)}>
        <Backdrop tilt={10} />
        <Chapter n={3} total={6} label="THE DRAG" />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 56px 130px' }}>
          {p.laggards.map((l, i) => (
            <Rise key={l.t} delay={4 + i * 9} y={22}>
              <div style={{ marginBottom: 18 }}>
                <Glass style={{ padding: '30px 32px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily, fontSize: 66, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>
                      {l.t}
                    </span>
                    <span style={{
                      fontFamily, fontSize: 66, fontWeight: 900, color: C.down,
                      letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                    }}>{l.pct}</span>
                  </div>
                  <div style={{ marginTop: 18, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.14)' }}>
                    <div style={{
                      height: '100%', borderRadius: 5, background: C.down,
                      width: `${Math.min(100, Math.abs(parseFloat(l.pct)) * 42)}%`,
                    }} />
                  </div>
                </Glass>
              </div>
            </Rise>
          ))}
        </AbsoluteFill>
        <Caption text={p.cap[2]} delay={30} />
      </Sequence>

      {/* ── 04 · 0:16–0:22 반전 — 같은 테이프, 정반대 두 상품 ── */}
      <Sequence from={S(16)} durationInFrames={S(6)}>
        <Backdrop tilt={-6} />
        <Chapter n={4} total={6} label="SAME TAPE" />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 56px 130px' }}>
          <Rise delay={2}>
            <Glass style={{ borderColor: 'rgba(255,92,122,0.30)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily, fontSize: 27, fontWeight: 800, color: C.mute, letterSpacing: '0.1em' }}>
                  {p.bullLabel}
                </span>
                <CountPct value={p.bullPct} size={78} color={C.down} delay={8} />
              </div>
              <div style={{ marginTop: 18 }}>
                <Spark series={p.bullSeries} color={C.down} w={904} h={240} delay={12} />
              </div>
            </Glass>
          </Rise>
          <div style={{ height: 18 }} />
          <Rise delay={20}>
            <Glass style={{ borderColor: 'rgba(46,229,157,0.28)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily, fontSize: 27, fontWeight: 800, color: C.mute, letterSpacing: '0.1em' }}>
                  {p.bearLabel}
                </span>
                <CountPct value={p.bearPct} size={92} color={C.up} delay={26} />
              </div>
              {/* 위 판과 «거울»이 되도록 반대 방향 막대. 두 판의 높이를 맞춘다 */}
              <div style={{ marginTop: 22, display: 'flex', alignItems: 'flex-end', gap: 9, height: 176 }}>
                {p.bullSeries.map((v, i) => {
                  const lo = Math.min(...p.bullSeries), hi = Math.max(...p.bullSeries);
                  const inv = 1 - (v - lo) / ((hi - lo) || 1);   // 인버스 = 위아래 뒤집힘
                  return (
                    <div key={i} style={{
                      flex: 1, height: `${18 + inv * 82}%`, borderRadius: 3,
                      background: `rgba(46,229,157,${0.34 + inv * 0.5})`,
                    }} />
                  );
                })}
              </div>
            </Glass>
          </Rise>
        </AbsoluteFill>
        <Caption text={p.cap[3]} delay={34} />
      </Sequence>

      {/* ── 05 · 0:22–0:27 답 — 실앱 화면을 «확대»해서 한 부분만 ── */}
      <Sequence from={S(22)} durationInFrames={S(5)}>
        <Backdrop tilt={16} />
        <Chapter n={5} total={6} label="WHAT WE SAW" />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 56px 130px' }}>
          <Rise delay={2}>
            <AppZoom src={staticFile(p.appShot)} focus={p.appFocus} />
          </Rise>
          <Rise delay={16}>
            <div style={{
              marginTop: 24, fontFamily, fontSize: 30, fontWeight: 800,
              color: C.accent, letterSpacing: '0.02em', textAlign: 'center',
            }}>{p.appNote}</div>
          </Rise>
        </AbsoluteFill>
        <Caption text={p.cap[4]} delay={28} />
      </Sequence>

      {/* ── 06 · 0:27–0:32 여운 + 아웃트로 ── */}
      <Sequence from={S(27)} durationInFrames={durationInFrames - S(27)}>
        <Backdrop tilt={0} />
        <Chapter n={6} total={6} label="SIGNUM HQ" />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px 130px' }}>
          <Rise delay={2}>
            <div style={{
              fontFamily, fontSize: 88, lineHeight: 1.14, fontWeight: 900,
              color: C.ink, textAlign: 'center', letterSpacing: '-0.035em', whiteSpace: 'pre-line',
            }}>{p.payoff}</div>
          </Rise>
          <Rise delay={20}>
            <Glass style={{ marginTop: 46, padding: '40px 56px', textAlign: 'center' }}>
              <div style={{ fontFamily, fontSize: 46, fontWeight: 900, color: C.accent, letterSpacing: '-0.02em' }}>
                {p.outroApp}
              </div>
              <div style={{ fontFamily, marginTop: 10, fontSize: 27, fontWeight: 700, color: C.mute }}>
                {p.outroLine}
              </div>
              <div style={{
                marginTop: 24, display: 'inline-block', fontFamily, fontSize: 26, fontWeight: 900,
                color: C.deep, background: C.accent, borderRadius: 999, padding: '13px 38px',
              }}>FREE · iOS & Android</div>
            </Glass>
          </Rise>
        </AbsoluteFill>
        <Caption text={p.cap[5]} delay={30} />
      </Sequence>

      {/* 상시 고지 — 하단 고정 */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{
          fontFamily, marginBottom: 40, fontSize: 21, fontWeight: 700,
          color: 'rgba(190,204,224,0.55)', letterSpacing: '0.02em',
        }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── 앱 화면 확대 ────────────────────────────────────────────────────────────
// V1은 폰 프레임에 통째로 축소해서 «어두운 사각형»이 됐다. 아무것도 안 읽혔다.
// 여기서는 관심 영역만 크게 잘라 보여주고, 밝기·대비를 올려 화면 밴드에 맞춘다.
function AppZoom({ src, focus }: { src: string; focus: { x: number; y: number; w: number } }) {
  const W = 900, H = 620;
  const scale = 1 / focus.w;              // 가로 focus.w 비율만큼만 보이게 확대
  return (
    <div style={{
      width: W, height: H, borderRadius: 30, overflow: 'hidden', position: 'relative',
      border: `1px solid rgba(255,255,255,0.14)`,
      boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 6px rgba(255,255,255,0.03)',
      background: C.deep,
    }}>
      <Img src={src} style={{
        position: 'absolute',
        width: `${scale * 100}%`,
        left: `${-focus.x * scale * 100}%`,
        top: `${-focus.y * scale * 100}%`,
        // 다크 UI를 그대로 넣으면 어두운 덩어리가 된다 — 밝기·대비를 올려 읽히게
        filter: 'brightness(1.35) contrast(1.12) saturate(1.06)',
      }} />
      {/* 상단 가장자리에 아주 옅은 빛 — 유리 느낌으로 «층»을 만든다 */}
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.10), transparent 26%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
