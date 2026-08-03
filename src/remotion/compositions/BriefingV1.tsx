// ============================================================================
// BriefingV1 — 「SIGNUM 브리핑」 데일리 쇼츠 템플릿 (신규 라인 1호)
// ----------------------------------------------------------------------------
// 정본: .agent/VIDEO_ENGINE_SPEC.md — 아래 수치는 전부 레퍼런스 실측에서 나왔다.
//   · 32초 = 콘텐츠 26 + 아웃트로 6 (§3-A)
//   · 무음 · 자막 13 CPS · 영어 우선 (§3-B)
//   · 풀블리드 배경 + **상단 정렬** 타이포, 하단 패널 없음 (§2-B)
//   · 헤드라인은 흰색이 아니라 **브랜드색** — 레퍼런스에서 화면을 지배한 요소 (§2-B)
//   · 하드컷 온리, 블렌드 0프레임 (§2-C)
//   · 텍스트 진입 = 컷 후 **750ms 대기 → 600ms 마스크 와이프** → 정지 (§2-E)
//   · 차트 = **왼→오 리빌 와이프**, 컷 후 1.2s 시작 800ms, 블록 전체를 한 마스크로 (§2-F)
//
// 🚫 절대 규칙 (§0)
//   1. 배경 레이어 없는 씬 금지 — 평면 색 위 텍스트가 기존 실패의 원인
//   2. 실앱 화면 30–50% — scripts/capture-app-screens.mjs 산출물을 디바이스 프레임에
//   3. 샷당 텍스트 블록 1개
//
// 🔁 이식성 (§5-D) — 로컬에서 만들되 람다로 그대로 올라가게
//   · 폰트는 @remotion/google-fonts로만. 시스템 폰트 이름 의존 금지(= 검정 렌더의 원인)
//   · 큰 소재는 URL 참조. 여기서는 앱 캡처가 public/에 있어 staticFile을 쓰되,
//     배경 영상이 붙는 순간 ASSET_BASE env로 바꾼다.
//
// 컴플라이언스: 관찰형만. 현재/과거 사실 서술, 예측·매수매도·방향 암시 금지.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

const FPS = 30;
export const BRIEFING_DURATION = 32 * FPS; // 960

// 브랜드 — SIGNUM 다크 + 앰버 액센트. 레퍼런스의 "헤드라인이 브랜드색" 규칙 이식.
const C = {
  bg: '#05070C',
  ink: '#F2F5FA',
  head: '#FFA028',      // 헤드라인 — 화면을 지배하는 색
  sub: '#8A96AB',
  up: '#22C77E',
  down: '#FF5A6E',
  grid: 'rgba(120,160,220,0.10)',
};

export interface BriefingProps {
  /** 훅 — 초대형 콜아웃. ≤20자 (§3-E) */
  hookLabel: string;
  hookValue: string;
  hookUp: boolean;
  /** 긴장 — 헤드라인. ≤47자 */
  tension: string;
  /** 증거1 — 헤드라인 + 차트. ≤60자 */
  evidence1: string;
  evidenceSeries: number[];
  /** 증거2 — 콜아웃 2연타. 각 ≤20자 */
  callout2a: { label: string; value: string; up: boolean };
  callout2b: { label: string; value: string; up: boolean };
  /** 증거3 — 실앱 화면. ≤60자 */
  evidence3: string;
  appShot: string;
  /** 페이오프. ≤34자 */
  payoff: string;
  /** 아웃트로 — 앱 1개(3앱 로테이션 §3-D) */
  outroApp: string;
  outroLine: string;
  outroShot: string;
  dateLine: string;
}

// ── 텍스트 마스크 와이프 ────────────────────────────────────────────────────
// 레퍼런스 실측: 컷 후 750ms 아무것도 없다가, 600ms에 걸쳐 «세로로 잘린 채» 드러난다.
// 슬라이드도 페이드도 아니다 — 아래에서 위로 열리는 마스크다.
const DELAY = Math.round(0.75 * FPS);   // 22f
const WIPE = Math.round(0.60 * FPS);    // 18f

function Wipe({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const f = useCurrentFrame();
  const p = interpolate(f, [DELAY + delay, DELAY + delay + WIPE], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),   // ease-out cubic
  });
  return (
    <div style={{ clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, willChange: 'clip-path' }}>
      {children}
    </div>
  );
}

// ── 배경 ────────────────────────────────────────────────────────────────────
// §7 배경 소재 «안 C» — 우리 데이터 화면 자체를 배경으로. 비용 0, 자동화 완전.
// 레퍼런스 실측(§2-D)에서 배경은 «아주 느린 연속 이동»이었다: 프레임간 차이는 0에
// 가깝지만 샷 처음↔끝 누적차가 크다. 그 성질을 그대로 재현한다 — 정지 배경 금지(§0-1).
// [FIX 2026-08-03 · 검수 게이트가 잡음] 1차 렌더가 «평균밝기 11.1 · 밝은화소 3.7% ·
// 컷 0회»로 GATE FAIL. 원인 둘:
//   ① 스크림(0.92/0.55/0.9)을 과하게 깔아 실패작(5.2)보다 조금 나은 수준이 됐다.
//   ② 8개 씬이 «같은 배경 + seed만 다름»이라 컷 지점의 프레임 차이가 임계 18에
//      못 미쳤다 = 기계가 못 잡은 게 아니라 **사람 눈에도 한 컷으로 보인다**는 뜻.
//      레퍼런스는 컷마다 배경이 확 바뀌었다(§2-C·2-D).
// → 씬마다 «색조·밀도·구성»을 실제로 갈아끼우고 스크림을 걷었다.
// [FIX 2026-08-03 · 2차] 색조만 바꾼 1차 수정은 컷을 여전히 0으로 남겼다.
// 원인: `#0A1424`와 `#141020`은 **휘도가 거의 같다.** 그레이스케일 차분이 못 잡는다는 건
// 기계의 한계가 아니라 **작은 화면에서 사람 눈에도 컷이 약하다**는 뜻이다.
// → 씬마다 «휘도»를 교차시킨다. 밝은 씬과 어두운 씬이 번갈아 와야 컷이 컷으로 읽힌다.
// (밝은 씬은 밝은 화소 비율도 같이 올려 §5-C 게이트의 두 번째 항목을 해결한다)
const TONES = [
  { base: '#0A1424', tint: '#2E7BE0', dense: 150, lum: 'dark' },   // 0 훅
  { base: '#E8ECF4', tint: '#3457C8', dense: 120, lum: 'light' },  // 1 긴장 ← 밝게
  { base: '#160B10', tint: '#FF5A6E', dense: 190, lum: 'dark' },   // 2 증거1(하락)
  // [3차] 2→3이 «어두움→어두움»이라 12초 컷이 검출되지 않았다(7~15s가 한 샷으로 붙음).
  // 앞 씬(#160B10)보다 확실히 밝은 진홍으로 올려 컷을 세운다.
  { base: '#8C1B2A', tint: '#FFB0A0', dense: 230, lum: 'mid' },    // 3 콜아웃 down
  { base: '#E9F6EE', tint: '#0E8A52', dense: 190, lum: 'light' },  // 4 콜아웃 up ← 밝게
  { base: '#0B1626', tint: '#3E92E8', dense: 120, lum: 'dark' },   // 5 실앱
  { base: '#FFB43A', tint: '#8A4A00', dense: 150, lum: 'light' },  // 6 페이오프 ← 브랜드색 전면
  { base: '#0D1018', tint: '#9FB4D8', dense: 120, lum: 'dark' },   // 7 아웃트로
] as const;

/**
 * 씬 밝기에 맞춰 잉크를 뒤집는다.
 * [3차 육안검수] 게이트는 통과했는데 프레임을 뽑아 보니 `-7.89%`가 진홍 배경에
 * 묻혀 있었다 — 영상에서 제일 중요한 숫자다. 수치 게이트는 «대비»를 못 본다.
 * 그래서 mid(진한 유채색) 티어를 따로 둔다: 배경이 이미 색을 가졌으면
 * 강조색이 아니라 «밝기»로 떼어내야 한다.
 */
export function inkFor(seed: number) {
  const lum = TONES[seed % TONES.length].lum;
  if (lum === 'light') return { ink: '#0B111C', head: '#B4470A', sub: '#4A5568' };
  if (lum === 'mid') return { ink: '#FFFFFF', head: '#FFE0C4', sub: 'rgba(255,226,228,0.88)' };
  return { ink: C.ink, head: C.head, sub: C.sub };
}

/** 콜아웃 숫자색 — 배경 티어별로 «대비가 남는» 쪽을 고른다. */
function valueColor(seed: number, up: boolean) {
  const lum = TONES[seed % TONES.length].lum;
  if (lum === 'light') return up ? '#0B7A45' : '#B01228';   // 흰 바탕 → 진하게
  if (lum === 'mid') return up ? '#D8FFEA' : '#FFE8EB';     // 유채 바탕 → 밝게
  return up ? C.up : C.down;                                 // 검은 바탕 → 원색
}

function DataField({ seed = 0 }: { seed?: number }) {
  const f = useCurrentFrame();
  const T = TONES[seed % TONES.length];
  const drift = f * 0.28;                       // 아주 느린 연속 이동(§2-D 성질 재현)
  const breathe = 1 + Math.sin(f / 95) * 0.035;

  const cols = 22, rows = 40;
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < T.dense; i++) {
    const x = ((i * 137 + seed * 61) % 100);
    const h = 8 + ((i * 53 + seed * 29) % 42);
    const y = ((i * 89 + seed * 17) % 100);
    const a = 0.30 + ((i * 31) % 10) / 16;      // 훨씬 밝게
    bars.push(
      <div key={i} style={{
        position: 'absolute', left: `${(x + drift * 0.06) % 100}%`, top: `${y}%`,
        width: 3, height: `${h}%`, background: i % 5 === 0 ? C.head : T.tint,
        opacity: a, borderRadius: 2,
      }} />,
    );
  }
  return (
    <AbsoluteFill style={{ background: T.base, overflow: 'hidden' }}>
      {/* 씬마다 다른 방향의 광원 — 컷이 «보이게» 만드는 두 번째 장치 */}
      <AbsoluteFill style={{
        background: `radial-gradient(72% 46% at ${20 + seed * 9}% ${seed % 2 ? 22 : 74}%, ${T.tint}55, transparent 66%)`,
      }} />
      <AbsoluteFill style={{ transform: `scale(${breathe})` }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: cols }).map((_, i) => (
            <line key={`v${i}`} x1={`${(i / cols) * 100}%`} x2={`${(i / cols) * 100}%`}
              y1="0" y2="100%" stroke={C.grid} strokeWidth="1.5" />
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <line key={`h${i}`} x1="0" x2="100%"
              y1={`${((i / rows) * 100 + drift * 0.1) % 100}%`}
              y2={`${((i / rows) * 100 + drift * 0.1) % 100}%`}
              stroke={C.grid} strokeWidth="1.5" />
          ))}
        </svg>
        {bars}
      </AbsoluteFill>
      {/* 가독성 확보용 — 다만 가볍게. 무겁게 깔면 위 ①이 재발한다.
          밝은 씬은 흰 스크림을 써서 «밝기를 유지한 채» 대비를 만든다. */}
      <AbsoluteFill style={{
        background: T.lum === 'light'
          ? 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.34) 48%, rgba(255,255,255,0.66) 100%)'
          : 'linear-gradient(180deg, rgba(4,6,11,0.62) 0%, rgba(4,6,11,0.12) 46%, rgba(4,6,11,0.58) 100%)',
      }} />
    </AbsoluteFill>
  );
}

// ── 상단 고정 타이포 블록 ───────────────────────────────────────────────────
function TopType({ chapter, sub, head, caption, delay = 0, seed = 0 }: {
  chapter: string; sub?: string; head: string; caption?: string; delay?: number; seed?: number;
}) {
  const K = inkFor(seed);
  return (
    <div style={{ position: 'absolute', top: 96, left: 64, right: 64 }}>
      <Wipe delay={delay}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily, fontSize: 46, fontWeight: 900, color: K.head, letterSpacing: '-0.02em' }}>{chapter}</span>
          <div style={{ height: 4, flex: 1, background: K.head, borderRadius: 2, opacity: 0.9 }} />
        </div>
        {sub && (
          <div style={{ fontFamily, marginTop: 16, fontSize: 30, fontWeight: 700, color: K.ink, opacity: 0.85 }}>{sub}</div>
        )}
        <div style={{
          fontFamily, marginTop: 14, fontSize: 78, lineHeight: 1.08, fontWeight: 900,
          color: K.head, letterSpacing: '-0.035em',
        }}>{head}</div>
        {caption && (
          <div style={{ fontFamily, marginTop: 16, fontSize: 26, fontWeight: 600, color: K.sub }}>{caption}</div>
        )}
      </Wipe>
    </div>
  );
}

// ── 초대형 콜아웃 ───────────────────────────────────────────────────────────
function Callout({ label, value, up, seed = 0 }: { label: string; value: string; up: boolean; seed?: number }) {
  const K = inkFor(seed);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
      <Wipe>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily, fontSize: 40, fontWeight: 800, color: K.sub, letterSpacing: '0.12em' }}>{label}</div>
          <div style={{
            fontFamily, fontSize: 190, lineHeight: 1, fontWeight: 900,
            color: valueColor(seed, up),
            letterSpacing: '-0.05em', marginTop: 12,
          }}>{value}</div>
        </div>
      </Wipe>
    </AbsoluteFill>
  );
}

// ── 차트 — 블록 전체를 한 장의 마스크로 왼→오 리빌 (§2-F) ──────────────────
function RevealChart({ series }: { series: number[] }) {
  const f = useCurrentFrame();
  const START = Math.round(1.2 * FPS);
  const DUR = Math.round(0.8 * FPS);
  const p = interpolate(f, [START, START + DUR], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 2),
  });

  const W = 952, H = 300;
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - ((v - lo) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    // 제목·축·라인이 «개별»이 아니라 이 한 겹으로 통째로 쓸려 나온다
    <div style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, willChange: 'clip-path' }}>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.down} stopOpacity="0.28" />
            <stop offset="100%" stopColor={C.down} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke={C.grid} strokeWidth="1.5" />
        ))}
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#fill)" />
        <polyline points={pts} fill="none" stroke={C.down} strokeWidth="5"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── 디바이스 프레임 — 풀블리드 생캡처는 아마추어로 보인다 (§5-A) ───────────
function DeviceShot({ src, scale = 1 }: { src: string; scale?: number }) {
  const f = useCurrentFrame();
  const rise = interpolate(f, [DELAY, DELAY + WIPE + 6], [70, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const W = 470 * scale, H = 1022 * scale;
  return (
    <div style={{
      width: W, height: H, borderRadius: 52 * scale, padding: 9 * scale,
      background: 'linear-gradient(160deg,#2A3242,#0B0F17)',
      boxShadow: '0 40px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)',
      transform: `translateY(${rise}px)`,
    }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 44 * scale, overflow: 'hidden', background: '#000' }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
      </div>
    </div>
  );
}

// ── 씬 ──────────────────────────────────────────────────────────────────────
const S = (sec: number) => Math.round(sec * FPS);

export const BriefingV1: React.FC<BriefingProps> = (p) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* 0:00–0:03 훅 */}
      <Sequence durationInFrames={S(3)}>
        <DataField seed={0} />
        <Callout label={p.hookLabel} value={p.hookValue} up={p.hookUp} seed={0} />
      </Sequence>

      {/* 0:03–0:07 긴장 */}
      <Sequence from={S(3)} durationInFrames={S(4)}>
        <DataField seed={1} />
        <TopType chapter="01" sub={p.dateLine} head={p.tension} seed={1} />
      </Sequence>

      {/* 0:07–0:12 증거1 — 헤드라인 + 차트 리빌 */}
      <Sequence from={S(7)} durationInFrames={S(5)}>
        <DataField seed={2} />
        <TopType chapter="02" head={p.evidence1} seed={2} />
        <div style={{ position: 'absolute', left: 64, right: 64, top: 1180 }}>
          <RevealChart series={p.evidenceSeries} />
        </div>
      </Sequence>

      {/* 0:12–0:15 · 0:15–0:18 콜아웃 2연타 */}
      <Sequence from={S(12)} durationInFrames={S(3)}>
        <DataField seed={3} />
        <Callout {...p.callout2a} seed={3} />
      </Sequence>
      <Sequence from={S(15)} durationInFrames={S(3)}>
        <DataField seed={4} />
        <Callout {...p.callout2b} seed={4} />
      </Sequence>

      {/* 0:18–0:23 증거3 — 실앱 화면 */}
      <Sequence from={S(18)} durationInFrames={S(5)}>
        <DataField seed={5} />
        <TopType chapter="03" head={p.evidence3} seed={5} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 40 }}>
          <DeviceShot src={staticFile(p.appShot)} scale={0.92} />
        </AbsoluteFill>
      </Sequence>

      {/* 0:23–0:26 페이오프 */}
      <Sequence from={S(23)} durationInFrames={S(3)}>
        <DataField seed={6} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 72px' }}>
          <Wipe>
            <div style={{
              fontFamily, fontSize: 92, lineHeight: 1.12, fontWeight: 900,
              color: '#2A1400', textAlign: 'center', letterSpacing: '-0.035em',
            }}>{p.payoff}</div>
          </Wipe>
        </AbsoluteFill>
      </Sequence>

      {/* 0:26–0:32 아웃트로 — 앱 1개 (§3-D 로테이션) */}
      <Sequence from={S(26)} durationInFrames={durationInFrames - S(26)}>
        <DataField seed={7} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          <Wipe>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily, fontSize: 74, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em' }}>{p.outroApp}</div>
              <div style={{ fontFamily, marginTop: 12, fontSize: 32, fontWeight: 700, color: C.sub }}>{p.outroLine}</div>
              <div style={{
                fontFamily, marginTop: 22, display: 'inline-block', fontSize: 30, fontWeight: 900,
                color: C.bg, background: C.head, borderRadius: 999, padding: '12px 34px',
              }}>FREE</div>
            </div>
          </Wipe>
          <DeviceShot src={staticFile(p.outroShot)} scale={0.62} />
        </AbsoluteFill>
      </Sequence>

      {/* 상시 고지 — 교육/정보용. 전 구간 유지.
          [3차 육안검수] 씬 밝기를 교차시키자 밝은 씬에서 회색 글씨가 «사라졌다».
          컴플라이언스 문구는 배경이 뭐든 읽혀야 하므로 자체 배경을 달아 분리한다. */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{
          fontFamily, marginBottom: 26, fontSize: 21, fontWeight: 700,
          color: 'rgba(236,241,248,0.86)', letterSpacing: '0.02em',
          background: 'rgba(8,12,20,0.60)', borderRadius: 999, padding: '9px 22px',
        }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
